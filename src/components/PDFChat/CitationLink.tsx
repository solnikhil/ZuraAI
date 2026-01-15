/**
 * CitationLink - Clickable citation reference in chat messages
 * 
 * Renders a citation as a clickable link with hover tooltip showing
 * the quoted text from the source.
 * 
 * Requirements: 8.2, 8.7, 8.8
 */

import React, { useState, useRef } from 'react';
import type { Citation } from '../../types/pdf';
import type { CitationLinkProps } from './types';

/**
 * Format citation for display
 */
export function formatCitation(citation: Citation): string {
  return `[${citation.documentName}, p.${citation.pageNumber}]`;
}

/**
 * CitationLink Component
 */
export function CitationLink({ 
  citation, 
  onClick, 
  onHover, 
  onHoverEnd 
}: CitationLinkProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const linkRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    setShowTooltip(true);
    onHover?.();
    
    // Calculate tooltip position
    if (linkRef.current) {
      const rect = linkRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2
      });
    }
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
    onHoverEnd?.();
  };


  return (
    <>
      <span
        ref={linkRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          color: '#60a5fa',
          cursor: 'pointer',
          textDecoration: 'none',
          fontSize: '0.85em',
          fontWeight: 500,
          padding: '1px 4px',
          borderRadius: '4px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          transition: 'all 0.15s ease',
          display: 'inline',
          whiteSpace: 'nowrap'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        }}
      >
        {formatCitation(citation)}
      </span>

      {/* Tooltip */}
      {showTooltip && citation.quotedText && (
        <div
          style={{
            position: 'fixed',
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            borderRadius: '8px',
            padding: '10px 12px',
            maxWidth: '300px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 1000,
            pointerEvents: 'none'
          }}
        >
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: '10px',
              height: '10px',
              backgroundColor: 'var(--theme-surface)',
              borderRight: '1px solid var(--theme-border)',
              borderBottom: '1px solid var(--theme-border)'
            }}
          />
          
          {/* Content */}
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--theme-text-secondary)',
            lineHeight: '1.5',
            fontStyle: 'italic'
          }}>
            "{citation.quotedText.slice(0, 150)}{citation.quotedText.length > 150 ? '...' : ''}"
          </div>
          
          {/* Source info */}
          <div style={{
            marginTop: '6px',
            fontSize: '0.7rem',
            color: 'var(--theme-text-muted)'
          }}>
            {citation.documentName} • Page {citation.pageNumber}
          </div>
        </div>
      )}
    </>
  );
}

export default CitationLink;
