/**
 * CitationLink - Clickable citation reference in chat messages
 * 
 * Renders a citation as a clickable link with hover tooltip showing
 * the quoted text from the source. Includes "Wrong citation" flag option.
 * 
 * Requirements: 8.2, 8.7, 8.8, 17.2
 */

import React, { useState, useRef, useCallback } from 'react';
import { Flag, Check } from '../icons';
import type { Citation, CitationFeedback } from '../../types/pdf';
import type { CitationLinkProps } from './types';

/**
 * Format citation for display
 */
export function formatCitation(citation: Citation): string {
  return `[${citation.documentName}, p.${citation.pageNumber}]`;
}

/**
 * Extended props for CitationLink with feedback support
 */
export interface CitationLinkWithFeedbackProps extends CitationLinkProps {
  /** Response ID this citation belongs to (for feedback tracking) */
  responseId?: string;
  /** Session ID (for feedback tracking) */
  sessionId?: string;
  /** Callback when citation is flagged as wrong */
  onFlagWrongCitation?: (citationId: string, responseId: string, sessionId: string) => void;
  /** Whether this citation has been flagged */
  isFlagged?: boolean;
}

/**
 * CitationLink Component
 * Requirements: 8.2, 8.7, 8.8, 17.2
 */
export function CitationLink({ 
  citation, 
  onClick, 
  onHover, 
  onHoverEnd,
  responseId,
  sessionId,
  onFlagWrongCitation,
  isFlagged: initialFlagged = false
}: CitationLinkWithFeedbackProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isFlagged, setIsFlagged] = useState(initialFlagged);
  const [showFlagConfirm, setShowFlagConfirm] = useState(false);
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

  /**
   * Handle flagging citation as wrong
   * Requirement 17.2: "Wrong citation" flag for citations
   */
  const handleFlagCitation = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering citation click
    
    if (isFlagged) return; // Already flagged
    
    if (!responseId || !sessionId) {
      console.warn('[CitationLink] Cannot flag citation: missing responseId or sessionId');
      return;
    }

    try {
      // Create feedback object
      const feedback: CitationFeedback = {
        citationId: citation.id,
        responseId,
        sessionId,
        type: 'wrong_citation',
        timestamp: Date.now(),
      };

      // Save feedback via IPC
      await window.ipcRenderer?.invoke('pdf:save-feedback', feedback);
      
      // Update local state
      setIsFlagged(true);
      setShowFlagConfirm(true);
      
      // Call callback if provided
      onFlagWrongCitation?.(citation.id, responseId, sessionId);
      
      // Hide confirmation after 2 seconds
      setTimeout(() => {
        setShowFlagConfirm(false);
      }, 2000);
      
      console.log('[CitationLink] Citation flagged as wrong:', citation.id);
    } catch (error) {
      console.error('[CitationLink] Failed to flag citation:', error);
    }
  }, [citation.id, responseId, sessionId, isFlagged, onFlagWrongCitation]);

  return (
    <>
      <span
        ref={linkRef}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          position: 'relative'
        }}
      >
        {/* Citation link */}
        <span
          onClick={onClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{
            color: isFlagged ? '#f87171' : '#60a5fa',
            cursor: 'pointer',
            textDecoration: isFlagged ? 'line-through' : 'none',
            fontSize: '0.85em',
            fontWeight: 500,
            padding: '1px 4px',
            borderRadius: '4px',
            backgroundColor: isFlagged 
              ? 'rgba(248, 113, 113, 0.1)' 
              : 'rgba(59, 130, 246, 0.1)',
            transition: 'all 0.15s ease',
            display: 'inline',
            whiteSpace: 'nowrap'
          }}
          onMouseOver={(e) => {
            if (!isFlagged) {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = isFlagged 
              ? 'rgba(248, 113, 113, 0.1)' 
              : 'rgba(59, 130, 246, 0.1)';
          }}
        >
          {formatCitation(citation)}
        </span>

        {/* Flag button - Requirement 17.2 */}
        {responseId && sessionId && (
          <button
            onClick={handleFlagCitation}
            title={isFlagged ? 'Citation flagged as incorrect' : 'Flag as wrong citation'}
            disabled={isFlagged}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '2px',
              cursor: isFlagged ? 'default' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFlagged ? '#f87171' : 'var(--theme-text-muted)',
              opacity: isFlagged ? 1 : 0.5,
              transition: 'all 0.15s ease',
              borderRadius: '3px',
              marginLeft: '1px'
            }}
            onMouseOver={(e) => {
              if (!isFlagged) {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.color = '#f87171';
                e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.1)';
              }
            }}
            onMouseOut={(e) => {
              if (!isFlagged) {
                e.currentTarget.style.opacity = '0.5';
                e.currentTarget.style.color = 'var(--theme-text-muted)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {showFlagConfirm ? (
              <Check size={10} />
            ) : (
              <Flag size={10} />
            )}
          </button>
        )}
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
            border: `1px solid ${isFlagged ? 'rgba(248, 113, 113, 0.3)' : 'var(--theme-border)'}`,
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
              borderRight: `1px solid ${isFlagged ? 'rgba(248, 113, 113, 0.3)' : 'var(--theme-border)'}`,
              borderBottom: `1px solid ${isFlagged ? 'rgba(248, 113, 113, 0.3)' : 'var(--theme-border)'}`
            }}
          />
          
          {/* Flagged indicator */}
          {isFlagged && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '6px',
              fontSize: '0.7rem',
              color: '#f87171',
              fontWeight: 500
            }}>
              <Flag size={10} />
              <span>Flagged as incorrect</span>
            </div>
          )}
          
          {/* Content */}
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--theme-text-secondary)',
            lineHeight: '1.5',
            fontStyle: 'italic',
            textDecoration: isFlagged ? 'line-through' : 'none',
            opacity: isFlagged ? 0.7 : 1
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
