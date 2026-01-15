/**
 * PDFChatArea - Chat interface for PDF document conversations
 * 
 * Provides RAG-powered chat with inline citations, streaming responses,
 * and grounded mode for anti-hallucination.
 * 
 * Requirements: 2.1, 8.2, 8.7, 8.8, 10.1, 10.2, 10.3, 10.4, 10.6
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, AlertTriangle, Shield, ShieldOff, Copy, Check, Info } from '../icons';
import LazyMarkdown from '../LazyMarkdown';
import StarBorder from '../StarBorder';
import type { 
  Citation, 
  PDFChatMessage, 
  TextSelection,
  RetrievalResult,
  CITATION_PATTERN 
} from '../../types/pdf';
import type { PDFChatAreaProps } from './types';
import { CitationLink } from './CitationLink';
import { SourcesPanel } from './SourcesPanel';

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

interface PDFMessageProps {
  message: PDFChatMessage;
  onCitationClick: (citation: Citation) => void;
  onCopy?: (content: string) => void;
  isStreaming?: boolean;
}

/**
 * Single PDF chat message component
 */
function PDFMessage({ message, onCitationClick, onCopy, isStreaming }: PDFMessageProps) {
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
    <div style={{ marginBottom: '16px' }}>
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
        />
      </div>

      {/* Action bar */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginTop: '8px' 
      }}>
        {/* Copy button */}
        {!isStreaming && (
          <button
            onClick={handleCopy}
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
}

/**
 * Render message content with clickable inline citations
 * Requirements: 8.2, 8.7, 8.8
 */
function MessageWithCitations({ 
  content, 
  citations, 
  onCitationClick,
  isStreaming 
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
 * Requirements: 2.1
 */
export function PDFChatArea({
  sessionId,
  documentIds,
  onCitationClick,
  groundedMode = false,
  onGroundedModeChange
}: PDFChatAreaProps) {
  // State
  const [messages, setMessages] = useState<PDFChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [lastConfidence, setLastConfidence] = useState<number>(1);
  const [attachedSelection, setAttachedSelection] = useState<TextSelection | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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

  const loadSessionMessages = async (sid: string) => {
    try {
      // Load messages from IPC
      const session = await window.ipcRenderer?.invoke('pdf-chat:get-session', sid);
      if (session?.messages) {
        setMessages(session.messages);
      }
    } catch (error) {
      console.error('[PDFChatArea] Failed to load session:', error);
    }
  };


  /**
   * Send a message and get RAG response
   */
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || documentIds.length === 0) return;

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

    try {
      // Query RAG engine via IPC
      const response = await window.ipcRenderer?.invoke('pdf:query', 
        userMessage.content, 
        documentIds, 
        { 
          groundedMode,
          attachedSelection: attachedSelection || undefined
        }
      );

      if (response) {
        // Update confidence
        setLastConfidence(response.confidence);

        // Update assistant message with response
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? {
                ...msg,
                content: response.answer,
                citations: response.citations,
                sources: response.sources
              }
            : msg
        ));

        // Save session
        await saveSession();
      }
    } catch (error) {
      console.error('[PDFChatArea] Query failed:', error);
      
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
  }, [input, isLoading, documentIds, groundedMode, attachedSelection]);


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
        {/* Low confidence warning */}
        {messages.length > 0 && lastConfidence < 0.5 && (
          <LowConfidenceWarning confidence={lastConfidence} threshold={0.5} />
        )}

        {/* Messages */}
        {messages.map((msg, idx) => (
          <PDFMessage
            key={msg.id}
            message={msg}
            onCitationClick={onCitationClick}
            onCopy={handleCopy}
            isStreaming={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
          />
        ))}

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
              justifyContent: 'space-between' 
            }}>
              {/* Grounded mode toggle */}
              {onGroundedModeChange && (
                <GroundedModeToggle
                  enabled={groundedMode}
                  onChange={onGroundedModeChange}
                />
              )}
              
              {!onGroundedModeChange && <div />}

              {/* Send button */}
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
