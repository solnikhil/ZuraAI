/**
 * PDF Viewer Component
 * 
 * Renders PDF documents using react-pdf with support for:
 * - Page navigation and display
 * - Text layer for selection
 * - Zoom controls
 * - Citation highlighting
 * 
 * Requirements: 3.1, 3.6
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { PDFViewerProps } from './types';
import type { BoundingBox, Citation, TextSelection } from '../../types/pdf';
import './PDFViewer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Constants for zoom bounds (Requirements 3.8)
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 25;

/**
 * Clamp zoom level to valid bounds
 */
export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * Clamp page number to valid bounds
 */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.max(1, Math.min(totalPages, page));
}

/**
 * PDF Viewer Component
 */
export function PDFViewer({
  documentId,
  onTextSelect,
  highlightedCitations,
  onPageChange,
  currentPage: controlledPage,
  zoomLevel: controlledZoom,
  onZoomChange,
}: PDFViewerProps) {
  // State
  const [numPages, setNumPages] = useState<number>(0);
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalZoom, setInternalZoom] = useState<number>(DEFAULT_ZOOM);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  
  // Use controlled or internal state
  const currentPage = controlledPage ?? internalPage;
  const zoomLevel = controlledZoom ?? internalZoom;
  
  // Calculate scale from zoom percentage
  const scale = zoomLevel / 100;

  // Load PDF data from main process
  useEffect(() => {
    if (!documentId) {
      setError('No document ID provided');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPDF() {
      setIsLoading(true);
      setError(null);

      try {
        // Get page data from main process to get the file path
        const page = await window.ipcRenderer.invoke('pdf:get-page', documentId, 1);
        
        if (cancelled) return;

        // For now, we'll use the document ID to construct a file URL
        // The main process should provide the actual file data
        // This is a simplified approach - in production, you'd want to
        // stream the PDF data through IPC or use a file:// URL
        
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[PDFViewer] Error loading PDF:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setIsLoading(false);
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Observe container width for responsive sizing
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width - 48); // Account for padding
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Handle document load success
  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    console.log('[PDFViewer] Document loaded, pages:', numPages);
  }, []);

  // Handle document load error
  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error('[PDFViewer] Document load error:', err);
    setError(err.message || 'Failed to load PDF document');
    setIsLoading(false);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    const clampedPage = clampPage(newPage, numPages);
    
    if (controlledPage === undefined) {
      setInternalPage(clampedPage);
    }
    
    onPageChange?.(clampedPage);
  }, [numPages, controlledPage, onPageChange]);

  // Handle zoom change
  const handleZoomChange = useCallback((newZoom: number) => {
    const clampedZoom = clampZoom(newZoom);
    
    if (controlledZoom === undefined) {
      setInternalZoom(clampedZoom);
    }
    
    onZoomChange?.(clampedZoom);
  }, [controlledZoom, onZoomChange]);

  // Navigation handlers
  const goToPreviousPage = useCallback(() => {
    handlePageChange(currentPage - 1);
  }, [currentPage, handlePageChange]);

  const goToNextPage = useCallback(() => {
    handlePageChange(currentPage + 1);
  }, [currentPage, handlePageChange]);

  const goToPage = useCallback((page: number) => {
    handlePageChange(page);
  }, [handlePageChange]);

  // Zoom handlers
  const zoomIn = useCallback(() => {
    handleZoomChange(zoomLevel + ZOOM_STEP);
  }, [zoomLevel, handleZoomChange]);

  const zoomOut = useCallback(() => {
    handleZoomChange(zoomLevel - ZOOM_STEP);
  }, [zoomLevel, handleZoomChange]);

  const resetZoom = useCallback(() => {
    handleZoomChange(DEFAULT_ZOOM);
  }, [handleZoomChange]);

  // Handle keyboard navigation (Requirement 3.4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if the viewer is focused
      if (!containerRef.current?.contains(document.activeElement)) return;

      switch (e.key) {
        case 'PageUp':
          e.preventDefault();
          goToPreviousPage();
          break;
        case 'PageDown':
          e.preventDefault();
          goToNextPage();
          break;
        case 'Home':
          e.preventDefault();
          goToPage(1);
          break;
        case 'End':
          e.preventDefault();
          goToPage(numPages);
          break;
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            resetZoom();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPreviousPage, goToNextPage, goToPage, numPages, zoomIn, zoomOut, resetZoom]);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Get the selection range
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const pageRect = pageRef.current?.getBoundingClientRect();

    if (!pageRect) return;

    // Calculate bounding box relative to page
    const boundingBox: BoundingBox = {
      x0: (rect.left - pageRect.left) / scale,
      y0: (rect.top - pageRect.top) / scale,
      x1: (rect.right - pageRect.left) / scale,
      y1: (rect.bottom - pageRect.top) / scale,
      pageNumber: currentPage,
    };

    const textSelection: TextSelection = {
      text: selectedText,
      documentId,
      pageNumber: currentPage,
      boundingBox,
    };

    onTextSelect(textSelection);
  }, [documentId, currentPage, scale, onTextSelect]);

  // Render citation highlights
  const renderCitationHighlights = useCallback(() => {
    if (!highlightedCitations || highlightedCitations.length === 0) return null;

    const pageHighlights = highlightedCitations.filter(
      (citation) => citation.boundingBoxes.some((bbox) => bbox.pageNumber === currentPage)
    );

    if (pageHighlights.length === 0) return null;

    return (
      <div className="pdf-viewer-highlights">
        {pageHighlights.map((citation) =>
          citation.boundingBoxes
            .filter((bbox) => bbox.pageNumber === currentPage)
            .map((bbox, index) => (
              <div
                key={`${citation.id}-${index}`}
                className="pdf-viewer-highlight"
                style={{
                  left: bbox.x0 * scale,
                  top: bbox.y0 * scale,
                  width: (bbox.x1 - bbox.x0) * scale,
                  height: (bbox.y1 - bbox.y0) * scale,
                }}
                title={citation.quotedText}
              />
            ))
        )}
      </div>
    );
  }, [highlightedCitations, currentPage, scale]);

  // Render loading state
  if (isLoading) {
    return (
      <div className="pdf-viewer-container pdf-viewer-loading">
        <div className="pdf-viewer-loading-spinner" />
        <span>Loading PDF...</span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="pdf-viewer-container pdf-viewer-error">
        <div className="pdf-viewer-error-icon">⚠️</div>
        <span className="pdf-viewer-error-message">{error}</span>
        <button 
          className="pdf-viewer-retry-button"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="pdf-viewer-container"
      tabIndex={0}
    >
      {/* Controls Bar */}
      <div className="pdf-viewer-controls">
        {/* Page Navigation */}
        <div className="pdf-viewer-nav">
          <button
            className="pdf-viewer-nav-button"
            onClick={goToPreviousPage}
            disabled={currentPage <= 1}
            title="Previous page (Page Up)"
          >
            ‹
          </button>
          <span className="pdf-viewer-page-info">
            <input
              type="number"
              className="pdf-viewer-page-input"
              value={currentPage}
              min={1}
              max={numPages}
              onChange={(e) => goToPage(parseInt(e.target.value, 10) || 1)}
              title="Go to page"
            />
            <span className="pdf-viewer-page-total">/ {numPages}</span>
          </span>
          <button
            className="pdf-viewer-nav-button"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            title="Next page (Page Down)"
          >
            ›
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="pdf-viewer-zoom">
          <button
            className="pdf-viewer-zoom-button"
            onClick={zoomOut}
            disabled={zoomLevel <= MIN_ZOOM}
            title="Zoom out (Ctrl+-)"
          >
            −
          </button>
          <span 
            className="pdf-viewer-zoom-level"
            onClick={resetZoom}
            title="Click to reset zoom"
          >
            {zoomLevel}%
          </span>
          <button
            className="pdf-viewer-zoom-button"
            onClick={zoomIn}
            disabled={zoomLevel >= MAX_ZOOM}
            title="Zoom in (Ctrl++)"
          >
            +
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div className="pdf-viewer-document-wrapper">
        <Document
          file={`file://${documentId}`}
          onLoadSuccess={handleDocumentLoadSuccess}
          onLoadError={handleDocumentLoadError}
          loading={
            <div className="pdf-viewer-page-loading">
              <div className="pdf-viewer-loading-spinner" />
            </div>
          }
          error={
            <div className="pdf-viewer-page-error">
              Failed to load document
            </div>
          }
          className="pdf-viewer-document"
        >
          <div 
            ref={pageRef}
            className="pdf-viewer-page-container"
            onMouseUp={handleTextSelection}
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="pdf-viewer-page"
              loading={
                <div className="pdf-viewer-page-loading">
                  <div className="pdf-viewer-loading-spinner" />
                </div>
              }
              error={
                <div className="pdf-viewer-page-error">
                  Failed to load page {currentPage}
                </div>
              }
            />
            {renderCitationHighlights()}
          </div>
        </Document>
      </div>
    </div>
  );
}

export default PDFViewer;
