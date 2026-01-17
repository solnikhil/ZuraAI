/**
 * IndexingProgress Component
 * 
 * Displays progress indication during PDF document indexing.
 * Shows a progress bar with percentage and status messages.
 * 
 * Requirements: 18.6, 19.3
 * - 18.6: Display progress indication when processing large PDFs
 * - 19.3: Process indexing in background without blocking UI
 */

import React from 'react';

export interface IndexingProgressProps {
  /** Document ID being indexed */
  documentId: string;
  /** Document name for display */
  documentName: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Whether indexing is in progress */
  isIndexing: boolean;
  /** Error message if indexing failed */
  error?: string | null;
  /** Whether indexing completed successfully */
  isComplete?: boolean;
  /** Callback when user dismisses the progress indicator */
  onDismiss?: () => void;
}

/**
 * Get status message based on progress percentage
 */
function getStatusMessage(progress: number): string {
  if (progress < 10) return 'Preparing document...';
  if (progress < 30) return 'Extracting text...';
  if (progress < 50) return 'Creating chunks...';
  if (progress < 70) return 'Generating embeddings...';
  if (progress < 85) return 'Storing vectors...';
  if (progress < 100) return 'Finalizing index...';
  return 'Indexing complete!';
}

/**
 * IndexingProgress Component
 * 
 * Displays a progress bar and status message during document indexing.
 * Automatically shows different status messages based on progress percentage.
 */
export function IndexingProgress({
  documentId,
  documentName,
  progress,
  isIndexing,
  error,
  isComplete,
  onDismiss,
}: IndexingProgressProps) {
  // Don't render if not indexing and no error/completion to show
  if (!isIndexing && !error && !isComplete) {
    return null;
  }

  const statusMessage = error 
    ? 'Indexing failed' 
    : isComplete 
      ? 'Indexing complete!' 
      : getStatusMessage(progress);

  const progressColor = error 
    ? 'var(--theme-error, #ef4444)' 
    : isComplete 
      ? 'var(--theme-success, #22c55e)' 
      : 'var(--theme-primary, #3b82f6)';

  return (
    <div 
      className="indexing-progress"
      style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        right: '16px',
        backgroundColor: 'var(--theme-surface, rgba(30, 30, 30, 0.95))',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))',
        zIndex: 100,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header with document name and dismiss button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {/* Icon */}
          {isIndexing && !error && (
            <div 
              className="indexing-spinner"
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(59, 130, 246, 0.3)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          )}
          {error && (
            <span style={{ color: '#ef4444', fontSize: '16px' }}>⚠️</span>
          )}
          {isComplete && !error && (
            <span style={{ color: '#22c55e', fontSize: '16px' }}>✓</span>
          )}
          
          {/* Title */}
          <span style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--theme-text-primary, #fff)',
          }}>
            {error ? 'Indexing Failed' : isComplete ? 'Indexing Complete' : 'Indexing Document'}
          </span>
        </div>

        {/* Dismiss button (only show when complete or error) */}
        {(isComplete || error) && onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--theme-text-muted, #888)',
              cursor: 'pointer',
              padding: '4px',
              fontSize: '16px',
              lineHeight: 1,
            }}
            title="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Document name */}
      <div style={{
        fontSize: '0.75rem',
        color: 'var(--theme-text-muted, #888)',
        marginBottom: '8px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {documentName}
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '8px',
      }}>
        <div
          style={{
            width: `${error ? 100 : progress}%`,
            height: '100%',
            backgroundColor: progressColor,
            borderRadius: '2px',
            transition: 'width 0.3s ease-out',
          }}
        />
      </div>

      {/* Status message and percentage */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{
          fontSize: '0.75rem',
          color: error ? '#ef4444' : 'var(--theme-text-muted, #888)',
        }}>
          {error || statusMessage}
        </span>
        {!error && (
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--theme-text-muted, #888)',
            fontWeight: 500,
          }}>
            {Math.round(progress)}%
          </span>
        )}
      </div>

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default IndexingProgress;
