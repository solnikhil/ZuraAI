/**
 * PDFChatLayout - Split-screen layout for PDF viewer and chat
 *
 * Implements a split-screen interface with:
 * - PDF viewer on the left (55% initial width)
 * - Chat area on the right (45% initial width)
 * - Draggable divider for resizing panels
 * - Shared state management for citations and navigation
 * - Multi-document support with tabs (Requirements 13.1, 13.2)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 13.1, 13.2
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PDFViewer } from './PDFViewer';
import { PDFChatArea } from './PDFChatArea';
import { DocumentTabs, type DocumentTabInfo } from './DocumentTabs';
import { IndexingProgress } from './IndexingProgress';
import { usePDFDocuments } from '../../contexts/PDFDocumentContext';
import type { PDFChatLayoutProps, IndexingState, DocumentLoadingState, IndexingPromptState, IndexingLogEntry } from './types';
import type { Citation, TextSelection, PDFDocument, IndexResult } from '../../types/pdf';

interface StarredPdf {
  filePath: string;
  fileName: string;
  starredAt: number;
}

// Initial split proportions (Requirements 2.2)
const INITIAL_LEFT_WIDTH_PERCENT = 55;
const INITIAL_RIGHT_WIDTH_PERCENT = 45;

// Minimum panel widths to prevent collapse (Requirements 2.4)
const MIN_PANEL_WIDTH_PERCENT = 20;
const MAX_PANEL_WIDTH_PERCENT = 80;

// Divider width in pixels
const DIVIDER_WIDTH = 6;

const STARRED_PDFS_KEY = 'zura-pdf-starred-v1';

/**
 * PDFChatLayout Component
 * 
 * Creates a split-screen layout with PDF viewer on the left and chat on the right.
 * Manages shared state between the two panels including:
 * - Current page and zoom level
 * - Highlighted citations
 * - Text selection for context
 * - Multiple loaded documents with tab navigation (Requirements 13.1, 13.2)
 * 
 * @param sessionId - Optional session ID to load existing chat
 * @param initialDocumentPath - Optional path to initially load a document
 */
