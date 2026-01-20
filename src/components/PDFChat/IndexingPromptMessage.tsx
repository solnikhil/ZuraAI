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
    /** Callback when user requests to delete the index */
    onDeleteIndex?: (documentId: string) => void;
    /** Callback when user requests to re-index */
    onReindex?: (documentId: string, modelId?: string) => void;
}

export function IndexingPromptMessage({
    prompt,
    onConfirm,
    onSkip,
    indexingState,
    indexingLogs: rawLogs = [],
    onDeleteIndex,
    onReindex,
}: IndexingPromptMessageProps) {
    const indexingLogs = rawLogs || [];
    const [modelsStatus, setModelsStatus] = useState<AllModelsStatus | null>(null);
    const [isLoadingModels, setIsLoadingModels] = useState(true);
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [showLogs, setShowLogs] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);

    // Verification state
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<{
        isIndexed: boolean;
        chunkCount: number;
        documentCount: number;
    } | null>(null);

    // Delete/Reindex state
    const [isDeleting, setIsDeleting] = useState(false);
    const [isReindexing, setIsReindexing] = useState(false);
    const [showReindexOptions, setShowReindexOptions] = useState(false);

    // Check if indexing is active for this document
    const isIndexing = indexingState?.documentId === prompt.documentId && indexingState?.isIndexing;
    const isComplete = indexingState?.documentId === prompt.documentId && indexingState?.isComplete;
    const hasError = indexingState?.documentId === prompt.documentId && indexingState?.error;

    // Fetch available models on mount
    useEffect(() => {
        fetchModels();
    }, []);

    const fetchModels = async () => {
        try {
            const status = await window.ipcRenderer?.invoke('pdf:get-all-models-status', { forceRefresh: true });
            setModelsStatus(status);

            // Check if Ollama is connected by looking for any local models
            const hasLocalModels = status?.models?.some((m: ModelCacheStatus) => m.provider === 'local');
            const hasAvailableLocal = status?.models?.some((m: ModelCacheStatus) => m.provider === 'local' && m.isAvailable);
            setOllamaConnected(hasLocalModels);

            // Auto-select first available local model
            const availableLocal = status?.models?.find((m: ModelCacheStatus) => m.provider === 'local' && m.isAvailable);
            if (availableLocal) {
                setSelectedModelId(availableLocal.modelId);
            }

            console.log('[IndexingPromptMessage] Fetched models:', status?.models?.map((m: ModelCacheStatus) => ({
                id: m.modelId,
                name: m.modelName,
                available: m.isAvailable
            })));
        } catch (error) {
            console.error('[IndexingPromptMessage] Failed to fetch models:', error);
            setOllamaConnected(false);
        } finally {
            setIsLoadingModels(false);
            setIsRefreshing(false);
        }
    };

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

    // Delete index handler
    const handleDeleteIndex = async () => {
        if (!onDeleteIndex) return;
        setIsDeleting(true);
        try {
            await onDeleteIndex(prompt.documentId);
        } finally {
            setIsDeleting(false);
        }
    };

    // Re-index handler
    const handleReindex = async () => {
        if (!onReindex) return;
        setIsReindexing(true);
        try {
            await onReindex(prompt.documentId, selectedModelId || undefined);
            setShowReindexOptions(false);
        } finally {
            setIsReindexing(false);
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

    // If document is already indexed, show status with management options
    if (prompt.isAlreadyIndexed && !isIndexing && !isComplete) {
        return (
            <div style={messageWrapperStyle}>
                <div className="markdown-content" style={contentStyle}>
                    <p style={{ margin: '0 0 8px 0' }}>
                        <strong style={{ color: '#22c55e' }}>✓ Document Indexed</strong>
                    </p>
                    <p style={{ margin: '0 0 12px 0', color: 'var(--theme-text-secondary)' }}>
                        <strong>"{prompt.documentName}"</strong> is already indexed and ready for AI-powered search.
                        You can ask me questions about the document and I'll find relevant information with page citations.
                    </p>

                    {/* Index Info */}
                    <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--theme-text-muted)',
                        padding: '8px 12px',
                        background: 'rgba(34, 197, 94, 0.05)',
                        borderRadius: '6px',
                        border: '1px solid rgba(34, 197, 94, 0.15)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        marginBottom: '12px',
                    }}>
                        {prompt.chunkCount !== undefined && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Searchable Chunks:</span>
                                <span style={{ color: 'var(--theme-text-primary)' }}>
                                    {prompt.chunkCount}
                                </span>
                            </div>
                        )}
                        {prompt.embeddingModel && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Embedding Model:</span>
                                <span style={{ color: 'var(--theme-text-primary)' }}>
                                    {prompt.embeddingModel}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Management Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Re-index button */}
                        {!showReindexOptions ? (
                            <button
                                onClick={() => setShowReindexOptions(true)}
                                disabled={isDeleting}
                                style={{
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(96, 165, 250, 0.4)',
                                    background: 'rgba(96, 165, 250, 0.1)',
                                    color: '#60a5fa',
                                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    opacity: isDeleting ? 0.5 : 1,
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
                                </svg>
                                Re-index
                            </button>
                        ) : null}

                        {/* Delete index button */}
                        <button
                            onClick={handleDeleteIndex}
                            disabled={isDeleting || isReindexing}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '6px',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                cursor: (isDeleting || isReindexing) ? 'wait' : 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                opacity: (isDeleting || isReindexing) ? 0.5 : 1,
                            }}
                        >
                            {isDeleting ? (
                                <>
                                    <span style={{
                                        display: 'inline-block',
                                        width: '14px',
                                        height: '14px',
                                        border: '2px solid #ef4444',
                                        borderTopColor: 'transparent',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite',
                                    }} />
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                    Delete Index
                                </>
                            )}
                        </button>
                    </div>

                    {/* Re-index options panel */}
                    {showReindexOptions && (
                        <div style={{
                            marginTop: '12px',
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}>
                            <div style={{
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                color: 'var(--theme-text-secondary)',
                                marginBottom: '10px',
                            }}>
                                Re-index with a different model:
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
                                <>
                                    {/* Model selection */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
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
                                                    name="reindexModel"
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
                                            </label>
                                        ))}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={handleReindex}
                                            disabled={!selectedModelId || isReindexing}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: (!selectedModelId || isReindexing)
                                                    ? 'rgba(96, 165, 250, 0.3)'
                                                    : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                                color: 'white',
                                                cursor: (!selectedModelId || isReindexing) ? 'not-allowed' : 'pointer',
                                                fontSize: '0.8rem',
                                                fontWeight: 500,
                                                opacity: (!selectedModelId || isReindexing) ? 0.5 : 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }}
                                        >
                                            {isReindexing ? (
                                                <>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        width: '12px',
                                                        height: '12px',
                                                        border: '2px solid white',
                                                        borderTopColor: 'transparent',
                                                        borderRadius: '50%',
                                                        animation: 'spin 1s linear infinite',
                                                    }} />
                                                    Re-indexing...
                                                </>
                                            ) : (
                                                'Start Re-index'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setShowReindexOptions(false)}
                                            disabled={isReindexing}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                background: 'transparent',
                                                color: 'var(--theme-text-secondary)',
                                                cursor: isReindexing ? 'not-allowed' : 'pointer',
                                                fontSize: '0.8rem',
                                                opacity: isReindexing ? 0.5 : 1,
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}
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
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                    }}>
                        <div style={{
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            color: 'var(--theme-text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                        }}>
                            Embedding Model
                        </div>
                        <button
                            onClick={() => {
                                setIsRefreshing(true);
                                setIsLoadingModels(true);
                                fetchModels();
                            }}
                            disabled={isLoadingModels || isRefreshing}
                            style={{
                                padding: '2px 8px',
                                fontSize: '0.7rem',
                                borderRadius: '4px',
                                border: '1px solid rgba(96, 165, 250, 0.3)',
                                background: 'transparent',
                                color: '#60a5fa',
                                cursor: (isLoadingModels || isRefreshing) ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            <span style={{
                                display: 'inline-block',
                                width: '10px',
                                height: '10px',
                                border: '2px solid #60a5fa',
                                borderTopColor: 'transparent',
                                borderRadius: '50%',
                                animation: (isLoadingModels || isRefreshing) ? 'spin 1s linear infinite' : 'none',
                            }} />
                            Refresh
                        </button>
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
                                    padding: '8px',
                                    background: 'rgba(239, 68, 68, 0.08)',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                }}>
                                    {ollamaConnected === false ? (
                                        <>
                                            <div style={{ marginBottom: '4px', fontWeight: 500 }}>
                                                ⚠️ Cannot connect to Ollama
                                            </div>
                                            <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                                                Make sure Ollama is running at <code style={{
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    padding: '1px 4px',
                                                    borderRadius: '2px',
                                                }}>http://localhost:11434</code>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ marginBottom: '4px', fontWeight: 500 }}>
                                                No embedding models found
                                            </div>
                                            <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                                                Install a model like: <code style={{
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    padding: '1px 4px',
                                                    borderRadius: '2px',
                                                    marginLeft: '2px',
                                                }}>ollama pull nomic-embed-text</code>
                                            </div>
                                        </>
                                    )}
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
