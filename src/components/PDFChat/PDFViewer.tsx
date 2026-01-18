/**
 * PDF Viewer Component using react-pdf v10.x
 * 
 * Features:
 * - Proper worker version matching
 * - Promise.withResolvers polyfill
 * - CMap configuration for font rendering
 * - DataCloneError prevention
 * - Lazy loading pages
 * - Zoom and Navigation
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import type { PDFViewerProps } from './types';
import type { BoundingBox, Citation, TextSelection } from '../../types/pdf';
import { Star, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from '../icons';
import './PDFViewer.css';

// Polyfill Promise.withResolvers for pdfjs-dist v5.x
  if (typeof Promise.withResolvers === 'undefined') {
    if (typeof window !== 'undefined') {
      // @ts-expect-error Polyfill
      window.Promise.withResolvers = function () {
        let resolve: (value?: unknown) => void;
        let reject: (reason?: unknown) => void;
        const promise = new Promise<unknown>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };
    }
  }


// Configure PDF.js worker in the same module as Document/Page
// Use legacy worker to include Promise.withResolvers polyfill for Electron
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;

// Constants
export const MIN_ZOOM = 25;
export const MAX_ZOOM = 400;
export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 25;

export function PDFViewer({
  documentId,
  onTextSelect,
  highlightedCitations,
  onPageChange,
  currentPage = 1,
  zoomLevel = DEFAULT_ZOOM,
  onZoomChange,
  autoFit = true,
  isStarred,
  onToggleStar,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pdfFile = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);

  // Load PDF Data
  useEffect(() => {
    let isMounted = true;
    setPdfData(null);
    setError(null);

    async function loadPdf() {
      try {
        const result = await window.ipcRenderer.invoke('pdf:get-file-data', documentId);
        if (isMounted && result) {
          // Fix DataCloneError: Copy buffer to prevent "ArrayBuffer is detached" issues
          const rawData = result.data || result;
          const buffer = new Uint8Array(rawData);
          const bufferCopy = new Uint8Array(buffer.length);
          bufferCopy.set(buffer);
          setPdfData(bufferCopy);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load PDF data:', err);
          setError(err instanceof Error ? err : new Error('Failed to load PDF'));
        }
      }
    }

    if (documentId) {
      loadPdf();
    }

    return () => {
      isMounted = false;
    };
  }, [documentId]);

  // Options for correct font rendering
  const options = useMemo(() => ({
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    disableAutoFetch: true,
    disableStream: true,
  }), []);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setError(null);
  }

  function onDocumentLoadError(err: Error) {
    console.error('PDF Load Error:', err);
    setError(err);
  }

  // Handle zoom changes
  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM);
    onZoomChange?.(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM);
    onZoomChange?.(newZoom);
  };

  if (error) {
    return (
      <div className="pdf-viewer-error">
        <p>Failed to load PDF</p>
        <p>{error.message}</p>
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div className="pdf-viewer-loading">
        <div className="pdf-viewer-spinner" />
        <span>Loading PDF...</span>
      </div>
    );
  }

  return (
    <div className="pdf-viewer-container" ref={containerRef}>
      {/* Toolbar */}
      <div className="pdf-viewer-controls">
        <button
          className="pdf-viewer-star-button"
          onClick={onToggleStar}
          title={isStarred ? "Remove Star" : "Star Document"}
          aria-pressed={isStarred}
        >
          <Star fill={isStarred ? "currentColor" : "none"} size={20} />
        </button>

        <div className="pdf-viewer-zoom">
          <button className="pdf-viewer-zoom-button" onClick={handleZoomOut} disabled={zoomLevel <= MIN_ZOOM}>
            <ZoomOut size={18} />
          </button>
          <span className="pdf-viewer-zoom-level">{zoomLevel}%</span>
          <button className="pdf-viewer-zoom-button" onClick={handleZoomIn} disabled={zoomLevel >= MAX_ZOOM}>
            <ZoomIn size={18} />
          </button>
        </div>

        <div className="pdf-viewer-page-info">
          <span>Page</span>
          <span className="pdf-viewer-page-total">
            {currentPage} of {numPages || '--'}
          </span>
        </div>
      </div>

      {/* Document Area */}
      <div className="pdf-viewer-document-wrapper">
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          options={options}
          className="pdf-viewer-document"
          loading={
            <div className="pdf-viewer-loading">
              <div className="pdf-viewer-loading-spinner" />
            </div>
          }
          error={
            <div className="pdf-viewer-error">
              Failed to render PDF document.
            </div>
          }
        >
          {Array.from(new Array(numPages), (el, index) => (
            <div
              key={`page_${index + 1}`}
              id={`page_${index + 1}`}
              className="pdf-viewer-page-container"
              style={{ margin: '20px auto' }}
            >
              <Page
                pageNumber={index + 1}
                scale={zoomLevel / 100}
                className="pdf-viewer-page"
                renderTextLayer={true}
                renderAnnotationLayer={true}
                onMouseDown={() => onPageChange?.(index + 1)}
                loading={
                  <div className="pdf-viewer-page-loading">
                    <div className="pdf-viewer-loading-spinner" />
                  </div>
                }
                error={<div className="pdf-viewer-page-error">Failed to load page.</div>}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}

export default PDFViewer;
