/**
 * CustomModelSelect component for Settings
 * Searchable dropdown for selecting models across all providers
 * 
 * @module CustomModelSelect
 * Requirements: 2.1
 */

import React, { useState, useRef, useMemo, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'
import { useDropdownPosition, calculateMaxHeight, getDropdownTransform, getDropdownAnimation } from '../../hooks/useDropdownPosition'

/**
 * Model option interface
 */
export interface ModelOption {
  code: string
  displayName: string
  provider?: string
}

/**
 * Props for CustomModelSelect component
 */
export interface CustomModelSelectProps {
  /** Currently selected model code */
  value: string
  /** Callback when selection changes */
  onChange: (value: string) => void
  /** Gemini models */
  geminiModels: ModelOption[]
  /** Groq models */
  groqModels: ModelOption[]
  /** OpenRouter models */
  openRouterModels: ModelOption[]
  /** Perplexity models */
  perplexityModels: ModelOption[]
  /** Ollama models */
  ollamaModels: ModelOption[]
}

/**
 * CustomModelSelect - Searchable dropdown for model selection
 * Uses centralized useDropdownPosition hook for positioning
 */
export function CustomModelSelect({
  value,
  onChange,
  geminiModels,
  groqModels,
  openRouterModels,
  perplexityModels,
  ollamaModels
}: CustomModelSelectProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  // Use centralized dropdown position hook
  const { position, recalculate } = useDropdownPosition({
    triggerRef: dropdownRef,
    isOpen,
    preferredWidth: 415,
    preferredHeight: 400,
    offset: 12
  })

  // Get all models grouped by provider
  const allModels = useMemo(() => [
    ...geminiModels.map(m => ({ ...m, provider: 'Gemini' })),
    ...groqModels.map(m => ({ ...m, provider: 'Groq' })),
    ...openRouterModels.map(m => ({ ...m, provider: 'OpenRouter' })),
    ...perplexityModels.map(m => ({ ...m, provider: 'Perplexity' })),
    ...ollamaModels.map(m => ({ ...m, provider: 'Ollama' }))
  ], [geminiModels, groqModels, openRouterModels, perplexityModels, ollamaModels])

  // Find selected model
  const selectedModel = allModels.find(m => m.code === value)

  // Filter models based on search
  const filteredModels = useMemo(() => {
    if (!searchQuery) return allModels
    const query = searchQuery.toLowerCase()
    return allModels.filter(m =>
      m.displayName.toLowerCase().includes(query) ||
      m.code.toLowerCase().includes(query) ||
      m.provider?.toLowerCase().includes(query)
    )
  }, [searchQuery, allModels])

  // Group filtered models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelOption[]> = {
      Gemini: [],
      Groq: [],
      OpenRouter: [],
      Perplexity: [],
      Ollama: []
    }
    filteredModels.forEach(m => {
      if (m.provider && groups[m.provider]) {
        groups[m.provider].push(m)
      }
    })
    return groups
  }, [filteredModels])

  // Toggle dropdown
  const toggleOpen = () => {
    if (!isOpen) {
      recalculate()
      setIsOpen(true)
    } else {
      setIsOpen(false)
      setSearchQuery('')
    }
  }

  // Handle selection
  const handleSelect = (model: ModelOption) => {
    onChange(model.code)
    setIsOpen(false)
    setSearchQuery('')
  }

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          portalRef.current && !portalRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Render group
  const renderGroup = (provider: string, models: ModelOption[]) => {
    if (models.length === 0) return null
    return (
      <div key={provider} style={{ marginBottom: '12px' }}>
        <div style={{
          fontSize: '0.75rem',
          color: '#b0b0b0',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
          padding: '0 4px'
        }}>
          {provider}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {models.map(model => {
            const isActive = model.code === value
            return (
              <div
                key={model.code}
                onClick={() => handleSelect(model)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: isActive ? 'var(--theme-accent-muted)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = 'var(--theme-surface-hover)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: 'var(--theme-text-primary)', fontSize: '0.9rem' }}>
                  {model.displayName}
                </span>
                {isActive && <Check size={14} color="var(--theme-accent)" />}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const maxHeight = calculateMaxHeight(position, 16, 400)

  return (
    <div style={{ position: 'relative', zIndex: 100 }} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={toggleOpen}
        className="setting-input-scira"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          fontSize: '0.9rem',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <span style={{ color: 'var(--theme-text-primary)' }}>
          {selectedModel?.displayName || 'Select a model...'}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: 'var(--theme-text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }}
        />
      </button>

      {/* Dropdown Portal */}
      {isOpen && ReactDOM.createPortal(
        <div
          ref={portalRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            transform: getDropdownTransform(position.showAbove),
            width: `${position.width}px`,
            maxHeight: `${maxHeight}px`,
            backgroundColor: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            borderRadius: '20px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            animation: `${getDropdownAnimation(position.showAbove)} 0.2s cubic-bezier(0.16, 1, 0.3, 1)`,
            zIndex: 99999,
            overflow: 'hidden'
          }}
        >
          {/* Search Header */}
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              color="var(--theme-text-muted)"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              autoFocus
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--theme-surface-hover)',
                border: '1px solid var(--theme-border)',
                borderRadius: '12px',
                padding: '10px 12px 10px 36px',
                color: 'var(--theme-text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--theme-accent)'
                e.target.style.boxShadow = '0 0 0 3px var(--theme-accent-muted)'
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--theme-border)'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Content Section */}
          <div
            className="custom-scrollbar"
            style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}
          >
            {renderGroup('Gemini', groupedModels.Gemini)}
            {renderGroup('Groq', groupedModels.Groq)}
            {renderGroup('OpenRouter', groupedModels.OpenRouter)}
            {renderGroup('Perplexity', groupedModels.Perplexity)}
            {renderGroup('Ollama', groupedModels.Ollama)}

            {filteredModels.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--theme-text-muted)' }}>
                No models found
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes dropdown-slide-up {
          from { opacity: 0; transform: translateY(calc(-100% + 10px)); }
          to { opacity: 1; transform: translateY(-100%); }
        }
        @keyframes dropdown-slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  )
}

export default CustomModelSelect
