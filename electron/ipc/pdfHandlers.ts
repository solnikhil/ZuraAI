/**
 * PDF IPC Handlers
 * 
 * This module registers all IPC handlers for PDF-related operations in the main process.
 * It provides handlers for:
 * - PDF loading and parsing
 * - Document indexing
 * - RAG queries
 * - Session management
 * - Settings and feedback
 * 
 * Requirements: 3.1, 6.1, 7.7, 8.1, 11.1, 11.2, 18.6, 19.3
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Import PDF services
import {
  pdfParserService,
  ragEngine,
  chunkManager,
  vectorStore,
} from '../pdf';

// Import types
import type {
  PDFDocument,
  PDFPage,
  TextSearchResult,
  OutlineItem,
  IndexOptions,
  IndexResult,
  IndexStatus,
  QueryOptions,
  RAGResponse,
  Chunk,
  PDFChatSession,
  PDFChatMessage,
  PDFRAGSettings,
  ResponseFeedback,
  CitationFeedback,
  RecentDocument,
} from '../../src/types/pdf';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a UUID v4 using Node.js crypto
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

// =============================================================================
// PDF Chat Store (Session & Settings Persistence)
// =============================================================================

interface PDFChatStoreData {
  sessions: PDFChatSession[];
  recentDocuments: RecentDocument[];
  settings: PDFRAGSettings;
  feedback: Array<ResponseFeedback | CitationFeedback>;
}

const DEFAULT_SETTINGS: PDFRAGSettings = {
  chunkSize: 512,
  chunkOverlap: 128,
  chunkingStrategy: 'semantic',
  embeddingModel: 'local',
  localEmbeddingModel: 'nomic-embed-text',
  embeddingDimensions: 768,
  topK: 5,
  minConfidenceScore: 0.5,
  useHybridSearch: true,
  hybridAlpha: 0.7,
  useReranker: true,
  maxSourcesInContext: 8,
  groundedModeEnabled: false,
  showLowConfidenceWarning: true,
  lowConfidenceThreshold: 0.5,
};

/**
 * Get the PDF chat store file path
 */
function getPDFChatStorePath(): string {
  const userDataPath = app.getPath('userData');
  const pdfChatDir = path.join(userDataPath, 'pdf-chat');
  
  // Ensure directory exists
  if (!fs.existsSync(pdfChatDir)) {
    fs.mkdirSync(pdfChatDir, { recursive: true });
  }
  
  return path.join(pdfChatDir, 'sessions.json');
}

/**
 * Load PDF chat store data
 */
function loadPDFChatStore(): PDFChatStoreData {
  const storePath = getPDFChatStorePath();
  
  try {
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        sessions: parsed.sessions || [],
        recentDocuments: parsed.recentDocuments || [],
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        feedback: parsed.feedback || [],
      };
    }
  } catch (error) {
    console.error('[PDFHandlers] Error loading PDF chat store:', error);
  }
  
  return {
    sessions: [],
    recentDocuments: [],
    settings: DEFAULT_SETTINGS,
    feedback: [],
  };
}

/**
 * Save PDF chat store data
 */
function savePDFChatStore(data: PDFChatStoreData): void {
  const storePath = getPDFChatStorePath();
  
  try {
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[PDFHandlers] Error saving PDF chat store:', error);
  }
}

// In-memory store (loaded on first access)
let pdfChatStore: PDFChatStoreData | null = null;

function getStore(): PDFChatStoreData {
  if (!pdfChatStore) {
    pdfChatStore = loadPDFChatStore();
  }
  return pdfChatStore;
}

function persistStore(): void {
  if (pdfChatStore) {
    savePDFChatStore(pdfChatStore);
  }
}


// =============================================================================
// PDF Loading & Parsing Handlers
// =============================================================================

/**
 * Register PDF loading IPC handlers
 * 
 * Implements Requirement 3.1: Load PDF within 3 seconds for files under 10MB
 */
