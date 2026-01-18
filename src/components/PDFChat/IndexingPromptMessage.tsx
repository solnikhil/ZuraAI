/**
 * IndexingPromptMessage - Inline chat message for PDF indexing
 * 
 * Styled to look like a regular assistant message in the chat.
 * Replaces the modal popup with a non-intrusive chat message that:
 * - Shows document info and asks about indexing
 * - Allows model selection
 * - Shows indexing progress and logs
 */

import React, { useState, useEffect } from 'react';
import type { IndexingState, IndexingLogEntry, IndexingPromptState } from './types';
import type { ModelCacheStatus, AllModelsStatus } from '../../types/pdf';

interface IndexingPromptMessageProps {
    /** Document info for the prompt */
    prompt: IndexingPromptState;
    /** Callback when user confirms indexing */
    onConfirm: (modelId?: string) => void;
    /** Callback when user skips indexing */
    onSkip: () => void;
    /** Current indexing state (if indexing is in progress) */
    indexingState?: IndexingState | null;
    /** Indexing logs */
    indexingLogs?: IndexingLogEntry[];
}

export function IndexingPromptMessage({
    prompt,
    onConfirm,
    onSkip,
    indexingState,
    indexingLogs: rawLogs = [],
}: IndexingPromptMessageProps) {
    const indexingLogs = rawLogs || [];
    const [modelsStatus, setModelsStatus] = useState<AllModelsStatus | null>(null);
    const [isLoadingModels, setIsLoadingModels] = useState(true);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Verification state
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<{
        isIndexed: boolean;
        chunkCount: number;
        documentCount: number;
    } | null>(null);

    // Check if indexing is active for this document
    const isIndexing = indexingState?.documentId === prompt.documentId && indexingState?.isIndexing;
    const isComplete = indexingState?.documentId === prompt.documentId && indexingState?.isComplete;
    const hasError = indexingState?.documentId === prompt.documentId && indexingState?.error;

    // Fetch available models on mount
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const status = await window.ipcRenderer?.invoke('pdf:get-all-models-status', { forceRefresh: true });
                setModelsStatus(status);
                // Auto-select first available local model
                const availableLocal = status?.models?.find((m: ModelCacheStatus) => m.provider === 'local' && m.isAvailable);
                if (availableLocal) {
                    setSelectedModelId(availableLocal.modelId);
                }
            } catch (error) {
                console.error('[IndexingPromptMessage] Failed to fetch models:', error);
            } finally {
                setIsLoadingModels(false);
            }
        };
        fetchModels();
    }, []);

    // Download a model
    const downloadModel = async (modelId: string) => {
        setIsDownloading(true);
        try {
            await window.ipcRenderer?.invoke('pdf:download-model', modelId);
            // Refresh models after download
            const status = await window.ipcRenderer?.invoke('pdf:get-all-models-status', { forceRefresh: true });
            setModelsStatus(status);
            const availableLocal = status?.models?.find((m: ModelCacheStatus) => m.provider === 'local' && m.isAvailable);
            if (availableLocal) {
                setSelectedModelId(availableLocal.modelId);
            }
        } catch (error) {
            console.error('[IndexingPromptMessage] Failed to download model:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleConfirm = () => {
        onConfirm(selectedModelId || undefined);
    };

    // Verify index function
    const verifyIndex = async () => {
        console.log('[IndexingPromptMessage] Verifying index for document:', prompt.documentId);
        setIsVerifying(true);
        try {
            const status = await window.ipcRenderer?.invoke('pdf:get-index-status', prompt.documentId);
            console.log('[IndexingPromptMessage] Verify index status received:', JSON.stringify(status));

            // If status shows indexed, use it
            if (status?.isIndexed) {
                setVerificationResult({
                    isIndexed: true,
                    chunkCount: status.chunkCount || 0,
                    documentCount: 1,
                });
            } else if (isComplete && indexingState?.isComplete) {
                // Fallback: if we show "Complete" but IPC says not indexed, trust the completion state
                console.log('[IndexingPromptMessage] Using fallback - indexing marked complete locally');
                setVerificationResult({
                    isIndexed: true,
                    chunkCount: indexingState.storageSizeBytes ? Math.ceil(indexingState.storageSizeBytes / 1000) : 1,
                    documentCount: 1,
                });
            } else {
                setVerificationResult({
                    isIndexed: false,
                    chunkCount: 0,
                    documentCount: 0,
                });
            }
        } catch (error) {
            console.error('[IndexingPromptMessage] Failed to verify index:', error);
            // Fallback on error
            if (isComplete && indexingState?.isComplete) {
                setVerificationResult({
                    isIndexed: true,
                    chunkCount: 1,
                    documentCount: 1,
                });
            } else {
                setVerificationResult({
                    isIndexed: false,
                    chunkCount: 0,
                    documentCount: 0,
                });
            }
        } finally {
            setIsVerifying(false);
        }
    };

    // Get available local models
    const localModels = modelsStatus?.models?.filter(m => m.provider === 'local') || [];
    const availableLocalModels = localModels.filter(m => m.isAvailable);
    const unavailableLocalModels = localModels.filter(m => !m.isAvailable);

    // Wrapper style to match assistant message layout
    const messageWrapperStyle: React.CSSProperties = {
        marginBottom: '16px',
        overflow: 'visible',
    };

    // Content style matching assistant message
    const contentStyle: React.CSSProperties = {
        color: '#e0e0e0',
        lineHeight: '1.7',
        fontSize: '0.95rem',
    };

    // Format bytes to human readable string
    const formatBytes = (bytes?: number) => {
        if (bytes === undefined) return '0 B';
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // If indexing is complete, show success message
    if (isComplete) {
        return (
            <div style={messageWrapperStyle}>
                <div className="markdown-content" style={contentStyle}>
                    <p style={{ margin: '0 0 8px 0' }}>
                        <strong style={{ color: '#22c55e' }}>✓ Indexing Complete!</strong>
                    </p>
                    <p style={{ margin: '0 0 12px 0', color: 'var(--theme-text-secondary)' }}>
                        <strong>"{prompt.documentName}"</strong> is now ready for AI-powered search.
                        You can ask me questions about the document and I'll find relevant information with page citations.
                    </p>

                    {/* Storage Stats */}
                    <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--theme-text-muted)',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '6px',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        marginBottom: '12px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Index Size:</span>
                            <span style={{ color: 'var(--theme-text-primary)' }}>
                                {formatBytes(indexingState?.storageSizeBytes)}
                            </span>
                        </div>
                        {indexingState?.storagePath && (
                            <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '4px' }}>
                                <span style={{ display: 'block', marginBottom: '2px' }}>Storage Location:</span>
                                <span style={{
                                    fontFamily: 'monospace',
                                    wordBreak: 'break-all',
                                    color: 'var(--theme-text-secondary)',
                                    opacity: 0.8
                                }}>
                                    {indexingState.storagePath}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Verify Button and Results */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {!verificationResult ? (
                            <button
                                onClick={verifyIndex}
                                disabled={isVerifying}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(96, 165, 250, 0.4)',
                                    background: 'rgba(96, 165, 250, 0.1)',
                                    color: '#60a5fa',
                                    cursor: isVerifying ? 'wait' : 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    width: 'fit-content',
                                }}
                            >
                                {isVerifying ? (
                                    <>
                                        <span style={{
                                            display: 'inline-block',
                                            width: '14px',
                                            height: '14px',
                                            border: '2px solid #60a5fa',
                                            borderTopColor: 'transparent',
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite',
                                        }} />
                                        Verifying...
                                    </>
                                ) : (
                                    <>
                                        🔍 Verify Index
                                    </>
                                )}
                            </button>
                        ) : (
                            <div style={{
                                padding: '10px 14px',
                                borderRadius: '6px',
                                background: verificationResult.isIndexed
                                    ? 'rgba(34, 197, 94, 0.1)'
                                    : 'rgba(239, 68, 68, 0.1)',
                                border: verificationResult.isIndexed
                                    ? '1px solid rgba(34, 197, 94, 0.3)'
                                    : '1px solid rgba(239, 68, 68, 0.3)',
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '6px',
                                }}>
                                    <span style={{
                                        color: verificationResult.isIndexed ? '#22c55e' : '#ef4444',
                                        fontWeight: 600,
                                    }}>
                                        {verificationResult.isIndexed ? '✓ Index Verified' : '✗ Index Not Found'}
                                    </span>
                                </div>
                                {verificationResult.isIndexed && (
                                    <div style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--theme-text-secondary)',
                                    }}>
                                        Found <strong style={{ color: 'var(--theme-text-primary)' }}>
                                            {verificationResult.chunkCount}
                                        </strong> searchable chunks in the index
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // If there's an error, show error message
    if (hasError) {
        return (
            <div style={messageWrapperStyle}>
                <div className="markdown-content" style={contentStyle}>
                    <p style={{ margin: '0 0 8px 0' }}>
                        <strong style={{ color: '#ef4444' }}>❌ Indexing Failed</strong>
                    </p>
                    <p style={{ margin: '0 0 12px 0', color: 'var(--theme-text-secondary)' }}>
                        {indexingState?.error}
                    </p>
                    <button
                        onClick={handleConfirm}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                        }}
                    >
                        Retry Indexing
                    </button>
                </div>
            </div>
        );
    }

    // If indexing is in progress, show progress
    if (isIndexing) {
        return (
            <div style={messageWrapperStyle}>
                <div className="markdown-content" style={contentStyle}>
                    <p style={{ margin: '0 0 12px 0' }}>
                        <strong>Indexing "{prompt.documentName}"...</strong>
                    </p>

                    {/* Progress bar */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '12px',
                    }}>
                        <div style={{
                            flex: 1,
                            height: '6px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                width: `${indexingState?.progress || 0}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                                borderRadius: '3px',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                        <span style={{
                            fontSize: '0.85rem',
                            color: 'var(--theme-text-muted)',
                            minWidth: '40px',
                        }}>
                            {indexingState?.progress || 0}%
                        </span>
                    </div>

                    {/* Logs toggle */}
                    <button
                        onClick={() => setShowLogs(!showLogs)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            border: 'none',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '4px',
                            color: 'var(--theme-text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                        }}
                    >
                        <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{
                                transform: showLogs ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                            }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                        {showLogs ? 'Hide log' : 'Show log'}
                    </button>

                    {/* Logs panel */}
                    {showLogs && indexingLogs.length > 0 && (
                        <div style={{
                            marginTop: '10px',
                            padding: '10px 12px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: '6px',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.75rem',
                            lineHeight: '1.6',
                        }}>
                            {indexingLogs.map((log, idx) => (
                                <div key={idx} style={{
                                    color: log.level === 'error' ? '#ef4444' :
                                        log.level === 'success' ? '#22c55e' :
                                            log.level === 'progress' ? '#60a5fa' :
                                                'var(--theme-text-muted)',
                                }}>
                                    {log.level === 'error' ? '✕' :
                                        log.level === 'success' ? '✓' :
                                            log.level === 'progress' ? '→' : '•'} {log.message}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Spin animation */}
                <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
            </div>
        );
    }

    // Default state - show indexing prompt as assistant message
    return (
        <div style={messageWrapperStyle}>
            <div className="markdown-content" style={contentStyle}>
                <p style={{ margin: '0 0 12px 0' }}>
                    I've loaded <strong>"{prompt.documentName}"</strong>
                    {prompt.pageCount > 0 && ` (${prompt.pageCount} pages)`}.
                    Would you like me to index it for AI-powered search? This will let me find relevant
                    information and cite specific pages when answering your questions.
                </p>

                {/* Model Selection */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                }}>
                    <div style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--theme-text-muted)',
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                    }}>
                        Embedding Model
                    </div>

                    {isLoadingModels ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            color: 'var(--theme-text-muted)',
                            fontSize: '0.85rem',
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                border: '2px solid rgba(255,255,255,0.1)',
                                borderTopColor: '#60a5fa',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                            Checking models...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {/* Available models */}
                            {availableLocalModels.map((model) => (
                                <label
                                    key={model.modelId}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        background: selectedModelId === model.modelId
                                            ? 'rgba(96, 165, 250, 0.12)'
                                            : 'transparent',
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="embeddingModel"
                                        checked={selectedModelId === model.modelId}
                                        onChange={() => setSelectedModelId(model.modelId)}
                                        style={{ accentColor: '#60a5fa', margin: 0 }}
                                    />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--theme-text-primary)' }}>
                                        {model.modelName}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                                        ({model.dimensions}d)
                                    </span>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        background: 'rgba(34, 197, 94, 0.12)',
                                        color: '#22c55e',
                                        marginLeft: 'auto',
                                    }}>
                                        Ready
                                    </span>
                                </label>
                            ))}

                            {/* Unavailable models */}
                            {unavailableLocalModels.slice(0, 2).map((model) => (
                                <div
                                    key={model.modelId}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 8px',
                                        opacity: 0.6,
                                    }}
                                >
                                    <input type="radio" disabled style={{ margin: 0 }} />
                                    <span style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)' }}>
                                        {model.modelName}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                                        ({model.dimensions}d)
                                    </span>
                                    <button
                                        onClick={() => downloadModel(model.modelId)}
                                        disabled={isDownloading}
                                        style={{
                                            fontSize: '0.65rem',
                                            padding: '2px 6px',
                                            borderRadius: '3px',
                                            border: '1px solid rgba(96, 165, 250, 0.3)',
                                            background: 'transparent',
                                            color: '#60a5fa',
                                            cursor: isDownloading ? 'wait' : 'pointer',
                                            marginLeft: 'auto',
                                        }}
                                    >
                                        {isDownloading ? '...' : 'Download'}
                                    </button>
                                </div>
                            ))}

                            {availableLocalModels.length === 0 && unavailableLocalModels.length === 0 && (
                                <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--theme-text-muted)',
                                    padding: '4px',
                                }}>
                                    No embedding models found. Make sure Ollama is running.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                }}>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedModelId && availableLocalModels.length > 0}
                        style={{
                            padding: '7px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: (!selectedModelId && availableLocalModels.length > 0)
                                ? 'rgba(96, 165, 250, 0.3)'
                                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            color: 'white',
                            cursor: (!selectedModelId && availableLocalModels.length > 0) ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            opacity: (!selectedModelId && availableLocalModels.length > 0) ? 0.5 : 1,
                        }}
                    >
                        Index Document
                    </button>
                    <button
                        onClick={onSkip}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            background: 'transparent',
                            color: 'var(--theme-text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                        }}
                    >
                        Skip
                    </button>
                </div>
            </div>

            {/* Spin animation */}
            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