export function PDFChatLayout({
  sessionId,
  initialDocumentPath
}: PDFChatLayoutProps) {
  // Layout state
  const [leftWidthPercent, setLeftWidthPercent] = useState(INITIAL_LEFT_WIDTH_PERCENT);

  // Divider drag state (Requirements 2.3, 2.4)
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Get shared document state from context (shared with Sidebar)
  const {
    loadedDocumentsMap: loadedDocuments,
    setLoadedDocuments,
    activeDocumentId,
    setActiveDocumentId,
    currentPage,
    setCurrentPage,
  } = usePDFDocuments();

  // Track document IDs for session management
  const [documentIds, setDocumentIds] = useState<string[]>([]);

  // Mapping from file paths to backend-generated document IDs
  // This is necessary because the backend generates IDs like doc_[hash]_[timestamp]
  // but we need to track which file path corresponds to which document ID
  const [filePathToDocId, setFilePathToDocId] = useState<Map<string, string>>(new Map());

  // File input ref for adding documents
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF viewer state (per-document state could be added for more advanced use)
  const [zoomLevel, setZoomLevel] = useState(100);

  // Citation and selection state
  const [highlightedCitations, setHighlightedCitations] = useState<Citation[]>([]);
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);

  // Grounded mode state
  const [groundedMode, setGroundedMode] = useState(false);

  // Session state
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);

  // Indexing progress state (Requirements 18.6, 19.3)
  const [indexingState, setIndexingState] = useState<IndexingState | null>(null);

  // Document loading state - shows when a document is being initially loaded
  const [documentLoadingState, setDocumentLoadingState] = useState<DocumentLoadingState | null>(null);

  // Indexing prompt state - shown as inline chat message (replaces modal)
  const [indexingPrompt, setIndexingPrompt] = useState<IndexingPromptState | null>(null);

  // Indexing logs - collected during indexing for display
  const [indexingLogs, setIndexingLogs] = useState<IndexingLogEntry[]>([]);

  const [starredPdfs, setStarredPdfs] = useState<StarredPdf[]>([]);
  const [hasHydratedStarredPdfs, setHasHydratedStarredPdfs] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(INITIAL_LEFT_WIDTH_PERCENT);

  const loadStarredPdfs = useCallback((): StarredPdf[] => {
    try {
      const raw = localStorage.getItem(STARRED_PDFS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const persistStarredPdfs = useCallback((next: StarredPdf[]) => {
    try {
      localStorage.setItem(STARRED_PDFS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('pdf-starred-updated'));
    } catch (error) {
      console.warn('[PDFChatLayout] Failed to persist starred PDFs:', error);
    }
  }, []);

  // Initialize session if not provided
  useEffect(() => {
    if (!currentSessionId && documentIds.length > 0) {
      createNewSession();
    }
  }, [documentIds]);

  useEffect(() => {
    const ids = Array.from(loadedDocuments.keys());
    setDocumentIds(prev => {
      if (prev.length === ids.length && ids.every(id => prev.includes(id))) {
        return prev;
      }
      return ids;
    });
  }, [loadedDocuments]);

  useEffect(() => {
    setStarredPdfs(loadStarredPdfs());
    setHasHydratedStarredPdfs(true);
  }, [loadStarredPdfs]);

  useEffect(() => {
    if (!hasHydratedStarredPdfs) return;
    persistStarredPdfs(starredPdfs);
  }, [hasHydratedStarredPdfs, persistStarredPdfs, starredPdfs]);

  /**
   * Handle divider drag start (Requirements 2.3)
   */
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = leftWidthPercent;

    // Add document-level event listeners for drag
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    // Prevent text selection during drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [leftWidthPercent]);

  /**
   * Handle divider drag move (Requirements 2.4)
   */
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;

    // Calculate the delta in pixels and convert to percentage
    const deltaX = e.clientX - dragStartXRef.current;
    const deltaPercent = (deltaX / containerWidth) * 100;

    // Calculate new width and clamp to bounds
    let newLeftWidth = dragStartWidthRef.current + deltaPercent;
    newLeftWidth = Math.max(MIN_PANEL_WIDTH_PERCENT, Math.min(MAX_PANEL_WIDTH_PERCENT, newLeftWidth));

    setLeftWidthPercent(newLeftWidth);
  }, []);

  /**
   * Handle divider drag end (Requirements 2.3)
   */
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);

    // Remove document-level event listeners
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);

    // Restore normal cursor and selection
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [handleDragMove]);

  /**
   * Handle window resize to maintain proportions (Requirements 2.5)
   * The percentage-based layout automatically maintains proportions,
   * but we ensure the width stays within bounds after resize
   */
  useEffect(() => {
    const handleWindowResize = () => {
      // Ensure width stays within bounds after resize
      setLeftWidthPercent(prev =>
        Math.max(MIN_PANEL_WIDTH_PERCENT, Math.min(MAX_PANEL_WIDTH_PERCENT, prev))
      );
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Cleanup drag listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [handleDragMove, handleDragEnd]);

  /**
   * Setup IPC listeners for indexing progress events
   * Requirements: 18.6, 19.3
   * - 18.6: Display progress indication when processing large PDFs
   * - 19.3: Process indexing in background without blocking UI
   */
  useEffect(() => {
    if (!window.ipcRenderer) return;

    // Handle indexing progress updates
    const handleIndexProgress = (_event: any, docId: string, progress: number) => {
      console.log('[PDFChatLayout] Index progress:', docId, progress);

      // Add progress log entry at key milestones
      if (progress === 10) {
        setIndexingLogs(prev => [...prev, {
          timestamp: Date.now(),
          level: 'info',
          message: 'Extracting text from PDF pages...',
        }]);
      } else if (progress === 30) {
        setIndexingLogs(prev => [...prev, {
          timestamp: Date.now(),
          level: 'info',
          message: 'Creating text chunks for indexing...',
        }]);
      } else if (progress === 50) {
        setIndexingLogs(prev => [...prev, {
          timestamp: Date.now(),
          level: 'info',
          message: 'Generating embeddings with AI model...',
        }]);
      } else if (progress === 80) {
        setIndexingLogs(prev => [...prev, {
          timestamp: Date.now(),
          level: 'info',
          message: 'Storing vectors in database...',
        }]);
      }

      setIndexingState(prev => {
        // Only update if this is the document we're tracking
        if (prev && prev.documentId === docId) {
          return {
            ...prev,
            progress,
            isIndexing: true,
            isComplete: false,
            error: undefined,
          };
        }
        return prev;
      });
    };

    // Handle indexing completion
    const handleIndexComplete = (_event: any, docId: string, result: IndexResult) => {
      console.log('[PDFChatLayout] Index complete:', docId, result);

      // Add completion log
      setIndexingLogs(prev => [...prev, {
        timestamp: Date.now(),
        level: 'success',
        message: `Indexing complete! Created ${result.chunkCount} searchable chunks in ${Math.round(result.indexingTimeMs / 1000)}s.`,
      }]);

      setIndexingState(prev => {
        if (prev && prev.documentId === docId) {
          return {
            ...prev,
            progress: 100,
            isIndexing: false,
            isComplete: true,
            error: undefined,
            storagePath: result.storagePath,
            storageSizeBytes: result.storageSizeBytes,
          };
        }
        return prev;
      });

      // Update document tab to show indexed status
      setLoadedDocuments(prev => {
        if (!prev) return new Map();
        const newMap = new Map(prev);
        const existing = newMap.get(docId);
        if (existing) {
          newMap.set(docId, { ...existing, isIndexed: true });
        }
        return newMap;
      });

      // We keep the prompt visible to show the success message and stats
    };

    // Handle indexing errors
    const handleIndexError = (_event: any, docId: string, errorMessage: string) => {
      console.error('[PDFChatLayout] Index error:', docId, errorMessage);

      // Add error log
      setIndexingLogs(prev => [...prev, {
        timestamp: Date.now(),
        level: 'error',
        message: errorMessage,
      }]);

      setIndexingState(prev => {
        if (prev && prev.documentId === docId) {
          return {
            ...prev,
            isIndexing: false,
            isComplete: false,
            error: errorMessage,
          };
        }
        return prev;
      });
    };

    // Handle detailed log messages from indexing
    const handleIndexLog = (_event: any, docId: string, logData: { level: 'info' | 'success' | 'warning' | 'error'; message: string; timestamp: number }) => {
      console.log('[PDFChatLayout] Index log:', docId, logData.level, logData.message);

      setIndexingLogs(prev => [...prev, {
        timestamp: logData.timestamp,
        level: logData.level,
        message: logData.message,
      }]);
    };

    // Register listeners
    window.ipcRenderer.on('pdf:index-progress', handleIndexProgress);
    window.ipcRenderer.on('pdf:index-complete', handleIndexComplete);
    window.ipcRenderer.on('pdf:index-error', handleIndexError);
    window.ipcRenderer.on('pdf:index-log', handleIndexLog);

    // Cleanup listeners on unmount
    return () => {
      window.ipcRenderer.off('pdf:index-progress', handleIndexProgress);
      window.ipcRenderer.off('pdf:index-complete', handleIndexComplete);
      window.ipcRenderer.off('pdf:index-error', handleIndexError);
      window.ipcRenderer.off('pdf:index-log', handleIndexLog);
    };
  }, []);

  /**
   * Dismiss the indexing progress indicator
   */
  const dismissIndexingProgress = useCallback(() => {
    setIndexingState(null);
  }, []);

  /**
   * Dismiss the indexing notification (called from PDFChatArea)
   */
  const dismissIndexingNotification = useCallback(() => {
    setIndexingState(null);
  }, []);

  /**
   * Start indexing a document (called from confirmation dialog)
   */
  const startIndexing = useCallback((docId: string, docName: string, modelId?: string, forceReindex?: boolean) => {
    console.log('[PDFChatLayout] Starting indexing for document:', docId, 'with model:', modelId, 'forceReindex:', forceReindex);

    // Clear previous logs
    setIndexingLogs([]);

    // Add initial log entry
    setIndexingLogs(prev => [...prev, {
      timestamp: Date.now(),
      level: 'info',
      message: forceReindex 
        ? `Re-indexing "${docName}" (existing index will be replaced)...`
        : `Starting indexing for "${docName}"...`,
    }]);

    // Initialize indexing state to show progress indicator
    setIndexingState({
      documentId: docId,
      documentName: docName,
      progress: 0,
      isIndexing: true,
      error: undefined,
      isComplete: false,
    });

    // Note: Keep the indexingPrompt visible to show progress inline
    // It will be dismissed when indexing completes

    // Prepare indexing options with model and forceReindex flag
    const indexOptions: { embeddingModel?: string; forceReindex?: boolean } = {};
    if (modelId) indexOptions.embeddingModel = modelId;
    if (forceReindex) indexOptions.forceReindex = true;

    // Start indexing in background (non-blocking)
    // The IPC handlers will send progress events that update the UI
    window.ipcRenderer?.invoke('pdf:index', docId, Object.keys(indexOptions).length > 0 ? indexOptions : undefined).catch(err => {
      console.error('[PDFChatLayout] Indexing failed:', err);
      setIndexingLogs(prev => [...prev, {
        timestamp: Date.now(),
        level: 'error',
        message: err instanceof Error ? err.message : String(err),
      }]);
      setIndexingState(prev => {
        if (!prev) return null;
        if (prev.documentId === docId) {
          return {
            ...prev,
            isIndexing: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
        return prev;
      });
    });
  }, []);

  /**
   * Skip indexing for a document (user clicked "Skip for now")
   */
  const skipIndexing = useCallback((docId: string) => {
    console.log('[PDFChatLayout] User skipped indexing for:', docId);
    setIndexingPrompt(null);
  }, []);

  /**
   * Delete index for a document
   */
  const deleteIndex = useCallback(async (docId: string) => {
    console.log('[PDFChatLayout] Deleting index for document:', docId);
    try {
      await window.ipcRenderer?.invoke('pdf:delete-index', docId);
      console.log('[PDFChatLayout] Index deleted successfully');

      // Update document tab to show not indexed
      setLoadedDocuments(prev => {
        if (!prev) return new Map();
        const newMap = new Map(prev);
        const existing = newMap.get(docId);
        if (existing) {
          newMap.set(docId, { ...existing, isIndexed: false });
        }
        return newMap;
      });

      // Clear the indexing prompt and show the "not indexed" prompt
      const docInfo = loadedDocuments.get(docId);
      setIndexingPrompt({
        documentId: docId,
        documentName: docInfo?.name || 'Document',
        pageCount: docInfo?.pageCount || 0,
        isAlreadyIndexed: false,
      });
    } catch (error) {
      console.error('[PDFChatLayout] Failed to delete index:', error);
    }
  }, [loadedDocuments]);

  /**
   * Re-index a document (delete existing and re-create)
   */
  const reindexDocument = useCallback(async (docId: string, modelId?: string) => {
    console.log('[PDFChatLayout] Re-indexing document:', docId, 'with model:', modelId);

    const docInfo = loadedDocuments.get(docId);
    const docName = docInfo?.name || 'Document';

    // Start indexing with forceReindex flag (this will delete existing before re-indexing)
    startIndexing(docId, docName, modelId, true);
  }, [loadedDocuments, startIndexing]);

  /**
   * Create a new PDF chat session
   */
  const createNewSession = async () => {
    try {
      const session = await window.ipcRenderer?.invoke('pdf-chat:create-session', documentIds);
      if (session?.id) {
        setCurrentSessionId(session.id);
      }
    } catch (error) {
      console.error('[PDFChatLayout] Failed to create session:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('PDF features are currently unavailable')) {
        const fallbackId = `local-${Date.now().toString(36)}`;
        setCurrentSessionId(fallbackId);
      }
    }
  };

  /**
   * Handle citation click from chat area
   * Navigates PDF viewer to the cited location and highlights the region
   * Requirements: 8.3, 8.4
   */
  const handleCitationClick = useCallback((citation: Citation) => {
    // Navigate to the cited page
    setCurrentPage(citation.pageNumber);

    // Highlight the citation in the PDF viewer
    setHighlightedCitations([citation]);

    // Clear highlight after a delay
    setTimeout(() => {
      setHighlightedCitations([]);
    }, 5000);
  }, []);

  /**
   * Handle text selection in PDF viewer
   * Stores selection for potential use in chat
   */
  const handleTextSelect = useCallback((selection: TextSelection) => {
    setSelectedText(selection);
  }, []);

  /**
   * Handle page change in PDF viewer
   */
  const handlePageChange = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  /**
   * Handle zoom change in PDF viewer
   */
  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom);
  }, []);

  /**
   * Handle grounded mode toggle
   */
  const handleGroundedModeChange = useCallback((enabled: boolean) => {
    setGroundedMode(enabled);
  }, []);

  const isActiveStarred = Boolean(
    activeDocumentId && starredPdfs.some(pdf => pdf.filePath === activeDocumentId)
  );

  const toggleStarForActiveDocument = useCallback(() => {
    if (!activeDocumentId) return;
    setStarredPdfs(prev => {
      const exists = prev.some(pdf => pdf.filePath === activeDocumentId);
      if (exists) {
        return prev.filter(pdf => pdf.filePath !== activeDocumentId);
      }
      return [
        ...prev,
        {
          filePath: activeDocumentId,
          fileName: loadedDocuments.get(activeDocumentId)?.name || activeDocumentId.split(/[/\\]/).pop() || 'Document',
          starredAt: Date.now()
        }
      ];
    });
  }, [activeDocumentId, loadedDocuments]);

  /**
   * Load a document into the viewer (supports multi-document)
   * Requirements: 13.1
   */
  const loadDocument = useCallback(async (filePath: string) => {
    // Get file name for display before loading
    const fileName = filePath.split(/[/\\]/).pop() || 'Document';

    // Set loading state to show in chat area
    setDocumentLoadingState({
      documentId: filePath,
      documentName: fileName,
      isLoading: true,
    });

    try {
      // Check if we've already loaded this file path
      const existingDocId = filePathToDocId.get(filePath);
      if (existingDocId && loadedDocuments.has(existingDocId)) {
        // Just switch to the existing document
        console.log('[PDFChatLayout] Document already loaded, switching to:', existingDocId);
        setActiveDocumentId(existingDocId);
        setDocumentLoadingState(null);
        return;
      }

      // Load document via IPC
      let doc: PDFDocument | undefined;
      try {
        doc = await window.ipcRenderer?.invoke('pdf:load', filePath);
      } catch (invokeError) {
        throw invokeError;
      }
      if (doc) {
        // Use the generated document ID from the backend
        // The pdfParserService stores documents using this generated ID as the key
        const docId = doc.id || doc.filePath || filePath;
        const fileName = doc.fileName || filePath.split(/[/\\]/).pop() || 'Document';

        console.log(`[PDFChatLayout] Document loaded with ID: ${docId} for file: ${filePath}`);

        // Store mapping from file path to document ID
        setFilePathToDocId(prev => {
          const newMap = new Map(prev);
          newMap.set(filePath, docId);
          return newMap;
        });

        // Create document tab info
        const tabInfo: DocumentTabInfo = {
          id: docId,
          name: fileName,
          isIndexed: false,
          pageCount: doc.pageCount,
        };

        // Add to loaded documents
        // Add to loaded documents
        setLoadedDocuments(prev => {
          if (!prev) return new Map();
          const newMap = new Map(prev);
          newMap.set(docId, tabInfo);
          return newMap;
        });

        // Update document IDs array
        setDocumentIds(prev => {
          if (!prev.includes(docId)) {
            return [...prev, docId];
          }
          return prev;
        });

        // Set as active document
        setActiveDocumentId(docId);

        // Reset viewer state for new document
        setCurrentPage(1);
        setZoomLevel(100);
        setHighlightedCitations([]);
        setSelectedText(null);

        // Clear loading state - document is now visible
        setDocumentLoadingState(null);

        // Check index status
        try {
          const indexStatus = await window.ipcRenderer?.invoke('pdf:get-index-status', docId);
          if (indexStatus?.isIndexed) {
            setLoadedDocuments(prev => {
              if (!prev) return new Map();
              const newMap = new Map(prev);
              const existing = newMap.get(docId);
              if (existing) {
                newMap.set(docId, { ...existing, isIndexed: true });
              }
              return newMap;
            });

            // Show "already indexed" status message in chat area with management options
            console.log('[PDFChatLayout] Document already indexed, showing status:', docId, indexStatus);
            setIndexingPrompt({
              documentId: docId,
              documentName: fileName,
              pageCount: doc.pageCount,
              isAlreadyIndexed: true,
              chunkCount: indexStatus.chunkCount,
              embeddingModel: indexStatus.embeddingModel,
            });
          } else {
            // Document not indexed - show inline prompt in chat area
            // This allows user to preview the document before committing to indexing
            console.log('[PDFChatLayout] Document not indexed, showing inline prompt:', docId);

            // Show inline indexing prompt in chat area
            setIndexingPrompt({
              documentId: docId,
              documentName: fileName,
              pageCount: doc.pageCount,
            });
          }
        } catch (err) {
          console.warn('[PDFChatLayout] Could not check index status:', err);
        }
      }
    } catch (error) {
      console.error('[PDFChatLayout] Failed to load document:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isPdfJsInitFailure =
        errorMessage.includes('Failed to initialize pdf.js') ||
        errorMessage.includes("Cannot find module 'canvas'");
      if (isPdfJsInitFailure) {
        const fallbackDocId = filePath;
        const fileName = filePath.split(/[/\\]/).pop() || 'Document';
        setLoadedDocuments(prev => {
          const newMap = new Map(prev);
          if (!newMap.has(fallbackDocId)) {
            newMap.set(fallbackDocId, {
              id: fallbackDocId,
              name: fileName,
              isIndexed: false,
            });
          }
          return newMap;
        });
        setDocumentIds(prev => (prev.includes(fallbackDocId) ? prev : [...prev, fallbackDocId]));
        setActiveDocumentId(fallbackDocId);
        setCurrentPage(1);
        setZoomLevel(100);
        setHighlightedCitations([]);
        setSelectedText(null);
        setIndexingState(null);
        setDocumentLoadingState(null);
        return;
      }
      // Clear loading state on error
      setDocumentLoadingState(null);
    }
  }, [loadedDocuments, filePathToDocId]);

  // Load initial document if provided via props
  // This must be placed after loadDocument is defined
  useEffect(() => {
    if (initialDocumentPath) {
      console.log('[PDFChatLayout] Loading initial document:', initialDocumentPath);
      loadDocument(initialDocumentPath);
    }
  }, [initialDocumentPath, loadDocument]);

  /**
   * Handle tab selection - switch to a different document
   * Requirements: 13.2
   */
  const handleTabSelect = useCallback((documentId: string) => {
    if (loadedDocuments.has(documentId)) {
      setActiveDocumentId(documentId);
      // Reset page to 1 when switching documents (could be enhanced to remember per-doc state)
      setCurrentPage(1);
      setHighlightedCitations([]);
    }
  }, [loadedDocuments]);

  /**
   * Handle tab close - remove a document from the session
   * Requirements: 13.1
   */
  const handleTabClose = useCallback((documentId: string) => {
    // Remove from loaded documents
    setLoadedDocuments(prev => {
      const newMap = new Map(prev);
      newMap.delete(documentId);
      return newMap;
    });

    // Remove from document IDs
    setDocumentIds(prev => prev.filter(id => id !== documentId));

    // If closing the active document, switch to another one
    if (activeDocumentId === documentId) {
      const remainingDocs = Array.from(loadedDocuments.keys()).filter(id => id !== documentId);
      if (remainingDocs.length > 0) {
        setActiveDocumentId(remainingDocs[0]);
      } else {
        setActiveDocumentId(null);
      }
    }

    // Unload document from main process
    window.ipcRenderer?.invoke('pdf:unload', documentId).catch(err => {
      console.warn('[PDFChatLayout] Could not unload document:', err);
    });
  }, [activeDocumentId, loadedDocuments]);

  /**
   * Handle add document button click
   * Requirements: 13.1
   */
  const handleAddDocument = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Listen for pdf:add-document event from sidebar
   */
  useEffect(() => {
    const handleAddDocumentEvent = () => {
      handleAddDocument();
    };
    window.addEventListener('pdf:add-document', handleAddDocumentEvent);
    return () => window.removeEventListener('pdf:add-document', handleAddDocumentEvent);
  }, [handleAddDocument]);

  /**
   * Handle file input change for adding documents
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const filePath = (file as any).path || file.name;
      loadDocument(filePath);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [loadDocument]);

  // Convert loaded documents map to array for tabs
  const documentTabsArray = Array.from(loadedDocuments.values());

  // Calculate panel widths
  const rightWidthPercent = 100 - leftWidthPercent;

  return (
    <div
      ref={containerRef}
      className={`pdf-chat-layout ${isDragging ? 'dragging' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--theme-background)',
      }}
    >
      {/* Document Tabs Bar (Requirements 13.1, 13.2) */}
      <DocumentTabs
        documents={documentTabsArray}
        activeDocumentId={activeDocumentId}
        onTabSelect={handleTabSelect}
        onTabClose={handleTabClose}
        onAddDocument={handleAddDocument}
      />

      {/* Hidden file input for adding documents */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Main content area with split panels */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
        {/* Left Panel - PDF Viewer (55% initial) */}
        <div
          className="pdf-chat-layout-left"
          style={{
            width: `calc(${leftWidthPercent}% - ${DIVIDER_WIDTH / 2}px)`,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            position: 'relative', // For positioning the indexing progress indicator
          }}
        >
          {activeDocumentId ? (
            <PDFViewer
              documentId={activeDocumentId}
              onTextSelect={handleTextSelect}
              highlightedCitations={highlightedCitations}
              onPageChange={handlePageChange}
              currentPage={currentPage}
              zoomLevel={zoomLevel}
              onZoomChange={handleZoomChange}
              autoFit={true}
              isStarred={isActiveStarred}
              onToggleStar={toggleStarForActiveDocument}
            />
          ) : (
            <PDFUploadPrompt onFileSelect={loadDocument} />
          )}

          {/* Indexing Progress Indicator (Requirements 18.6, 19.3) */}
          {indexingState && (
            <IndexingProgress
              documentId={indexingState.documentId}
              documentName={indexingState.documentName}
              progress={indexingState.progress}
              isIndexing={indexingState.isIndexing}
              error={indexingState.error}
              isComplete={indexingState.isComplete}
              onDismiss={dismissIndexingProgress}
            />
          )}
        </div>

        {/* Draggable Divider (Requirements 2.3, 2.4) */}
        <div
          ref={dividerRef}
          className={`pdf-chat-divider ${isDragging ? 'dragging' : ''} ${isHovering ? 'hovering' : ''}`}
          onMouseDown={handleDragStart}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          style={{
            width: `${DIVIDER_WIDTH}px`,
            height: '100%',
            cursor: 'col-resize',
            backgroundColor: isDragging || isHovering
              ? 'rgba(59, 130, 246, 0.5)'
              : 'var(--theme-border)',
            flexShrink: 0,
            position: 'relative',
            transition: isDragging ? 'none' : 'background-color 0.15s ease',
            zIndex: 10,
          }}
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={leftWidthPercent}
          aria-valuemin={MIN_PANEL_WIDTH_PERCENT}
          aria-valuemax={MAX_PANEL_WIDTH_PERCENT}
          tabIndex={0}
          onKeyDown={(e) => {
            // Keyboard accessibility for divider
            const step = 2; // 2% per key press
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setLeftWidthPercent(prev => Math.max(MIN_PANEL_WIDTH_PERCENT, prev - step));
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              setLeftWidthPercent(prev => Math.min(MAX_PANEL_WIDTH_PERCENT, prev + step));
            }
          }}
        >
          {/* Visual grip indicator */}
          <div
            className="divider-grip"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '4px',
              height: '40px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '3px',
              opacity: isDragging || isHovering ? 1 : 0.5,
              transition: 'opacity 0.15s ease',
            }}
          >
            {/* Grip dots */}
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  backgroundColor: isDragging || isHovering
                    ? 'rgba(255, 255, 255, 0.9)'
                    : 'rgba(255, 255, 255, 0.4)',
                  transition: 'background-color 0.15s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Chat Area (45% initial) */}
        <div
          className="pdf-chat-layout-right"
          style={{
            width: `calc(${rightWidthPercent}% - ${DIVIDER_WIDTH / 2}px)`,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <PDFChatArea
            sessionId={currentSessionId || ''}
            documentIds={documentIds}
            onCitationClick={handleCitationClick}
            groundedMode={groundedMode}
            onGroundedModeChange={handleGroundedModeChange}
            indexingState={indexingState}
            loadedDocuments={loadedDocuments}
            documentLoadingState={documentLoadingState}
            onDismissIndexingNotification={dismissIndexingNotification}
            indexingPrompt={indexingPrompt}
            onConfirmIndexing={(docId, modelId) => startIndexing(docId, indexingPrompt?.documentName || 'Document', modelId)}
            onSkipIndexing={skipIndexing}
            onDeleteIndex={deleteIndex}
            onReindex={reindexDocument}
            indexingLogs={indexingLogs}
          />
        </div>
      </div>

      {/* Layout styles */}
      <style>{`
        .pdf-chat-layout {
          --theme-border: rgba(255, 255, 255, 0.1);
        }
        
        .pdf-chat-layout-left,
        .pdf-chat-layout-right {
          transition: ${isDragging ? 'none' : 'width 0.1s ease-out'};
        }
        
        .pdf-chat-divider:focus {
          outline: none;
          background-color: rgba(59, 130, 246, 0.5) !important;
        }
        
        .pdf-chat-divider:focus .divider-grip > div {
          background-color: rgba(255, 255, 255, 0.9) !important;
        }
        
        /* Prevent pointer events on children during drag */
        .pdf-chat-layout.dragging .pdf-chat-layout-left,
        .pdf-chat-layout.dragging .pdf-chat-layout-right {
          pointer-events: none;
        }
      `}</style>

      {/* Note: IndexingConfirmationModal removed - now using inline IndexingPromptMessage in chat area */}
    </div>
  );
}