function registerPDFLoadingHandlers(): void {
  /**
   * Load a PDF document from file path
   * Channel: pdf:load
   */
  ipcMain.handle('pdf:load', async (_event, filePath: string, password?: string): Promise<PDFDocument> => {
    console.log('[PDFHandlers] Loading PDF:', filePath);
    
    try {
      // Validate file path
      if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
      }
      
      // Load document using PDF parser service
      const document = await pdfParserService.loadDocument(filePath, password);
      
      // Update recent documents
      const store = getStore();
      const existingIndex = store.recentDocuments.findIndex(d => d.filePath === filePath);
      
      const recentDoc: RecentDocument = {
        id: document.id,
        filePath: document.filePath,
        fileName: document.fileName,
        lastOpenedAt: Date.now(),
        isIndexed: false, // Will be updated when indexed
        pageCount: document.pageCount,
      };
      
      if (existingIndex >= 0) {
        store.recentDocuments[existingIndex] = recentDoc;
      } else {
        store.recentDocuments.unshift(recentDoc);
        // Keep only last 20 recent documents
        if (store.recentDocuments.length > 20) {
          store.recentDocuments = store.recentDocuments.slice(0, 20);
        }
      }
      
      persistStore();
      
      console.log('[PDFHandlers] PDF loaded successfully:', document.id);
      return document;
    } catch (error) {
      console.error('[PDFHandlers] Error loading PDF:', error);
      throw error;
    }
  });

  /**
   * Get a specific page from a loaded document
   * Channel: pdf:get-page
   */
  ipcMain.handle('pdf:get-page', async (_event, docId: string, pageNum: number): Promise<PDFPage> => {
    console.log('[PDFHandlers] Getting page:', docId, pageNum);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      if (typeof pageNum !== 'number' || pageNum < 1) {
        throw new Error('Invalid page number');
      }
      
      const page = await pdfParserService.getPage(docId, pageNum);
      return page;
    } catch (error) {
      console.error('[PDFHandlers] Error getting page:', error);
      throw error;
    }
  });

  /**
   * Search for text within a document
   * Channel: pdf:search-text
   */
  ipcMain.handle('pdf:search-text', async (_event, docId: string, query: string): Promise<TextSearchResult[]> => {
    console.log('[PDFHandlers] Searching text:', docId, query);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      if (!query || typeof query !== 'string') {
        return [];
      }
      
      const results = await pdfParserService.searchText(docId, query);
      return results;
    } catch (error) {
      console.error('[PDFHandlers] Error searching text:', error);
      throw error;
    }
  });

  /**
   * Get the document outline (table of contents)
   * Channel: pdf:get-outline
   */
  ipcMain.handle('pdf:get-outline', async (_event, docId: string): Promise<OutlineItem[]> => {
    console.log('[PDFHandlers] Getting outline:', docId);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      const outline = await pdfParserService.getDocumentOutline(docId);
      return outline;
    } catch (error) {
      console.error('[PDFHandlers] Error getting outline:', error);
      throw error;
    }
  });

  /**
   * Unload a document from memory
   * Channel: pdf:unload
   */
  ipcMain.handle('pdf:unload', async (_event, docId: string): Promise<void> => {
    console.log('[PDFHandlers] Unloading document:', docId);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      pdfParserService.unloadDocument(docId);
      console.log('[PDFHandlers] Document unloaded:', docId);
    } catch (error) {
      console.error('[PDFHandlers] Error unloading document:', error);
      throw error;
    }
  });
}


// =============================================================================
// PDF Indexing Handlers
// =============================================================================

/**
 * Register PDF indexing IPC handlers
 * 
 * Implements Requirements 6.1, 18.6, 19.3
 */
