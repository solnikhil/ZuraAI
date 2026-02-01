/**
 * ModelSection component for Settings
 * Manages model catalog and custom models
 * 
 * @module ModelSection
 * Requirements: 2.4
 */

import React, { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronDown, Edit2, Trash2, Plus, Type } from 'lucide-react'
import { getModelAttributes } from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import { ProviderLogo } from '../../shared'

/**
 * Model configuration interface
 */
export interface ModelConfig {
  code: string
  displayName: string
  description?: string
}

/**
 * Props for ModelSection component
 */
export interface ModelSectionProps {
  /** Configured models (OpenRouter) */
  configuredModels: ModelConfig[]
  /** Perplexity models */
  perplexityModels: ModelConfig[]
  /** Gemini models */
  geminiModels: ModelConfig[]
  /** Groq models */
  groqModels: ModelConfig[]
  /** MiniMax models */
  minimaxModels: ModelConfig[]
  /** Ollama models */
  ollamaModels: ModelConfig[]
  /** Callback when models change */
  onModelsChange: (models: ModelConfig[]) => void
  /** Currently selected title generation model */
  titleModel: string
  /** Callback when title model changes */
  onTitleModelChange: (model: string) => void
}

/**
 * ModelSection - Manages model catalog display and custom model addition
 */
