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
import type { PDFChatLayoutProps } from './types';
import type { Citation, TextSelection, PDFDocument } from '../../types/pdf';

// Initial split proportions (Requirements 2.2)
const INITIAL_LEFT_WIDTH_PERCENT = 55;
const INITIAL_RIGHT_WIDTH_PERCENT = 45;

// Minimum panel widths to prevent collapse (Requirements 2.4)
const MIN_PANEL_WIDTH_PERCENT = 20;
const MAX_PANEL_WIDTH_PERCENT = 80;

// Divider width in pixels
const DIVIDER_WIDTH = 6;

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
  
  // Multi-document state (Requirements 13.1, 13.2)
  const [loadedDocuments, setLoadedDocuments] = useState<Map<string, DocumentTabInfo>>(new Map());
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(initialDocumentPath || null);
  const [documentIds, setDocumentIds] = useState<string[]>(
    initialDocumentPath ? [initialDocumentPath] : []
  );
  
  // File input ref for adding documents
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // PDF viewer state (per-document state could be added for more advanced use)
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  
  // Citation and selection state
  const [highlightedCitations, setHighlightedCitations] = useState<Citation[]>([]);
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null);
  
  // Grounded mode state
  const [groundedMode, setGroundedMode] = useState(false);
  
  // Session state
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const dragStartXRef = useRef<number>(0);
  const dragStartWidthRef = useRef<number>(INITIAL_LEFT_WIDTH_PERCENT);

  // Initialize session if not provided
  useEffect(() => {
    if (!currentSessionId && documentIds.length > 0) {
      createNewSession();
    }
  }, [documentIds]);

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

  /**
   * Load a document into the viewer (supports multi-document)
   * Requirements: 13.1
   */
  const loadDocument = useCallback(async (filePath: string) => {
    try {
      // Check if document is already loaded
      if (loadedDocuments.has(filePath)) {
        // Just switch to the existing document
        setActiveDocumentId(filePath);
        return;
      }

      // Load document via IPC
      const doc = await window.ipcRenderer?.invoke('pdf:load', filePath);
      if (doc) {
        const docId = doc.id || filePath;
        const fileName = doc.fileName || filePath.split(/[/\\]/).pop() || 'Document';
        
        // Create document tab info
        const tabInfo: DocumentTabInfo = {
          id: docId,
          name: fileName,
          isIndexed: false,
          pageCount: doc.pageCount,
        };
        
        // Add to loaded documents
        setLoadedDocuments(prev => {
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
        
        // Check index status
        try {
          const indexStatus = await window.ipcRenderer?.invoke('pdf:get-index-status', docId);
          if (indexStatus?.isIndexed) {
            setLoadedDocuments(prev => {
              const newMap = new Map(prev);
              const existing = newMap.get(docId);
              if (existing) {
                newMap.set(docId, { ...existing, isIndexed: true });
              }
              return newMap;
            });
          }
        } catch (err) {
          console.warn('[PDFChatLayout] Could not check index status:', err);
        }
      }
    } catch (error) {
      console.error('[PDFChatLayout] Failed to load document:', error);
    }
  }, [loadedDocuments]);

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
            />
          ) : (
            <PDFUploadPrompt onFileSelect={loadDocument} />
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

export default PDFChatLayout;
