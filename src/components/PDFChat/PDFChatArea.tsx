/**
 * PDFChatArea - Chat interface for PDF document conversations
 * 
 * Provides RAG-powered chat with inline citations, streaming responses,
 * grounded mode for anti-hallucination, and feedback collection.
 * 
 * Requirements: 2.1, 8.2, 8.7, 8.8, 10.1, 10.2, 10.3, 10.4, 10.6, 12.1, 12.3, 12.4, 17.1, 17.2, 18.2
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, AlertTriangle, Shield, ShieldOff, Copy, Check, Info, Download, Share2, ChevronDown, FileText, BookOpen, ThumbsUp, ThumbsDown, RefreshCw, Settings, MoreVertical } from '../icons';
import LazyMarkdown from '../LazyMarkdown';
import StarBorder from '../StarBorder';
import ModelSelector from '../Dashboard/ModelSelector';
import { useSettings } from '../../contexts/SettingsContext';
import type {
  Citation,
  PDFChatMessage,
  TextSelection,
  RetrievalResult,
  DocumentSummary,
  SectionSummary,
  CITATION_PATTERN,
  ResponseFeedback,
  EmbeddingFallbackState,
  EmbeddingFallbackNotification
} from '../../types/pdf';
import type { PDFChatAreaProps, IndexingState, DocumentLoadingState, IndexingPromptState, IndexingLogEntry } from './types';
import { CitationLink } from './CitationLink';
import { SourcesPanel } from './SourcesPanel';
import { IndexingPromptMessage } from './IndexingPromptMessage';
import type { ChatMessage } from '../../services/types';
import { generateOpenRouterCompletion } from '../../services/openrouter';
import { generateGroqCompletion } from '../../services/groq';
import { generateGeminiCompletion } from '../../services/gemini';
import { generatePerplexityCompletion, cleanSonarResponse } from '../../services/perplexity';
import { generateOllamaCompletion } from '../../services/ollama';
import { generateMiniMaxCompletion } from '../../services/minimax';
import {
  exportAndCopy,
  exportAndDownload,
  exportMessageToMarkdown,
  exportBriefToMarkdown,
  downloadAsFile,
  copyToClipboard,
  generateExportFilename
} from '../../utils/pdfExport';

// Re-export the citation pattern for use in parsing
export { CITATION_PATTERN } from '../../types/pdf';

/**
 * Parse citations from AI response text
 * Property 9: Citation Format Consistency
 */
export function parseCitations(
  text: string,
  chunkMap: Map<string, { documentName: string; pageNumber: number; quotedText: string }>
): { cleanText: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const pattern = /\[\[cite:([a-zA-Z0-9_-]+):p(\d+)\]\]/g;
  let match;
  let citationIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    const chunkId = match[1];
    const pageNumber = parseInt(match[2], 10);
    const chunkInfo = chunkMap.get(chunkId);

    citations.push({
      id: `citation-${citationIndex++}`,
      chunkId,
      pageNumber,
      documentName: chunkInfo?.documentName || 'Document',
      quotedText: chunkInfo?.quotedText || '',
      boundingBoxes: [], // Will be populated from chunk metadata
    });
  }

  // Replace citation markers with numbered references
  let citationCounter = 0;
  const cleanText = text.replace(pattern, () => {
    citationCounter++;
    return `[${citationCounter}]`;
  });

  return { cleanText, citations };
}

/**
 * Format citation for display
 */
export function formatCitationDisplay(citation: Citation): string {
  return `[${citation.documentName}, p.${citation.pageNumber}]`;
}

/**
 * Export menu dropdown component
 * Requirements: 14.1, 14.4
 */
interface ExportMenuProps {
  message: PDFChatMessage;
  previousMessage?: PDFChatMessage;
  onExportComplete?: (success: boolean, action: 'copy' | 'download') => void;
}

