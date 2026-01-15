/**
 * useCitationNavigation Hook
 * 
 * Custom hook for handling citation click navigation in the PDF viewer.
 * Provides:
 * - Navigation to cited page
 * - Highlight of bounding box region
 * - Smooth scrolling
 * - Temporary highlight animation
 * 
 * Requirements: 8.3, 8.4, 9.4
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Citation, BoundingBox } from '../../types/pdf';

export interface UseCitationNavigationOptions {
  /** Callback to change the current page */
  onPageChange: (page: number) => void;
  /** Current page number */
  currentPage: number;
  /** Current zoom scale */
  scale: number;
  /** Container element ref for scrolling */
  containerRef: React.RefObject<HTMLElement>;
  /** Duration of highlight animation in ms */
  highlightDuration?: number;
}

export interface UseCitationNavigationReturn {
  /** Currently highlighted citation (for temporary highlight) */
  activeCitation: Citation | null;
  /** Handle citation click */
  navigateToCitation: (citation: Citation) => void;
  /** Clear active citation highlight */
  clearActiveCitation: () => void;
  /** Check if a citation is currently active */
  isCitationActive: (citationId: string) => boolean;
}

/**
 * Calculate scroll position to center a bounding box in the viewport
 */
function calculateScrollPosition(
  bbox: BoundingBox,
  scale: number,
  containerRect: DOMRect,
  viewportHeight: number
): { top: number; left: number } {
  // Calculate the center of the bounding box
  const centerY = ((bbox.y0 + bbox.y1) / 2) * scale;
  const centerX = ((bbox.x0 + bbox.x1) / 2) * scale;
  
  // Calculate scroll position to center the bbox in viewport
  const scrollTop = centerY - viewportHeight / 2;
  const scrollLeft = centerX - containerRect.width / 2;
  
  return {
    top: Math.max(0, scrollTop),
    left: Math.max(0, scrollLeft),
  };
}

/**
 * Validate bounding box coordinates
 * Property 10: Citation Navigation Accuracy
 */
export function isValidBoundingBox(bbox: BoundingBox): boolean {
  return (
    typeof bbox.x0 === 'number' &&
    typeof bbox.y0 === 'number' &&
    typeof bbox.x1 === 'number' &&
    typeof bbox.y1 === 'number' &&
    typeof bbox.pageNumber === 'number' &&
    !isNaN(bbox.x0) &&
    !isNaN(bbox.y0) &&
    !isNaN(bbox.x1) &&
    !isNaN(bbox.y1) &&
    !isNaN(bbox.pageNumber) &&
    bbox.x0 >= 0 &&
    bbox.y0 >= 0 &&
    bbox.x1 >= bbox.x0 &&
    bbox.y1 >= bbox.y0 &&
    bbox.pageNumber >= 1
  );
}

/**
 * Validate citation for navigation
 */
export function isValidCitation(citation: Citation): boolean {
  return (
    citation &&
    typeof citation.id === 'string' &&
    typeof citation.pageNumber === 'number' &&
    !isNaN(citation.pageNumber) &&
    citation.pageNumber >= 1 &&
    Array.isArray(citation.boundingBoxes)
  );
}

/**
 * useCitationNavigation Hook
 */
export function useCitationNavigation({
  onPageChange,
  currentPage,
  scale,
  containerRef,
  highlightDuration = 2000,
}: UseCitationNavigationOptions): UseCitationNavigationReturn {
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Navigate to citation
  const navigateToCitation = useCallback((citation: Citation) => {
    // Validate citation
    if (!isValidCitation(citation)) {
      console.warn('[CitationNavigation] Invalid citation:', citation);
      return;
    }

    // Clear any existing highlight timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    // Navigate to the page if different
    if (citation.pageNumber !== currentPage) {
      onPageChange(citation.pageNumber);
    }

    // Set active citation for highlighting
    setActiveCitation(citation);

    // Find the first valid bounding box for scrolling
    const validBbox = citation.boundingBoxes.find(isValidBoundingBox);
    
    if (validBbox && containerRef.current) {
      // Wait for page change to complete before scrolling
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const scrollPos = calculateScrollPosition(
          validBbox,
          scale,
          containerRect,
          containerRect.height
        );

        // Smooth scroll to the citation
        container.scrollTo({
          top: scrollPos.top,
          left: scrollPos.left,
          behavior: 'smooth',
        });
      });
    }

    // Clear highlight after duration
    highlightTimeoutRef.current = setTimeout(() => {
      setActiveCitation(null);
    }, highlightDuration);
  }, [currentPage, onPageChange, scale, containerRef, highlightDuration]);

  // Clear active citation
  const clearActiveCitation = useCallback(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    setActiveCitation(null);
  }, []);

  // Check if citation is active
  const isCitationActive = useCallback((citationId: string) => {
    return activeCitation?.id === citationId;
  }, [activeCitation]);

  return {
    activeCitation,
    navigateToCitation,
    clearActiveCitation,
    isCitationActive,
  };
}

export default useCitationNavigation;
