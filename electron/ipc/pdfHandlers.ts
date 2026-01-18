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
  embeddingService,
  generatePDFSystemPrompt,
  buildPDFChatErrorMessage,
} from '../pdf';
import type { PDFChatContext } from '../pdf';

// Import types
import type {
  PDFDocument,
  PDFPage,
  TextSearchResult,
  OutlineItem,
  MajorSection,
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
  DocumentRetrievalSettings,
  ModelChangeInfo,
  IndexedDocumentInfo,
  RetrievalResult,
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
  /** Per-document retrieval settings (Requirement 16.7) */
  documentSettings: DocumentRetrievalSettings[];
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
  // Image processing settings
  processImages: true,
  visionModel: 'qwen2-vl:2b',
  enableOCRFallback: true,
  preferVisionOverOCR: true,
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
        documentSettings: parsed.documentSettings || [],
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
    documentSettings: [],
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
   * Get major sections from the document outline
   * Channel: pdf:get-major-sections
   * 
   * Identifies top-level sections from the PDF outline/table of contents
   * for section-aware summarization.
   * 
   * Implements Requirement 12.2: Extract document outline/table of contents
   */
  ipcMain.handle('pdf:get-major-sections', async (_event, docId: string): Promise<MajorSection[]> => {
    console.log('[PDFHandlers] Getting major sections:', docId);

    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }

      const sections = await pdfParserService.getMajorSections(docId);
      console.log('[PDFHandlers] Found', sections.length, 'major sections');
      return sections;
    } catch (error) {
      console.error('[PDFHandlers] Error getting major sections:', error);
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

      // Set up log callback for detailed progress messages
      const logCallback = (level: 'info' | 'success' | 'warning' | 'error', message: string) => {
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('pdf:index-log', docId, { level, message, timestamp: Date.now() });
        }
      };

      // Start indexing with progress and log callbacks
      const result = await ragEngine.indexDocument(docId, options, progressCallback, logCallback);

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
 * Implements Requirements 7.7, 8.1, 12.1, 12.3, 12.4
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
   * Get RAG context for a query (without generating AI response)
   * Channel: pdf:get-context
   *
   * Returns the retrieved context, sources, and citations for the renderer
   * to generate the AI response. This allows the renderer to use its own
   * AI services rather than requiring AI generation in the main process.
   */
  ipcMain.handle('pdf:get-context', async (
    _event,
    query: string,
    docIds: string[],
    options?: QueryOptions,
    conversationContext?: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      viewState?: { currentPage: number; visibleText: string };
    }
  ): Promise<{
    contextString: string;
    sources: RetrievalResult[];
    confidence: number;
    isLowConfidence: boolean;
    warning?: string;
    documentNameMap?: Map<string, string>;
    pdfSystemPrompt: string;
    documentMetadata: Array<{
      id: string;
      fileName: string;
      pageCount: number;
      title?: string;
    }>;
  }> => {
    console.log('[PDFHandlers] Getting RAG context:', query, docIds);

    try {
      if (!query || typeof query !== 'string') {
        throw new Error('Invalid query');
      }

      if (!Array.isArray(docIds) || docIds.length === 0) {
        throw new Error('No documents specified for context retrieval');
      }

      // Build query options
      const queryOpts: QueryOptions = {
        topK: options?.topK ?? 5,
        minScore: options?.minScore ?? 0.5,
        useHybrid: options?.useHybrid ?? true,
        useReranker: options?.useReranker ?? true,
        pageFilter: options?.pageFilter,
        sectionFilter: options?.sectionFilter,
      };

      // Apply view context filter if query references current view
      if (conversationContext?.viewState) {
        const viewRefPatterns = [
          /\bthis page\b/i,
          /\bcurrent page\b/i,
          /\bthe table above\b/i,
          /\bthe figure above\b/i,
          /\bthis section\b/i,
          /\bhere\b/i,
        ];
        const hasViewRef = viewRefPatterns.some(pattern => pattern.test(query));
        if (hasViewRef) {
          queryOpts.pageFilter = {
            start: conversationContext.viewState.currentPage,
            end: conversationContext.viewState.currentPage,
          };
        }
      }

      // Build proper conversation context for RAG engine
      const ragConversationContext = conversationContext ? {
        messages: conversationContext.messages || [],
        documentIds: docIds,
        viewState: conversationContext.viewState,
      } : undefined;

      // Get context from RAG engine
      const ragContext = await ragEngine.getContextForQuery(
        query,
        docIds,
        queryOpts,
        ragConversationContext
      );

      // Gather document metadata
      const documentMetadata: Array<{
        id: string;
        fileName: string;
        pageCount: number;
        title?: string;
      }> = [];

      let totalPageCount = 0;
      const documentNames: string[] = [];

      for (const docId of docIds) {
        const loadedDoc = pdfParserService.getLoadedDocument(docId);
        if (loadedDoc) {
          const doc = loadedDoc.document;
          documentMetadata.push({
            id: docId,
            fileName: doc.fileName,
            pageCount: doc.pageCount,
            title: doc.metadata?.title,
          });
          totalPageCount += doc.pageCount;
          documentNames.push(doc.fileName);
        }
      }

      // Generate PDF-aware system prompt
      const pdfChatContext: PDFChatContext = {
        documentNames,
        pageCount: totalPageCount,
        currentPage: conversationContext?.viewState?.currentPage,
        hasMultipleDocuments: docIds.length > 1,
        retrievedContext: ragContext.contextString,
        groundedMode: options?.minScore ? options.minScore > 0.5 : false,
      };

      const pdfSystemPrompt = generatePDFSystemPrompt(pdfChatContext);

      console.log('[PDFHandlers] RAG context retrieved, sources:', ragContext.sources.length);
      console.log('[PDFHandlers] Generated PDF system prompt with context');

      return {
        ...ragContext,
        pdfSystemPrompt,
        documentMetadata,
      };
    } catch (error) {
      console.error('[PDFHandlers] Error getting RAG context:', error);
      throw error;
    }
  });

  /**
   * Generate section-by-section document summary
   * Channel: pdf:summarize-document
   *
   * Implements Requirements 12.1, 12.3, 12.4:
   * - 12.1: Generate document summary
   * - 12.3: Section-by-section summarization
   * - 12.4: Include section citations in summary
   */
  ipcMain.handle('pdf:summarize-document', async (
    _event,
    docId: string,
    options?: {
      maxSectionsToSummarize?: number;
      includeSubsections?: boolean;
    }
  ): Promise<import('../../src/types/pdf').DocumentSummary> => {
    console.log('[PDFHandlers] Generating document summary:', docId, options);

    try {
      if (!docId || typeof docId !== 'string') {
        throw new Error('Invalid document ID');
      }

      // Generate document summary using RAG engine
      const summary = await ragEngine.generateDocumentSummary(docId, options);

      console.log('[PDFHandlers] Document summary generated:', {
        documentId: summary.documentId,
        sectionCount: summary.sectionCount,
        citationCount: summary.citations.length,
      });

      return summary;
    } catch (error) {
      console.error('[PDFHandlers] Error generating document summary:', error);
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

  /**
   * Get recent PDF documents
   * Channel: pdf-chat:get-recent-documents
   * 
   * Returns the list of recently opened PDF documents for display in the sidebar.
   * Implements Requirements 1.4, 1.5
   */
  ipcMain.handle('pdf-chat:get-recent-documents', async (_event, limit?: number): Promise<RecentDocument[]> => {
    console.log('[PDFHandlers] Getting recent documents, limit:', limit);

    try {
      const store = getStore();
      const maxDocs = limit && typeof limit === 'number' ? Math.min(limit, 20) : 10;

      // Return the most recent documents, limited to maxDocs
      const recentDocs = store.recentDocuments.slice(0, maxDocs);

      console.log('[PDFHandlers] Returning', recentDocs.length, 'recent documents');
      return recentDocs;
    } catch (error) {
      console.error('[PDFHandlers] Error getting recent documents:', error);
      return [];
    }
  });
}


// =============================================================================
// Settings and Feedback Handlers
// =============================================================================

/**
 * Register settings and feedback IPC handlers
 * 
 * Implements Requirement 16.7: Support per-collection retrieval settings
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

  // ==========================================================================
  // Per-Document Settings Handlers (Requirement 16.7)
  // ==========================================================================

  /**
   * Get per-document retrieval settings for a specific document
   * Channel: pdf:get-document-settings
   * 
   * Implements Requirement 16.7: Support per-collection retrieval settings
   */
  ipcMain.handle('pdf:get-document-settings', async (
    _event,
    documentId: string
  ): Promise<DocumentRetrievalSettings | null> => {
    console.log('[PDFHandlers] Getting document settings:', documentId);

    try {
      if (!documentId || typeof documentId !== 'string') {
        throw new Error('Invalid document ID');
      }

      const store = getStore();
      const settings = store.documentSettings.find(s => s.documentId === documentId);

      return settings || null;
    } catch (error) {
      console.error('[PDFHandlers] Error getting document settings:', error);
      return null;
    }
  });

  /**
   * Update per-document retrieval settings
   * Channel: pdf:update-document-settings
   * 
   * Implements Requirement 16.7: Support per-collection retrieval settings
   */
  ipcMain.handle('pdf:update-document-settings', async (
    _event,
    settings: DocumentRetrievalSettings
  ): Promise<void> => {
    console.log('[PDFHandlers] Updating document settings:', settings.documentId);

    try {
      if (!settings || !settings.documentId) {
        throw new Error('Invalid document settings');
      }

      const store = getStore();
      const existingIndex = store.documentSettings.findIndex(
        s => s.documentId === settings.documentId
      );

      // Update timestamp
      settings.updatedAt = Date.now();

      if (existingIndex >= 0) {
        store.documentSettings[existingIndex] = settings;
      } else {
        store.documentSettings.push(settings);
      }

      persistStore();
      console.log('[PDFHandlers] Document settings updated:', settings.documentId);
    } catch (error) {
      console.error('[PDFHandlers] Error updating document settings:', error);
      throw error;
    }
  });

  /**
   * Delete per-document retrieval settings
   * Channel: pdf:delete-document-settings
   * 
   * Implements Requirement 16.7: Support per-collection retrieval settings
   */
  ipcMain.handle('pdf:delete-document-settings', async (
    _event,
    documentId: string
  ): Promise<void> => {
    console.log('[PDFHandlers] Deleting document settings:', documentId);

    try {
      if (!documentId || typeof documentId !== 'string') {
        throw new Error('Invalid document ID');
      }

      const store = getStore();
      const index = store.documentSettings.findIndex(s => s.documentId === documentId);

      if (index >= 0) {
        store.documentSettings.splice(index, 1);
        persistStore();
        console.log('[PDFHandlers] Document settings deleted:', documentId);
      }
    } catch (error) {
      console.error('[PDFHandlers] Error deleting document settings:', error);
      throw error;
    }
  });

  /**
   * Get all per-document retrieval settings
   * Channel: pdf:get-all-document-settings
   * 
   * Implements Requirement 16.7: Support per-collection retrieval settings
   */
  ipcMain.handle('pdf:get-all-document-settings', async (): Promise<DocumentRetrievalSettings[]> => {
    console.log('[PDFHandlers] Getting all document settings');

    try {
      const store = getStore();
      return store.documentSettings;
    } catch (error) {
      console.error('[PDFHandlers] Error getting all document settings:', error);
      return [];
    }
  });

  /**
   * Save user feedback on a response or citation
   * Channel: pdf:save-feedback
   * 
   * Stores feedback with full context (session ID, response ID, citation ID, timestamp)
   * for later analysis. Feedback persists across application restarts.
   * 
   * Implements Requirements 17.3, 17.4:
   * - 17.3: Store feedback with context locally
   * - 17.4: Persist feedback across sessions
   */
  ipcMain.handle('pdf:save-feedback', async (_event, feedback: ResponseFeedback | CitationFeedback): Promise<void> => {
    console.log('[PDFHandlers] Saving feedback:', feedback);

    try {
      if (!feedback) {
        throw new Error('Invalid feedback');
      }

      // Validate required fields based on feedback type
      if (!feedback.sessionId || !feedback.responseId || !feedback.type || !feedback.timestamp) {
        throw new Error('Feedback missing required fields: sessionId, responseId, type, timestamp');
      }

      // For citation feedback, validate citationId
      if ('citationId' in feedback && !feedback.citationId) {
        throw new Error('Citation feedback missing required field: citationId');
      }

      const store = getStore();

      // Add the feedback with a unique ID if not present
      const feedbackWithId = {
        ...feedback,
        id: feedback.responseId + '_' + feedback.timestamp, // Create a unique ID
      };

      store.feedback.push(feedbackWithId);

      // Keep only last 1000 feedback entries to prevent unbounded growth
      if (store.feedback.length > 1000) {
        store.feedback = store.feedback.slice(-1000);
      }

      persistStore();
      console.log('[PDFHandlers] Feedback saved successfully:', feedbackWithId.id);
    } catch (error) {
      console.error('[PDFHandlers] Error saving feedback:', error);
      throw error;
    }
  });

  /**
   * Get feedback for a specific session or all feedback
   * Channel: pdf:get-feedback
   * 
   * Retrieves stored feedback, optionally filtered by session ID.
   * This allows the UI to display feedback state and enables
   * future analysis of user feedback patterns.
   * 
   * Implements Requirements 17.3, 17.4:
   * - 17.3: Store feedback with context locally (retrieval for display)
   * - 17.4: Persist feedback across sessions (retrieval after restart)
   */
  ipcMain.handle('pdf:get-feedback', async (
    _event,
    options?: {
      sessionId?: string;
      responseId?: string;
      limit?: number;
    }
  ): Promise<Array<ResponseFeedback | CitationFeedback>> => {
    console.log('[PDFHandlers] Getting feedback:', options);

    try {
      const store = getStore();
      let feedback = [...store.feedback];

      // Filter by session ID if provided
      if (options?.sessionId) {
        feedback = feedback.filter(f => f.sessionId === options.sessionId);
      }

      // Filter by response ID if provided
      if (options?.responseId) {
        feedback = feedback.filter(f => f.responseId === options.responseId);
      }

      // Apply limit if provided (return most recent)
      if (options?.limit && options.limit > 0) {
        feedback = feedback.slice(-options.limit);
      }

      console.log('[PDFHandlers] Returning', feedback.length, 'feedback entries');
      return feedback;
    } catch (error) {
      console.error('[PDFHandlers] Error getting feedback:', error);
      return [];
    }
  });

  // ==========================================================================
  // Embedding Model Management Handlers (Requirement 21.6)
  // ==========================================================================

  /**
   * Check if changing to a new embedding model would require re-indexing
   * Channel: pdf:check-model-change
   * 
   * Compares the new model with the model used to index existing documents.
   * Returns information about whether re-indexing is needed.
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   */
  ipcMain.handle('pdf:check-model-change', async (
    _event,
    newModelId: string
  ): Promise<{
    documentsNeedingReindex: IndexedDocumentInfo[];
    currentModelId: string;
    newModelId: string;
    hasDocumentsToReindex: boolean;
  }> => {
    console.log('[PDFHandlers] Checking model change to:', newModelId);

    try {
      if (!newModelId || typeof newModelId !== 'string') {
        throw new Error('Invalid model ID');
      }

      // Get all indexed documents
      const allDocuments = await vectorStore.getAllDocuments();

      // Get current model ID from embedding service
      const currentModelId = embeddingService.getCurrentModelId();

      // Find documents that need re-indexing (indexed with different model)
      const documentsNeedingReindex: IndexedDocumentInfo[] = allDocuments
        .filter(doc => doc.embeddingModel !== newModelId)
        .map(doc => ({
          id: doc.id,
          fileName: doc.fileName,
          filePath: doc.filePath,
          chunkCount: doc.chunkCount,
          embeddingModel: doc.embeddingModel,
          indexedAt: doc.indexedAt,
          needsReindex: true,
          currentModelId: newModelId,
        }));

      console.log('[PDFHandlers] Documents needing reindex:', documentsNeedingReindex.length);

      return {
        documentsNeedingReindex,
        currentModelId,
        newModelId,
        hasDocumentsToReindex: documentsNeedingReindex.length > 0,
      };
    } catch (error) {
      console.error('[PDFHandlers] Error checking model change:', error);
      throw error;
    }
  });

  /**
   * Get all indexed documents with their embedding model info
   * Channel: pdf:get-indexed-documents
   * 
   * Returns a list of all indexed documents with information about
   * which embedding model was used for each.
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   */
  ipcMain.handle('pdf:get-indexed-documents', async (): Promise<IndexedDocumentInfo[]> => {
    console.log('[PDFHandlers] Getting indexed documents');

    try {
      // Get all indexed documents from vector store
      const allDocuments = await vectorStore.getAllDocuments();

      // Get current model ID
      const currentModelId = embeddingService.getCurrentModelId();

      // Map to IndexedDocumentInfo with needsReindex flag
      const indexedDocs: IndexedDocumentInfo[] = allDocuments.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.filePath,
        chunkCount: doc.chunkCount,
        embeddingModel: doc.embeddingModel,
        indexedAt: doc.indexedAt,
        needsReindex: doc.embeddingModel !== currentModelId,
        currentModelId,
      }));

      console.log('[PDFHandlers] Returning', indexedDocs.length, 'indexed documents');
      return indexedDocs;
    } catch (error) {
      console.error('[PDFHandlers] Error getting indexed documents:', error);
      return [];
    }
  });

  /**
   * Get documents that need re-indexing with the current model
   * Channel: pdf:get-documents-needing-reindex
   * 
   * Returns documents indexed with a different embedding model
   * than the currently configured one.
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   */
  ipcMain.handle('pdf:get-documents-needing-reindex', async (): Promise<IndexedDocumentInfo[]> => {
    console.log('[PDFHandlers] Getting documents needing reindex');

    try {
      // Get current model ID
      const currentModelId = embeddingService.getCurrentModelId();

      // Get documents that need re-indexing
      const documentsNeedingReindex = await vectorStore.getDocumentsNeedingReindex(currentModelId);

      // Map to IndexedDocumentInfo
      const result: IndexedDocumentInfo[] = documentsNeedingReindex.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.filePath,
        chunkCount: doc.chunkCount,
        embeddingModel: doc.embeddingModel,
        indexedAt: doc.indexedAt,
        needsReindex: true,
        currentModelId,
      }));

      console.log('[PDFHandlers] Documents needing reindex:', result.length);
      return result;
    } catch (error) {
      console.error('[PDFHandlers] Error getting documents needing reindex:', error);
      return [];
    }
  });

  /**
   * Re-index specified documents with the current embedding model
   * Channel: pdf:reindex-documents
   * 
   * Deletes existing indexes and re-indexes documents with the
   * currently configured embedding model.
   * 
   * Implements Requirement 21.6: Handle embedding model changes
   */
  ipcMain.handle('pdf:reindex-documents', async (
    event,
    documentIds: string[]
  ): Promise<{
    success: boolean;
    results: Array<{ documentId: string; success: boolean; error?: string }>;
  }> => {
    console.log('[PDFHandlers] Re-indexing documents:', documentIds);

    try {
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        throw new Error('No documents specified for re-indexing');
      }

      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const results: Array<{ documentId: string; success: boolean; error?: string }> = [];

      for (const docId of documentIds) {
        try {
          // Send progress event
          if (senderWindow && !senderWindow.isDestroyed()) {
            senderWindow.webContents.send('pdf:reindex-progress', docId, 'starting');
          }

          // Delete existing index
          await ragEngine.deleteIndex(docId);

          // Re-index the document
          const indexResult = await ragEngine.indexDocument(docId, { forceReindex: true });

          results.push({
            documentId: docId,
            success: indexResult.success,
            error: indexResult.error,
          });

          // Send completion event
          if (senderWindow && !senderWindow.isDestroyed()) {
            senderWindow.webContents.send('pdf:reindex-progress', docId, indexResult.success ? 'complete' : 'error');
          }
        } catch (error) {
          console.error(`[PDFHandlers] Error re-indexing document ${docId}:`, error);
          results.push({
            documentId: docId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const allSuccess = results.every(r => r.success);
      console.log('[PDFHandlers] Re-indexing complete. All success:', allSuccess);

      return {
        success: allSuccess,
        results,
      };
    } catch (error) {
      console.error('[PDFHandlers] Error re-indexing documents:', error);
      throw error;
    }
  });

  // ==========================================================================
  // Model Caching Handlers (Requirement 21.7)
  // ==========================================================================

  /**
   * Get cache status for a specific embedding model
   * Channel: pdf:get-model-cache-status
   * 
   * Returns detailed status about a model's availability, cache state,
   * and download progress (for local models).
   * 
   * Implements Requirement 21.7: Cache downloaded models locally, support offline use
   */
  ipcMain.handle('pdf:get-model-cache-status', async (
    _event,
    modelId: string,
    options?: { forceRefresh?: boolean; timeoutMs?: number }
  ): Promise<import('../../src/types/pdf').ModelCacheStatus> => {
    console.log('[PDFHandlers] Getting model cache status:', modelId);

    try {
      if (!modelId || typeof modelId !== 'string') {
        throw new Error('Invalid model ID');
      }

      // Import the model caching functions
      const { getModelCacheStatus } = await import('../pdf/embeddingService');

      const status = await getModelCacheStatus(modelId, options);
      console.log('[PDFHandlers] Model cache status:', modelId, status.isAvailable ? 'available' : 'unavailable');

      return status;
    } catch (error) {
      console.error('[PDFHandlers] Error getting model cache status:', error);
      throw error;
    }
  });

  /**
   * Get status of all available embedding models
   * Channel: pdf:get-all-models-status
   * 
   * Returns status for all configured embedding models, including
   * availability, cache state, and API key configuration.
   * 
   * Implements Requirement 21.7: Cache downloaded models locally, support offline use
   */
  ipcMain.handle('pdf:get-all-models-status', async (
    _event,
    options?: { forceRefresh?: boolean; timeoutMs?: number }
  ): Promise<import('../../src/types/pdf').AllModelsStatus> => {
    console.log('[PDFHandlers] Getting all models status');

    try {
      // Import the model caching functions
      const { getAllModelsStatus } = await import('../pdf/embeddingService');

      const status = await getAllModelsStatus(options);
      console.log('[PDFHandlers] All models status:', status.models.length, 'models,',
        status.models.filter(m => m.isAvailable).length, 'available');

      return status;
    } catch (error) {
      console.error('[PDFHandlers] Error getting all models status:', error);
      throw error;
    }
  });

  /**
   * Download/pull a local embedding model via Ollama
   * Channel: pdf:download-model
   * 
   * Initiates download of a local embedding model through Ollama.
   * Sends progress events during download.
   * 
   * Implements Requirement 21.7: Cache downloaded models locally, support offline use
   */
  ipcMain.handle('pdf:download-model', async (
    event,
    modelId: string
  ): Promise<import('../../src/types/pdf').ModelDownloadResult> => {
    console.log('[PDFHandlers] Downloading model:', modelId);

    try {
      if (!modelId || typeof modelId !== 'string') {
        throw new Error('Invalid model ID');
      }

      const senderWindow = BrowserWindow.fromWebContents(event.sender);

      // Import the model caching functions
      const { downloadModel } = await import('../pdf/embeddingService');

      // Set up progress callback
      const onProgress = (progress: number, status: string) => {
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('pdf:model-download-progress', modelId, progress, status);
        }
      };

      const result = await downloadModel(modelId, onProgress);

      // Send completion event
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.webContents.send('pdf:model-download-complete', modelId, result);
      }

      console.log('[PDFHandlers] Model download complete:', modelId, result.success ? 'success' : 'failed');
      return result;
    } catch (error) {
      console.error('[PDFHandlers] Error downloading model:', error);
      throw error;
    }
  });

  /**
   * Clear the model availability cache
   * Channel: pdf:clear-model-cache
   * 
   * Forces fresh availability checks on next status request.
   * 
   * Implements Requirement 21.7: Cache downloaded models locally, support offline use
   */
  ipcMain.handle('pdf:clear-model-cache', async (): Promise<void> => {
    console.log('[PDFHandlers] Clearing model cache');

    try {
      // Import the model caching functions
      const { clearModelCache } = await import('../pdf/embeddingService');

      clearModelCache();
      console.log('[PDFHandlers] Model cache cleared');
    } catch (error) {
      console.error('[PDFHandlers] Error clearing model cache:', error);
      throw error;
    }
  });

  /**
   * Refresh the status of a specific model
   * Channel: pdf:refresh-model-status
   * 
   * Clears cache for the model and returns fresh status.
   * 
   * Implements Requirement 21.7: Cache downloaded models locally, support offline use
   */
  ipcMain.handle('pdf:refresh-model-status', async (
    _event,
    modelId: string
  ): Promise<import('../../src/types/pdf').ModelCacheStatus> => {
    console.log('[PDFHandlers] Refreshing model status:', modelId);

    try {
      if (!modelId || typeof modelId !== 'string') {
        throw new Error('Invalid model ID');
      }

      // Import the model caching functions
      const { refreshModelStatus } = await import('../pdf/embeddingService');

      const status = await refreshModelStatus(modelId);
      console.log('[PDFHandlers] Model status refreshed:', modelId, status.isAvailable ? 'available' : 'unavailable');

      return status;
    } catch (error) {
      console.error('[PDFHandlers] Error refreshing model status:', error);
      throw error;
    }
  });

  // ==========================================================================
  // Embedding Fallback Handlers (Requirement 18.2)
  // ==========================================================================

  /**
   * Get the current embedding fallback state
   * Channel: pdf:get-embedding-fallback-state
   * 
   * Returns the current state of the embedding fallback system,
   * including whether fallback mode is active and the reason.
   * 
   * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
   */
  ipcMain.handle('pdf:get-embedding-fallback-state', async (): Promise<import('../../src/types/pdf').EmbeddingFallbackState> => {
    console.log('[PDFHandlers] Getting embedding fallback state');

    try {
      const { embeddingFallbackManager } = await import('../pdf/embeddingService');
      const state = embeddingFallbackManager.getState();

      console.log('[PDFHandlers] Fallback state:', state.isActive ? 'active' : 'inactive');
      return state;
    } catch (error) {
      console.error('[PDFHandlers] Error getting fallback state:', error);
      // Return default state on error
      return {
        isActive: false,
        failureCount: 0,
        canRecover: true,
      };
    }
  });

  /**
   * Attempt to recover from embedding fallback mode
   * Channel: pdf:attempt-embedding-recovery
   * 
   * Tries to recover from fallback mode by checking if embeddings
   * are now available and testing embedding generation.
   * 
   * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
   */
  ipcMain.handle('pdf:attempt-embedding-recovery', async (): Promise<{
    success: boolean;
    state: import('../../src/types/pdf').EmbeddingFallbackState;
  }> => {
    console.log('[PDFHandlers] Attempting embedding recovery');

    try {
      const { embeddingFallbackManager } = await import('../pdf/embeddingService');

      const success = await embeddingFallbackManager.attemptRecovery();
      const state = embeddingFallbackManager.getState();

      console.log('[PDFHandlers] Recovery attempt:', success ? 'successful' : 'failed');
      return { success, state };
    } catch (error) {
      console.error('[PDFHandlers] Error attempting recovery:', error);
      return {
        success: false,
        state: {
          isActive: true,
          failureCount: 0,
          canRecover: true,
          lastError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  /**
   * Get embedding fallback notification for UI display
   * Channel: pdf:get-embedding-fallback-notification
   * 
   * Returns a notification object suitable for displaying to the user
   * when fallback mode is active.
   * 
   * Implements Requirement 18.2: Notify user of fallback
   */
  ipcMain.handle('pdf:get-embedding-fallback-notification', async (): Promise<import('../../src/types/pdf').EmbeddingFallbackNotification | null> => {
    console.log('[PDFHandlers] Getting embedding fallback notification');

    try {
      const { embeddingFallbackManager } = await import('../pdf/embeddingService');
      const notification = embeddingFallbackManager.createNotification();

      return notification;
    } catch (error) {
      console.error('[PDFHandlers] Error getting fallback notification:', error);
      return null;
    }
  });

  /**
   * Check embedding availability and update fallback state
   * Channel: pdf:check-embedding-availability
   * 
   * Checks if the current embedding model is available and updates
   * the fallback state accordingly.
   * 
   * Implements Requirement 18.2: Fall back to BM25 when embeddings unavailable
   */
  ipcMain.handle('pdf:check-embedding-availability', async (): Promise<{
    available: boolean;
    state: import('../../src/types/pdf').EmbeddingFallbackState;
  }> => {
    console.log('[PDFHandlers] Checking embedding availability');

    try {
      const { checkEmbeddingAvailability, embeddingFallbackManager } = await import('../pdf/embeddingService');

      const available = await checkEmbeddingAvailability();
      const state = embeddingFallbackManager.getState();

      console.log('[PDFHandlers] Embedding availability:', available ? 'available' : 'unavailable');
      return { available, state };
    } catch (error) {
      console.error('[PDFHandlers] Error checking embedding availability:', error);
      return {
        available: false,
        state: {
          isActive: true,
          failureCount: 0,
          canRecover: true,
          lastError: error instanceof Error ? error.message : String(error),
        },
      };
    }
  });

  // ==========================================================================
  // Index Corruption Recovery Handlers (Requirement 18.4)
  // ==========================================================================

  /**
   * Check the index for corruption
   * Channel: pdf:check-index-corruption
   * 
   * Performs a comprehensive check of the vector store index to detect
   * various types of corruption including missing tables, orphaned chunks,
   * invalid embeddings, and data inconsistencies.
   * 
   * Implements Requirement 18.4: IF the Vector_Store becomes corrupted,
   * THEN THE System SHALL offer to rebuild the index
   */
  ipcMain.handle('pdf:check-index-corruption', async (): Promise<import('../../src/types/pdf').IndexCorruptionCheckResult> => {
    console.log('[PDFHandlers] Checking index for corruption');

    try {
      const result = await vectorStore.checkIndexCorruption();

      console.log('[PDFHandlers] Corruption check complete:', {
        isCorrupted: result.isCorrupted,
        issueCount: result.issues.length,
        rebuildRecommended: result.rebuildRecommended,
      });

      return result;
    } catch (error) {
      console.error('[PDFHandlers] Error checking index corruption:', error);

      // Return a result indicating we couldn't check
      return {
        isCorrupted: true,
        isHealthy: false,
        issues: [{
          type: 'unknown',
          description: `Failed to check index: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'critical',
          canAutoRepair: false,
          suggestedAction: 'Try clearing and rebuilding the entire index',
        }],
        checkedAt: Date.now(),
        documentsChecked: 0,
        chunksChecked: 0,
        rebuildRecommended: true,
        summary: 'Unable to check index integrity. A rebuild may be required.',
      };
    }
  });

  /**
   * Rebuild corrupted index
   * Channel: pdf:rebuild-corrupted-index
   * 
   * Rebuilds the index for specified documents or all documents if none specified.
   * Sends progress events during the rebuild process.
   * 
   * Implements Requirement 18.4: Offer rebuild option
   */
  ipcMain.handle('pdf:rebuild-corrupted-index', async (
    event,
    options?: import('../../src/types/pdf').IndexRebuildOptions
  ): Promise<import('../../src/types/pdf').IndexRebuildResult> => {
    console.log('[PDFHandlers] Rebuilding corrupted index:', options);

    const startTime = Date.now();
    const rebuiltDocuments: string[] = [];
    const failedDocuments: Array<{ documentId: string; error: string }> = [];
    let totalChunksCreated = 0;

    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);

      // Send progress update helper
      const sendProgress = (progress: import('../../src/types/pdf').IndexRebuildProgress) => {
        if (senderWindow && !senderWindow.isDestroyed()) {
          senderWindow.webContents.send('pdf:rebuild-progress', progress);
        }
      };

      // Phase 1: Preparing
      sendProgress({
        phase: 'preparing',
        overallProgress: 0,
        documentsProcessed: 0,
        totalDocuments: 0,
        chunksCreated: 0,
        errors: [],
      });

      // Determine which documents to rebuild
      let documentsToRebuild: import('../pdf/types').DocumentRecord[];

      if (options?.documentIds && options.documentIds.length > 0) {
        // Rebuild specific documents
        const allDocs = await vectorStore.getAllDocuments();
        documentsToRebuild = allDocs.filter(d => options.documentIds!.includes(d.id));
      } else {
        // Rebuild all documents that need it
        documentsToRebuild = await vectorStore.getDocumentsNeedingRebuild();

        // If no documents need rebuild but force is set, rebuild all
        if (documentsToRebuild.length === 0 && options?.force) {
          documentsToRebuild = await vectorStore.getAllDocuments();
        }
      }

      if (documentsToRebuild.length === 0) {
        return {
          success: true,
          rebuiltDocuments: [],
          failedDocuments: [],
          totalChunksCreated: 0,
          rebuildTimeMs: Date.now() - startTime,
          isHealthy: true,
          summary: 'No documents needed rebuilding.',
        };
      }

      // Phase 2: Cleaning (if requested)
      if (options?.cleanupOrphans) {
        sendProgress({
          phase: 'cleaning',
          overallProgress: 5,
          documentsProcessed: 0,
          totalDocuments: documentsToRebuild.length,
          chunksCreated: 0,
          errors: [],
        });

        await vectorStore.cleanupOrphanedChunks();
      }

      // Phase 3: Reindexing
      const totalDocs = documentsToRebuild.length;

      for (let i = 0; i < documentsToRebuild.length; i++) {
        const doc = documentsToRebuild[i];

        sendProgress({
          phase: 'reindexing',
          overallProgress: 10 + Math.floor((i / totalDocs) * 80),
          currentDocument: doc.fileName,
          documentsProcessed: i,
          totalDocuments: totalDocs,
          chunksCreated: totalChunksCreated,
          errors: failedDocuments,
        });

        try {
          // Check if the source file still exists
          if (!fs.existsSync(doc.filePath)) {
            failedDocuments.push({
              documentId: doc.id,
              error: 'Source PDF file not found',
            });
            continue;
          }

          // Delete existing index for this document
          await ragEngine.deleteIndex(doc.id);

          // Re-index the document
          const indexResult = await ragEngine.indexDocument(doc.id, { forceReindex: true });

          if (indexResult.success) {
            rebuiltDocuments.push(doc.id);
            totalChunksCreated += indexResult.chunkCount;
          } else {
            failedDocuments.push({
              documentId: doc.id,
              error: indexResult.error || 'Unknown indexing error',
            });
          }
        } catch (error) {
          console.error(`[PDFHandlers] Error rebuilding document ${doc.id}:`, error);
          failedDocuments.push({
            documentId: doc.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Phase 4: Verifying
      sendProgress({
        phase: 'verifying',
        overallProgress: 95,
        documentsProcessed: totalDocs,
        totalDocuments: totalDocs,
        chunksCreated: totalChunksCreated,
        errors: failedDocuments,
      });

      // Verify the rebuild
      const verificationResult = await vectorStore.checkIndexCorruption();

      // Phase 5: Complete
      sendProgress({
        phase: 'complete',
        overallProgress: 100,
        documentsProcessed: totalDocs,
        totalDocuments: totalDocs,
        chunksCreated: totalChunksCreated,
        errors: failedDocuments,
      });

      const success = failedDocuments.length === 0;
      const rebuildTimeMs = Date.now() - startTime;

      let summary: string;
      if (success) {
        summary = `Successfully rebuilt ${rebuiltDocuments.length} document(s) with ${totalChunksCreated} chunks in ${Math.round(rebuildTimeMs / 1000)}s.`;
      } else {
        summary = `Rebuilt ${rebuiltDocuments.length} document(s), ${failedDocuments.length} failed. ${totalChunksCreated} chunks created.`;
      }

      console.log('[PDFHandlers] Rebuild complete:', summary);

      return {
        success,
        rebuiltDocuments,
        failedDocuments,
        totalChunksCreated,
        rebuildTimeMs,
        isHealthy: verificationResult.isHealthy,
        summary,
        remainingIssues: verificationResult.issues.length > 0 ? verificationResult.issues : undefined,
      };

    } catch (error) {
      console.error('[PDFHandlers] Error during index rebuild:', error);

      return {
        success: false,
        rebuiltDocuments,
        failedDocuments: [...failedDocuments, {
          documentId: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        }],
        totalChunksCreated,
        rebuildTimeMs: Date.now() - startTime,
        isHealthy: false,
        summary: `Rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Clean up orphaned chunks
   * Channel: pdf:cleanup-orphaned-chunks
   * 
   * Removes chunks that don't have corresponding document records.
   * This is a safe cleanup operation.
   * 
   * Implements Requirement 18.4: Index corruption recovery
   */
  ipcMain.handle('pdf:cleanup-orphaned-chunks', async (): Promise<{
    success: boolean;
    removed: number;
    errors: string[];
  }> => {
    console.log('[PDFHandlers] Cleaning up orphaned chunks');

    try {
      const result = await vectorStore.cleanupOrphanedChunks();

      console.log('[PDFHandlers] Cleanup complete:', result);

      return {
        success: result.errors.length === 0,
        removed: result.removed,
        errors: result.errors,
      };
    } catch (error) {
      console.error('[PDFHandlers] Error cleaning up orphaned chunks:', error);
      return {
        success: false,
        removed: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  });

  /**
   * Repair document chunk counts
   * Channel: pdf:repair-chunk-counts
   * 
   * Updates document records to have accurate chunk counts.
   * 
   * Implements Requirement 18.4: Index corruption recovery
   */
  ipcMain.handle('pdf:repair-chunk-counts', async (): Promise<{
    success: boolean;
    repaired: number;
    errors: string[];
  }> => {
    console.log('[PDFHandlers] Repairing chunk counts');

    try {
      const result = await vectorStore.repairChunkCounts();

      console.log('[PDFHandlers] Repair complete:', result);

      return {
        success: result.errors.length === 0,
        repaired: result.repaired,
        errors: result.errors,
      };
    } catch (error) {
      console.error('[PDFHandlers] Error repairing chunk counts:', error);
      return {
        success: false,
        repaired: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  });

  /**
   * Get documents that need rebuilding
   * Channel: pdf:get-documents-needing-rebuild
   * 
   * Returns a list of documents that have corruption issues
   * and need to be rebuilt.
   * 
   * Implements Requirement 18.4: Index corruption recovery
   */
  ipcMain.handle('pdf:get-documents-needing-rebuild', async (): Promise<import('../../src/types/pdf').IndexedDocumentInfo[]> => {
    console.log('[PDFHandlers] Getting documents needing rebuild');

    try {
      const documents = await vectorStore.getDocumentsNeedingRebuild();
      const currentModelId = embeddingService.getCurrentModelId();

      const result: import('../../src/types/pdf').IndexedDocumentInfo[] = documents.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        filePath: doc.filePath,
        chunkCount: doc.chunkCount,
        embeddingModel: doc.embeddingModel,
        indexedAt: doc.indexedAt,
        needsReindex: true,
        currentModelId,
      }));

      console.log('[PDFHandlers] Documents needing rebuild:', result.length);
      return result;
    } catch (error) {
      console.error('[PDFHandlers] Error getting documents needing rebuild:', error);
      return [];
    }
  });
}

// =============================================================================
// Handler Registration
// =============================================================================

/**
 * Register all PDF IPC handlers
 *
 * Note: PDF Loading handlers (pdf:load, pdf:get-page, etc.) are registered
 * separately by pdfCoreHandlers to avoid conflicts and ensure basic PDF
 * functionality works even when RAG features are unavailable.
 */
export function registerPDFHandlers(): void {
  console.log('[PDFHandlers] Registering PDF IPC handlers');

  // Skip registerPDFLoadingHandlers() - those are registered by pdfCoreHandlers
  // This prevents "Attempted to register a second handler" errors
  // registerPDFLoadingHandlers();
  registerPDFIndexingHandlers();
  registerRAGQueryHandlers();
  registerSessionManagementHandlers();
  registerSettingsAndFeedbackHandlers();

  console.log('[PDFHandlers] All PDF IPC handlers registered');
}

/**
 * Unregister all PDF IPC handlers
 *
 * Note: PDF Loading handlers (pdf:load, pdf:get-page, etc.) are unregistered
 * separately by pdfCoreHandlers. We only unregister the RAG-specific handlers here.
 */
export function unregisterPDFHandlers(): void {
  console.log('[PDFHandlers] Unregistering PDF IPC handlers');

  // PDF Loading handlers are managed by pdfCoreHandlers, skip them here
  // This prevents errors when those handlers don't exist in our registry

  // PDF Indexing
  ipcMain.removeHandler('pdf:index');
  ipcMain.removeHandler('pdf:get-index-status');
  ipcMain.removeHandler('pdf:delete-index');

  // RAG Query
  ipcMain.removeHandler('pdf:query');
  ipcMain.removeHandler('pdf:get-context');
  ipcMain.removeHandler('pdf:get-chunks');
  ipcMain.removeHandler('pdf:summarize-document');

  // Session Management
  ipcMain.removeHandler('pdf-chat:create-session');
  ipcMain.removeHandler('pdf-chat:get-sessions');
  ipcMain.removeHandler('pdf-chat:get-session');
  ipcMain.removeHandler('pdf-chat:save-session');
  ipcMain.removeHandler('pdf-chat:delete-session');
  ipcMain.removeHandler('pdf-chat:get-recent-documents');

  // Settings and Feedback
  ipcMain.removeHandler('pdf:get-settings');
  ipcMain.removeHandler('pdf:update-settings');
  ipcMain.removeHandler('pdf:save-feedback');
  ipcMain.removeHandler('pdf:get-feedback');

  // Per-Document Settings (Requirement 16.7)
  ipcMain.removeHandler('pdf:get-document-settings');
  ipcMain.removeHandler('pdf:update-document-settings');
  ipcMain.removeHandler('pdf:delete-document-settings');
  ipcMain.removeHandler('pdf:get-all-document-settings');

  // Embedding Model Management (Requirement 21.6)
  ipcMain.removeHandler('pdf:check-model-change');
  ipcMain.removeHandler('pdf:get-indexed-documents');
  ipcMain.removeHandler('pdf:get-documents-needing-reindex');
  ipcMain.removeHandler('pdf:reindex-documents');

  // Model Caching (Requirement 21.7)
  ipcMain.removeHandler('pdf:get-model-cache-status');
  ipcMain.removeHandler('pdf:get-all-models-status');
  ipcMain.removeHandler('pdf:download-model');
  ipcMain.removeHandler('pdf:clear-model-cache');
  ipcMain.removeHandler('pdf:refresh-model-status');

  // Embedding Fallback (Requirement 18.2)
  ipcMain.removeHandler('pdf:get-embedding-fallback-state');
  ipcMain.removeHandler('pdf:attempt-embedding-recovery');
  ipcMain.removeHandler('pdf:get-embedding-fallback-notification');
  ipcMain.removeHandler('pdf:check-embedding-availability');

  // Index Corruption Recovery (Requirement 18.4)
  ipcMain.removeHandler('pdf:check-index-corruption');
  ipcMain.removeHandler('pdf:rebuild-corrupted-index');
  ipcMain.removeHandler('pdf:cleanup-orphaned-chunks');
  ipcMain.removeHandler('pdf:repair-chunk-counts');
  ipcMain.removeHandler('pdf:get-documents-needing-rebuild');

  console.log('[PDFHandlers] All PDF IPC handlers unregistered');
}