/**
 * Simple upload prompt component for when no PDF is loaded
 * Requirements: 2.6
 */
interface PDFUploadPromptProps {
  onFileSelect: (filePath: string) => void;
}

function PDFUploadPrompt({ onFileSelect }: PDFUploadPromptProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // In Electron, we can get the file path
        const filePath = (file as any).path || file.name;
        onFileSelect(filePath);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const filePath = (file as any).path || file.name;
      onFileSelect(filePath);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        cursor: 'pointer',
        backgroundColor: isDragging
          ? 'rgba(59, 130, 246, 0.1)'
          : 'transparent',
        border: isDragging
          ? '2px dashed rgba(59, 130, 246, 0.5)'
          : '2px dashed rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        margin: '20px',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Upload icon */}
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '16px',
      }}>
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: '#60a5fa' }}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      {/* Text */}
      <div style={{
        fontSize: '1.1rem',
        fontWeight: 500,
        color: 'var(--theme-text-primary)',
        marginBottom: '8px',
      }}>
        {isDragging ? 'Drop PDF here' : 'Upload a PDF'}
      </div>
      <div style={{
        fontSize: '0.9rem',
        color: 'var(--theme-text-muted)',
        textAlign: 'center',
      }}>
        Drag and drop a PDF file here, or click to browse
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}

