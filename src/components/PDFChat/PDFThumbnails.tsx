/**
 * PDF Thumbnails Sidebar Component
 * 
 * Displays page thumbnails for navigation in a sidebar.
 * Supports:
 * - Thumbnail generation for all pages
 * - Click navigation to pages
 * - Current page highlighting
 * - Lazy loading for performance
 * 
 * Requirements: 3.2, 3.3
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import type { PDFThumbnailsProps } from './types';
import { generateThumbnailPages } from './thumbnailUtils';
import './PDFThumbnails.css';

// Re-export for convenience
export { generateThumbnailPages } from './thumbnailUtils';

// Configure PDF.js worker (same as PDFViewer)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// Thumbnail configuration
const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_SCALE = 0.2;

/**
 * Single Thumbnail Component
 */
interface ThumbnailItemProps {
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
  documentId: string;
}

function ThumbnailItem({ pageNumber, isActive, onClick, documentId }: ThumbnailItemProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Intersection observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    if (itemRef.current) {
      observer.observe(itemRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleLoadSuccess = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);
  }, []);

  const handleLoadError = useCallback(() => {
    setHasError(true);
    setIsLoaded(true);
  }, []);

  return (
    <div
      ref={itemRef}
      className={`pdf-thumbnail-item ${isActive ? 'pdf-thumbnail-active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={isActive ? 'page' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="pdf-thumbnail-preview">
        {isVisible ? (
          <Document
            file={`file://${documentId}`}
            loading={null}
            error={null}
            className="pdf-thumbnail-document"
          >
            <Page
              pageNumber={pageNumber}
              width={THUMBNAIL_WIDTH}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={handleLoadError}
              loading={
                <div className="pdf-thumbnail-loading">
                  <div className="pdf-thumbnail-spinner" />
                </div>
              }
              error={
                <div className="pdf-thumbnail-error">
                  <span>!</span>
                </div>
              }
              className="pdf-thumbnail-page"
            />
          </Document>
        ) : (
          <div className="pdf-thumbnail-placeholder">
            <span>{pageNumber}</span>
          </div>
        )}
      </div>
      <span className="pdf-thumbnail-label">{pageNumber}</span>
    </div>
  );
}

/**
 * PDF Thumbnails Sidebar Component
 */
export function PDFThumbnails({
  documentId,
  pageCount,
  currentPage,
  onPageSelect,
}: PDFThumbnailsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Generate thumbnail pages array
  // Property 27: Thumbnail Count Consistency
  const thumbnailPages = useMemo(() => generateThumbnailPages(pageCount), [pageCount]);

  // Scroll active thumbnail into view when page changes
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const active = activeRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      
      // Check if active thumbnail is outside visible area
      if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
        active.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentPage]);

  // Handle thumbnail click
  const handleThumbnailClick = useCallback((pageNumber: number) => {
    onPageSelect(pageNumber);
  }, [onPageSelect]);

  // Empty state
  if (pageCount === 0) {
    return (
      <div className="pdf-thumbnails-container pdf-thumbnails-empty">
        <span>No pages</span>
      </div>
    );
  }

  return (
    <div className="pdf-thumbnails-container" ref={containerRef}>
      <div className="pdf-thumbnails-header">
        <span className="pdf-thumbnails-title">Pages</span>
        <span className="pdf-thumbnails-count">{pageCount}</span>
      </div>
      <div className="pdf-thumbnails-list" role="listbox" aria-label="Page thumbnails">
        {thumbnailPages.map((pageNumber) => {
          const isActive = pageNumber === currentPage;
          return (
            <div
              key={pageNumber}
              ref={isActive ? activeRef : undefined}
            >
              <ThumbnailItem
                pageNumber={pageNumber}
                isActive={isActive}
                onClick={() => handleThumbnailClick(pageNumber)}
                documentId={documentId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PDFThumbnails;
