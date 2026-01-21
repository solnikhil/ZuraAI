/**
 * PDF Viewer - Minimal Test Version
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

import type { PDFViewerProps } from './types';
import { Star, ZoomIn, ZoomOut } from '../icons';
import './PDFViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 25;

export function PDFViewer({
  documentId,
  onPageChange,
  currentPage = 1,
  zoomLevel = DEFAULT_ZOOM,
  onZoomChange,
  isStarred,
  onToggleStar,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [documentFile, setDocumentFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const documentWrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Middle mouse button panning state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadPdf() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await window.ipcRenderer.invoke('pdf:get-file-data', documentId);
        if (cancelled || !result) return;

        const rawData = result?.data ? new Uint8Array(result.data) : new Uint8Array(result);
        const data = new Uint8Array(rawData.length);
        data.set(rawData);

        const blob = new Blob([data], { type: 'application/pdf' });
        objectUrl = URL.createObjectURL(blob);

        // Get page count
        const loadingTask = pdfjs.getDocument({ data: data.slice() });
        const pdf = await loadingTask.promise;

        if (cancelled) {
          pdf.destroy();
          return;
        }

        setNumPages(pdf.numPages);
        setDocumentFile(objectUrl);
        setIsLoading(false);
        pdf.destroy();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
          setIsLoading(false);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  const handleZoomIn = useCallback(() => {
    onZoomChange?.(Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM));
  }, [zoomLevel, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    onZoomChange?.(Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM));
  }, [zoomLevel, onZoomChange]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const wrapper = documentWrapperRef.current;
      if (!wrapper) return;

      if (event.ctrlKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel + delta));
        if (nextZoom !== zoomLevel) {
          onZoomChange?.(nextZoom);
        }
        return;
      }

      if (event.altKey) {
        event.preventDefault();
        // Use deltaY for horizontal scrolling (Alt+scroll converts vertical to horizontal)
        wrapper.scrollLeft += event.deltaY;
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        // On Windows/some browsers, Shift+scroll may already set deltaX
        // Use whichever delta is non-zero, preferring deltaY for consistency
        // Note: deltaY > 0 = scroll down = pan right, deltaY < 0 = scroll up = pan left
        const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
        wrapper.scrollLeft += delta;
      }
    },
    [zoomLevel, onZoomChange]
  );

  // Middle mouse button panning handlers
  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    // Middle mouse button (button === 1)
    if (event.button === 1) {
      event.preventDefault();
      const wrapper = documentWrapperRef.current;
      if (!wrapper) return;
      
      setIsPanning(true);
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: wrapper.scrollLeft,
        scrollTop: wrapper.scrollTop,
      };
      wrapper.style.cursor = 'grabbing';
    }
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    
    const wrapper = documentWrapperRef.current;
    if (!wrapper) return;

    event.preventDefault();
    const deltaX = event.clientX - panStartRef.current.x;
    const deltaY = event.clientY - panStartRef.current.y;
    
    wrapper.scrollLeft = panStartRef.current.scrollLeft - deltaX;
    wrapper.scrollTop = panStartRef.current.scrollTop - deltaY;
  }, [isPanning]);

  const handleMouseUp = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 1 || isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      const wrapper = documentWrapperRef.current;
      if (wrapper) {
        wrapper.style.cursor = '';
      }
    }
  }, [isPanning]);

  const handleMouseLeave = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      const wrapper = documentWrapperRef.current;
      if (wrapper) {
        wrapper.style.cursor = '';
      }
    }
  }, [isPanning]);

  if (isLoading) {
    return (
      <div className="pdf-viewer-container">
        <div className="pdf-viewer-loading">
          <div className="pdf-viewer-loading-spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !documentFile) {
    return (
      <div className="pdf-viewer-container">
        <div className="pdf-viewer-error">
          <p>{error || 'No document'}</p>
        </div>
      </div>
    );
  }

  const pageWidth = Math.round(700 * (zoomLevel / 100));

  return (
    <div className="pdf-viewer-container">
      {/* Controls */}
      <div className="pdf-viewer-controls">
        <button
          className="pdf-viewer-star-button"
          onClick={onToggleStar}
          aria-pressed={isStarred}
          type="button"
        >
          <Star fill={isStarred ? 'currentColor' : 'none'} size={20} />
        </button>

        <div className="pdf-viewer-zoom">
          <button className="pdf-viewer-zoom-button" onClick={handleZoomOut} disabled={zoomLevel <= MIN_ZOOM} type="button">
            <ZoomOut size={18} />
          </button>
          <span className="pdf-viewer-zoom-level">{zoomLevel}%</span>
          <button className="pdf-viewer-zoom-button" onClick={handleZoomIn} disabled={zoomLevel >= MAX_ZOOM} type="button">
            <ZoomIn size={18} />
          </button>
        </div>

        <div className="pdf-viewer-page-info">
          Page {currentPage} of {numPages}
        </div>
      </div>

      {/* Single Document with all pages - like how react-pdf is designed */}
      <div
        className="pdf-viewer-document-wrapper"
        ref={documentWrapperRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <Document
          file={documentFile}
          onLoadSuccess={(pdf) => console.log('[PDFViewer] Document loaded:', pdf.numPages)}
          onLoadError={(err) => console.error('[PDFViewer] Document error:', err)}
          loading={<div>Loading document...</div>}
          error={<div>Error loading document</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i + 1} className="pdf-viewer-page-container" style={{ marginBottom: 16 }}>
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={() => console.log(`[PDFViewer] Page ${i + 1} loaded`)}
                onRenderSuccess={() => console.log(`[PDFViewer] Page ${i + 1} rendered`)}
                onRenderError={(err) => console.error(`[PDFViewer] Page ${i + 1} render error:`, err)}
                loading={<div style={{ width: pageWidth, height: pageWidth * 1.3, background: '#eee' }}>Loading page {i + 1}...</div>}
                error={<div style={{ width: pageWidth, height: pageWidth * 1.3, background: '#fee' }}>Error page {i + 1}</div>}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PDFViewer;