function registerPDFIndexingHandlers(): void {
  /**
   * Index a document for RAG retrieval
   * Channel: pdf:index
   * 
   * This handler supports background indexing with progress events
   */
  ipcMain.handle('pdf:index', async (event, docId: string, options?: IndexOptions): Promise<IndexResult> => {
    console.log('[PDFHandlers] Indexing document:', docId, options);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      // Get the sender window for progress events
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      
      // Set up progress callback
      const progressCallback = (progress: number) => {
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('pdf:index-progress', docId, progress);
        }
      };
      
      // Start indexing
      const result = await ragEngine.indexDocument(docId, options);
      
      // Send completion event
      if (senderWindow && !senderWindow.isDestroyed()) {
        if (result.success) {
          senderWindow.webContents.send('pdf:index-complete', docId, result);
        } else {
          senderWindow.webContents.send('pdf:index-error', docId, result.error || 'Unknown error');
        }
      }
      
      // Update recent documents with indexed status
      if (result.success) {
        const store = getStore();
        const recentDoc = store.recentDocuments.find(d => d.id === docId);
        if (recentDoc) {
          recentDoc.isIndexed = true;
        }
        persistStore();
      }
      
      console.log('[PDFHandlers] Indexing complete:', docId, result.success);
      return result;
    } catch (error) {
      console.error('[PDFHandlers] Error indexing document:', error);
      
      // Send error event
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.webContents.send('pdf:index-error', docId, error instanceof Error ? error.message : String(error));
      }
      
      return {
        success: false,
        documentId: docId,
        chunkCount: 0,
        indexingTimeMs: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Get the indexing status of a document
   * Channel: pdf:get-index-status
   */
  ipcMain.handle('pdf:get-index-status', async (_event, docId: string): Promise<IndexStatus> => {
    console.log('[PDFHandlers] Getting index status:', docId);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      // Use async version to check vector store
      const status = await ragEngine.getIndexStatusAsync(docId);
      return status;
    } catch (error) {
      console.error('[PDFHandlers] Error getting index status:', error);
      return {
        isIndexed: false,
        chunkCount: 0,
        isIndexing: false,
      };
    }
  });

  /**
   * Delete the index for a document
   * Channel: pdf:delete-index
   */
  ipcMain.handle('pdf:delete-index', async (_event, docId: string): Promise<void> => {
    console.log('[PDFHandlers] Deleting index:', docId);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      await ragEngine.deleteIndex(docId);
      
      // Update recent documents
      const store = getStore();
      const recentDoc = store.recentDocuments.find(d => d.id === docId);
      if (recentDoc) {
        recentDoc.isIndexed = false;
      }
      persistStore();
      
      console.log('[PDFHandlers] Index deleted:', docId);
    } catch (error) {
      console.error('[PDFHandlers] Error deleting index:', error);
      throw error;
    }
  });
}


// =============================================================================
// RAG Query Handlers
// =============================================================================

/**
 * Register RAG query IPC handlers
 * 
 * Implements Requirements 7.7, 8.1
 */
function registerRAGQueryHandlers(): void {
  /**
   * Query documents using RAG
   * Channel: pdf:query
   * 
   * Returns structured RAG response with citations
   */
  ipcMain.handle('pdf:query', async (
    _event,
    query: string,
    docIds: string[],
    options?: QueryOptions,
    conversationContext?: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      viewState?: { currentPage: number; visibleText: string };
    }
  ): Promise<RAGResponse> => {
    console.log('[PDFHandlers] RAG query:', query, docIds);
    
    try {
      if (!query || typeof query !== 'string') {
        throw new Error('Invalid query');
      }
      
      if (!Array.isArray(docIds) || docIds.length === 0) {
        throw new Error('No documents specified for query');
      }
      
      // Build conversation context if provided
      const context = conversationContext ? {
        messages: conversationContext.messages || [],
        documentIds: docIds,
        viewState: conversationContext.viewState,
      } : undefined;
      
      // Execute RAG query
      const response = await ragEngine.query(query, docIds, options, context);
      
      console.log('[PDFHandlers] RAG query complete, sources:', response.sources.length);
      return response;
    } catch (error) {
      console.error('[PDFHandlers] Error executing RAG query:', error);
      throw error;
    }
  });

  /**
   * Get specific chunks by ID
   * Channel: pdf:get-chunks
   */
  ipcMain.handle('pdf:get-chunks', async (_event, docId: string, chunkIds: string[]): Promise<Chunk[]> => {
    console.log('[PDFHandlers] Getting chunks:', docId, chunkIds.length);
    
    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }
      
      if (!Array.isArray(chunkIds)) {
        throw new Error('Invalid chunk IDs');
      }
      
      // Get chunks from chunk manager or vector store
      const chunks: Chunk[] = [];
      
      for (const chunkId of chunkIds) {
        const chunk = chunkManager.getChunk(chunkId);
        if (chunk) {
          chunks.push(chunk);
        }
      }
      
      // If not found in memory, try vector store
      if (chunks.length < chunkIds.length) {
        const missingIds = chunkIds.filter(id => !chunks.find(c => c.id === id));
        const storedChunks = await vectorStore.getChunks(missingIds);
        
        for (const record of storedChunks) {
          // Convert ChunkRecord to Chunk
          let boundingBoxes = [];
          try {
            boundingBoxes = JSON.parse(record.boundingBoxes || '[]');
          } catch {
            boundingBoxes = [];
          }
          
          chunks.push({
            id: record.id,
            documentId: record.documentId,
            content: record.content,
            metadata: {
              pageNumbers: record.pageNumbers || [],
              boundingBoxes,
              sectionHeader: record.sectionHeader || undefined,
              chunkIndex: record.chunkIndex,
              tokenCount: record.tokenCount,
              blockType: record.blockType as 'text' | 'table' | 'figure',
            },
            embedding: record.vector,
          });
        }
      }
      
      return chunks;
    } catch (error) {
      console.error('[PDFHandlers] Error getting chunks:', error);
      throw error;
    }
  });
}