/**
 * Indexing Confirmation Modal
 * Shows a dialog asking if the user wants to index the document
 * Includes model selection for embeddings
 */
interface IndexingConfirmationModalProps {
  documentName: string;
  pageCount: number;
  onConfirm: (modelId?: string) => void;
  onDismiss: () => void;
}

function IndexingConfirmationModal({
  documentName,
  pageCount,
  onConfirm,
  onDismiss,
}: IndexingConfirmationModalProps) {
  const [modelsStatus, setModelsStatus] = useState<import('../../types/pdf').AllModelsStatus | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const status = await window.ipcRenderer?.invoke('pdf:get-all-models-status', { forceRefresh: true });
        setModelsStatus(status);
        // Auto-select first available local model
        const availableLocal = status.models.find((m: import('../../types/pdf').ModelCacheStatus) => m.provider === 'local' && m.isAvailable);
        if (availableLocal) {
          setSelectedModelId(availableLocal.modelId);
        }
      } catch (error) {
        console.error('[IndexingConfirmationModal] Failed to fetch models:', error);
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

  // Download a model
  const downloadModel = async (modelId: string) => {
    setIsDownloading(true);
    setDownloadProgress(0);
    try {
      await window.ipcRenderer?.invoke('pdf:download-model', modelId, (_event: any, progress: number) => {
        setDownloadProgress(progress);
      });
      // Refresh models after download
      const status = await window.ipcRenderer?.invoke('pdf:get-all-models-status', { forceRefresh: true });
      setModelsStatus(status);
      const availableLocal = status.models.find((m: import('../../types/pdf').ModelCacheStatus) => m.provider === 'local' && m.isAvailable);
      if (availableLocal) {
        setSelectedModelId(availableLocal.modelId);
      }
    } catch (error) {
      console.error('[IndexingConfirmationModal] Failed to download model:', error);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  // Get available local models
  const localModels = modelsStatus?.models.filter(m => m.provider === 'local') || [];
  const availableLocalModels = localModels.filter(m => m.isAvailable);
  const unavailableLocalModels = localModels.filter(m => !m.isAvailable);

  const handleConfirm = () => {
    onConfirm(selectedModelId || undefined);
  };

  // Handle backdrop click to dismiss
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onDismiss();
    }
  };

  // Handle escape key to dismiss
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onDismiss]);

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--theme-surface, #1e1e1e)',
          borderRadius: '16px',
          border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))',
          padding: '24px',
          maxWidth: '480px',
          width: '90%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Icon */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(96, 165, 250, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: '1.2rem',
          fontWeight: 600,
          color: 'var(--theme-text-primary, #e0e0e0)',
          marginTop: 0,
          marginBottom: '4px',
          textAlign: 'center',
        }}>
          Index this document?
        </h3>

        {/* Description */}
        <p style={{
          fontSize: '0.9rem',
          color: 'var(--theme-text-secondary, #a0a0a0)',
          lineHeight: '1.5',
          textAlign: 'center',
          margin: '0 0 16px 0',
        }}>
          <strong>"{documentName}"</strong>
          {pageCount > 0 && ` • ${pageCount} pages`}
        </p>

        {/* Model Selection Section */}
        <div style={{
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '0.85rem',
            fontWeight: 500,
            color: 'var(--theme-text-muted, #808080)',
            marginBottom: '8px',
            textAlign: 'center',
          }}>
            EMBEDDING MODEL FOR INDEXING
          </div>

          {isLoadingModels ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '16px',
              color: 'var(--theme-text-muted)',
            }}>
              <div style={{
                width: '20px',
                height: '20px',
                border: '2px solid rgba(255,255,255,0.1)',
                borderTopColor: '#60a5fa',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginRight: '8px',
              }} />
              Checking models...
            </div>
          ) : availableLocalModels.length > 0 ? (
            <>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '8px',
              }}>
                {availableLocalModels.map((model) => (
                  <div
                    key={model.modelId}
                    onClick={() => setSelectedModelId(model.modelId)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: selectedModelId === model.modelId
                        ? '2px solid #60a5fa'
                        : '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))',
                      background: selectedModelId === model.modelId
                        ? 'rgba(96, 165, 250, 0.1)'
                        : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                      if (selectedModelId !== model.modelId) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (selectedModelId !== model.modelId) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        color: 'var(--theme-text-primary)',
                        marginBottom: '2px',
                      }}>
                        {model.modelName}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--theme-text-muted)',
                      }}>
                        {model.dimensions} dimensions • local
                      </div>
                    </div>
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: selectedModelId === model.modelId
                        ? '2px solid #60a5fa'
                        : '1px solid var(--theme-border)',
                    }} />
                  </div>
                ))}
              </div>

              {/* Show unavailable models with download option */}
              {unavailableLocalModels.length > 0 && (
                <div style={{
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--theme-border)',
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--theme-text-muted)',
                    marginBottom: '8px',
                  }}>
                    Available to download:
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}>
                    {unavailableLocalModels.map((model) => (
                      <div
                        key={model.modelId}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px dashed var(--theme-border)',
                          background: 'rgba(255, 255, 255, 0.02)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: '0.8rem',
                            color: 'var(--theme-text-secondary)',
                          }}>
                            {model.modelName}
                          </div>
                        </div>
                        <button
                          onClick={() => downloadModel(model.modelId)}
                          disabled={isDownloading}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'rgba(96, 165, 250, 0.2)',
                            color: '#60a5fa',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: isDownloading ? 'wait' : 'pointer',
                            opacity: isDownloading ? 0.6 : 1,
                          }}
                        >
                          {isDownloading ? `${downloadProgress}%` : 'Download'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* No models available - show download prompt */
            <div style={{
              padding: '16px',
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: '8px',
              marginBottom: '8px',
            }}>
              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
                fontSize: '0.85rem',
                color: '#fbbf24',
              }}>
                <span>⚠️</span>
                <span style={{ flex: 1 }}>
                  <strong>No embedding models found.</strong>
                  You need Ollama running with an embedding model installed.
                </span>
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--theme-text-muted)',
                lineHeight: '1.5',
              }}>
                1. Install Ollama from{' '}
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#60a5fa', textDecoration: 'underline' }}
                >
                  ollama.com
                </a>
                <br />
                2. Run: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '3px' }}>ollama serve</code>
                <br />
                3. Click Download below to get an embedding model
              </div>
              <div style={{
                marginTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                {unavailableLocalModels.map((model) => (
                  <button
                    key={model.modelId}
                    onClick={() => downloadModel(model.modelId)}
                    disabled={isDownloading}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid rgba(96, 165, 250, 0.3)',
                      background: 'rgba(96, 165, 250, 0.1)',
                      color: '#60a5fa',
                      fontSize: '0.8rem',
                      cursor: isDownloading ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: isDownloading ? 0.6 : 1,
                    }}
                  >
                    <span>Download {model.modelName}</span>
                    {isDownloading && (
                      <span style={{ fontSize: '0.75rem' }}>({downloadProgress}%)</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Indexing info */}
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '0.8rem',
          color: 'var(--theme-text-muted)',
          lineHeight: '1.5',
        }}>
          📊 Indexing creates embeddings for semantic search.
          Larger documents may take a few minutes.
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
        }}>
          <button
            onClick={onDismiss}
            style={{
              flex: 1,
              padding: '12px 20px',
              borderRadius: '10px',
              border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.15))',
              background: 'transparent',
              color: 'var(--theme-text-secondary, #a0a0a0)',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Not Now
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedModelId || isLoadingModels || isDownloading}
            style={{
              flex: 1,
              padding: '12px 20px',
              borderRadius: '10px',
              border: 'none',
              background: (!selectedModelId || isLoadingModels || isDownloading)
                ? 'rgba(96, 165, 250, 0.3)'
                : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
              color: '#000',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: (!selectedModelId || isLoadingModels || isDownloading)
                ? 'not-allowed'
                : 'pointer',
              transition: 'all 0.2s',
              opacity: (!selectedModelId || isLoadingModels || isDownloading) ? 0.6 : 1,
            }}
          >
            {isDownloading ? 'Downloading...' : isLoadingModels ? 'Loading...' : 'Index Document'}
          </button>
        </div>

        {/* Help link */}
        <div style={{
          marginTop: '12px',
          textAlign: 'center',
          fontSize: '0.75rem',
        }}>
          <a
            href="https://ollama.com/blog/embedding-models"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--theme-text-muted)',
              textDecoration: 'none',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#60a5fa';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--theme-text-muted)';
            }}
          >
            Learn about embedding models →
          </a>
        </div>

        {/* Spinner animation */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

export default PDFChatLayout;
