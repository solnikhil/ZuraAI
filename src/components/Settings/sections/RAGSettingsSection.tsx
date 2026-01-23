/**
 * RAGSettingsSection component for Settings
 * Manages PDF RAG (Retrieval-Augmented Generation) configuration
 * 
 * @module RAGSettingsSection
 * Requirements: 16.1, 16.2, 16.3, 16.7, 21.6
 */

import React, { useState, useEffect, useCallback } from 'react'
import { FileText, Cpu, Search, AlertCircle, RefreshCw, Info, Settings2, Trash2, ChevronDown, ChevronRight, AlertTriangle, Download, CheckCircle, XCircle, Loader } from 'lucide-react'
import { 
  PDFRAGSettings, 
  DEFAULT_PDF_RAG_SETTINGS,
  PDF_IPC_CHANNELS,
  DocumentRetrievalSettings,
  DEFAULT_DOCUMENT_RETRIEVAL_SETTINGS,
  RecentDocument,
  IndexedDocumentInfo,
  ModelCacheStatus,
  OllamaModelInfo,
} from '../../../types/pdf'

/**
 * Props for RAGSettingsSection component
 */
export interface RAGSettingsSectionProps {
  /** Callback when settings change (for unsaved changes tracking) */
  onUnsavedChange?: (hasChanges: boolean) => void
}

/**
 * Embedding model options
 */
const EMBEDDING_MODEL_OPTIONS = [
  { 
    value: 'local', 
    label: 'Local (Ollama)', 
    description: 'Uses nomic-embed-text via Ollama. Privacy-focused, no API calls.',
    dimensions: 768
  },
  { 
    value: 'openai', 
    label: 'OpenAI', 
    description: 'Uses text-embedding-3-small. Requires OpenRouter API key.',
    dimensions: 1536
  },
  { 
    value: 'voyage', 
    label: 'Voyage AI', 
    description: 'Uses voyage-3. High quality embeddings for documents.',
    dimensions: 1024
  },
] as const

/**
 * Chunking strategy options
 */
const CHUNKING_STRATEGY_OPTIONS = [
  { 
    value: 'fixed', 
    label: 'Fixed Size', 
    description: 'Split text into fixed-size chunks'
  },
  { 
    value: 'semantic', 
    label: 'Semantic', 
    description: 'Split at natural boundaries (paragraphs, sections)'
  },
  { 
    value: 'paragraph', 
    label: 'Paragraph', 
    description: 'Split at paragraph boundaries only'
  },
] as const

/**
 * Number input with label and description
 */
interface NumberInputProps {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  unit?: string
}

function NumberInput({ 
  label, 
  description, 
  value, 
  min, 
  max, 
  step = 1, 
  onChange,
  unit 
}: NumberInputProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {description && (
        <div className="section-desc" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
          {description}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          className="setting-input-scira"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => {
            const val = parseInt(e.target.value, 10)
            if (!isNaN(val) && val >= min && val <= max) {
              onChange(val)
            }
          }}
          style={{ width: 120 }}
        />
        {unit && (
          <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Slider input with label and value display
 */
interface SliderInputProps {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  formatValue?: (value: number) => string
}

function SliderInput({ 
  label, 
  description, 
  value, 
  min, 
  max, 
  step = 0.1, 
  onChange,
  formatValue = (v) => v.toFixed(1)
}: SliderInputProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label className="label-small">{label}</label>
        <span style={{ 
          color: 'var(--theme-text-secondary)', 
          fontSize: '0.85rem',
          fontWeight: 500 
        }}>
          {formatValue(value)}
        </span>
      </div>
      {description && (
        <div className="section-desc" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
          {description}
        </div>
      )}
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: 6,
          borderRadius: 3,
          background: 'var(--theme-surface)',
          cursor: 'pointer',
          accentColor: 'var(--theme-accent)'
        }}
      />
    </div>
  )
}

/**
 * Select dropdown with label
 */
interface SelectInputProps {
  label: string
  description?: string
  value: string
  options: readonly { value: string; label: string; description?: string }[]
  onChange: (value: string) => void
}

function SelectInput({ 
  label, 
  description, 
  value, 
  options, 
  onChange 
}: SelectInputProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {description && (
        <div className="section-desc" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
          {description}
        </div>
      )}
      <select
        className="setting-input-scira"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', cursor: 'pointer' }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {/* Show selected option description */}
      {options.find(o => o.value === value)?.description && (
        <div style={{ 
          marginTop: 8, 
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 6,
          fontSize: '0.8rem',
          color: 'var(--theme-text-muted)'
        }}>
          <Info size={12} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {options.find(o => o.value === value)?.description}
        </div>
      )}
    </div>
  )
}

/**
 * Text input with label and description
 */
interface TextInputProps {
  label: string
  description?: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

function TextInput({
  label,
  description,
  value,
  placeholder,
  onChange
}: TextInputProps): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label-small" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {description && (
        <div className="section-desc" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
          {description}
        </div>
      )}
      <input
        type="text"
        className="setting-input-scira"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%' }}
      />
    </div>
  )
}

/**
 * Toggle switch with label
 */
interface ToggleInputProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleInput({ 
  label, 
  description, 
  checked, 
  onChange 
}: ToggleInputProps): React.ReactElement {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'flex-start', 
      justifyContent: 'space-between',
      marginBottom: 16 
    }}>
      <div style={{ flex: 1, marginRight: 16 }}>
        <label className="label-small" style={{ display: 'block', marginBottom: 4 }}>
          {label}
        </label>
        {description && (
          <div className="section-desc" style={{ fontSize: '0.8rem' }}>
            {description}
          </div>
        )}
      </div>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <span className="toggle-slider"></span>
      </label>
    </div>
  )
}

// =============================================================================
// =============================================================================
// Model Cache Status Component (Requirement 21.7)
// =============================================================================

interface ModelCacheStatusDisplayProps {
  /** The model ID to show status for */
  modelId: string
  /** Callback when refresh is requested */
  onRefresh?: () => void
}

/**
 * Model Cache Status Display Component
 * 
 * Shows the cache status of the selected embedding model including:
 * - Availability status
 * - Cache state (for local models)
 * - Download progress (if downloading)
 * - API key status (for API-based models)
 * 
 * Implements Requirement 21.7: Cache downloaded models locally, support offline use
 */