// =============================================================================
// Session Management Handlers
// =============================================================================

/**
 * Register session management IPC handlers
 * 
 * Implements Requirements 11.1, 11.2
 */
function registerSessionManagementHandlers(): void {
  /**
   * Create a new PDF chat session
   * Channel: pdf-chat:create-session
   */
  ipcMain.handle('pdf-chat:create-session', async (_event, docIds: string[]): Promise<PDFChatSession> => {
    console.log('[PDFHandlers] Creating session for documents:', docIds);
    
    try {
      if (!Array.isArray(docIds) || docIds.length === 0) {
        throw new Error('No documents specified for session');
      }
      
      const store = getStore();
      
      // Generate session title from document names
      const docNames = docIds.map(id => {
        const recentDoc = store.recentDocuments.find(d => d.id === id);
        return recentDoc?.fileName || id;
      });
      const title = docNames.length === 1 
        ? docNames[0] 
        : `${docNames[0]} + ${docNames.length - 1} more`;
      
      const session: PDFChatSession = {
        id: generateUUID(),
        title,
        documentIds: docIds,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      store.sessions.unshift(session);
      persistStore();
      
      console.log('[PDFHandlers] Session created:', session.id);
      return session;
    } catch (error) {
      console.error('[PDFHandlers] Error creating session:', error);
      throw error;
    }
  });

  /**
   * Get all PDF chat sessions
   * Channel: pdf-chat:get-sessions
   */
  ipcMain.handle('pdf-chat:get-sessions', async (): Promise<PDFChatSession[]> => {
    console.log('[PDFHandlers] Getting all sessions');
    
    try {
      const store = getStore();
      return store.sessions;
    } catch (error) {
      console.error('[PDFHandlers] Error getting sessions:', error);
      return [];
    }
  });

  /**
   * Get a specific session by ID
   * Channel: pdf-chat:get-session
   */
  ipcMain.handle('pdf-chat:get-session', async (_event, sessionId: string): Promise<PDFChatSession | null> => {
    console.log('[PDFHandlers] Getting session:', sessionId);
    
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid session ID');
      }
      
      const store = getStore();
      const session = store.sessions.find(s => s.id === sessionId);
      return session || null;
    } catch (error) {
      console.error('[PDFHandlers] Error getting session:', error);
      return null;
    }
  });

  /**
   * Save/update a session
   * Channel: pdf-chat:save-session
   */
  ipcMain.handle('pdf-chat:save-session', async (_event, session: PDFChatSession): Promise<void> => {
    console.log('[PDFHandlers] Saving session:', session.id);
    
    try {
      if (!session || !session.id) {
        throw new Error('Invalid session');
      }
      
      const store = getStore();
      const existingIndex = store.sessions.findIndex(s => s.id === session.id);
      
      // Update timestamp
      session.updatedAt = Date.now();
      
      if (existingIndex >= 0) {
        store.sessions[existingIndex] = session;
      } else {
        store.sessions.unshift(session);
      }
      
      persistStore();
      console.log('[PDFHandlers] Session saved:', session.id);
    } catch (error) {
      console.error('[PDFHandlers] Error saving session:', error);
      throw error;
    }
  });

  /**
   * Delete a session
   * Channel: pdf-chat:delete-session
   */
  ipcMain.handle('pdf-chat:delete-session', async (_event, sessionId: string): Promise<void> => {
    console.log('[PDFHandlers] Deleting session:', sessionId);
    
    try {
      if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Invalid session ID');
      }
      
      const store = getStore();
      const index = store.sessions.findIndex(s => s.id === sessionId);
      
      if (index >= 0) {
        store.sessions.splice(index, 1);
        persistStore();
        console.log('[PDFHandlers] Session deleted:', sessionId);
      }
    } catch (error) {
      console.error('[PDFHandlers] Error deleting session:', error);
      throw error;
    }
  });
}


