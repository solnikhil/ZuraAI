/**
 * PDF Viewer Component
 * 
 * Renders PDF documents using react-pdf with support for:
 * - Page navigation and display
 * - Text layer for selection
 * - Zoom controls
 * - Citation highlighting
 * - Lazy page rendering (virtualization) for memory optimization
 * 
 * Requirements: 3.1, 3.6, 19.1
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { PDFViewerProps } from './types';
import type { BoundingBox, Citation, TextSelection } from '../../types/pdf';
import { Star } from '../icons';
import './PDFViewer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

// Constants for zoom bounds (Requirements 3.8)
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 25;

// Constants for lazy rendering (Requirements 19.1)
// Number of pages to render above/below the visible viewport
export const PAGE_BUFFER = 2;
// Default page dimensions for placeholder sizing (will be updated after first page loads)
export const DEFAULT_PAGE_WIDTH = 612; // Standard US Letter width in points
export const DEFAULT_PAGE_HEIGHT = 792; // Standard US Letter height in points

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
 * Custom hook for tracking visible pages using Intersection Observer
 * Implements lazy rendering by only rendering pages that are visible or near-visible
 * Requirements: 19.1
 */
function useVisiblePages(
  numPages: number,
  containerRef: React.RefObject<HTMLDivElement>,
  pageBuffer: number = PAGE_BUFFER
): Set<number> {
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // Register a page element for observation
  const registerPageElement = useCallback((pageNum: number, element: HTMLDivElement | null) => {
    if (element) {
      pageElementsRef.current.set(pageNum, element);
      observerRef.current?.observe(element);
    } else {
      const existingElement = pageElementsRef.current.get(pageNum);
      if (existingElement) {
        observerRef.current?.unobserve(existingElement);
        pageElementsRef.current.delete(pageNum);
      }
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create intersection observer to track which pages are visible
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const newVisible = new Set(prev);
          
          entries.forEach((entry) => {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
            if (pageNum > 0) {
              if (entry.isIntersecting) {
                // Add the visible page and buffer pages
                for (let i = Math.max(1, pageNum - pageBuffer); i <= Math.min(numPages, pageNum + pageBuffer); i++) {
                  newVisible.add(i);
                }
              }
            }
          });

          // Clean up pages that are far from any visible page
          // Keep only pages within buffer range of any intersecting page
          const intersectingPages = new Set<number>();
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
              if (pageNum > 0) intersectingPages.add(pageNum);
            }
          });

          // If we have intersecting pages, clean up distant pages
          if (intersectingPages.size > 0) {
            const minVisible = Math.min(...intersectingPages);
            const maxVisible = Math.max(...intersectingPages);
            const keepMin = Math.max(1, minVisible - pageBuffer);
            const keepMax = Math.min(numPages, maxVisible + pageBuffer);

            newVisible.forEach((page) => {
              if (page < keepMin || page > keepMax) {
                newVisible.delete(page);
              }
            });
          }

          return newVisible;
        });
      },
      {
        root: containerRef.current,
        rootMargin: '200px 0px', // Pre-load pages 200px before they become visible
        threshold: 0,
      }
    );

    // Observe all registered page elements
    pageElementsRef.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [containerRef, numPages, pageBuffer]);

  return visiblePages;
}

/**
 * Page placeholder component for non-visible pages
 * Maintains scroll position while reducing memory usage
 * Requirements: 19.1
 */
interface PagePlaceholderProps {
  pageNumber: number;
  width: number;
  height: number;
  onRef: (pageNum: number, element: HTMLDivElement | null) => void;
}

function PagePlaceholder({ pageNumber, width, height, onRef }: PagePlaceholderProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onRef(pageNumber, ref.current);
    return () => onRef(pageNumber, null);
  }, [pageNumber, onRef]);

  return (
    <div
      ref={ref}
      className="pdf-viewer-page-placeholder"
      data-page-number={pageNumber}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      <span className="pdf-viewer-page-placeholder-text">Page {pageNumber}</span>
    </div>
  );
}

/**
 * PDF Viewer Component
 * Implements lazy page rendering for memory optimization (Requirements 19.1)
 */
