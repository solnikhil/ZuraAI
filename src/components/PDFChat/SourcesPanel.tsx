/**
 * SourcesPanel - Collapsible panel showing retrieved sources
 * 
 * Displays retrieved chunks with relevance scores and allows
 * navigation to source locations in the PDF.
 * Groups sources by document for multi-document scenarios.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 13.4, 13.5
 */

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FileText, ExternalLink, File } from '../icons';
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

/**
 * Group sources by document ID
 * Implements Requirement 13.5: Group citations by document for comparison queries
 */
function groupSourcesByDocument(sources: RetrievalResult[]): Map<string, RetrievalResult[]> {
  const groups = new Map<string, RetrievalResult[]>();
  
  for (const source of sources) {
    const docId = source.chunk.documentId;
    const existing = groups.get(docId) || [];
    existing.push(source);
    groups.set(docId, existing);
  }
  
  return groups;
}

/**
 * Get document display name from source
 */
function getDocumentDisplayName(source: RetrievalResult): string {
  // Try to extract a meaningful name from the document ID
  const docId = source.chunk.documentId;
  
  // If it looks like a file path, extract the filename
  if (docId.includes('/') || docId.includes('\\')) {
    const parts = docId.split(/[/\\]/);
    return parts[parts.length - 1] || docId;
  }
  
  // If it's a UUID or long ID, truncate it
  if (docId.length > 30) {
    return docId.substring(0, 20) + '...';
  }
  
  return docId;
}

interface SourceItemProps {
  source: RetrievalResult;
  index: number;
  onClick: () => void;
  showDocumentName?: boolean;
}

/**
 * Individual source item component
 */
function SourceItem({ source, index, onClick, showDocumentName = false }: SourceItemProps) {
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
          {showDocumentName && (
            <span style={{ 
              color: 'var(--theme-text-muted)', 
              marginLeft: '8px',
              fontSize: '0.75rem'
            }}>
              • {getDocumentDisplayName(source)}
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

interface DocumentGroupProps {
  documentId: string;
  sources: RetrievalResult[];
  onSourceClick: (source: RetrievalResult) => void;
  startIndex: number;
}

/**
 * Document group component for multi-document scenarios
 * Implements Requirement 13.5: Group citations by document
 */
function DocumentGroup({ documentId, sources, onSourceClick, startIndex }: DocumentGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const docName = getDocumentDisplayName(sources[0]);

  return (
    <div style={{
      marginBottom: '12px',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      backgroundColor: 'rgba(255, 255, 255, 0.01)'
    }}>
      {/* Document header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderBottom: expanded ? '1px solid rgba(255, 255, 255, 0.05)' : 'none'
        }}
      >
        <span style={{ color: 'var(--theme-text-muted)' }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <File size={14} color="#60a5fa" />
        <span style={{
          color: '#60a5fa',
          fontSize: '0.8rem',
          fontWeight: 500,
          flex: 1
        }}>
          {docName}
        </span>
        <span style={{
          color: 'var(--theme-text-muted)',
          fontSize: '0.7rem'
        }}>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Sources in this document */}
      {expanded && (
        <div style={{
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          {sources.map((source, idx) => (
            <SourceItem
              key={source.chunk.id}
              source={source}
              index={startIndex + idx}
              onClick={() => onSourceClick(source)}
              showDocumentName={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * SourcesPanel Component
 * 
 * Displays sources with optional grouping by document for multi-document scenarios.
 * Implements Requirements 9.1-9.6, 13.4, 13.5
 */
export function SourcesPanel({ 
  sources, 
  onSourceClick, 
  expanded, 
  onToggle,
  groupByDocument = true
}: SourcesPanelProps & { groupByDocument?: boolean }) {
  if (sources.length === 0) return null;

  // Check if we have multiple documents
  const documentGroups = useMemo(() => groupSourcesByDocument(sources), [sources]);
  const isMultiDocument = documentGroups.size > 1;

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
          {isMultiDocument && (
            <span style={{ 
              color: 'var(--theme-text-muted)', 
              fontWeight: 400,
              marginLeft: '6px'
            }}>
              from {documentGroups.size} documents
            </span>
          )}
        </span>
      </div>

      {/* Sources list */}
      {expanded && (
        <div style={{
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: isMultiDocument && groupByDocument ? '4px' : '8px'
        }}>
          {isMultiDocument && groupByDocument ? (
            // Group by document for multi-document scenarios
            (() => {
              let globalIndex = 0;
              return Array.from(documentGroups.entries()).map(([docId, docSources]) => {
                const startIdx = globalIndex;
                globalIndex += docSources.length;
                return (
                  <DocumentGroup
                    key={docId}
                    documentId={docId}
                    sources={docSources}
                    onSourceClick={onSourceClick}
                    startIndex={startIdx}
                  />
                );
              });
            })()
          ) : (
            // Flat list for single document
            sources.map((source, index) => (
              <SourceItem
                key={source.chunk.id}
                source={source}
                index={index}
                onClick={() => onSourceClick(source)}
                showDocumentName={isMultiDocument}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SourcesPanel;