// =============================================================================
// Settings and Feedback Handlers
// =============================================================================

/**
 * Register settings and feedback IPC handlers
 */
function registerSettingsAndFeedbackHandlers(): void {
  /**
   * Get current PDF RAG settings
   * Channel: pdf:get-settings
   */
  ipcMain.handle('pdf:get-settings', async (): Promise<PDFRAGSettings> => {
    console.log('[PDFHandlers] Getting settings');
    
    try {
      const store = getStore();
      return store.settings;
    } catch (error) {
      console.error('[PDFHandlers] Error getting settings:', error);
      return DEFAULT_SETTINGS;
    }
  });

  /**
   * Update PDF RAG settings
   * Channel: pdf:update-settings
   */
  ipcMain.handle('pdf:update-settings', async (_event, settings: Partial<PDFRAGSettings>): Promise<void> => {
    console.log('[PDFHandlers] Updating settings:', settings);
    
    try {
      const store = getStore();
      store.settings = { ...store.settings, ...settings };
      
      // Also update RAG engine settings
      ragEngine.updateSettings(store.settings);
      
      persistStore();
      console.log('[PDFHandlers] Settings updated');
    } catch (error) {
      console.error('[PDFHandlers] Error updating settings:', error);
      throw error;
    }
  });

  /**
   * Save user feedback on a response or citation
   * Channel: pdf:save-feedback
   */
  ipcMain.handle('pdf:save-feedback', async (_event, feedback: ResponseFeedback | CitationFeedback): Promise<void> => {
    console.log('[PDFHandlers] Saving feedback:', feedback);
    
    try {
      if (!feedback) {
        throw new Error('Invalid feedback');
      }
      
      const store = getStore();
      store.feedback.push(feedback);
      
      // Keep only last 1000 feedback entries
      if (store.feedback.length > 1000) {
        store.feedback = store.feedback.slice(-1000);
      }
      
      persistStore();
      console.log('[PDFHandlers] Feedback saved');
    } catch (error) {
      console.error('[PDFHandlers] Error saving feedback:', error);
      throw error;
    }
  });
}

// =============================================================================
// Handler Registration
// =============================================================================

/**
 * Register all PDF IPC handlers
 */
export function registerPDFHandlers(): void {
  console.log('[PDFHandlers] Registering PDF IPC handlers');
  
  registerPDFLoadingHandlers();
  registerPDFIndexingHandlers();
  registerRAGQueryHandlers();
  registerSessionManagementHandlers();
  registerSettingsAndFeedbackHandlers();
  
  console.log('[PDFHandlers] All PDF IPC handlers registered');
}

/**
 * Unregister all PDF IPC handlers
 */
export function unregisterPDFHandlers(): void {
  console.log('[PDFHandlers] Unregistering PDF IPC handlers');
  
  // PDF Loading
  ipcMain.removeHandler('pdf:load');
  ipcMain.removeHandler('pdf:get-page');
  ipcMain.removeHandler('pdf:search-text');
  ipcMain.removeHandler('pdf:get-outline');
  ipcMain.removeHandler('pdf:unload');
  
  // PDF Indexing
  ipcMain.removeHandler('pdf:index');
  ipcMain.removeHandler('pdf:get-index-status');
  ipcMain.removeHandler('pdf:delete-index');
  
  // RAG Query
  ipcMain.removeHandler('pdf:query');
  ipcMain.removeHandler('pdf:get-chunks');
  
  // Session Management
  ipcMain.removeHandler('pdf-chat:create-session');
  ipcMain.removeHandler('pdf-chat:get-sessions');
  ipcMain.removeHandler('pdf-chat:get-session');
  ipcMain.removeHandler('pdf-chat:save-session');
  ipcMain.removeHandler('pdf-chat:delete-session');
  
  // Settings and Feedback
  ipcMain.removeHandler('pdf:get-settings');
  ipcMain.removeHandler('pdf:update-settings');
  ipcMain.removeHandler('pdf:save-feedback');
  
  console.log('[PDFHandlers] All PDF IPC handlers unregistered');
}

