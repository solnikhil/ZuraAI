/**
 * Citation Highlight Component
 * 
 * Renders highlight overlays for citations on PDF pages.
 * Supports:
 * - Multiple citation highlights per page
 * - Click interaction for navigation
 * - Hover tooltips with quoted text
 * - Visual grouping of related highlights
 * 
 * Requirements: 4.1, 8.4, 8.5
 */

import React, { useCallback, useState } from 'react';
import type { CitationHighlightProps } from './types';
import type { Citation, BoundingBox } from '../../types/pdf';
import './CitationHighlight.css';

/**
 * Calculate scaled position for a bounding box
 */
function getScaledPosition(bbox: BoundingBox, scale: number) {
  return {
    left: bbox.x0 * scale,
    top: bbox.y0 * scale,
    width: (bbox.x1 - bbox.x0) * scale,
    height: (bbox.y1 - bbox.y0) * scale,
  };
}

/**
 * Single highlight box component
 */
interface HighlightBoxProps {
  bbox: BoundingBox;
  scale: number;
  citation: Citation;
  isHovered: boolean;
  onClick?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function HighlightBox({
  bbox,
  scale,
  citation,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: HighlightBoxProps) {
  const position = getScaledPosition(bbox, scale);

  return (
    <div
      className={`citation-highlight-box ${isHovered ? 'citation-highlight-hovered' : ''}`}
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="button"
      tabIndex={0}
      aria-label={`Citation from ${citation.documentName}, page ${citation.pageNumber}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    />
  );
}

/**
 * Tooltip component for citation preview
 */
interface TooltipProps {
  citation: Citation;
  position: { x: number; y: number };
}

function Tooltip({ citation, position }: TooltipProps) {
  // Truncate quoted text for tooltip
  const truncatedText = citation.quotedText.length > 150
    ? citation.quotedText.slice(0, 150) + '...'
    : citation.quotedText;

  return (
    <div
      className="citation-highlight-tooltip"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="citation-highlight-tooltip-header">
        <span className="citation-highlight-tooltip-doc">{citation.documentName}</span>
        <span className="citation-highlight-tooltip-page">p.{citation.pageNumber}</span>
      </div>
      <div className="citation-highlight-tooltip-text">
        "{truncatedText}"
      </div>
    </div>
  );
}

/**
 * Citation Highlight Component
 */
export function CitationHighlight({
  citations,
  scale,
  pageNumber,
  onHighlightClick,
}: CitationHighlightProps) {
  const [hoveredCitation, setHoveredCitation] = useState<Citation | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // Filter citations for current page
  const pageCitations = citations.filter((citation) =>
    citation.boundingBoxes.some((bbox) => bbox.pageNumber === pageNumber)
  );

  // Handle mouse enter on highlight
  const handleMouseEnter = useCallback((citation: Citation, event: React.MouseEvent) => {
    setHoveredCitation(citation);
    
    // Position tooltip near the mouse
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setTooltipPosition({
      x: rect.right + 8,
      y: rect.top,
    });
  }, []);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoveredCitation(null);
    setTooltipPosition(null);
  }, []);

  // Handle click on highlight
  const handleClick = useCallback((citation: Citation) => {
    onHighlightClick?.(citation);
  }, [onHighlightClick]);

  if (pageCitations.length === 0) {
    return null;
  }

  return (
    <div className="citation-highlight-container">
      {pageCitations.map((citation) =>
        citation.boundingBoxes
          .filter((bbox) => bbox.pageNumber === pageNumber)
          .map((bbox, index) => (
            <HighlightBox
              key={`${citation.id}-${index}`}
              bbox={bbox}
              scale={scale}
              citation={citation}
              isHovered={hoveredCitation?.id === citation.id}
              onClick={() => handleClick(citation)}
              onMouseEnter={(e: any) => handleMouseEnter(citation, e)}
              onMouseLeave={handleMouseLeave}
            />
          ))
      )}
      
      {/* Tooltip */}
      {hoveredCitation && tooltipPosition && (
        <Tooltip
          citation={hoveredCitation}
          position={tooltipPosition}
        />
      )}
    </div>
  );
}

export default CitationHighlight;