export function PDFViewer({
  documentId,
  onTextSelect,
  highlightedCitations,
  onPageChange,
  currentPage: controlledPage,
  zoomLevel: controlledZoom,
  onZoomChange,
  autoFit = true,
  isStarred,
  onToggleStar,
}: PDFViewerProps) {
  // State
  const [numPages, setNumPages] = useState<number>(0);
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalZoom, setInternalZoom] = useState<number>(DEFAULT_ZOOM);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(600);
  // Page dimensions for placeholder sizing (Requirements 19.1)
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
  });
  // Track which pages are visible for lazy rendering (Requirements 19.1)
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const documentWrapperRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Use controlled or internal state
  const currentPage = controlledPage ?? internalPage;
  const zoomLevel = controlledZoom ?? internalZoom;
  
  // Calculate scale from zoom percentage
  const scale = zoomLevel / 100;

  // Calculate scaled page dimensions for placeholders (Requirements 19.1)
  const scaledPageWidth = pageDimensions.width * scale;
  const scaledPageHeight = pageDimensions.height * scale;

  // Ref callback for registering page elements with intersection observer (Requirements 19.1)
  const registerPageRef = useCallback((pageNum: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNum, element);
      observerRef.current?.observe(element);
    } else {
      const existingElement = pageRefs.current.get(pageNum);
      if (existingElement) {
        observerRef.current?.unobserve(existingElement);
        pageRefs.current.delete(pageNum);
      }
    }
  }, []);

  // Setup intersection observer for lazy rendering (Requirements 19.1)
  useEffect(() => {
    if (!documentWrapperRef.current || numPages === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const newVisible = new Set(prev);
          const intersectingPages = new Set<number>();
          
          entries.forEach((entry) => {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '0', 10);
            if (pageNum > 0 && entry.isIntersecting) {
              intersectingPages.add(pageNum);
              // Add the visible page and buffer pages
              for (let i = Math.max(1, pageNum - PAGE_BUFFER); i <= Math.min(numPages, pageNum + PAGE_BUFFER); i++) {
                newVisible.add(i);
              }
            }
          });

          // Clean up pages that are far from any visible page to free memory
          if (intersectingPages.size > 0) {
            const minVisible = Math.min(...intersectingPages);
            const maxVisible = Math.max(...intersectingPages);
            const keepMin = Math.max(1, minVisible - PAGE_BUFFER - 1);
            const keepMax = Math.min(numPages, maxVisible + PAGE_BUFFER + 1);

            newVisible.forEach((page) => {
              if (page < keepMin || page > keepMax) {
                newVisible.delete(page);
              }
            });
          }

          return newVisible;
        });
      },
      {
        root: documentWrapperRef.current,
        rootMargin: '300px 0px', // Pre-load pages 300px before they become visible
        threshold: 0,
      }
    );

    // Observe all registered page elements
    pageRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [numPages]);

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
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
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
    // Initialize visible pages to include first few pages (Requirements 19.1)
    setVisiblePages(new Set([1, 2, 3].filter(p => p <= numPages)));
    console.log('[PDFViewer] Document loaded, pages:', numPages);
  }, []);

  // Handle page render success to capture dimensions (Requirements 19.1)
  const handlePageRenderSuccess = useCallback((page: { width: number; height: number }) => {
    // Update page dimensions using unscaled size to avoid auto-fit oscillation
    if (page.width > 0 && page.height > 0 && scale > 0) {
      const baseWidth = page.width / scale;
      const baseHeight = page.height / scale;
      setPageDimensions({ width: baseWidth, height: baseHeight });
    }
  }, [scale]);

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

  useEffect(() => {
    if (!autoFit || containerWidth <= 0 || pageDimensions.width <= 0) return;
    const fitZoom = clampZoom(Math.round((containerWidth / pageDimensions.width) * 100));
    if (Math.abs(fitZoom - zoomLevel) >= 1) {
      handleZoomChange(fitZoom);
    }
  }, [autoFit, containerWidth, pageDimensions.width, zoomLevel, handleZoomChange]);

  // Navigation handlers
  const goToPreviousPage = useCallback(() => {
    handlePageChange(currentPage - 1);
  }, [currentPage, handlePageChange]);

  const goToNextPage = useCallback(() => {
    handlePageChange(currentPage + 1);
  }, [currentPage, handlePageChange]);

  // Scroll to a specific page element (Requirements 19.1)
  const scrollToPage = useCallback((pageNum: number) => {
    const pageElement = pageRefs.current.get(pageNum);
    if (pageElement && documentWrapperRef.current) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const goToPage = useCallback((page: number) => {
    const clampedPage = clampPage(page, numPages);
    handlePageChange(clampedPage);
    // Scroll to the page after a short delay to allow state update
    setTimeout(() => scrollToPage(clampedPage), 50);
  }, [handlePageChange, numPages, scrollToPage]);

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

  // Handle text selection for a specific page (Requirements 19.1)
  const handleTextSelection = useCallback((pageNumber: number) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Get the selection range
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const pageElement = pageRefs.current.get(pageNumber);
    const pageRect = pageElement?.getBoundingClientRect();

    if (!pageRect) return;

    // Calculate bounding box relative to page
    const boundingBox: BoundingBox = {
      x0: (rect.left - pageRect.left) / scale,
      y0: (rect.top - pageRect.top) / scale,
      x1: (rect.right - pageRect.left) / scale,
      y1: (rect.bottom - pageRect.top) / scale,
      pageNumber,
    };

    const textSelection: TextSelection = {
      text: selectedText,
      documentId,
      pageNumber,
      boundingBox,
    };

    onTextSelect(textSelection);
  }, [documentId, scale, onTextSelect]);

  // Render citation highlights for a specific page (Requirements 19.1)
  const renderCitationHighlightsForPage = useCallback((pageNumber: number) => {
    if (!highlightedCitations || highlightedCitations.length === 0) return null;

    const pageHighlights = highlightedCitations.filter(
      (citation) => citation.boundingBoxes.some((bbox) => bbox.pageNumber === pageNumber)
    );

    if (pageHighlights.length === 0) return null;

    return (
      <div className="pdf-viewer-highlights">
        {pageHighlights.map((citation) =>
          citation.boundingBoxes
            .filter((bbox) => bbox.pageNumber === pageNumber)
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
  }, [highlightedCitations, scale]);

  // Generate array of page numbers for rendering (Requirements 19.1)
  const pageNumbers = useMemo(() => {
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages]);

  const looksLikePath = useMemo(() => {
    return documentId ? (documentId.includes(':') || documentId.startsWith('/') || documentId.startsWith('\\')) : false;
  }, [documentId]);

  const fileUrl = useMemo(() => {
    if (!documentId) return '';
    return documentId.startsWith('http://') || documentId.startsWith('https://')
      ? documentId
      : `file://${documentId}`;
  }, [documentId]);

  const documentFile = useMemo(() => {
    if (pdfData) return { data: pdfData };
    if (looksLikePath) return undefined;
    return fileUrl || undefined;
  }, [pdfData, looksLikePath, fileUrl]);

  useEffect(() => {
    if (!documentId) return;
  }, [documentId, fileUrl]);

  useEffect(() => {
    if (!documentId) return;
    if (!looksLikePath) {
      setPdfData(null);
      return;
    }
    let cancelled = false;
    async function loadPdfBytes() {
      try {
        const result = await window.ipcRenderer.invoke('pdf:get-file-data', documentId);
        if (cancelled) return;
        const data = result?.data ? new Uint8Array(result.data) : new Uint8Array(result);
        setPdfData(data);
      } catch (err) {
        if (cancelled) return;
        console.error('[PDFViewer] Failed to load PDF bytes:', err);
      }
    }
    loadPdfBytes();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

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

        {/* Star toggle */}
        {onToggleStar && (
          <button
            className="pdf-viewer-star-button"
            onClick={onToggleStar}
            title={isStarred ? 'Unstar PDF' : 'Star PDF'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: isStarred ? 'rgba(250, 204, 21, 0.2)' : 'transparent',
              color: isStarred ? '#facc15' : 'var(--theme-text-muted)',
              cursor: 'pointer'
            }}
          >
            <Star size={16} />
          </button>
        )}
      </div>

      {/* PDF Document with Lazy Rendering (Requirements 19.1) */}
      <div ref={documentWrapperRef} className="pdf-viewer-document-wrapper">
        <Document
          file={documentFile}
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
          {/* Virtualized page list - only render visible pages (Requirements 19.1) */}
          {pageNumbers.map((pageNum) => (
            <div
              key={pageNum}
              ref={(el) => registerPageRef(pageNum, el)}
              data-page-number={pageNum}
              className="pdf-viewer-page-container"
              onMouseUp={() => handleTextSelection(pageNum)}
              style={{
                marginBottom: '16px',
                minWidth: `${scaledPageWidth}px`,
                minHeight: `${scaledPageHeight}px`,
              }}
            >
              {visiblePages.has(pageNum) ? (
                <>
                  <Page
                    pageNumber={pageNum}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    className="pdf-viewer-page"
                    onRenderSuccess={pageNum === 1 ? handlePageRenderSuccess : undefined}
                    loading={
                      <div 
                        className="pdf-viewer-page-loading"
                        style={{
                          width: `${scaledPageWidth}px`,
                          height: `${scaledPageHeight}px`,
                        }}
                      >
                        <div className="pdf-viewer-loading-spinner" />
                      </div>
                    }
                    error={
                      <div className="pdf-viewer-page-error">
                        Failed to load page {pageNum}
                      </div>
                    }
                  />
                  {renderCitationHighlightsForPage(pageNum)}
                </>
              ) : (
                <div 
                  className="pdf-viewer-page-placeholder"
                  style={{
                    width: `${scaledPageWidth}px`,
                    height: `${scaledPageHeight}px`,
                  }}
                >
                  <span className="pdf-viewer-page-placeholder-text">Page {pageNum}</span>
                </div>
              )}
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PDFViewer;