function ExportMenu({ message, previousMessage, onExportComplete }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'copying' | 'downloading' | 'success' | 'error'>('idle');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset status after showing success/error
  useEffect(() => {
    if (exportStatus === 'success' || exportStatus === 'error') {
      const timer = setTimeout(() => {
        setExportStatus('idle');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [exportStatus]);

  const handleCopyToClipboard = async () => {
    setExportStatus('copying');
    try {
      const result = await exportAndCopy(message, previousMessage);
      if (result.success) {
        setExportStatus('success');
        onExportComplete?.(true, 'copy');
      } else {
        setExportStatus('error');
        onExportComplete?.(false, 'copy');
      }
    } catch (error) {
      console.error('[ExportMenu] Copy failed:', error);
      setExportStatus('error');
      onExportComplete?.(false, 'copy');
    }
    setIsOpen(false);
  };

  const handleDownload = () => {
    setExportStatus('downloading');
    try {
      const result = exportAndDownload(message, previousMessage);
      if (result.success) {
        setExportStatus('success');
        onExportComplete?.(true, 'download');
      } else {
        setExportStatus('error');
        onExportComplete?.(false, 'download');
      }
    } catch (error) {
      console.error('[ExportMenu] Download failed:', error);
      setExportStatus('error');
      onExportComplete?.(false, 'download');
    }
    setIsOpen(false);
  };

  const getButtonIcon = () => {
    switch (exportStatus) {
      case 'copying':
      case 'downloading':
        return (
          <div style={{
            width: '14px',
            height: '14px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#60a5fa',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        );
      case 'success':
        return <Check size={14} />;
      case 'error':
        return <AlertTriangle size={14} />;
      default:
        return <Share2 size={14} />;
    }
  };

  const getButtonColor = () => {
    switch (exportStatus) {
      case 'success':
        return 'var(--theme-success, #22c55e)';
      case 'error':
        return 'var(--theme-error, #ef4444)';
      default:
        return 'var(--theme-text-muted)';
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Export response"
        style={{
          background: 'transparent',
          border: 'none',
          color: getButtonColor(),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          borderRadius: '4px',
          transition: 'all 0.2s',
          fontSize: '0.8rem'
        }}
      >
        {getButtonIcon()}
        <ChevronDown size={12} style={{
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s'
        }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 100,
          minWidth: '180px',
          overflow: 'hidden'
        }}>
          <button
            onClick={handleCopyToClipboard}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              textAlign: 'left',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Copy size={16} />
            <div>
              <div style={{ fontWeight: 500 }}>Copy as Markdown</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                With citations & references
              </div>
            </div>
          </button>

          <div style={{
            height: '1px',
            backgroundColor: 'var(--theme-border)',
            margin: '0 8px'
          }} />

          <button
            onClick={handleDownload}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              textAlign: 'left',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Download size={16} />
            <div>
              <div style={{ fontWeight: 500 }}>Download as File</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                Save .md file locally
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Session Export Menu - Export all messages as a consolidated brief
 * Requirements: 14.5
 */
interface SessionExportMenuProps {
  messages: PDFChatMessage[];
  sessionTitle?: string;
  onExportComplete?: (success: boolean, action: 'copy' | 'download') => void;
}

function SessionExportMenu({ messages, sessionTitle, onExportComplete }: SessionExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'copying' | 'downloading' | 'success' | 'error'>('idle');
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter to only include messages with content (skip empty assistant placeholders)
  const exportableMessages = messages.filter(m => m.content && m.content.trim().length > 0);

  // Count assistant messages with citations for display
  const responsesWithCitations = exportableMessages.filter(
    m => m.role === 'assistant' && m.citations && m.citations.length > 0
  ).length;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Reset status after showing success/error
  useEffect(() => {
    if (exportStatus === 'success' || exportStatus === 'error') {
      const timer = setTimeout(() => {
        setExportStatus('idle');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [exportStatus]);

  const handleCopyBrief = async () => {
    setExportStatus('copying');
    try {
      const title = sessionTitle || 'PDF Chat Brief';
      const content = exportBriefToMarkdown(exportableMessages, title);
      const success = await copyToClipboard(content);

      if (success) {
        setExportStatus('success');
        onExportComplete?.(true, 'copy');
      } else {
        setExportStatus('error');
        onExportComplete?.(false, 'copy');
      }
    } catch (error) {
      console.error('[SessionExportMenu] Copy brief failed:', error);
      setExportStatus('error');
      onExportComplete?.(false, 'copy');
    }
    setIsOpen(false);
  };

  const handleDownloadBrief = () => {
    setExportStatus('downloading');
    try {
      const title = sessionTitle || 'PDF Chat Brief';
      const content = exportBriefToMarkdown(exportableMessages, title);
      const filename = generateExportFilename('pdf-chat-brief', 'md');
      downloadAsFile(content, filename);

      setExportStatus('success');
      onExportComplete?.(true, 'download');
    } catch (error) {
      console.error('[SessionExportMenu] Download brief failed:', error);
      setExportStatus('error');
      onExportComplete?.(false, 'download');
    }
    setIsOpen(false);
  };

  const getButtonIcon = () => {
    switch (exportStatus) {
      case 'copying':
      case 'downloading':
        return (
          <div style={{
            width: '14px',
            height: '14px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: '#60a5fa',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
        );
      case 'success':
        return <Check size={14} />;
      case 'error':
        return <AlertTriangle size={14} />;
      default:
        return <FileText size={14} />;
    }
  };

  const getButtonColor = () => {
    switch (exportStatus) {
      case 'success':
        return 'var(--theme-success, #22c55e)';
      case 'error':
        return 'var(--theme-error, #ef4444)';
      default:
        return '#60a5fa';
    }
  };

  // Don't show if there are no messages to export
  if (exportableMessages.length === 0) {
    return null;
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Export entire session as brief"
        style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          color: getButtonColor(),
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          borderRadius: '6px',
          transition: 'all 0.2s',
          fontSize: '0.8rem',
          fontWeight: 500
        }}
      >
        {getButtonIcon()}
        <span>Export Session</span>
        <ChevronDown size={12} style={{
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s'
        }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          marginBottom: '4px',
          backgroundColor: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 100,
          minWidth: '220px',
          overflow: 'hidden'
        }}>
          {/* Header with stats */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--theme-border)',
            backgroundColor: 'rgba(59, 130, 246, 0.05)'
          }}>
            <div style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--theme-text-primary)',
              marginBottom: '4px'
            }}>
              Export Session Brief
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--theme-text-muted)'
            }}>
              {exportableMessages.length} message{exportableMessages.length !== 1 ? 's' : ''}
              {responsesWithCitations > 0 && ` • ${responsesWithCitations} with citations`}
            </div>
          </div>

          <button
            onClick={handleCopyBrief}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              textAlign: 'left',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Copy size={16} />
            <div>
              <div style={{ fontWeight: 500 }}>Copy Brief</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                All Q&A with consolidated references
              </div>
            </div>
          </button>

          <div style={{
            height: '1px',
            backgroundColor: 'var(--theme-border)',
            margin: '0 8px'
          }} />

          <button
            onClick={handleDownloadBrief}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              textAlign: 'left',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Download size={16} />
            <div>
              <div style={{ fontWeight: 500 }}>Download Brief</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                Save consolidated .md file
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

interface PDFMessageProps {
  message: PDFChatMessage;
  previousMessage?: PDFChatMessage;
  onCitationClick: (citation: Citation) => void;
  onCopy?: (content: string) => void;
  isStreaming?: boolean;
  /** Session ID for feedback tracking - Requirement 17.1 */
  sessionId?: string;
  /** Callback when feedback is submitted - Requirement 17.1 */
  onFeedback?: (messageId: string, type: 'thumbs_up' | 'thumbs_down') => void;
  /** Current feedback state for this message */
  feedbackState?: 'thumbs_up' | 'thumbs_down' | null;
}

/**
 * Feedback buttons component for assistant messages
 * Requirement 17.1: Thumbs up/down feedback on responses
 */
interface FeedbackButtonsProps {
  messageId: string;
  sessionId: string;
  onFeedback: (messageId: string, type: 'thumbs_up' | 'thumbs_down') => void;
  currentFeedback?: 'thumbs_up' | 'thumbs_down' | null;
}

function FeedbackButtons({ messageId, sessionId, onFeedback, currentFeedback }: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(currentFeedback || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFeedback = async (type: 'thumbs_up' | 'thumbs_down') => {
    if (isSubmitting || feedback === type) return;

    setIsSubmitting(true);

    try {
      // Create feedback object
      const feedbackData: ResponseFeedback = {
        responseId: messageId,
        sessionId,
        type,
        timestamp: Date.now(),
      };

      // Save feedback via IPC
      await window.ipcRenderer?.invoke('pdf:save-feedback', feedbackData);

      // Update local state
      setFeedback(type);
      onFeedback(messageId, type);

      console.log('[FeedbackButtons] Feedback submitted:', type, 'for message:', messageId);
    } catch (error) {
      console.error('[FeedbackButtons] Failed to submit feedback:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    }}>
      {/* Thumbs up button */}
      <button
        onClick={() => handleFeedback('thumbs_up')}
        disabled={isSubmitting}
        title={feedback === 'thumbs_up' ? 'You found this helpful' : 'This was helpful'}
        style={{
          background: feedback === 'thumbs_up'
            ? 'rgba(34, 197, 94, 0.15)'
            : 'transparent',
          border: feedback === 'thumbs_up'
            ? '1px solid rgba(34, 197, 94, 0.4)'
            : '1px solid transparent',
          color: feedback === 'thumbs_up'
            ? '#22c55e'
            : 'var(--theme-text-muted)',
          cursor: isSubmitting ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '4px',
          transition: 'all 0.2s',
          opacity: isSubmitting ? 0.5 : 1,
        }}
        onMouseOver={(e) => {
          if (feedback !== 'thumbs_up' && !isSubmitting) {
            e.currentTarget.style.color = '#22c55e';
            e.currentTarget.style.backgroundColor = 'rgba(34, 197, 94, 0.1)';
          }
        }}
        onMouseOut={(e) => {
          if (feedback !== 'thumbs_up') {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        <ThumbsUp size={14} />
      </button>

      {/* Thumbs down button */}
      <button
        onClick={() => handleFeedback('thumbs_down')}
        disabled={isSubmitting}
        title={feedback === 'thumbs_down' ? 'You found this unhelpful' : 'This was not helpful'}
        style={{
          background: feedback === 'thumbs_down'
            ? 'rgba(239, 68, 68, 0.15)'
            : 'transparent',
          border: feedback === 'thumbs_down'
            ? '1px solid rgba(239, 68, 68, 0.4)'
            : '1px solid transparent',
          color: feedback === 'thumbs_down'
            ? '#ef4444'
            : 'var(--theme-text-muted)',
          cursor: isSubmitting ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px',
          borderRadius: '4px',
          transition: 'all 0.2s',
          opacity: isSubmitting ? 0.5 : 1,
        }}
        onMouseOver={(e) => {
          if (feedback !== 'thumbs_down' && !isSubmitting) {
            e.currentTarget.style.color = '#ef4444';
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
          }
        }}
        onMouseOut={(e) => {
          if (feedback !== 'thumbs_down') {
            e.currentTarget.style.color = 'var(--theme-text-muted)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}

/**
 * Single PDF chat message component
 */
function PDFMessage({ message, previousMessage, onCitationClick, onCopy, isStreaming, sessionId, onFeedback, feedbackState }: PDFMessageProps) {
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    if (onCopy) {
      onCopy(message.content);
    } else {
      navigator.clipboard.writeText(message.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render user message
  if (isUser) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        marginBottom: '16px',
        gap: '8px'
      }}>
        {/* Attached selection indicator */}
        {message.attachedSelection && (
          <div style={{
            padding: '8px 12px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            fontSize: '0.8rem',
            color: '#60a5fa',
            maxWidth: '70%'
          }}>
            <div style={{ fontWeight: 500, marginBottom: '4px' }}>
              Selected from page {message.attachedSelection.pageNumber}:
            </div>
            <div style={{
              color: 'var(--theme-text-secondary)',
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}>
              "{message.attachedSelection.text.slice(0, 150)}..."
            </div>
          </div>
        )}

        {/* Message content */}
        <div style={{
          padding: '12px 18px',
          backgroundColor: 'var(--theme-surface)',
          borderRadius: '20px',
          color: 'var(--theme-text-secondary)',
          fontSize: '0.95rem',
          maxWidth: '70%',
          whiteSpace: 'pre-wrap'
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  // Render assistant message with citations
  return (
    <div style={{ marginBottom: '16px', overflow: 'visible' }}>
      {/* Message content with inline citations */}
      <div className="markdown-content" style={{
        color: '#e0e0e0',
        lineHeight: '1.7',
        fontSize: '0.95rem'
      }}>
        <MessageWithCitations
          content={message.content}
          citations={message.citations || []}
          onCitationClick={onCitationClick}
          isStreaming={isStreaming}
          responseId={message.id}
          sessionId={sessionId}
        />
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        rowGap: '6px',
        flexWrap: 'wrap',
        marginTop: '8px',
        overflow: 'visible'
      }}>
        {/* Feedback buttons - Requirement 17.1 */}
        {!isStreaming && sessionId && onFeedback && (
          <FeedbackButtons
            messageId={message.id}
            sessionId={sessionId}
            onFeedback={onFeedback}
            currentFeedback={feedbackState}
          />
        )}

        {/* Divider between feedback and other actions */}
        {!isStreaming && sessionId && onFeedback && (
          <div style={{
            width: '1px',
            height: '16px',
            backgroundColor: 'var(--theme-border)',
            margin: '0 4px'
          }} />
        )}

        {/* Copy button */}
        {!isStreaming && (
          <button
            onClick={handleCopy}
            title="Copy response"
            style={{
              background: 'transparent',
              border: 'none',
              color: copied ? 'var(--theme-success)' : 'var(--theme-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s',
              fontSize: '0.8rem'
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}

        {/* Export button - Requirements: 14.1, 14.4 */}
        {!isStreaming && (
          <ExportMenu
            message={message}
            previousMessage={previousMessage}
          />
        )}

        {/* Sources toggle */}
        {message.sources && message.sources.length > 0 && (
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60a5fa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 500
            }}
          >
            <Info size={14} />
            {message.sources.length} source{message.sources.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Sources panel */}
      {message.sources && message.sources.length > 0 && (
        <SourcesPanel
          sources={message.sources}
          onSourceClick={(source) => {
            if (source.chunk.metadata.boundingBoxes.length > 0) {
              onCitationClick({
                id: source.chunk.id,
                chunkId: source.chunk.id,
                documentName: source.chunk.documentId,
                pageNumber: source.chunk.metadata.pageNumbers[0] || 1,
                boundingBoxes: source.chunk.metadata.boundingBoxes,
                quotedText: source.chunk.content.slice(0, 150)
              });
            }
          }}
          expanded={sourcesExpanded}
          onToggle={() => setSourcesExpanded(!sourcesExpanded)}
        />
      )}
    </div>
  );
}


interface MessageWithCitationsProps {
  content: string;
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
  isStreaming?: boolean;
  /** Response ID for citation feedback tracking - Requirement 17.2 */
  responseId?: string;
  /** Session ID for citation feedback tracking - Requirement 17.2 */
  sessionId?: string;
}

/**
 * Render message content with clickable inline citations
 * Requirements: 8.2, 8.7, 8.8, 17.2
 */
function MessageWithCitations({
  content,
  citations,
  onCitationClick,
  isStreaming,
  responseId,
  sessionId
}: MessageWithCitationsProps) {
  // If streaming or no citations, render plain markdown
  if (isStreaming || citations.length === 0) {
    return <LazyMarkdown content={content} />;
  }

  // Parse and render content with citation links
  // Citations are in format [1], [2], etc. after parsing
  const citationPattern = /\[(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = citationPattern.exec(content)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <LazyMarkdown key={`text-${lastIndex}`} content={textBefore} />
      );
    }

    // Add citation link
    const citationNum = parseInt(match[1], 10) - 1;
    const citation = citations[citationNum];

    if (citation) {
      parts.push(
        <CitationLink
          key={`cite-${match.index}`}
          citation={citation}
          onClick={() => onCitationClick(citation)}
          responseId={responseId}
          sessionId={sessionId}
        />
      );
    } else {
      // Keep original text if citation not found
      parts.push(<span key={`cite-${match.index}`}>{match[0]}</span>);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(
      <LazyMarkdown key={`text-${lastIndex}`} content={content.slice(lastIndex)} />
    );
  }

  return <>{parts}</>;
}


interface LowConfidenceWarningProps {
  confidence: number;
  threshold: number;
}

/**
 * Low confidence warning component
 * Requirements: 10.2, 10.5
 */
function LowConfidenceWarning({ confidence, threshold }: LowConfidenceWarningProps) {
  if (confidence >= threshold) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 14px',
      backgroundColor: 'rgba(251, 191, 36, 0.1)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: '8px',
      marginBottom: '12px',
      fontSize: '0.85rem',
      color: '#fbbf24'
    }}>
      <AlertTriangle size={16} />
      <span>
        Low confidence ({Math.round(confidence * 100)}%).
        The retrieved information may not fully answer your question.
      </span>
    </div>
  );
}

/**
 * Embedding fallback notification banner
 * 
 * Displays a warning when semantic search is unavailable and the system
 * is using keyword-only (BM25) search as a fallback.
 * 
 * Implements Requirement 18.2: Notify user of fallback
 */
interface EmbeddingFallbackBannerProps {
  fallbackState: EmbeddingFallbackState;
  onRetry?: () => void;
  onConfigure?: () => void;
  onDismiss?: () => void;
}

function EmbeddingFallbackBanner({
  fallbackState,
  onRetry,
  onConfigure,
  onDismiss
}: EmbeddingFallbackBannerProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (!fallbackState.isActive || isDismissed) {
    return null;
  }

  const handleRetry = async () => {
    if (isRecovering) return;

    setIsRecovering(true);
    try {
      onRetry?.();
    } finally {
      // Give some time for the recovery attempt
      setTimeout(() => setIsRecovering(false), 2000);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Determine the icon and color based on reason
  const getReasonStyle = () => {
    switch (fallbackState.reason) {
      case 'model_unavailable':
        return { color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.1)', borderColor: 'rgba(249, 115, 22, 0.3)' };
      case 'rate_limited':
        return { color: '#eab308', bgColor: 'rgba(234, 179, 8, 0.1)', borderColor: 'rgba(234, 179, 8, 0.3)' };
      case 'dimension_mismatch':
        return { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' };
      default:
        return { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' };
    }
  };

  const style = getReasonStyle();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '12px 16px',
      backgroundColor: style.bgColor,
      border: `1px solid ${style.borderColor}`,
      borderRadius: '10px',
      marginBottom: '12px',
      fontSize: '0.85rem',
    }}>
      {/* Icon */}
      <div style={{
        color: style.color,
        flexShrink: 0,
        marginTop: '2px'
      }}>
        <AlertTriangle size={18} />
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontWeight: 600,
          color: style.color,
          marginBottom: '4px'
        }}>
          Using Keyword Search Only
        </div>
        <div style={{
          color: 'var(--theme-text-secondary)',
          lineHeight: 1.5
        }}>
          {fallbackState.message || 'Semantic search is temporarily unavailable. Results are based on keyword matching only, which may be less accurate.'}
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '10px'
        }}>
          {/* Retry button */}
          {fallbackState.canRecover && onRetry && (
            <button
              onClick={handleRetry}
              disabled={isRecovering}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: `1px solid ${style.borderColor}`,
                background: 'transparent',
                color: style.color,
                cursor: isRecovering ? 'wait' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                opacity: isRecovering ? 0.6 : 1,
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw
                size={14}
                style={{
                  animation: isRecovering ? 'spin 1s linear infinite' : 'none'
                }}
              />
              {isRecovering ? 'Checking...' : 'Retry'}
            </button>
          )}

          {/* Configure button */}
          {fallbackState.reason === 'model_unavailable' && onConfigure && (
            <button
              onClick={onConfigure}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: 'var(--theme-text-secondary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <Settings size={14} />
              Configure
            </button>
          )}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        title="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--theme-text-muted)',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.6,
          transition: 'opacity 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
        onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
      >
        <span style={{ fontSize: '16px', lineHeight: 1 }}>×</span>
      </button>
    </div>
  );
}

interface GroundedModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

/**
 * Grounded mode toggle component
 * Requirements: 10.1, 10.3, 10.4
 */
function GroundedModeToggle({ enabled, onChange }: GroundedModeToggleProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      title={enabled
        ? "Grounded mode: Only answers from document content"
        : "Standard mode: May include general knowledge"
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderRadius: '8px',
        border: enabled
          ? '1px solid rgba(34, 197, 94, 0.5)'
          : '1px solid rgba(255, 255, 255, 0.1)',
        background: enabled
          ? 'rgba(34, 197, 94, 0.1)'
          : 'rgba(255, 255, 255, 0.03)',
        color: enabled ? '#22c55e' : '#888',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 500,
        transition: 'all 0.2s'
      }}
    >
      {enabled ? <Shield size={14} /> : <ShieldOff size={14} />}
      <span>Grounded</span>
    </button>
  );
}


/**
 * PDFChatArea - Main PDF chat interface component
 * Requirements: 2.1, 12.1, 12.3, 12.4
 */
export function PDFChatArea({
  sessionId,
  documentIds,
  onCitationClick,
  groundedMode = false,
  onGroundedModeChange,
  indexingState,
  loadedDocuments,
  documentLoadingState,
  onDismissIndexingNotification,
  indexingPrompt,
  onConfirmIndexing,
  onSkipIndexing,
  onDeleteIndex,
  onReindex,
  indexingLogs,
}: PDFChatAreaProps) {
  const { settings } = useSettings();
  // State
  const [messages, setMessages] = useState<PDFChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [lastConfidence, setLastConfidence] = useState<number>(1);
  const [attachedSelection, setAttachedSelection] = useState<TextSelection | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<'top' | 'bottom'>('top');
  const [actionMenuCoords, setActionMenuCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  // Feedback state - tracks thumbs up/down for each message - Requirement 17.1
  const [feedbackState, setFeedbackState] = useState<Record<string, 'thumbs_up' | 'thumbs_down'>>({});
  // Embedding fallback state - Requirement 18.2
  const [embeddingFallbackState, setEmbeddingFallbackState] = useState<EmbeddingFallbackState | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Handle feedback submission for a message
   * Requirement 17.1: Thumbs up/down feedback on responses
   */
  const handleFeedback = useCallback((messageId: string, type: 'thumbs_up' | 'thumbs_down') => {
    setFeedbackState(prev => ({
      ...prev,
      [messageId]: type
    }));
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideMenu = actionMenuRef.current && !actionMenuRef.current.contains(target);
      const isOutsideButton = actionMenuButtonRef.current && !actionMenuButtonRef.current.contains(target);
      if (isOutsideMenu && isOutsideButton) {
        setIsActionMenuOpen(false);
      }
    };

    if (isActionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActionMenuOpen]);

  useEffect(() => {
    if (!isActionMenuOpen || !actionMenuButtonRef.current) return;
    const rect = actionMenuButtonRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceAbove > spaceBelow;
    setActionMenuPosition(openAbove ? 'top' : 'bottom');
    
    // Calculate fixed position for portal
    const menuHeight = 200; // Approximate menu height
    setActionMenuCoords({
      top: openAbove ? rect.top - menuHeight - 6 : rect.bottom + 6,
      left: rect.right - 230 // Align right edge with button, menu is 230px wide
    });
  }, [isActionMenuOpen]);

  const actionMenuStyles = useMemo(() => ({
    position: 'fixed' as const,
    top: actionMenuCoords.top,
    left: actionMenuCoords.left,
    backgroundColor: 'var(--theme-surface)',
    border: '1px solid var(--theme-border)',
    borderRadius: '10px',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
    zIndex: 9999,
    minWidth: '230px',
    overflow: 'hidden'
  }), [actionMenuCoords]);

  useEffect(() => {
    if (!isActionMenuOpen) return;
    const handleScrollOrResize = () => {
      if (!actionMenuButtonRef.current) return;
      const rect = actionMenuButtonRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openAbove = spaceAbove > spaceBelow;
      setActionMenuPosition(openAbove ? 'top' : 'bottom');
      
      // Update fixed position for portal
      const menuHeight = 200;
      setActionMenuCoords({
        top: openAbove ? rect.top - menuHeight - 6 : rect.bottom + 6,
        left: rect.right - 230
      });
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isActionMenuOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  // Load session messages
  useEffect(() => {
    if (sessionId) {
      loadSessionMessages(sessionId);
    }
  }, [sessionId]);

  // Check embedding fallback state on mount and listen for changes - Requirement 18.2
  useEffect(() => {
    const checkFallbackState = async () => {
      try {
        const state = await window.ipcRenderer?.invoke('pdf:get-embedding-fallback-state');
        if (state) {
          setEmbeddingFallbackState(state);
        }
      } catch (error) {
        console.error('[PDFChatArea] Failed to get fallback state:', error);
      }
    };

    // Initial check
    checkFallbackState();

    // Listen for fallback state changes
    const handleFallbackStateChange = (_event: any, state: EmbeddingFallbackState) => {
      setEmbeddingFallbackState(state);
    };

    window.ipcRenderer?.on('pdf:embedding-fallback-status', handleFallbackStateChange);

    return () => {
      window.ipcRenderer?.off('pdf:embedding-fallback-status', handleFallbackStateChange);
    };
  }, []);

  /**
   * Attempt to recover from embedding fallback mode
   * Requirement 18.2: Allow recovery when embeddings become available
   */
  const attemptEmbeddingRecovery = useCallback(async () => {
    try {
      const result = await window.ipcRenderer?.invoke('pdf:attempt-embedding-recovery');
      if (result) {
        setEmbeddingFallbackState(result.state);
        if (result.success) {
          console.log('[PDFChatArea] Embedding recovery successful');
        }
      }
    } catch (error) {
      console.error('[PDFChatArea] Embedding recovery failed:', error);
    }
  }, []);

  const loadSessionMessages = async (sid: string) => {
    try {
      // Load messages from IPC
      const session = await window.ipcRenderer?.invoke('pdf-chat:get-session', sid);
      if (session?.messages) {
        setMessages(session.messages);
      }

      // Load persisted feedback for this session - Requirement 17.4
      const feedback = await window.ipcRenderer?.invoke('pdf:get-feedback', { sessionId: sid });
      if (feedback && Array.isArray(feedback)) {
        const feedbackMap: Record<string, 'thumbs_up' | 'thumbs_down'> = {};
        for (const f of feedback) {
          // Only process response feedback (not citation feedback)
          if ('type' in f && (f.type === 'thumbs_up' || f.type === 'thumbs_down')) {
            feedbackMap[f.responseId] = f.type;
          }
        }
        setFeedbackState(feedbackMap);
      }
    } catch (error) {
      console.error('[PDFChatArea] Failed to load session:', error);
    }
  };

  const buildFallbackMessages = useCallback((userContent: string): Array<{ role: string; content: string }> => {
    const history = [...messages, { role: 'user', content: userContent }];
    const trimmedHistory = history
      .filter(m => typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-8)
      .map(m => ({ role: m.role, content: String(m.content) }));
    const systemPrompt = settings.systemPrompt?.trim();
    return systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...trimmedHistory]
      : trimmedHistory;
  }, [messages, settings.systemPrompt]);

  const generateFallbackResponse = useCallback(async (userContent: string): Promise<string> => {
    const fallbackMessages = buildFallbackMessages(userContent);
    const model = settings.aiModel;
    const temperature = settings.temperature;
    const maxTokens = settings.maxTokens;

    switch (settings.modelProvider) {
      case 'groq': {
        const res = await generateGroqCompletion(settings.groqApiKey, model, fallbackMessages, {
          temperature,
          max_tokens: maxTokens
        });
        return res.choices?.[0]?.message?.content || '';
      }
      case 'gemini': {
        const res = await generateGeminiCompletion(settings.geminiApiKey, model, fallbackMessages, {
          temperature,
          maxOutputTokens: maxTokens,
          systemInstruction: settings.systemPrompt
        });
        return res.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
      }
      case 'perplexity': {
        const res = await generatePerplexityCompletion(settings.perplexityApiKey, model, fallbackMessages, {
          temperature,
          max_tokens: maxTokens
        });
        const content = res.choices?.[0]?.message?.content || '';
        return cleanSonarResponse(content, res.citations, res.search_results);
      }
      case 'ollama': {
        const res = await generateOllamaCompletion(settings.ollamaUrl, model, fallbackMessages, {
          temperature,
          num_ctx: maxTokens
        });
        return res?.message?.content || '';
      }
      case 'minimax': {
        const res = await generateMiniMaxCompletion(settings.minimaxApiKey, model, fallbackMessages, {
          temperature,
          maxTokens
        });
        return res.choices?.[0]?.message?.content || '';
      }
      case 'openrouter':
      default: {
        const res = await generateOpenRouterCompletion(settings.openRouterApiKey, model, fallbackMessages, {
          temperature,
          maxTokens
        });
        return res.choices?.[0]?.message?.content || '';
      }
    }
  }, [
    buildFallbackMessages,
    settings.aiModel,
    settings.temperature,
    settings.maxTokens,
    settings.modelProvider,
    settings.groqApiKey,
    settings.geminiApiKey,
    settings.systemPrompt,
    settings.perplexityApiKey,
    settings.ollamaUrl,
    settings.minimaxApiKey,
    settings.openRouterApiKey
  ]);

  /**
   * Generate AI response with PDF context awareness
   * 
   * This function uses the PDF system prompt from the RAG engine
   * to generate responses that are grounded in the PDF content.
   */
  const generatePDFAwareResponse = useCallback(async (
    userContent: string,
    pdfSystemPrompt: string
  ): Promise<string> => {
    console.log('[PDFChatArea] ═══════════════════════════════════════════════════════');
    console.log('[PDFChatArea] 🤖 generatePDFAwareResponse START');
    console.log('[PDFChatArea]    User content:', userContent.substring(0, 100) + (userContent.length > 100 ? '...' : ''));
    console.log('[PDFChatArea]    System prompt length:', pdfSystemPrompt.length, 'chars');
    console.log('[PDFChatArea]    System prompt preview:', pdfSystemPrompt.substring(0, 200) + '...');

    // Build messages array with PDF system prompt
    const messagesForAI: Array<{ role: string; content: string }> = [
      { role: 'system', content: pdfSystemPrompt },
      { role: 'user', content: userContent }
    ];

    const model = settings.aiModel;
    const temperature = settings.temperature;
    const maxTokens = settings.maxTokens;

    console.log('[PDFChatArea]    Provider:', settings.modelProvider);
    console.log('[PDFChatArea]    Model:', model);
    console.log('[PDFChatArea]    Temperature:', temperature);
    console.log('[PDFChatArea]    Max tokens:', maxTokens);

    let aiResponse = '';
    try {
      switch (settings.modelProvider) {
        case 'groq': {
          console.log('[PDFChatArea]    Calling Groq API...');
          const res = await generateGroqCompletion(settings.groqApiKey, model, messagesForAI, {
            temperature,
            max_tokens: maxTokens
          });
          console.log('[PDFChatArea]    Groq raw response:', JSON.stringify(res).substring(0, 500));
          aiResponse = res.choices?.[0]?.message?.content || '';
          break;
        }
        case 'gemini': {
          console.log('[PDFChatArea]    Calling Gemini API...');
          const res = await generateGeminiCompletion(settings.geminiApiKey, model, messagesForAI, {
            temperature,
            maxOutputTokens: maxTokens,
            systemInstruction: pdfSystemPrompt
          });
          console.log('[PDFChatArea]    Gemini raw response:', JSON.stringify(res).substring(0, 500));
          aiResponse = res.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
          break;
        }
        case 'perplexity': {
          console.log('[PDFChatArea]    Calling Perplexity API...');
          const res = await generatePerplexityCompletion(settings.perplexityApiKey, model, messagesForAI, {
            temperature,
            max_tokens: maxTokens
          });
          console.log('[PDFChatArea]    Perplexity raw response:', JSON.stringify(res).substring(0, 500));
          const content = res.choices?.[0]?.message?.content || '';
          aiResponse = cleanSonarResponse(content, res.citations, res.search_results);
          break;
        }
        case 'ollama': {
          console.log('[PDFChatArea]    Calling Ollama API at:', settings.ollamaUrl);
          const res = await generateOllamaCompletion(settings.ollamaUrl, model, messagesForAI, {
            temperature,
            num_ctx: maxTokens
          });
          console.log('[PDFChatArea]    Ollama raw response:', JSON.stringify(res).substring(0, 500));
          aiResponse = res?.message?.content || '';
          break;
        }
        case 'minimax': {
          console.log('[PDFChatArea]    Calling MiniMax API...');
          const res = await generateMiniMaxCompletion(settings.minimaxApiKey, model, messagesForAI, {
            temperature,
            maxTokens
          });
          console.log('[PDFChatArea]    MiniMax raw response:', JSON.stringify(res).substring(0, 500));
          aiResponse = res.choices?.[0]?.message?.content || '';
          break;
        }
        case 'openrouter':
        default: {
          console.log('[PDFChatArea]    Calling OpenRouter API...');
          const res = await generateOpenRouterCompletion(settings.openRouterApiKey, model, messagesForAI, {
            temperature,
            maxTokens
          });
          console.log('[PDFChatArea]    OpenRouter raw response:', JSON.stringify(res).substring(0, 500));
          aiResponse = res.choices?.[0]?.message?.content || '';
          break;
        }
      }
    } catch (apiError) {
      console.error('[PDFChatArea]    ❌ API call failed:', apiError);
      throw apiError;
    }

    console.log('[PDFChatArea] 📝 AI Response received');
    console.log('[PDFChatArea]    Response length:', aiResponse.length, 'chars');
    console.log('[PDFChatArea]    Response preview:', aiResponse.substring(0, 300) + (aiResponse.length > 300 ? '...' : ''));
    console.log('[PDFChatArea]    Response is empty:', !aiResponse || aiResponse.trim().length === 0);
    console.log('[PDFChatArea] ═══════════════════════════════════════════════════════');

    return aiResponse;
  }, [
    settings.aiModel,
    settings.temperature,
    settings.maxTokens,
    settings.modelProvider,
    settings.groqApiKey,
    settings.geminiApiKey,
    settings.perplexityApiKey,
    settings.ollamaUrl,
    settings.minimaxApiKey,
    settings.openRouterApiKey
  ]);


  /**
   * Send a message and get RAG response
   */
  const sendMessage = useCallback(async () => {
    console.log('[PDFChatArea] ═══════════════════════════════════════════════════════');
    console.log('[PDFChatArea] 💬 sendMessage START');
    console.log('[PDFChatArea]    Input:', input.substring(0, 100) + (input.length > 100 ? '...' : ''));
    console.log('[PDFChatArea]    isLoading:', isLoading);
    console.log('[PDFChatArea]    documentIds:', documentIds);

    if (!input.trim() || isLoading || documentIds.length === 0) {
      console.log('[PDFChatArea]    ⚠️ Early return - input empty, loading, or no documents');
      return;
    }

    // Check if any documents are indexed
    const hasIndexedDocuments = documentIds.some(docId => {
      const doc = loadedDocuments?.get(docId);
      console.log('[PDFChatArea]    Document', docId, 'indexed:', doc?.isIndexed);
      return doc?.isIndexed === true;
    });
    console.log('[PDFChatArea]    hasIndexedDocuments:', hasIndexedDocuments);

    const userMessage: PDFChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
      attachedSelection: attachedSelection || undefined
    };

    // Add user message
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedSelection(null);
    setIsLoading(true);

    // Create placeholder for assistant response
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const assistantMessage: PDFChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, assistantMessage]);

    // If no documents are indexed, show a helpful message
    if (!hasIndexedDocuments) {
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
            ...msg,
            content: 'This document needs to be indexed before I can search and answer questions about its content. Please click "Index Document" above to enable document search and chat features.'
          }
          : msg
      ));
      setIsLoading(false);
      return;
    }

    try {
      console.log('[PDFChatArea] 🔍 Calling pdf:get-context IPC...');
      console.log('[PDFChatArea]    Query:', userMessage.content);
      console.log('[PDFChatArea]    Document IDs:', documentIds);
      console.log('[PDFChatArea]    Grounded mode:', groundedMode);

      // Get RAG context via IPC (retrieves relevant chunks and builds PDF system prompt)
      const ragContext = await window.ipcRenderer?.invoke('pdf:get-context',
        userMessage.content,
        documentIds,
        {
          groundedMode,
          topK: 5,
          minScore: groundedMode ? 0.6 : 0.4,
          useHybrid: true,
          useReranker: true
        },
        {
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          viewState: undefined // Could be populated with current page view state
        }
      );

      console.log('[PDFChatArea] 📊 RAG Context received:');
      console.log('[PDFChatArea]    Has context:', !!ragContext);
      console.log('[PDFChatArea]    Has pdfSystemPrompt:', !!ragContext?.pdfSystemPrompt);
      console.log('[PDFChatArea]    pdfSystemPrompt length:', ragContext?.pdfSystemPrompt?.length || 0);
      console.log('[PDFChatArea]    Confidence:', ragContext?.confidence);
      console.log('[PDFChatArea]    Sources count:', ragContext?.sources?.length || 0);
      console.log('[PDFChatArea]    Is low confidence:', ragContext?.isLowConfidence);
      console.log('[PDFChatArea]    Warning:', ragContext?.warning);
      console.log('[PDFChatArea]    Context string length:', ragContext?.contextString?.length || 0);
      console.log('[PDFChatArea]    Context string preview:', ragContext?.contextString?.substring(0, 200) || 'EMPTY/NO CONTEXT');

      if (ragContext?.sources?.length === 0) {
        console.error('[PDFChatArea] ❌❌❌ NO SOURCES FOUND - RAG RETRIEVAL FAILED ❌❌❌');
        console.error('[PDFChatArea]    This usually means:');
        console.error('[PDFChatArea]    1. Document is NOT INDEXED - Click "Index Document" button');
        console.error('[PDFChatArea]    2. Query has no matching content in the document');
        console.error('[PDFChatArea]    3. Document ID mismatch between loaded and indexed');
      }

      if (ragContext?.sources?.length > 0) {
        console.log('[PDFChatArea]    ✅ Sources details:');
        ragContext.sources.slice(0, 3).forEach((source: RetrievalResult, idx: number) => {
          console.log(`[PDFChatArea]       [${idx}] Score: ${source.score?.toFixed(3)}, Page: ${source.chunk?.metadata?.pageNumbers?.[0]}, Content preview: ${source.chunk?.content?.substring(0, 100)}...`);
        });
      }

      if (ragContext && ragContext.pdfSystemPrompt) {
        // Update confidence from RAG retrieval
        setLastConfidence(ragContext.confidence || 1);

        console.log('[PDFChatArea] 🤖 Generating AI response...');
        // Generate AI response using the PDF-aware system prompt
        const aiResponse = await generatePDFAwareResponse(
          userMessage.content,
          ragContext.pdfSystemPrompt
        );

        console.log('[PDFChatArea] ✅ AI Response generated');
        console.log('[PDFChatArea]    Response length:', aiResponse?.length || 0);
        console.log('[PDFChatArea]    Response preview:', aiResponse?.substring(0, 200) + '...');

        // Build citations from sources
        const citations: Citation[] = (ragContext.sources || []).map((source: RetrievalResult, idx: number) => ({
          id: `citation-${idx}`,
          chunkId: source.chunk.id,
          pageNumber: source.chunk.metadata.pageNumbers?.[0] || 1,
          documentName: ragContext.documentMetadata?.find((d: { id: string }) => d.id === source.chunk.documentId)?.fileName || 'Document',
          quotedText: source.chunk.content?.substring(0, 200) || '',
          boundingBoxes: source.chunk.metadata.boundingBoxes || [],
        }));

        console.log('[PDFChatArea]    Citations built:', citations.length);

        // Update assistant message with response
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              content: aiResponse,
              citations,
              sources: ragContext.sources
            }
            : msg
        ));

        console.log('[PDFChatArea] 💬 sendMessage COMPLETE');
        console.log('[PDFChatArea] ═══════════════════════════════════════════════════════');

        // Save session
        await saveSession();
      } else {
        // Fallback if no context was retrieved
        console.warn('[PDFChatArea] ⚠️ No PDF context available, using fallback response');
        console.log('[PDFChatArea]    ragContext:', ragContext);
        const fallbackContent = await generateFallbackResponse(userMessage.content);
        setLastConfidence(0.5);
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              content: fallbackContent || 'I could not find relevant information in the document to answer your question.'
            }
            : msg
        ));
      }
    } catch (error) {
      console.error('[PDFChatArea] Query failed:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const shouldFallback = errorMessage.includes('PDF features are currently unavailable');
      if (shouldFallback) {
        try {
          const fallbackContent = await generateFallbackResponse(userMessage.content);
          if (fallbackContent) {
            setLastConfidence(1);
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                  ...msg,
                  content: fallbackContent
                }
                : msg
            ));
            return;
          }
        } catch (fallbackError) {
          console.error('[PDFChatArea] Fallback response failed:', fallbackError);
        }
      }

      // Update with error message
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
            ...msg,
            content: 'Sorry, I encountered an error while processing your question. Please try again.'
          }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, documentIds, groundedMode, attachedSelection, messages, generateFallbackResponse, generatePDFAwareResponse, loadedDocuments]);


  /**
   * Generate section-by-section document summary
   * 
   * Implements Requirements 12.1, 12.3, 12.4:
   * - 12.1: Generate document summary
   * - 12.3: Section-by-section summarization
   * - 12.4: Include section citations in summary
   */
  const summarizeDocument = useCallback(async () => {
    console.log('[PDFChatArea] ═══════════════════════════════════════════════════════');
    console.log('[PDFChatArea] 📄 summarizeDocument START');
    console.log('[PDFChatArea]    documentIds:', documentIds);
    console.log('[PDFChatArea]    isSummarizing:', isSummarizing);

    if (documentIds.length === 0 || isSummarizing) {
      console.log('[PDFChatArea]    ⚠️ Early return - no documents or already summarizing');
      return;
    }
    setIsActionMenuOpen(false);
    setIsSummarizing(true);

    // Helper to check if API key is configured for current provider
    const hasApiKey = (): boolean => {
      switch (settings.modelProvider) {
        case 'groq': return !!settings.groqApiKey;
        case 'gemini': return !!settings.geminiApiKey;
        case 'perplexity': return !!settings.perplexityApiKey;
        case 'minimax': return !!settings.minimaxApiKey;
        case 'ollama': return true; // Ollama doesn't need API key
        case 'openrouter':
        default: return !!settings.openRouterApiKey;
      }
    };

    // Get provider display name
    const getProviderName = (): string => {
      switch (settings.modelProvider) {
        case 'groq': return 'Groq';
        case 'gemini': return 'Gemini';
        case 'perplexity': return 'Perplexity';
        case 'minimax': return 'MiniMax';
        case 'ollama': return 'Ollama';
        case 'openrouter':
        default: return 'OpenRouter';
      }
    };

    // Add user message indicating summarization request
    const userMessage: PDFChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: '📄 Generate a section-by-section summary of this document',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Create placeholder for assistant response
    const assistantMessageId = `msg-${Date.now() + 1}`;
    const assistantMessage: PDFChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: 'Generating summary...',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    // Pre-flight validation: Check if API key is configured
    if (!hasApiKey()) {
      const providerName = getProviderName();
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
            ...msg,
            content: `**Cannot generate summary: No API key configured**\n\nTo generate AI-powered summaries, please configure your ${providerName} API key in **Settings**.\n\nCurrent provider: ${providerName}\n\n*Go to Settings > AI Provider to add your API key.*`,
          }
          : msg
      ));
      setIsSummarizing(false);
      return;
    }

    try {
      console.log('[PDFChatArea] 🔍 Calling pdf:summarize-document IPC...');
      console.log('[PDFChatArea]    Document ID:', documentIds[0]);

      // Get document summary via IPC
      const summary: DocumentSummary = await window.ipcRenderer?.invoke(
        'pdf:summarize-document',
        documentIds[0], // Summarize the first document
        { maxSectionsToSummarize: 15, includeSubsections: false }
      );

      console.log('[PDFChatArea] 📊 Summary received from IPC:');
      console.log('[PDFChatArea]    Has summary:', !!summary);
      console.log('[PDFChatArea]    Document name:', summary?.documentName);
      console.log('[PDFChatArea]    Page count:', summary?.pageCount);
      console.log('[PDFChatArea]    Section count:', summary?.sectionCount);
      console.log('[PDFChatArea]    Section summaries count:', summary?.sectionSummaries?.length);

      if (summary?.sectionSummaries?.length > 0) {
        console.log('[PDFChatArea]    Section summaries details:');
        summary.sectionSummaries.forEach((s, idx) => {
          console.log(`[PDFChatArea]       [${idx}] "${s.sectionTitle}" (pp. ${s.startPage}-${s.endPage}), context length: ${s.contextString?.length || 0}, citations: ${s.citations?.length || 0}`);
        });
      }

      if (summary) {
        // Track successful summaries for overall summary generation
        const successfulSummaries: Array<{ title: string; summary: string }> = [];
        let failedSections = 0;

        // Format the summary content with section summaries
        let summaryContent = `# Document Summary: ${summary.documentName}\n\n`;
        summaryContent += `📊 **${summary.pageCount} pages** | **${summary.sectionCount} sections**\n\n`;
        summaryContent += `---\n\n`;

        // Generate AI summaries for each section
        for (let i = 0; i < summary.sectionSummaries.length; i++) {
          const sectionSummary = summary.sectionSummaries[i];
          const indent = '  '.repeat(sectionSummary.level);
          const pageRange = sectionSummary.endPage > 0
            ? `(pp. ${sectionSummary.startPage}-${sectionSummary.endPage})`
            : `(p. ${sectionSummary.startPage})`;

          console.log(`[PDFChatArea] 📝 Processing section ${i + 1}/${summary.sectionSummaries.length}: "${sectionSummary.sectionTitle}"`);
          console.log(`[PDFChatArea]    Context string length: ${sectionSummary.contextString?.length || 0}`);
          console.log(`[PDFChatArea]    Context preview: ${sectionSummary.contextString?.substring(0, 150) || 'NONE'}...`);

          summaryContent += `${indent}## ${sectionSummary.sectionTitle} ${pageRange}\n\n`;

          // Generate AI summary for this section if we have context
          if (sectionSummary.contextString && sectionSummary.contextString.trim().length > 0) {
            try {
              console.log(`[PDFChatArea]    🤖 Generating AI summary for section "${sectionSummary.sectionTitle}"...`);
              // Build a concise summarization prompt
              const summarizationPrompt = `You are summarizing a section of a PDF document.

Section Title: "${sectionSummary.sectionTitle}"
Pages: ${sectionSummary.startPage}${sectionSummary.endPage > 0 ? `-${sectionSummary.endPage}` : ''}

Section Content:
---
${sectionSummary.contextString.substring(0, 2000)}${sectionSummary.contextString.length > 2000 ? '...' : ''}
---

Provide a concise summary (2-4 sentences) of the key points in this section. Focus on the main ideas and important details. Do not use phrases like "This section discusses" - just state the content directly.`;

              const sectionAIResponse = await generatePDFAwareResponse(
                'Summarize this section concisely.',
                summarizationPrompt
              );

              console.log(`[PDFChatArea]    ✅ Section AI response received`);
              console.log(`[PDFChatArea]       Response length: ${sectionAIResponse?.length || 0}`);
              console.log(`[PDFChatArea]       Response preview: ${sectionAIResponse?.substring(0, 100) || 'EMPTY'}...`);
              console.log(`[PDFChatArea]       Response is empty: ${!sectionAIResponse || sectionAIResponse.trim().length === 0}`);

              if (sectionAIResponse && sectionAIResponse.trim().length > 0) {
                summaryContent += `${indent}${sectionAIResponse.trim()}\n\n`;
                // Track successful summary for overall summary generation
                successfulSummaries.push({
                  title: sectionSummary.sectionTitle,
                  summary: sectionAIResponse.trim()
                });
                console.log(`[PDFChatArea]    ✅ Section "${sectionSummary.sectionTitle}" summarized successfully`);
              } else {
                // Fallback to context preview if AI returns empty - show clear indicator
                console.log(`[PDFChatArea]    ⚠️ AI returned empty response for section "${sectionSummary.sectionTitle}", using preview`);
                const contextPreview = sectionSummary.contextString.substring(0, 300).trim();
                summaryContent += `${indent}> *Preview:* ${contextPreview}${sectionSummary.contextString.length > 300 ? '...' : ''}\n\n`;
                failedSections++;
              }
            } catch (sectionError) {
              console.error(`[PDFChatArea] ❌ Failed to generate AI summary for section ${i}:`, sectionError);
              // Fallback to context preview with warning indicator
              const contextPreview = sectionSummary.contextString.substring(0, 300).trim();
              summaryContent += `${indent}> *Preview:* ${contextPreview}${sectionSummary.contextString.length > 300 ? '...' : ''}\n\n`;
              failedSections++;
            }
          } else {
            summaryContent += `${indent}*No text content could be extracted from this section. It may contain images or non-text elements.*\n\n`;
          }

          // Add citations for this section
          if (sectionSummary.citations.length > 0) {
            const citationRefs = sectionSummary.citations
              .map((c) => `[[cite:${c.chunkId}:p${c.pageNumber}]]`)
              .join(' ');
            summaryContent += `${indent}*Sources: ${citationRefs}*\n\n`;
          }

          // Update progress in the UI
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? {
                ...msg,
                content: `Generating summary... (${i + 1}/${summary.sectionSummaries.length} sections)\n\n${summaryContent}`,
              }
              : msg
          ));
        }

        console.log('[PDFChatArea] 📊 Section processing complete');
        console.log(`[PDFChatArea]    Successful sections: ${successfulSummaries.length}`);
        console.log(`[PDFChatArea]    Failed sections: ${failedSections}`);

        // Generate overall executive summary if we have successful section summaries
        let overallSummary = '';
        if (successfulSummaries.length > 0) {
          try {
            console.log('[PDFChatArea] 🤖 Generating executive summary...');

            // Update UI to show we're generating overall summary
            setMessages(prev => prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                  ...msg,
                  content: `Generating executive summary...\n\n${summaryContent}`,
                }
                : msg
            ));

            // Combine section summaries for overall summary generation
            const combinedSummaries = successfulSummaries
              .map(s => `**${s.title}:** ${s.summary}`)
              .join('\n\n');

            console.log(`[PDFChatArea]    Combined summaries length: ${combinedSummaries.length}`);

            const overallPrompt = `Based on these section summaries from the document "${summary.documentName}", provide a concise executive summary (3-5 sentences) that captures the main themes and key takeaways:\n\n${combinedSummaries.substring(0, 3000)}`;

            overallSummary = await generatePDFAwareResponse(
              'Generate an executive summary of this document.',
              overallPrompt
            );

            console.log(`[PDFChatArea]    ✅ Executive summary generated`);
            console.log(`[PDFChatArea]       Length: ${overallSummary?.length || 0}`);
            console.log(`[PDFChatArea]       Preview: ${overallSummary?.substring(0, 150) || 'EMPTY'}...`);
          } catch (overallError) {
            console.error('[PDFChatArea] ❌ Failed to generate overall summary:', overallError);
          }
        } else {
          console.log('[PDFChatArea]    ⚠️ No successful summaries, skipping executive summary');
        }

        // Build final content with executive summary at the top
        let finalContent = `# Document Summary: ${summary.documentName}\n\n`;
        finalContent += `📊 **${summary.pageCount} pages** | **${summary.sectionCount} sections**`;

        // Add warning if some sections failed
        if (failedSections > 0) {
          finalContent += ` | ⚠️ *${failedSections} section(s) showing preview only*`;
        }
        finalContent += `\n\n`;

        // Add executive summary if generated
        if (overallSummary && overallSummary.trim().length > 0) {
          finalContent += `## Executive Summary\n\n${overallSummary.trim()}\n\n---\n\n`;
        }

        finalContent += `---\n\n`;

        // Add section summaries (skip the header we already added)
        const sectionContent = summaryContent.split('---\n\n').slice(1).join('---\n\n');
        finalContent += sectionContent;

        console.log('[PDFChatArea] 📄 Final summary built');
        console.log(`[PDFChatArea]    Final content length: ${finalContent.length}`);
        console.log(`[PDFChatArea]    Has executive summary: ${!!(overallSummary && overallSummary.trim().length > 0)}`);

        // Update assistant message with final summary
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              content: finalContent,
              citations: summary.citations,
              sources: summary.sectionSummaries.flatMap(s => s.sources),
            }
            : msg
        ));

        console.log('[PDFChatArea] 📄 summarizeDocument COMPLETE');
        console.log('[PDFChatArea] ═══════════════════════════════════════════════════════');

        // Save session
        await saveSession();
      } else {
        console.log('[PDFChatArea] ⚠️ No summary received from IPC');
      }
    } catch (error) {
      console.error('[PDFChatArea] ❌ Summarization failed:', error);

      // Update with error message
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
            ...msg,
            content: 'Sorry, I encountered an error while generating the document summary. Please try again.',
          }
          : msg
      ));
    } finally {
      setIsSummarizing(false);
    }
  }, [isSummarizing, isLoading, documentIds, generatePDFAwareResponse, settings.modelProvider, settings.groqApiKey, settings.geminiApiKey, settings.perplexityApiKey, settings.minimaxApiKey, settings.openRouterApiKey]);


  /**
   * Save current session
   */
  const saveSession = async () => {
    if (!sessionId) return;

    try {
      await window.ipcRenderer?.invoke('pdf-chat:save-session', {
        id: sessionId,
        documentIds,
        messages,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('[PDFChatArea] Failed to save session:', error);
    }
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Handle copy message
   */
  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  /**
   * Attach text selection from PDF
   */
  const attachSelection = useCallback((selection: TextSelection) => {
    setAttachedSelection(selection);
  }, []);

  /**
   * Clear attached selection
   */
  const clearSelection = useCallback(() => {
    setAttachedSelection(null);
  }, []);

  // Expose attachSelection for parent components
  useEffect(() => {
    // This could be exposed via context or ref if needed
  }, [attachSelection]);


  // Empty state
  if (documentIds.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--theme-text-muted)'
      }}>
        <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
          No document loaded
        </div>
        <div style={{ fontSize: '0.9rem' }}>
          Upload a PDF to start chatting
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--theme-background)'
    }}>
      {/* Messages container */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px'
        }}
      >
        {/* Embedding fallback warning - Requirement 18.2 */}
        {embeddingFallbackState?.isActive && (
          <EmbeddingFallbackBanner
            fallbackState={embeddingFallbackState}
            onRetry={attemptEmbeddingRecovery}
            onConfigure={() => {
              // Navigate to settings - this could be handled by parent component
              console.log('[PDFChatArea] Configure embedding model requested');
            }}
          />
        )}

        {/* Low confidence warning */}
        {messages.length > 0 && lastConfidence < 0.5 && (
          <LowConfidenceWarning confidence={lastConfidence} threshold={0.5} />
        )}

        {/* Document Loading Indicator */}
        {documentLoadingState && documentLoadingState.isLoading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            margin: '0 16px 12px 16px',
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #a855f7',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--theme-text-primary)',
              }}>
                Loading PDF...
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--theme-text-muted)',
              }}>
                {documentLoadingState.documentName}
              </div>
            </div>
          </div>
        )}

        {/* Indexing Prompt - Inline indexing experience */}
        {indexingPrompt && onConfirmIndexing && onSkipIndexing && (
          <IndexingPromptMessage
            prompt={indexingPrompt}
            onConfirm={(modelId) => onConfirmIndexing(indexingPrompt.documentId, modelId)}
            onSkip={() => onSkipIndexing(indexingPrompt.documentId)}
            indexingState={indexingState}
            indexingLogs={indexingLogs}
            onDeleteIndex={onDeleteIndex}
            onReindex={onReindex}
          />
        )}

        {/* Legacy Indexing Status Indicator (only shown if no prompt) */}
        {!indexingPrompt && indexingState && indexingState.isIndexing && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            margin: '0 16px 12px 16px',
            background: 'rgba(96, 165, 250, 0.1)',
            border: '1px solid rgba(96, 165, 250, 0.3)',
            borderRadius: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #60a5fa',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--theme-text-primary)',
                marginBottom: '2px',
              }}>
                Indexing {indexingState.documentName}...
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--theme-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px' }}>
                  <div style={{
                    width: `${indexingState.progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <span>{indexingState.progress}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Legacy Indexing Complete Notification (only shown if no prompt) */}
        {!indexingPrompt && indexingState && indexingState.isComplete && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            margin: '0 16px 12px 16px',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            position: 'relative',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{
              fontSize: '0.9rem',
              color: 'var(--theme-text-primary)',
              flex: 1,
            }}>
              <span style={{ fontWeight: 500 }}>Indexing complete!</span> {indexingState.documentName} is now ready for search.
            </div>
            {onDismissIndexingNotification && (
              <button
                onClick={onDismissIndexingNotification}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--theme-text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.6,
                  transition: 'opacity 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                title="Dismiss"
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>×</span>
              </button>
            )}
          </div>
        )}

        {/* Legacy Indexing Error (only shown if no prompt) */}
        {!indexingPrompt && indexingState && indexingState.error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            margin: '0 16px 12px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--theme-text-primary)',
                marginBottom: '2px',
              }}>
                Indexing failed
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: 'var(--theme-text-muted)',
              }}>
                {indexingState.error}
              </div>
            </div>
            {onDismissIndexingNotification && (
              <button
                onClick={onDismissIndexingNotification}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--theme-text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.6,
                  transition: 'opacity 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                title="Dismiss"
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>×</span>
              </button>
            )}
          </div>
        )}

        {/* PDF Context Indicator */}
        {loadedDocuments && loadedDocuments.size > 0 && (
          <div style={{
            padding: '8px 16px',
            margin: '0 16px 12px 16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--theme-border)',
            borderRadius: '8px',
            fontSize: '0.75rem',
            color: 'var(--theme-text-muted)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span style={{ fontWeight: 500 }}>Loaded Documents</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Array.from(loadedDocuments.entries()).map(([id, info]) => (
                <div
                  key={id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    background: info.isIndexed
                      ? 'rgba(34, 197, 94, 0.1)'
                      : 'rgba(251, 191, 36, 0.1)',
                    border: info.isIndexed
                      ? '1px solid rgba(34, 197, 94, 0.3)'
                      : '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '6px',
                  }}
                  title={info.isIndexed ? 'Indexed - ready for search' : 'Not indexed - limited search'}
                >
                  <span style={{
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {info.name}
                  </span>
                  {info.isIndexed ? (
                    <span style={{ color: '#22c55e', fontSize: '10px' }}>●</span>
                  ) : (
                    <span style={{ color: '#fbbf24', fontSize: '10px' }}>○</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => {
          // Find the previous user message for assistant responses (for export context)
          const previousMessage = msg.role === 'assistant' && idx > 0
            ? messages[idx - 1]
            : undefined;

          return (
            <PDFMessage
              key={msg.id}
              message={msg}
              previousMessage={previousMessage?.role === 'user' ? previousMessage : undefined}
              onCitationClick={onCitationClick}
              onCopy={handleCopy}
              isStreaming={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
              sessionId={sessionId}
              onFeedback={handleFeedback}
              feedbackState={feedbackState[msg.id]}
            />
          );
        })}

        {/* Loading indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px',
            color: 'var(--theme-text-muted)'
          }}>
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span style={{ fontSize: '0.85rem' }}>Searching documents...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>


      {/* Input area */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--theme-border)' }}>
        {/* Attached selection preview */}
        {attachedSelection && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            marginBottom: '8px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            fontSize: '0.8rem'
          }}>
            <div style={{ color: '#60a5fa', flex: 1, overflow: 'hidden' }}>
              <span style={{ fontWeight: 500 }}>Selected text (p.{attachedSelection.pageNumber}): </span>
              <span style={{
                color: 'var(--theme-text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                "{attachedSelection.text.slice(0, 50)}..."
              </span>
            </div>
            <button
              onClick={clearSelection}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#60a5fa',
                cursor: 'pointer',
                padding: '4px',
                marginLeft: '8px'
              }}
            >
              ×
            </button>
          </div>
        )}

        <StarBorder
          as="div"
          color={isFocused ? "cyan" : "#444"}
          speed="10s"
          style={{
            borderRadius: '12px',
            padding: '0'
          }}
        >
          <div style={{
            background: 'var(--theme-surface)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Ask about the document..."
              disabled={isLoading}
              rows={1}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#fff',
                resize: 'none',
                outline: 'none',
                fontSize: '0.95rem',
                fontFamily: 'inherit',
                lineHeight: '1.6',
                minHeight: '32px',
                maxHeight: '150px'
              }}
            />


            {/* Bottom row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div ref={actionMenuRef} style={{ position: 'relative' }}>
                  <button
                    ref={actionMenuButtonRef}
                    onClick={() => setIsActionMenuOpen(prev => !prev)}
                    title="Chat actions"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      color: 'var(--theme-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                  >
                    <MoreVertical size={14} />
                    <span>Actions</span>
                    <ChevronDown size={12} style={{
                      transform: isActionMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }} />
                  </button>

                  {isActionMenuOpen && createPortal(
                    <div ref={actionMenuRef} style={actionMenuStyles}>
                      {onGroundedModeChange && (
                        <button
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            onGroundedModeChange?.(!groundedMode);
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 14px',
                            background: 'transparent',
                            border: 'none',
                            color: groundedMode ? '#22c55e' : 'var(--theme-text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            textAlign: 'left',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {groundedMode ? <Shield size={16} /> : <ShieldOff size={16} />}
                          <div>
                            <div style={{ fontWeight: 500 }}>Grounded Mode</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                              {groundedMode ? 'On - answers from document' : 'Off - allow general knowledge'}
                            </div>
                          </div>
                        </button>
                      )}

                      <button
                        onClick={summarizeDocument}
                        disabled={isSummarizing || isLoading || documentIds.length === 0}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          color: isSummarizing ? '#a78bfa' : 'var(--theme-text-secondary)',
                          cursor: isSummarizing || isLoading ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                          opacity: isSummarizing || isLoading ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {isSummarizing ? (
                          <div style={{
                            width: '14px',
                            height: '14px',
                            border: '2px solid rgba(167, 139, 250, 0.3)',
                            borderTopColor: '#c084fc',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                        ) : (
                          <BookOpen size={16} />
                        )}
                        <div>
                          <div style={{ fontWeight: 500 }}>{isSummarizing ? 'Summarizing...' : 'Summarize Document'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>Section-by-section overview</div>
                        </div>
                      </button>

                      {messages.length > 0 && !isLoading && (
                        <div style={{
                          borderTop: '1px solid var(--theme-border)'
                        }}>
                          <div style={{
                            padding: '10px 14px 6px',
                            fontSize: '0.75rem',
                            color: 'var(--theme-text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}>
                            Session Export
                          </div>
                          <div style={{ padding: '0 10px 10px' }}>
                            <SessionExportMenu
                              messages={messages}
                              sessionTitle={`PDF Chat - ${new Date().toLocaleDateString()}`}
                            />
                          </div>
                        </div>
                      )}
                    </div>,
                    document.body
                  )}
                </div>
              </div>

              {/* Right side: Model selector + Send button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ModelSelector minimal />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !input.trim()}
                  style={{
                    background: input.trim() && !isLoading
                      ? 'var(--theme-accent)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: input.trim() && !isLoading
                      ? 'none'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    width: '36px',
                    height: '36px',
                    color: input.trim() && !isLoading ? '#000' : '#888',
                    cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    padding: 0,
                    opacity: isLoading ? 0.5 : 1
                  }}
                >
                  {isLoading ? (
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </StarBorder>
      </div>

      {/* Styles */}
      <style>{`
        .typing-indicator {
          display: flex;
          gap: 4px;
        }
        .typing-indicator span {
          width: 6px;
          height: 6px;
          background: #555;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default PDFChatArea;
