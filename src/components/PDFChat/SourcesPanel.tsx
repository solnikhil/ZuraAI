/**
 * SourcesPanel - Collapsible panel showing retrieved sources
 * 
 * Displays retrieved chunks with relevance scores and allows
 * navigation to source locations in the PDF.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, ExternalLink } from '../icons';
import type { RetrievalResult } from '../../types/pdf';
import type { SourcesPanelProps } from './types';

/**
 * Format relevance score as percentage
 */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get score color based on relevance
 */
function getScoreColor(score: number): string {
  if (score >= 0.8) return '#22c55e'; // Green
  if (score >= 0.6) return '#60a5fa'; // Blue
  if (score >= 0.4) return '#fbbf24'; // Yellow
  return '#f87171'; // Red
}

interface SourceItemProps {
  source: RetrievalResult;
  index: number;
  onClick: () => void;
}

/**
 * Individual source item component
 */
function SourceItem({ source, index, onClick }: SourceItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { chunk, score } = source;
  const pageNumbers = chunk.metadata.pageNumbers;
  const pageDisplay = pageNumbers.length === 1 
    ? `p.${pageNumbers[0]}` 
    : `p.${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`;


  return (
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          cursor: 'pointer',
          transition: 'background 0.15s'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {/* Expand icon */}
        <span style={{ color: 'var(--theme-text-muted)' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>

        {/* Source number */}
        <span style={{
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          color: '#60a5fa',
          fontSize: '0.7rem',
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: '4px'
        }}>
          {index + 1}
        </span>

        {/* Page info */}
        <span style={{
          color: 'var(--theme-text-secondary)',
          fontSize: '0.8rem',
          flex: 1
        }}>
          {pageDisplay}
          {chunk.metadata.sectionHeader && (
            <span style={{ color: 'var(--theme-text-muted)', marginLeft: '8px' }}>
              • {chunk.metadata.sectionHeader}
            </span>
          )}
        </span>

        {/* Score badge */}
        <span style={{
          backgroundColor: `${getScoreColor(score)}20`,
          color: getScoreColor(score),
          fontSize: '0.7rem',
          fontWeight: 600,
          padding: '2px 6px',
          borderRadius: '4px'
        }}>
          {formatScore(score)}
        </span>

        {/* Open button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--theme-text-muted)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px',
            transition: 'all 0.15s'
          }}
          title="Open in PDF"
          onMouseOver={(e) => {
            e.currentTarget.style.color = '#60a5fa';
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ExternalLink size={14} />
        </button>
      </div>


      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px 12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            fontSize: '0.8rem',
            color: 'var(--theme-text-secondary)',
            lineHeight: '1.6',
            maxHeight: '150px',
            overflowY: 'auto'
          }}>
            {chunk.content}
          </div>

          {/* Score breakdown */}
          {(source.vectorScore !== undefined || source.bm25Score !== undefined) && (
            <div style={{
              marginTop: '8px',
              display: 'flex',
              gap: '12px',
              fontSize: '0.7rem',
              color: 'var(--theme-text-muted)'
            }}>
              {source.vectorScore !== undefined && (
                <span>Vector: {formatScore(source.vectorScore)}</span>
              )}
              {source.bm25Score !== undefined && (
                <span>BM25: {formatScore(source.bm25Score)}</span>
              )}
              {source.rerankerScore !== undefined && (
                <span>Reranker: {formatScore(source.rerankerScore)}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SourcesPanel Component
 */
export function SourcesPanel({ 
  sources, 
  onSourceClick, 
  expanded, 
  onToggle 
}: SourcesPanelProps) {
  if (sources.length === 0) return null;

  return (
    <div style={{
      marginTop: '12px',
      borderRadius: '10px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      backgroundColor: 'rgba(255, 255, 255, 0.02)'
    }}>
      {/* Panel header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          cursor: 'pointer',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderBottom: expanded ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
        }}
      >
        <span style={{ color: 'var(--theme-text-muted)' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <FileText size={14} color="var(--theme-text-muted)" />
        <span style={{
          color: 'var(--theme-text-secondary)',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          Sources ({sources.length})
        </span>
      </div>

      {/* Sources list */}
      {expanded && (
        <div style={{
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {sources.map((source, index) => (
            <SourceItem
              key={source.chunk.id}
              source={source}
              index={index}
              onClick={() => onSourceClick(source)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SourcesPanel;
