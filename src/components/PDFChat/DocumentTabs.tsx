/**
 * DocumentTabs - Tab bar for switching between multiple loaded PDF documents
 * 
 * Provides a tab interface for multi-document support with:
 * - Tab for each loaded document
 * - Active tab highlighting
 * - Close button for each tab
 * - Add document button
 * 
 * Requirements: 13.1, 13.2
 */

import React, { useRef, useState, useCallback } from 'react';
import { X, Plus, FileText } from '../icons';

/**
 * Information about a loaded document for display in tabs
 */
export interface DocumentTabInfo {
  /** Document ID (file path) */
  id: string;
  /** Display name (file name) */
  name: string;
  /** Whether the document is indexed */
  isIndexed: boolean;
  /** Page count (optional) */
  pageCount?: number;
}

export interface DocumentTabsProps {
  /** List of loaded documents */
  documents: DocumentTabInfo[];
  /** ID of the currently active document */
  activeDocumentId: string | null;
  /** Callback when a tab is clicked */
  onTabSelect: (documentId: string) => void;
  /** Callback when a tab close button is clicked */
  onTabClose: (documentId: string) => void;
  /** Callback when add document button is clicked */
  onAddDocument: () => void;
  /** Whether adding documents is disabled */
  addDisabled?: boolean;
}

/**
 * DocumentTabs Component
 * 
 * Renders a horizontal tab bar for switching between multiple loaded PDF documents.
 * Supports scrolling when there are many tabs.
 */
export function DocumentTabs({
  documents,
  activeDocumentId,
  onTabSelect,
  onTabClose,
  onAddDocument,
  addDisabled = false,
}: DocumentTabsProps) {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  /**
   * Scroll tabs container to show the active tab
   */
  const scrollToActiveTab = useCallback(() => {
    if (!tabsContainerRef.current || !activeDocumentId) return;
    
    const activeTab = tabsContainerRef.current.querySelector(
      `[data-tab-id="${activeDocumentId}"]`
    ) as HTMLElement;
    
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeDocumentId]);

  // If no documents, show minimal state
  if (documents.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid var(--theme-border)',
        backgroundColor: 'var(--theme-surface)',
        minHeight: '44px',
      }}>
        <span style={{
          color: 'var(--theme-text-muted)',
          fontSize: '0.85rem',
        }}>
          No documents loaded
        </span>
        <button
          onClick={onAddDocument}
          disabled={addDisabled}
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--theme-text-muted)',
            cursor: addDisabled ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            opacity: addDisabled ? 0.5 : 1,
            transition: 'all 0.2s',
          }}
          title="Add PDF document"
          onMouseEnter={(e) => {
            if (!addDisabled) {
              e.currentTarget.style.backgroundColor = 'var(--theme-surface-hover)';
              e.currentTarget.style.color = 'var(--theme-text-primary)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--theme-text-muted)';
          }}
        >
          <Plus size={14} />
          Add PDF
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--theme-border)',
      backgroundColor: 'var(--theme-surface)',
      minHeight: '44px',
      overflow: 'hidden',
    }}>
      {/* Tabs container with horizontal scroll */}
      <div
        ref={tabsContainerRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.2) transparent',
        }}
        className="document-tabs-scroll"
      >
        {documents.map((doc) => {
          const isActive = doc.id === activeDocumentId;
          const isHovered = doc.id === hoveredTab;
          
          return (
            <div
              key={doc.id}
              data-tab-id={doc.id}
              onClick={() => onTabSelect(doc.id)}
              onMouseEnter={() => setHoveredTab(doc.id)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                paddingRight: '8px',
                cursor: 'pointer',
                backgroundColor: isActive 
                  ? 'var(--theme-background)' 
                  : isHovered 
                    ? 'rgba(255, 255, 255, 0.03)' 
                    : 'transparent',
                borderBottom: isActive 
                  ? '2px solid #60a5fa' 
                  : '2px solid transparent',
                borderRight: '1px solid var(--theme-border)',
                minWidth: '120px',
                maxWidth: '200px',
                flexShrink: 0,
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
              title={doc.name}
            >
              {/* Document icon */}
              <FileText 
                size={14} 
                style={{ 
                  color: isActive ? '#60a5fa' : 'var(--theme-text-muted)',
                  flexShrink: 0,
                }} 
              />
              
              {/* Document name */}
              <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: '0.85rem',
                color: isActive ? 'var(--theme-text-primary)' : 'var(--theme-text-secondary)',
                fontWeight: isActive ? 500 : 400,
              }}>
                {doc.name}
              </span>
              
              {/* Index status indicator */}
              {doc.isIndexed && (
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#22c55e',
                    flexShrink: 0,
                  }}
                  title="Indexed"
                />
              )}
              
              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(doc.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: isHovered || isActive 
                    ? 'rgba(255, 255, 255, 0.1)' 
                    : 'transparent',
                  color: 'var(--theme-text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  opacity: isHovered || isActive ? 1 : 0,
                  transition: 'opacity 0.15s, background-color 0.15s',
                }}
                title="Close document"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add document button */}
      <button
        onClick={onAddDocument}
        disabled={addDisabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          margin: '0 8px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: 'transparent',
          color: 'var(--theme-text-muted)',
          cursor: addDisabled ? 'not-allowed' : 'pointer',
          opacity: addDisabled ? 0.5 : 1,
          flexShrink: 0,
          transition: 'all 0.2s',
        }}
        title="Add another PDF document"
        onMouseEnter={(e) => {
          if (!addDisabled) {
            e.currentTarget.style.backgroundColor = 'var(--theme-surface-hover)';
            e.currentTarget.style.color = 'var(--theme-text-primary)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--theme-text-muted)';
        }}
      >
        <Plus size={16} />
      </button>

      {/* Scrollbar styles */}
      <style>{`
        .document-tabs-scroll::-webkit-scrollbar {
          height: 4px;
        }
        .document-tabs-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .document-tabs-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }
        .document-tabs-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

export default DocumentTabs;