function ModelCacheStatusDisplay({
  modelId,
  onRefresh,
}: ModelCacheStatusDisplayProps): React.ReactElement {
  const [status, setStatus] = useState<ModelCacheStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadStatus, setDownloadStatus] = useState('')

  // Load model status
  useEffect(() => {
    const loadStatus = async () => {
      setLoading(true)
      try {
        if (window.ipcRenderer) {
          const result = await window.ipcRenderer.invoke(
            PDF_IPC_CHANNELS.GET_MODEL_CACHE_STATUS,
            modelId
          )
          setStatus(result)
        }
      } catch (err) {
        console.error('[ModelCacheStatus] Failed to load status:', err)
      } finally {
        setLoading(false)
      }
    }
    
    void loadStatus()
  }, [modelId])

  // Listen for download progress events
  useEffect(() => {
    if (!window.ipcRenderer) return

    const handleProgress = (_event: any, progressModelId: string, progress: number, progressStatus: string) => {
      if (progressModelId === modelId) {
        setDownloadProgress(progress)
        setDownloadStatus(progressStatus)
      }
    }

    const handleComplete = (_event: any, completeModelId: string, result: any) => {
      if (completeModelId === modelId) {
        setDownloading(false)
        setDownloadProgress(0)
        setDownloadStatus('')
        // Refresh status after download
        if (result.success) {
          window.ipcRenderer.invoke(PDF_IPC_CHANNELS.GET_MODEL_CACHE_STATUS, modelId)
            .then(setStatus)
            .catch(console.error)
        }
      }
    }

    window.ipcRenderer.on('pdf:model-download-progress', handleProgress)
    window.ipcRenderer.on('pdf:model-download-complete', handleComplete)
    
    return () => {
      window.ipcRenderer.off('pdf:model-download-progress', handleProgress)
      window.ipcRenderer.off('pdf:model-download-complete', handleComplete)
    }
  }, [modelId])

  // Handle download button click
  const handleDownload = async () => {
    if (!window.ipcRenderer || downloading) return
    
    setDownloading(true)
    setDownloadProgress(0)
    setDownloadStatus('Starting download...')
    
    try {
      await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.DOWNLOAD_MODEL, modelId)
    } catch (err) {
      console.error('[ModelCacheStatus] Download failed:', err)
      setDownloading(false)
      setDownloadStatus('')
    }
  }

  // Handle refresh button click
  const handleRefresh = async () => {
    setLoading(true)
    try {
      if (window.ipcRenderer) {
        const result = await window.ipcRenderer.invoke(
          PDF_IPC_CHANNELS.REFRESH_MODEL_STATUS,
          modelId
        )
        setStatus(result)
      }
      onRefresh?.()
    } catch (err) {
      console.error('[ModelCacheStatus] Refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }

  // Format cache size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  if (loading) {
    return (
      <div style={{
        marginTop: 12,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: '0.8rem',
        color: 'var(--theme-text-muted)',
      }}>
        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
        Checking model status...
      </div>
    )
  }

  if (!status) {
    return (
      <div style={{
        marginTop: 12,
        padding: '10px 14px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: '0.8rem',
        color: '#ef4444',
      }}>
        <XCircle size={14} />
        Failed to check model status
      </div>
    )
  }

  // Determine status color and icon
  const isAvailable = status.isAvailable
  const statusColor = isAvailable ? '#22c55e' : '#ef4444'
  const StatusIcon = isAvailable ? CheckCircle : XCircle

  return (
    <div style={{
      marginTop: 12,
      padding: '12px 14px',
      background: isAvailable ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
      border: `1px solid ${isAvailable ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      borderRadius: 8,
    }}>
      {/* Status Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: downloading ? 12 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusIcon size={16} style={{ color: statusColor }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 500, color: statusColor }}>
            {isAvailable ? 'Model Available' : 'Model Unavailable'}
          </span>
          {status.isCached && status.cacheSizeBytes && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#3b82f6',
              borderRadius: 4,
            }}>
              Cached: {formatSize(status.cacheSizeBytes)}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text-muted)',
              cursor: loading ? 'default' : 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              opacity: loading ? 0.5 : 1,
            }}
            title="Refresh status"
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
          
          {/* Download button (for local models that aren't cached) */}
          {status.provider === 'local' && !status.isCached && !downloading && (
            <button
              onClick={handleDownload}
              style={{
                background: '#3b82f6',
                border: 'none',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Download size={12} />
              Download
            </button>
          )}
        </div>
      </div>

      {/* Download Progress */}
      {downloading && (
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
            fontSize: '0.75rem',
            color: 'var(--theme-text-muted)',
          }}>
            <span>{downloadStatus || 'Downloading...'}</span>
            <span>{downloadProgress}%</span>
          </div>
          <div style={{
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${downloadProgress}%`,
              background: '#3b82f6',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Error Message */}
      {!isAvailable && status.errorMessage && !downloading && (
        <div style={{
          marginTop: 8,
          fontSize: '0.8rem',
          color: 'var(--theme-text-muted)',
        }}>
          {status.errorMessage}
        </div>
      )}

      {/* API Key Status (for API-based models) */}
      {status.requiresApiKey && (
        <div style={{
          marginTop: 8,
          fontSize: '0.75rem',
          color: status.hasApiKey ? '#22c55e' : '#fbbf24',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {status.hasApiKey ? (
            <>
              <CheckCircle size={12} />
              API key configured
            </>
          ) : (
            <>
              <AlertTriangle size={12} />
              API key required - configure in API Keys settings
            </>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Model Change Warning Component (Requirement 21.6)
// =============================================================================

interface ModelChangeWarningProps {
  /** The new model ID being switched to */
  newModelId: string
  /** Current saved model ID */
  currentModelId: string
  /** Callback when user confirms re-indexing */
  onReindex: (documentIds: string[]) => Promise<void>
  /** Callback when user dismisses the warning */
  onDismiss: () => void
}

/**
 * Model Change Warning Component
 * 
 * Displays a warning when the embedding model is changed and documents
 * need to be re-indexed. Allows users to select which documents to re-index.
 * 
 * Implements Requirement 21.6: Prompt for re-indexing on model change
 */
function ModelChangeWarning({
  newModelId,
  currentModelId,
  onReindex,
  onDismiss,
}: ModelChangeWarningProps): React.ReactElement | null {
  const [documentsNeedingReindex, setDocumentsNeedingReindex] = useState<IndexedDocumentInfo[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [reindexProgress, setReindexProgress] = useState<Record<string, string>>({})

  // Load documents that need re-indexing
  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true)
      try {
        if (window.ipcRenderer) {
          const result = await window.ipcRenderer.invoke(
            PDF_IPC_CHANNELS.CHECK_MODEL_CHANGE,
            newModelId
          )
          setDocumentsNeedingReindex(result.documentsNeedingReindex || [])
          // Select all by default
          setSelectedDocIds(new Set(result.documentsNeedingReindex?.map((d: IndexedDocumentInfo) => d.id) || []))
        }
      } catch (err) {
        console.error('[ModelChangeWarning] Failed to check model change:', err)
      } finally {
        setLoading(false)
      }
    }
    
    if (newModelId !== currentModelId) {
      void loadDocuments()
    }
  }, [newModelId, currentModelId])

  // Listen for reindex progress events
  useEffect(() => {
    if (!window.ipcRenderer) return

    const handleProgress = (_event: any, docId: string, status: string) => {
      setReindexProgress(prev => ({ ...prev, [docId]: status }))
    }

    window.ipcRenderer.on('pdf:reindex-progress', handleProgress)
    
    return () => {
      window.ipcRenderer.off('pdf:reindex-progress', handleProgress)
    }
  }, [])

  const toggleDocument = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedDocIds(new Set(documentsNeedingReindex.map(d => d.id)))
  }

  const selectNone = () => {
    setSelectedDocIds(new Set())
  }

  const handleReindex = async () => {
    if (selectedDocIds.size === 0) return
    
    setReindexing(true)
    try {
      await onReindex(Array.from(selectedDocIds))
    } finally {
      setReindexing(false)
    }
  }

  // Don't show if no model change or no documents need re-indexing
  if (newModelId === currentModelId || documentsNeedingReindex.length === 0) {
    return null
  }

  if (loading) {
    return (
      <div style={{
        padding: '16px',
        background: 'rgba(251, 191, 36, 0.1)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: 8,
        marginTop: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24' }}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Checking for documents that need re-indexing...
        </div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '16px',
      background: 'rgba(251, 191, 36, 0.1)',
      border: '1px solid rgba(251, 191, 36, 0.3)',
      borderRadius: 8,
      marginTop: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <AlertTriangle size={20} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: 4 }}>
            Embedding Model Changed
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)' }}>
            {documentsNeedingReindex.length} document{documentsNeedingReindex.length !== 1 ? 's' : ''} were 
            indexed with a different embedding model. Re-indexing is recommended for accurate search results.
          </div>
        </div>
      </div>

      {/* Document list */}
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        padding: '8px 0',
        marginBottom: 12,
        maxHeight: 200,
        overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 12px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 4,
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
            Select documents to re-index:
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={selectAll}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--theme-accent)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              Select All
            </button>
            <button
              onClick={selectNone}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--theme-text-muted)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              Select None
            </button>
          </div>
        </div>
        
        {documentsNeedingReindex.map(doc => (
          <div
            key={doc.id}
            onClick={() => !reindexing && toggleDocument(doc.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              cursor: reindexing ? 'default' : 'pointer',
              opacity: reindexing ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => {
              if (!reindexing) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <input
              type="checkbox"
              checked={selectedDocIds.has(doc.id)}
              onChange={() => toggleDocument(doc.id)}
              disabled={reindexing}
              style={{ cursor: reindexing ? 'default' : 'pointer' }}
            />
            <FileText size={14} style={{ color: 'var(--theme-text-muted)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: '0.85rem', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis' 
              }}>
                {doc.fileName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                {doc.chunkCount} chunks • Indexed with: {doc.embeddingModel}
              </div>
            </div>
            {reindexProgress[doc.id] && (
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: 4,
                background: reindexProgress[doc.id] === 'complete' 
                  ? 'rgba(34, 197, 94, 0.2)' 
                  : reindexProgress[doc.id] === 'error'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(59, 130, 246, 0.2)',
                color: reindexProgress[doc.id] === 'complete'
                  ? '#22c55e'
                  : reindexProgress[doc.id] === 'error'
                    ? '#ef4444'
                    : '#3b82f6',
              }}>
                {reindexProgress[doc.id] === 'complete' ? '✓ Done' : 
                 reindexProgress[doc.id] === 'error' ? '✗ Error' : 
                 'Re-indexing...'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={onDismiss}
          disabled={reindexing}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--theme-text-secondary)',
            fontSize: '0.85rem',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: reindexing ? 'default' : 'pointer',
            opacity: reindexing ? 0.5 : 1,
          }}
        >
          Skip for Now
        </button>
        <button
          onClick={handleReindex}
          disabled={reindexing || selectedDocIds.size === 0}
          style={{
            background: '#fbbf24',
            border: 'none',
            color: '#000',
            fontSize: '0.85rem',
            fontWeight: 500,
            padding: '6px 12px',
            borderRadius: 6,
            cursor: (reindexing || selectedDocIds.size === 0) ? 'default' : 'pointer',
            opacity: (reindexing || selectedDocIds.size === 0) ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {reindexing && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
          {reindexing ? 'Re-indexing...' : `Re-index ${selectedDocIds.size} Document${selectedDocIds.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

/**
 * RAGSettingsSection - Manages PDF RAG configuration
 * 
 * Implements Requirements:
 * - 16.1: Configure chunk size and overlap
 * - 16.2: Select embedding model
 * - 16.3: Configure retrieval parameters
 * - 16.7: Support per-collection retrieval settings
 */

// =============================================================================
// Per-Document Settings Component (Requirement 16.7)
// =============================================================================
// Indexed Documents Model Info Component (Requirement 21.6)
// =============================================================================

interface IndexedDocumentsModelInfoProps {
  currentModelId: string
}

/**
 * Indexed Documents Model Info Component
 * 
 * Shows which embedding model was used to index each document and
 * highlights documents that need re-indexing due to model mismatch.
 * 
 * Implements Requirement 21.6: Show which model was used for indexing
 */
function IndexedDocumentsModelInfo({ currentModelId }: IndexedDocumentsModelInfoProps): React.ReactElement {
  const [indexedDocuments, setIndexedDocuments] = useState<IndexedDocumentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState<Set<string>>(new Set())

  // Load indexed documents
  useEffect(() => {
    const loadDocuments = async () => {
      setLoading(true)
      try {
        if (window.ipcRenderer) {
          const docs = await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.GET_INDEXED_DOCUMENTS)
          setIndexedDocuments(docs || [])
        }
      } catch (err) {
        console.error('[IndexedDocumentsModelInfo] Failed to load documents:', err)
      } finally {
        setLoading(false)
      }
    }
    
    void loadDocuments()
  }, [currentModelId])

  // Handle re-indexing a single document
  const handleReindexDocument = async (docId: string) => {
    setReindexing(prev => new Set(prev).add(docId))
    try {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.REINDEX_DOCUMENTS, [docId])
        // Reload documents to get updated info
        const docs = await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.GET_INDEXED_DOCUMENTS)
        setIndexedDocuments(docs || [])
      }
    } catch (err) {
      console.error('[IndexedDocumentsModelInfo] Failed to re-index document:', err)
    } finally {
      setReindexing(prev => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

  // Get model display name
  const getModelDisplayName = (modelId: string): string => {
    const modelOption = EMBEDDING_MODEL_OPTIONS.find(m => m.value === modelId)
    return modelOption?.label || modelId
  }

  // Count documents needing re-index
  const docsNeedingReindex = indexedDocuments.filter(d => d.needsReindex)

  if (loading) {
    return (
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">
          <Cpu size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Indexed Documents
        </h3>
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--theme-text-muted)' }}>
          Loading indexed documents...
        </div>
      </div>
    )
  }

  if (indexedDocuments.length === 0) {
    return (
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">
          <Cpu size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Indexed Documents
        </h3>
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--theme-text-muted)',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 8,
        }}>
          <FileText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>No indexed documents found.</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
            Load and index a PDF to see embedding model information.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-section-card" style={{ marginTop: 24 }}>
      <h3 className="section-head">
        <Cpu size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        Indexed Documents
        {docsNeedingReindex.length > 0 && (
          <span style={{
            marginLeft: 8,
            fontSize: '0.75rem',
            padding: '2px 8px',
            background: 'rgba(251, 191, 36, 0.2)',
            color: '#fbbf24',
            borderRadius: 10,
          }}>
            {docsNeedingReindex.length} need re-indexing
          </span>
        )}
      </h3>
      <div className="section-desc" style={{ marginBottom: 16 }}>
        Shows which embedding model was used to index each document. Documents indexed with a 
        different model than the current setting may have reduced search accuracy.
      </div>

      {/* Model mismatch warning */}
      {docsNeedingReindex.length > 0 && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: 8,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)' }}>
            <strong style={{ color: '#fbbf24' }}>{docsNeedingReindex.length} document{docsNeedingReindex.length !== 1 ? 's' : ''}</strong> were 
            indexed with a different embedding model. Re-indexing is recommended for optimal search results.
          </div>
        </div>
      )}

      {/* Document list */}
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {indexedDocuments.map((doc, index) => (
          <div
            key={doc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: index < indexedDocuments.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <FileText size={16} style={{ 
                color: doc.needsReindex ? '#fbbf24' : 'var(--theme-text-muted)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {doc.fileName}
                </div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--theme-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                  <span>{doc.chunkCount} chunks</span>
                  <span>•</span>
                  <span style={{ 
                    color: doc.needsReindex ? '#fbbf24' : 'var(--theme-text-muted)',
                  }}>
                    Model: {getModelDisplayName(doc.embeddingModel)}
                  </span>
                  {doc.needsReindex && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#fbbf24' }}>
                        Current: {getModelDisplayName(currentModelId)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {doc.needsReindex && (
              <button
                onClick={() => handleReindexDocument(doc.id)}
                disabled={reindexing.has(doc.id)}
                style={{
                  background: 'rgba(251, 191, 36, 0.2)',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  color: '#fbbf24',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 4,
                  cursor: reindexing.has(doc.id) ? 'default' : 'pointer',
                  opacity: reindexing.has(doc.id) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                {reindexing.has(doc.id) ? (
                  <>
                    <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    Re-indexing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    Re-index
                  </>
                )}
              </button>
            )}
            
            {!doc.needsReindex && (
              <span style={{
                fontSize: '0.7rem',
                padding: '2px 8px',
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#22c55e',
                borderRadius: 4,
              }}>
                ✓ Current Model
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Per-Document Settings Component (Requirement 16.7)
// =============================================================================

interface PerDocumentSettingsSectionProps {
  globalSettings: PDFRAGSettings
}

/**
 * Per-Document Settings Section
 * 
 * Allows users to configure different retrieval parameters for different PDF documents.
 * Settings are stored with the document/collection metadata and applied during retrieval.
 * 
 * Implements Requirement 16.7: Support per-collection retrieval settings
 */
function PerDocumentSettingsSection({ globalSettings }: PerDocumentSettingsSectionProps): React.ReactElement {
  const [documentSettings, setDocumentSettings] = useState<DocumentRetrievalSettings[]>([])
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [savingDocId, setSavingDocId] = useState<string | null>(null)

  // Load document settings and recent documents
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (window.ipcRenderer) {
        const [settings, docs] = await Promise.all([
          window.ipcRenderer.invoke(PDF_IPC_CHANNELS.GET_ALL_DOCUMENT_SETTINGS),
          window.ipcRenderer.invoke(PDF_IPC_CHANNELS.GET_RECENT_DOCUMENTS, 20),
        ])
        setDocumentSettings(settings || [])
        setRecentDocuments(docs || [])
      }
    } catch (err) {
      console.error('[PerDocumentSettings] Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Get settings for a specific document (or create default)
  const getDocSettings = (docId: string, docName: string): DocumentRetrievalSettings => {
    const existing = documentSettings.find(s => s.documentId === docId)
    if (existing) return existing
    return {
      documentId: docId,
      documentName: docName,
      ...DEFAULT_DOCUMENT_RETRIEVAL_SETTINGS,
    }
  }

  // Update settings for a document
  const updateDocSettings = async (settings: DocumentRetrievalSettings) => {
    setSavingDocId(settings.documentId)
    try {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.UPDATE_DOCUMENT_SETTINGS, settings)
        setDocumentSettings(prev => {
          const idx = prev.findIndex(s => s.documentId === settings.documentId)
          if (idx >= 0) {
            const updated = [...prev]
            updated[idx] = settings
            return updated
          }
          return [...prev, settings]
        })
      }
    } catch (err) {
      console.error('[PerDocumentSettings] Failed to save settings:', err)
    } finally {
      setSavingDocId(null)
    }
  }

  // Delete settings for a document
  const deleteDocSettings = async (docId: string) => {
    try {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.DELETE_DOCUMENT_SETTINGS, docId)
        setDocumentSettings(prev => prev.filter(s => s.documentId !== docId))
        setExpandedDocId(null)
      }
    } catch (err) {
      console.error('[PerDocumentSettings] Failed to delete settings:', err)
    }
  }

  // Toggle document expansion
  const toggleExpand = (docId: string) => {
    setExpandedDocId(prev => prev === docId ? null : docId)
  }

  // Get documents with custom settings
  const docsWithSettings = documentSettings.filter(s => s.enabled)

  // Get indexed documents without custom settings
  const indexedDocsWithoutSettings = recentDocuments.filter(
    doc => doc.isIndexed && !documentSettings.some(s => s.documentId === doc.id && s.enabled)
  )

  if (loading) {
    return (
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">
          <Settings2 size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Per-Document Settings
        </h3>
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--theme-text-muted)' }}>
          Loading document settings...
        </div>
      </div>
    )
  }

  return (
    <div className="settings-section-card" style={{ marginTop: 24 }}>
      <h3 className="section-head">
        <Settings2 size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        Per-Document Settings
      </h3>
      <div className="section-desc" style={{ marginBottom: 20 }}>
        Configure custom retrieval settings for individual documents. These override global settings when enabled.
      </div>

      {/* Documents with custom settings */}
      {docsWithSettings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ 
            fontSize: '0.85rem', 
            fontWeight: 500, 
            color: 'var(--theme-text-secondary)',
            marginBottom: 8 
          }}>
            Documents with Custom Settings
          </div>
          {docsWithSettings.map(docSettings => (
            <DocumentSettingsCard
              key={docSettings.documentId}
              settings={docSettings}
              globalSettings={globalSettings}
              isExpanded={expandedDocId === docSettings.documentId}
              isSaving={savingDocId === docSettings.documentId}
              onToggle={() => toggleExpand(docSettings.documentId)}
              onUpdate={updateDocSettings}
              onDelete={() => deleteDocSettings(docSettings.documentId)}
            />
          ))}
        </div>
      )}

      {/* Indexed documents without custom settings */}
      {indexedDocsWithoutSettings.length > 0 && (
        <div>
          <div style={{ 
            fontSize: '0.85rem', 
            fontWeight: 500, 
            color: 'var(--theme-text-secondary)',
            marginBottom: 8 
          }}>
            Indexed Documents (Using Global Settings)
          </div>
          {indexedDocsWithoutSettings.map(doc => {
            const docSettings = getDocSettings(doc.id, doc.fileName)
            return (
              <DocumentSettingsCard
                key={doc.id}
                settings={docSettings}
                globalSettings={globalSettings}
                isExpanded={expandedDocId === doc.id}
                isSaving={savingDocId === doc.id}
                onToggle={() => toggleExpand(doc.id)}
                onUpdate={updateDocSettings}
                onDelete={() => deleteDocSettings(doc.id)}
              />
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {docsWithSettings.length === 0 && indexedDocsWithoutSettings.length === 0 && (
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: 'var(--theme-text-muted)',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 8,
        }}>
          <FileText size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>No indexed documents found.</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
            Load and index a PDF to configure per-document settings.
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Document Settings Card Component
// =============================================================================

interface DocumentSettingsCardProps {
  settings: DocumentRetrievalSettings
  globalSettings: PDFRAGSettings
  isExpanded: boolean
  isSaving: boolean
  onToggle: () => void
  onUpdate: (settings: DocumentRetrievalSettings) => Promise<void>
  onDelete: () => void
}

function DocumentSettingsCard({
  settings,
  globalSettings,
  isExpanded,
  isSaving,
  onToggle,
  onUpdate,
  onDelete,
}: DocumentSettingsCardProps): React.ReactElement {
  const [localSettings, setLocalSettings] = useState<DocumentRetrievalSettings>(settings)
  const hasChanges = JSON.stringify(localSettings) !== JSON.stringify(settings)

  // Reset local settings when props change
  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const updateLocal = <K extends keyof DocumentRetrievalSettings>(
    key: K,
    value: DocumentRetrievalSettings[K]
  ) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    await onUpdate(localSettings)
  }

  const handleDiscard = () => {
    setLocalSettings(settings)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8,
      marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <FileText size={16} style={{ color: 'var(--theme-accent)' }} />
          <span style={{ fontWeight: 500 }}>{settings.documentName}</span>
          {settings.enabled && (
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#22c55e',
              borderRadius: 4,
            }}>
              Custom
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isSaving && (
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
          )}
          {settings.enabled && (
            <button
              onClick={e => {
                e.stopPropagation()
                onDelete()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--theme-text-muted)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Remove custom settings"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Settings */}
      {isExpanded && (
        <div style={{
          padding: '16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Enable toggle */}
          <ToggleInput
            label="Enable Custom Settings"
            description="Override global settings for this document."
            checked={localSettings.enabled}
            onChange={v => updateLocal('enabled', v)}
          />

          {localSettings.enabled && (
            <>
              {/* Retrieval Overrides */}
              <div style={{ 
                marginTop: 16, 
                paddingTop: 16, 
                borderTop: '1px solid rgba(255,255,255,0.06)' 
              }}>
                <div style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 500, 
                  marginBottom: 12,
                  color: 'var(--theme-text-secondary)' 
                }}>
                  Retrieval Settings
                </div>

                <NumberInput
                  label="Top K Results"
                  description={`Global: ${globalSettings.topK}`}
                  value={localSettings.topK ?? globalSettings.topK}
                  min={1}
                  max={20}
                  onChange={v => updateLocal('topK', v)}
                  unit="chunks"
                />

                <SliderInput
                  label="Minimum Confidence Score"
                  description={`Global: ${globalSettings.minConfidenceScore.toFixed(2)}`}
                  value={localSettings.minConfidenceScore ?? globalSettings.minConfidenceScore}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={v => updateLocal('minConfidenceScore', v)}
                />

                <ToggleInput
                  label="Hybrid Search"
                  description={`Global: ${globalSettings.useHybridSearch ? 'Enabled' : 'Disabled'}`}
                  checked={localSettings.useHybridSearch ?? globalSettings.useHybridSearch}
                  onChange={v => updateLocal('useHybridSearch', v)}
                />

                {(localSettings.useHybridSearch ?? globalSettings.useHybridSearch) && (
                  <SliderInput
                    label="Hybrid Alpha (Vector Weight)"
                    description={`Global: ${globalSettings.hybridAlpha.toFixed(1)}`}
                    value={localSettings.hybridAlpha ?? globalSettings.hybridAlpha}
                    min={0}
                    max={1}
                    step={0.1}
                    onChange={v => updateLocal('hybridAlpha', v)}
                  />
                )}

                <ToggleInput
                  label="Enable Reranker"
                  description={`Global: ${globalSettings.useReranker ? 'Enabled' : 'Disabled'}`}
                  checked={localSettings.useReranker ?? globalSettings.useReranker}
                  onChange={v => updateLocal('useReranker', v)}
                />

                <NumberInput
                  label="Max Sources in Context"
                  description={`Global: ${globalSettings.maxSourcesInContext}`}
                  value={localSettings.maxSourcesInContext ?? globalSettings.maxSourcesInContext}
                  min={1}
                  max={15}
                  onChange={v => updateLocal('maxSourcesInContext', v)}
                  unit="chunks"
                />
              </div>

              {/* Grounding Overrides */}
              <div style={{ 
                marginTop: 16, 
                paddingTop: 16, 
                borderTop: '1px solid rgba(255,255,255,0.06)' 
              }}>
                <div style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 500, 
                  marginBottom: 12,
                  color: 'var(--theme-text-secondary)' 
                }}>
                  Grounding Settings
                </div>

                <ToggleInput
                  label="Grounded Mode"
                  description={`Global: ${globalSettings.groundedModeEnabled ? 'Enabled' : 'Disabled'}`}
                  checked={localSettings.groundedModeEnabled ?? globalSettings.groundedModeEnabled}
                  onChange={v => updateLocal('groundedModeEnabled', v)}
                />

                <ToggleInput
                  label="Show Low Confidence Warnings"
                  description={`Global: ${globalSettings.showLowConfidenceWarning ? 'Enabled' : 'Disabled'}`}
                  checked={localSettings.showLowConfidenceWarning ?? globalSettings.showLowConfidenceWarning}
                  onChange={v => updateLocal('showLowConfidenceWarning', v)}
                />

                {(localSettings.showLowConfidenceWarning ?? globalSettings.showLowConfidenceWarning) && (
                  <SliderInput
                    label="Low Confidence Threshold"
                    description={`Global: ${globalSettings.lowConfidenceThreshold.toFixed(2)}`}
                    value={localSettings.lowConfidenceThreshold ?? globalSettings.lowConfidenceThreshold}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={v => updateLocal('lowConfidenceThreshold', v)}
                  />
                )}
              </div>
            </>
          )}

          {/* Save/Discard buttons */}
          {hasChanges && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <button
                onClick={handleDiscard}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--theme-text-secondary)',
                  fontSize: '0.85rem',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  background: '#22c55e',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: isSaving ? 'default' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Main RAGSettingsSection Component
// =============================================================================

export function RAGSettingsSection({ 
  onUnsavedChange 
}: RAGSettingsSectionProps): React.ReactElement {
  const [settings, setSettings] = useState<PDFRAGSettings>(DEFAULT_PDF_RAG_SETTINGS)
  const [originalSettings, setOriginalSettings] = useState<PDFRAGSettings>(DEFAULT_PDF_RAG_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([])
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false)
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null)
  
  // Model change warning state (Requirement 21.6)
  const [showModelChangeWarning, setShowModelChangeWarning] = useState(false)
  const [pendingModelChange, setPendingModelChange] = useState<string | null>(null)

  // Load settings from main process
  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      if (window.ipcRenderer) {
        const loadedSettings = await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.GET_SETTINGS)
        setSettings(loadedSettings)
        setOriginalSettings(loadedSettings)
      }
    } catch (err) {
      console.error('[RAGSettings] Failed to load settings:', err)
      setError('Failed to load RAG settings')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOllamaModels = useCallback(async () => {
    if (!window.ipcRenderer) return
    setOllamaModelsLoading(true)
    setOllamaModelsError(null)
    try {
      const models = await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.LIST_OLLAMA_MODELS, settings.ollamaBaseUrl)
      const safeModels = Array.isArray(models) ? models : []
      setOllamaModels(safeModels)
    } catch (err) {
      console.error('[RAGSettings] Failed to load Ollama models:', err)
      setOllamaModelsError('Failed to fetch Ollama models')
      setOllamaModels([])
    } finally {
      setOllamaModelsLoading(false)
    }
  }, [settings.ollamaBaseUrl])

  // Load settings on mount
  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (settings.embeddingModel === 'local') {
      void loadOllamaModels()
    }
  }, [settings.embeddingModel, loadOllamaModels])

  // Track unsaved changes
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings)
  
  useEffect(() => {
    onUnsavedChange?.(hasChanges)
  }, [hasChanges, onUnsavedChange])

  // Save settings to main process
  const saveSettings = async () => {
    setSaving(true)
    setError(null)
    
    try {
      if (window.ipcRenderer) {
        await window.ipcRenderer.invoke(PDF_IPC_CHANNELS.UPDATE_SETTINGS, settings)
        setOriginalSettings(settings)
        
        // Check if embedding model changed and show warning
        if (settings.embeddingModel !== originalSettings.embeddingModel) {
          setPendingModelChange(settings.embeddingModel)
          setShowModelChangeWarning(true)
        }
      }
    } catch (err) {
      console.error('[RAGSettings] Failed to save settings:', err)
      setError('Failed to save RAG settings')
    } finally {
      setSaving(false)
    }
  }

  // Reset to defaults
  const resetToDefaults = () => {
    setSettings(DEFAULT_PDF_RAG_SETTINGS)
  }

  // Discard changes
  const discardChanges = () => {
    setSettings(originalSettings)
  }

  // Update a single setting
  const updateSetting = <K extends keyof PDFRAGSettings>(
    key: K, 
    value: PDFRAGSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const formatSize = (bytes?: number): string => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // Update embedding dimensions when model changes (Requirement 21.6)
  const handleEmbeddingModelChange = (model: string) => {
    const modelOption = EMBEDDING_MODEL_OPTIONS.find(m => m.value === model)
    setSettings(prev => ({
      ...prev,
      embeddingModel: model as PDFRAGSettings['embeddingModel'],
      embeddingDimensions: modelOption?.dimensions ?? prev.embeddingDimensions
    }))
  }

  // Handle re-indexing documents after model change (Requirement 21.6)
  const handleReindexDocuments = async (documentIds: string[]) => {
    try {
      if (window.ipcRenderer && documentIds.length > 0) {
        const result = await window.ipcRenderer.invoke(
          PDF_IPC_CHANNELS.REINDEX_DOCUMENTS,
          documentIds
        )
        
        if (result.success) {
          setShowModelChangeWarning(false)
          setPendingModelChange(null)
        } else {
          // Show error for failed re-indexing
          const failedDocs = result.results.filter((r: any) => !r.success)
          if (failedDocs.length > 0) {
            setError(`Failed to re-index ${failedDocs.length} document(s)`)
          }
        }
      }
    } catch (err) {
      console.error('[RAGSettings] Failed to re-index documents:', err)
      setError('Failed to re-index documents')
    }
  }

  // Dismiss model change warning
  const handleDismissModelChangeWarning = () => {
    setShowModelChangeWarning(false)
    setPendingModelChange(null)
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <RefreshCw 
          size={24} 
          style={{ 
            animation: 'spin 1s linear infinite',
            color: 'var(--theme-text-muted)' 
          }} 
        />
        <div style={{ marginTop: 12, color: 'var(--theme-text-muted)' }}>
          Loading RAG settings...
        </div>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">
          <FileText size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          PDF RAG Settings
        </h2>
        <div className="page-subtitle">
          Configure how PDF documents are processed and searched
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#ef4444'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Chunking Settings - Requirement 16.1 */}
      <div className="settings-section-card">
        <h3 className="section-head">
          <FileText size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Document Chunking
        </h3>
        <div className="section-desc" style={{ marginBottom: 20 }}>
          Configure how PDF documents are split into chunks for indexing and retrieval.
        </div>

        <NumberInput
          label="Chunk Size"
          description="Target number of tokens per chunk. Larger chunks provide more context but may reduce precision."
          value={settings.chunkSize}
          min={128}
          max={2048}
          step={64}
          onChange={v => updateSetting('chunkSize', v)}
          unit="tokens"
        />

        <NumberInput
          label="Chunk Overlap"
          description="Number of tokens to overlap between adjacent chunks. Helps maintain context across chunk boundaries."
          value={settings.chunkOverlap}
          min={0}
          max={512}
          step={32}
          onChange={v => updateSetting('chunkOverlap', v)}
          unit="tokens"
        />

        <SelectInput
          label="Chunking Strategy"
          value={settings.chunkingStrategy}
          options={CHUNKING_STRATEGY_OPTIONS}
          onChange={v => updateSetting('chunkingStrategy', v as PDFRAGSettings['chunkingStrategy'])}
        />
      </div>

      {/* Embedding Settings - Requirement 16.2 */}
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">
          <Cpu size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Embedding Model
        </h3>
        <div className="section-desc" style={{ marginBottom: 20 }}>
          Choose the model used to generate vector embeddings for semantic search.
        </div>

        <SelectInput
          label="Embedding Provider"
          value={settings.embeddingModel}
          options={EMBEDDING_MODEL_OPTIONS}
          onChange={handleEmbeddingModelChange}
        />

        {settings.embeddingModel === 'local' && (
          <>
            <TextInput
              label="Ollama Base URL"
              description="URL where Ollama server is running. Use 127.0.0.1 instead of localhost to avoid IPv6 connection issues."
              value={settings.ollamaBaseUrl || 'http://127.0.0.1:11434'}
              placeholder="http://127.0.0.1:11434"
              onChange={v => updateSetting('ollamaBaseUrl', v || 'http://127.0.0.1:11434')}
            />
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="label-small">Ollama Embedding Model</label>
                <button
                  onClick={() => void loadOllamaModels()}
                  disabled={ollamaModelsLoading}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--theme-text-muted)',
                    cursor: ollamaModelsLoading ? 'default' : 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.75rem',
                  }}
                  title="Refresh Ollama models"
                >
                  <RefreshCw size={12} style={ollamaModelsLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
                  Refresh
                </button>
              </div>
              {ollamaModelsLoading ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
                  Checking Ollama models...
                </div>
              ) : ollamaModels.length > 0 ? (
                <SelectInput
                  label="Local Model"
                  description="Select the Ollama model to use for embeddings."
                  value={settings.localEmbeddingModel || ollamaModels[0].name}
                  options={ollamaModels.map(model => ({
                    value: model.name,
                    label: model.name,
                    description: model.size ? `Size: ${formatSize(model.size)}` : undefined,
                  }))}
                  onChange={v => updateSetting('localEmbeddingModel', v)}
                />
              ) : (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontSize: '0.8rem',
                }}>
                  {ollamaModelsError || 'No Ollama models found. Make sure Ollama is running and models are installed.'}
                </div>
              )}
            </div>
            <div style={{
              padding: '12px 16px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 8,
              marginTop: 12,
              fontSize: '0.85rem',
              color: 'var(--theme-text-secondary)'
            }}>
              <Info size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Make sure Ollama is running with the <code style={{
                background: 'rgba(0,0,0,0.2)',
                padding: '2px 6px',
                borderRadius: 4
              }}>nomic-embed-text</code> model installed.
              <br />
              <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>
                Run: <code style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '2px 6px',
                  borderRadius: 4
                }}>ollama pull nomic-embed-text</code>
              </span>
            </div>
          </>
        )}

        <div style={{ 
          marginTop: 16,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 6,
          fontSize: '0.8rem',
          color: 'var(--theme-text-muted)'
        }}>
          Embedding Dimensions: <strong style={{ color: 'var(--theme-text-secondary)' }}>
            {settings.embeddingDimensions}
          </strong>
        </div>

        {/* Model Cache Status - Requirement 21.7 */}
        <ModelCacheStatusDisplay 
          modelId={settings.embeddingModel} 
          onRefresh={() => {
            // Force refresh of model status
            if (window.ipcRenderer) {
              window.ipcRenderer.invoke(PDF_IPC_CHANNELS.REFRESH_MODEL_STATUS, settings.embeddingModel)
            }
          }}
        />

        {/* Model Change Warning - Requirement 21.6 */}
        {showModelChangeWarning && pendingModelChange && (
          <ModelChangeWarning
            newModelId={pendingModelChange}
            currentModelId={originalSettings.embeddingModel}
            onReindex={handleReindexDocuments}
            onDismiss={handleDismissModelChangeWarning}
          />
        )}

        {/* Show warning if model differs from saved but not yet saved */}
        {settings.embeddingModel !== originalSettings.embeddingModel && !showModelChangeWarning && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: 8,
            marginTop: 16,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)' }}>
              <strong style={{ color: '#fbbf24' }}>Note:</strong> Changing the embedding model will require 
              re-indexing existing documents. After saving, you'll be prompted to re-index documents 
              that were indexed with the previous model.
            </div>
          </div>
        )}
      </div>

      {/* Retrieval Settings - Requirement 16.3 */}
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">
          <Search size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Retrieval Parameters
        </h3>
        <div className="section-desc" style={{ marginBottom: 20 }}>
          Configure how relevant chunks are retrieved and ranked.
        </div>

        <NumberInput
          label="Top K Results"
          description="Number of most relevant chunks to retrieve for each query."
          value={settings.topK}
          min={1}
          max={20}
          onChange={v => updateSetting('topK', v)}
          unit="chunks"
        />

        <NumberInput
          label="Max Sources in Context"
          description="Maximum number of source chunks to include in AI context. Prevents answer dilution."
          value={settings.maxSourcesInContext}
          min={1}
          max={15}
          onChange={v => updateSetting('maxSourcesInContext', v)}
          unit="chunks"
        />

        <SliderInput
          label="Minimum Confidence Score"
          description="Chunks below this score will be filtered out."
          value={settings.minConfidenceScore}
          min={0}
          max={1}
          step={0.05}
          onChange={v => updateSetting('minConfidenceScore', v)}
        />

        <ToggleInput
          label="Hybrid Search"
          description="Combine vector similarity with BM25 keyword search for better results."
          checked={settings.useHybridSearch}
          onChange={v => updateSetting('useHybridSearch', v)}
        />

        {settings.useHybridSearch && (
          <SliderInput
            label="Hybrid Alpha (Vector Weight)"
            description="Balance between vector search (1.0) and keyword search (0.0)."
            value={settings.hybridAlpha}
            min={0}
            max={1}
            step={0.1}
            onChange={v => updateSetting('hybridAlpha', v)}
          />
        )}

        <ToggleInput
          label="Enable Reranker"
          description="Apply cross-encoder reranking to improve result ordering."
          checked={settings.useReranker}
          onChange={v => updateSetting('useReranker', v)}
        />
      </div>

      {/* Grounding Settings */}
      <div className="settings-section-card" style={{ marginTop: 24 }}>
        <h3 className="section-head">
          <AlertCircle size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Grounding & Confidence
        </h3>
        <div className="section-desc" style={{ marginBottom: 20 }}>
          Configure how the AI handles uncertain or low-confidence results.
        </div>

        <ToggleInput
          label="Grounded Mode by Default"
          description="Restrict AI responses to only information found in retrieved chunks."
          checked={settings.groundedModeEnabled}
          onChange={v => updateSetting('groundedModeEnabled', v)}
        />

        <ToggleInput
          label="Show Low Confidence Warnings"
          description="Display a warning when retrieved chunks have low relevance scores."
          checked={settings.showLowConfidenceWarning}
          onChange={v => updateSetting('showLowConfidenceWarning', v)}
        />

        {settings.showLowConfidenceWarning && (
          <SliderInput
            label="Low Confidence Threshold"
            description="Show warning when max relevance score is below this value."
            value={settings.lowConfidenceThreshold}
            min={0}
            max={1}
            step={0.05}
            onChange={v => updateSetting('lowConfidenceThreshold', v)}
          />
        )}
      </div>

      {/* Per-Document Settings - Requirement 16.7 */}
      <PerDocumentSettingsSection globalSettings={settings} />

      {/* Indexed Documents Model Info - Requirement 21.6 */}
      <IndexedDocumentsModelInfo currentModelId={settings.embeddingModel} />

      {/* Action Buttons */}
      {hasChanges && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 24px',
          background: 'rgba(30, 34, 42, 0.98)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
          animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <span style={{ color: '#a0a0a0', fontSize: '0.9rem' }}>
            Careful — you have unsaved changes!
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={resetToDefaults}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                fontSize: '0.85rem',
                cursor: 'pointer',
                padding: '6px 12px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
            >
              Reset to Defaults
            </button>
            <button
              onClick={discardChanges}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                fontSize: '0.85rem',
                cursor: 'pointer',
                padding: '6px 12px',
                transition: 'color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
            >
              Discard
            </button>
            <button
              onClick={saveSettings}
              disabled={saving}
              style={{
                background: '#22c55e',
                border: 'none',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                padding: '8px 16px',
                borderRadius: 6,
                cursor: saving ? 'default' : 'pointer',
                transition: 'all 0.2s',
                opacity: saving ? 0.7 : 1
              }}
              onMouseEnter={e => {
                if (!saving) e.currentTarget.style.background = '#16a34a'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#22c55e'
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default RAGSettingsSection
