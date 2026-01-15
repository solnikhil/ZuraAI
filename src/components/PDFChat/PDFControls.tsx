/**
 * PDF Controls Component
 * 
 * Provides navigation and zoom controls for the PDF viewer.
 * Supports:
 * - Page navigation (previous, next, go to page)
 * - Zoom controls (zoom in, zoom out, reset)
 * - Keyboard shortcuts
 * - Page number input
 * 
 * Requirements: 3.4, 3.7, 3.8, 3.9
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { PDFControlsProps } from './types';
import type { OutlineItem } from '../../types/pdf';
import {
  clampZoom,
  clampPage,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_STEP,
  ZOOM_PRESETS,
} from './navigationUtils';
import './PDFControls.css';

// Re-export for convenience
export {
  clampZoom,
  clampPage,
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_ZOOM,
  ZOOM_STEP,
  ZOOM_PRESETS,
} from './navigationUtils';

/**
 * PDF Controls Component
 */
export function PDFControls({
  currentPage,
  totalPages,
  zoomLevel,
  onPageChange,
  onZoomChange,
  outline,
  onOutlineItemClick,
}: PDFControlsProps) {
  const [pageInputValue, setPageInputValue] = useState<string>(String(currentPage));
  const [showZoomDropdown, setShowZoomDropdown] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const zoomDropdownRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);

  // Sync page input with current page
  useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomDropdownRef.current && !zoomDropdownRef.current.contains(e.target as Node)) {
        setShowZoomDropdown(false);
      }
      if (outlineRef.current && !outlineRef.current.contains(e.target as Node)) {
        setShowOutline(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Navigation handlers
  const goToPreviousPage = useCallback(() => {
    const newPage = clampPage(currentPage - 1, totalPages);
    onPageChange(newPage);
  }, [currentPage, totalPages, onPageChange]);

  const goToNextPage = useCallback(() => {
    const newPage = clampPage(currentPage + 1, totalPages);
    onPageChange(newPage);
  }, [currentPage, totalPages, onPageChange]);

  const goToFirstPage = useCallback(() => {
    onPageChange(1);
  }, [onPageChange]);

  const goToLastPage = useCallback(() => {
    onPageChange(totalPages);
  }, [totalPages, onPageChange]);

  const handlePageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  }, []);

  const handlePageInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(pageInputValue, 10);
    if (!isNaN(pageNum)) {
      const clampedPage = clampPage(pageNum, totalPages);
      onPageChange(clampedPage);
      setPageInputValue(String(clampedPage));
    } else {
      setPageInputValue(String(currentPage));
    }
  }, [pageInputValue, totalPages, currentPage, onPageChange]);

  const handlePageInputBlur = useCallback(() => {
    const pageNum = parseInt(pageInputValue, 10);
    if (!isNaN(pageNum)) {
      const clampedPage = clampPage(pageNum, totalPages);
      onPageChange(clampedPage);
      setPageInputValue(String(clampedPage));
    } else {
      setPageInputValue(String(currentPage));
    }
  }, [pageInputValue, totalPages, currentPage, onPageChange]);

  // Zoom handlers
  const zoomIn = useCallback(() => {
    const newZoom = clampZoom(zoomLevel + ZOOM_STEP);
    onZoomChange(newZoom);
  }, [zoomLevel, onZoomChange]);

  const zoomOut = useCallback(() => {
    const newZoom = clampZoom(zoomLevel - ZOOM_STEP);
    onZoomChange(newZoom);
  }, [zoomLevel, onZoomChange]);

  const resetZoom = useCallback(() => {
    onZoomChange(DEFAULT_ZOOM);
  }, [onZoomChange]);

  const setZoomPreset = useCallback((preset: number) => {
    const newZoom = clampZoom(preset);
    onZoomChange(newZoom);
    setShowZoomDropdown(false);
  }, [onZoomChange]);

  // Outline handler
  const handleOutlineClick = useCallback((item: OutlineItem) => {
    onOutlineItemClick?.(item);
    setShowOutline(false);
  }, [onOutlineItemClick]);

  // Render outline items recursively
  const renderOutlineItems = (items: OutlineItem[], level: number = 0) => {
    return items.map((item, index) => (
      <div key={`${level}-${index}`}>
        <button
          className="pdf-controls-outline-item"
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => handleOutlineClick(item)}
        >
          <span className="pdf-controls-outline-title">{item.title}</span>
          <span className="pdf-controls-outline-page">p.{item.pageNumber}</span>
        </button>
        {item.children && item.children.length > 0 && (
          <div className="pdf-controls-outline-children">
            {renderOutlineItems(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="pdf-controls">
      {/* Page Navigation */}
      <div className="pdf-controls-section pdf-controls-nav">
        <button
          className="pdf-controls-button"
          onClick={goToFirstPage}
          disabled={currentPage <= 1}
          title="First page (Home)"
          aria-label="Go to first page"
        >
          ⟨⟨
        </button>
        <button
          className="pdf-controls-button"
          onClick={goToPreviousPage}
          disabled={currentPage <= 1}
          title="Previous page (Page Up)"
          aria-label="Go to previous page"
        >
          ‹
        </button>
        
        <form onSubmit={handlePageInputSubmit} className="pdf-controls-page-form">
          <input
            type="text"
            className="pdf-controls-page-input"
            value={pageInputValue}
            onChange={handlePageInputChange}
            onBlur={handlePageInputBlur}
            aria-label="Current page number"
            title="Enter page number"
          />
          <span className="pdf-controls-page-separator">/</span>
          <span className="pdf-controls-page-total">{totalPages}</span>
        </form>

        <button
          className="pdf-controls-button"
          onClick={goToNextPage}
          disabled={currentPage >= totalPages}
          title="Next page (Page Down)"
          aria-label="Go to next page"
        >
          ›
        </button>
        <button
          className="pdf-controls-button"
          onClick={goToLastPage}
          disabled={currentPage >= totalPages}
          title="Last page (End)"
          aria-label="Go to last page"
        >
          ⟩⟩
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="pdf-controls-section pdf-controls-zoom" ref={zoomDropdownRef}>
        <button
          className="pdf-controls-button"
          onClick={zoomOut}
          disabled={zoomLevel <= MIN_ZOOM}
          title="Zoom out (Ctrl+-)"
          aria-label="Zoom out"
        >
          −
        </button>
        
        <button
          className="pdf-controls-zoom-display"
          onClick={() => setShowZoomDropdown(!showZoomDropdown)}
          title="Click to select zoom level"
          aria-label={`Current zoom: ${zoomLevel}%`}
          aria-haspopup="listbox"
          aria-expanded={showZoomDropdown}
        >
          {zoomLevel}%
        </button>

        {showZoomDropdown && (
          <div className="pdf-controls-zoom-dropdown" role="listbox">
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset}
                className={`pdf-controls-zoom-option ${preset === zoomLevel ? 'active' : ''}`}
                onClick={() => setZoomPreset(preset)}
                role="option"
                aria-selected={preset === zoomLevel}
              >
                {preset}%
              </button>
            ))}
            <div className="pdf-controls-zoom-divider" />
            <button
              className="pdf-controls-zoom-option"
              onClick={resetZoom}
            >
              Reset to 100%
            </button>
          </div>
        )}

        <button
          className="pdf-controls-button"
          onClick={zoomIn}
          disabled={zoomLevel >= MAX_ZOOM}
          title="Zoom in (Ctrl++)"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>

      {/* Outline/TOC Button */}
      {outline && outline.length > 0 && (
        <div className="pdf-controls-section pdf-controls-outline-wrapper" ref={outlineRef}>
          <button
            className="pdf-controls-button pdf-controls-outline-toggle"
            onClick={() => setShowOutline(!showOutline)}
            title="Table of Contents"
            aria-label="Toggle table of contents"
            aria-haspopup="menu"
            aria-expanded={showOutline}
          >
            ☰
          </button>

          {showOutline && (
            <div className="pdf-controls-outline-dropdown" role="menu">
              <div className="pdf-controls-outline-header">
                Table of Contents
              </div>
              <div className="pdf-controls-outline-list">
                {renderOutlineItems(outline)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PDFControls;