export function ModelSection({
  configuredModels,
  perplexityModels,
  geminiModels,
  groqModels,
  minimaxModels,
  ollamaModels,
  onModelsChange,
  titleModel,
  onTitleModelChange
}: ModelSectionProps): React.ReactElement {
  // Model editing state
  const [newModelCode, setNewModelCode] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [newModelDescription, setNewModelDescription] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    openrouter: false,
    perplexity: false,
    gemini: false,
    groq: false,
    minimax: false,
    ollama: false
  })
  const [titleModelDropdownOpen, setTitleModelDropdownOpen] = useState(false)

  // Group all available models by provider for the title model selector
  const allModelsByProvider = useMemo(() => {
    const groups: Array<{ provider: string; providerKey: string; models: ModelConfig[] }> = []
    
    if (geminiModels.length > 0) {
      groups.push({ provider: 'Gemini', providerKey: 'gemini', models: geminiModels })
    }
    if (groqModels.length > 0) {
      groups.push({ provider: 'Groq', providerKey: 'groq', models: groqModels })
    }
    if (configuredModels.length > 0) {
      groups.push({ provider: 'OpenRouter', providerKey: 'openrouter', models: configuredModels })
    }
    if (perplexityModels.length > 0) {
      groups.push({ provider: 'Perplexity', providerKey: 'perplexity', models: perplexityModels })
    }
    if (minimaxModels.length > 0) {
      groups.push({ provider: 'MiniMax', providerKey: 'minimax', models: minimaxModels })
    }
    if (ollamaModels.length > 0) {
      groups.push({ provider: 'Ollama', providerKey: 'ollama', models: ollamaModels })
    }
    
    return groups
  }, [configuredModels, geminiModels, groqModels, minimaxModels, perplexityModels, ollamaModels])

  // Find the currently selected title model's display info
  const selectedTitleModel = useMemo(() => {
    for (const group of allModelsByProvider) {
      const found = group.models.find(m => m.code === titleModel)
      if (found) {
        return { ...found, provider: group.provider, providerKey: group.providerKey }
      }
    }
    // Default fallback
    return { code: titleModel, displayName: titleModel, provider: 'Unknown', providerKey: 'unknown' }
  }, [titleModel, allModelsByProvider])

  const toggleGroup = (provider: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [provider]: !prev[provider]
    }))
  }

  const addModel = () => {
    if (newModelCode && newModelName) {
      const updated = [...configuredModels, {
        code: newModelCode,
        displayName: newModelName,
        description: newModelDescription || undefined
      }]
      onModelsChange(updated)
      setNewModelCode('')
      setNewModelName('')
      setNewModelDescription('')
    }
  }

  const deleteModel = (index: number) => {
    const updated = configuredModels.filter((_, i) => i !== index)
    onModelsChange(updated)
  }

  const startEdit = (index: number) => {
    const model = configuredModels[index]
    setEditingIndex(index)
    setEditCode(model.code)
    setEditName(model.displayName)
    setEditDescription(model.description || '')
  }

  const saveEdit = () => {
    if (editingIndex !== null && editCode && editName) {
      const updated = [...configuredModels]
      updated[editingIndex] = {
        code: editCode,
        displayName: editName,
        description: editDescription || undefined
      }
      onModelsChange(updated)
      setEditingIndex(null)
    }
  }

  const renderModelList = (models: ModelConfig[], provider: string, isEditable: boolean = false) => {
    if (models.length === 0) {
      return (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
          No models available. {isEditable && 'Add a custom model below.'}
        </div>
      )
    }

    return models.map((model, index) => {
      const { icon, color } = getModelAttributes(model)
      const isEditing = isEditable && editingIndex === index

      return (
        <div
          key={`${provider}-${index}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderRadius: '8px',
            marginBottom: '4px',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            {React.cloneElement(icon as React.ReactElement<{ size?: number }>, { size: 18 })}
          </div>

          {isEditing ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={editCode}
                  onChange={e => setEditCode(e.target.value)}
                  className="setting-input-scira"
                  style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }}
                  placeholder="Code"
                />
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="setting-input-scira"
                  style={{ padding: '6px 10px', fontSize: '0.85rem', flex: 1 }}
                  placeholder="Name"
                />
              </div>
              <input
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="setting-input-scira"
                style={{ padding: '6px 10px', fontSize: '0.85rem', width: '100%' }}
                placeholder="Description (optional)"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={saveEdit}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: '#1a3a1a',
                    border: '1px solid #22c55e',
                    color: '#22c55e',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingIndex(null)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    background: 'transparent',
                    border: '1px solid #444',
                    color: '#888',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                  {removeEmojis(model.displayName)}
                </div>
                <div style={{ color: '#888', fontSize: '0.75rem', marginTop: '2px' }}>
                  {model.code}
                </div>
                {model.description && (
                  <div style={{ color: '#666', fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic' }}>
                    {model.description}
                  </div>
                )}
              </div>
              {isEditable && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(index) }}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: '#999999',
                      cursor: 'pointer',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.color = '#e0e0e0'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = '#999999'
                    }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteModel(index) }}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: '#999999',
                      cursor: 'pointer',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                      e.currentTarget.style.color = '#ef4444'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = '#999999'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )
    })
  }

  const renderProviderGroup = (
    provider: string,
    providerKey: string,
    models: ModelConfig[],
    isEditable: boolean = false
  ) => {
    const isCollapsed = collapsedGroups[providerKey]

    return (
      <Card
        className="settings-section-card"
        style={{
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: 12,
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          onClick={() => toggleGroup(providerKey)}
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--theme-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--theme-surface-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ProviderLogo provider={providerKey as any} size={18} />
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                {provider}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                {models.length} Models
              </div>
            </div>
          </div>
          <ChevronDown
            size={16}
            style={{
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
              color: 'var(--theme-text-muted)'
            }}
          />
        </div>

        {/* Model List */}
        {!isCollapsed && (
          <div style={{ padding: '8px' }}>
            {renderModelList(models, providerKey, isEditable)}
          </div>
        )}

        {/* Add New Model (only for OpenRouter) */}
        {isEditable && !isCollapsed && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Plus size={14} color="#00bcd4" />
              <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#e0e0e0' }}>
                Add Custom Model
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input
                value={newModelCode}
                onChange={e => setNewModelCode(e.target.value)}
                className="setting-input-scira"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  background: '#1B1913',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#fff'
                }}
                placeholder="Model ID"
              />
              <input
                value={newModelName}
                onChange={e => setNewModelName(e.target.value)}
                className="setting-input-scira"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  background: '#1B1913',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#fff'
                }}
                placeholder="Display Name"
              />
            </div>
            <input
              value={newModelDescription}
              onChange={e => setNewModelDescription(e.target.value)}
              className="setting-input-scira"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '0.85rem',
                background: '#1B1913',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
                marginBottom: 10
              }}
              placeholder="Description (optional)"
            />
            <button
              onClick={addModel}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'linear-gradient(90deg, #00bcd4, #0097a7)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                opacity: (!newModelCode || !newModelName) ? 0.5 : 1,
                pointerEvents: (!newModelCode || !newModelName) ? 'none' : 'auto',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              Add Model to Library
            </button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div style={{ padding: '32px' }}>
      <div className="page-header">
        <h2 className="page-title">Models</h2>
        <div className="page-subtitle">Configure your AI model catalog</div>
      </div>

      <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Title Generation Model Selector */}
        <Card
          className="settings-section-card"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-border)',
            borderRadius: 12,
            padding: '20px',
            overflow: 'visible'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Type size={18} color="var(--theme-accent)" />
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                Title Generation Model
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)', marginTop: '2px' }}>
                Select which model generates chat session titles
              </div>
            </div>
          </div>

          {/* Dropdown Selector */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setTitleModelDropdownOpen(!titleModelDropdownOpen)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'var(--theme-surface-hover)',
                border: '1px solid var(--theme-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--theme-accent)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--theme-border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ProviderLogo provider={selectedTitleModel.providerKey as any} size={16} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--theme-text-primary)' }}>
                    {removeEmojis(selectedTitleModel.displayName)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--theme-text-muted)' }}>
                    {selectedTitleModel.provider}
                  </div>
                </div>
              </div>
              <ChevronDown
                size={16}
                style={{
                  transform: titleModelDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  color: 'var(--theme-text-muted)'
                }}
              />
            </button>

            {/* Dropdown Menu */}
            {titleModelDropdownOpen && (
              <div
                className="absolute left-0 right-0 mt-1 z-[100] rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-lg"
                style={{
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}
              >
                <ScrollArea style={{ height: '300px' }}>
                  {allModelsByProvider.map(group => (
                    <div key={group.providerKey}>
                      {/* Provider Header */}
                      <div
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(0,0,0,0.2)',
                          borderBottom: '1px solid var(--theme-border)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <ProviderLogo provider={group.providerKey as any} size={14} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {group.provider}
                        </span>
                      </div>
                      {/* Models */}
                      {group.models.map((model, idx) => (
                        <div
                          key={`${group.providerKey}-${idx}`}
                          onClick={() => {
                            onTitleModelChange(model.code)
                            setTitleModelDropdownOpen(false)
                          }}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: model.code === titleModel ? 'rgba(0, 188, 212, 0.1)' : 'transparent',
                            borderLeft: model.code === titleModel ? '2px solid var(--theme-accent)' : '2px solid transparent',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => {
                            if (model.code !== titleModel) {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                            }
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = model.code === titleModel ? 'rgba(0, 188, 212, 0.1)' : 'transparent'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--theme-text-primary)' }}>
                              {removeEmojis(model.displayName)}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--theme-text-muted)' }}>
                              {model.code}
                            </div>
                          </div>
                          {model.code === titleModel && (
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--theme-accent)' }} />
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>
        </Card>

        {/* OpenRouter Models (editable) */}
        {renderProviderGroup('OpenRouter', 'openrouter', configuredModels, true)}

        {/* Perplexity Models */}
        {perplexityModels.length > 0 && renderProviderGroup('Perplexity', 'perplexity', perplexityModels)}

        {/* Gemini Models */}
        {geminiModels.length > 0 && renderProviderGroup('Gemini', 'gemini', geminiModels)}

        {/* Groq Models */}
        {groqModels.length > 0 && renderProviderGroup('Groq', 'groq', groqModels)}

        {/* MiniMax Models */}
        {minimaxModels.length > 0 && renderProviderGroup('MiniMax', 'minimax', minimaxModels)}

        {/* Ollama Models */}
        {ollamaModels.length > 0 && renderProviderGroup('Ollama', 'ollama', ollamaModels)}
      </div>
    </div>
  )
}

export default ModelSection
