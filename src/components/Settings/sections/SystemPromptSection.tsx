/**
 * SystemPromptSection component for Settings
 * Manages the AI system prompt configuration
 *
 * @module SystemPromptSection
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { defaultSystemPrompt } from '../../../prompts/defaultSystemPrompt'
import { defaultWebSearchPrompt } from '../../../prompts/defaultWebSearchPrompt'
import { estimateMessageTokens } from '../../../utils/tokenUtils'

/**
 * Props for SystemPromptSection component
 */
export interface SystemPromptSectionProps {
  /** Current system prompt value */
  systemPrompt: string
  /** Current web search prompt value */
  webSearchPrompt: string
  /** Callback when system prompt changes */
  onChange: (changes: { systemPrompt?: string; webSearchPrompt?: string }) => void
}

/**
 * SystemPromptSection - Allows users to configure the AI's system prompt
 */
export function SystemPromptSection({
  systemPrompt,
  webSearchPrompt,
  onChange
}: SystemPromptSectionProps): React.ReactElement {
  const [isDirtySystem, setIsDirtySystem] = useState(false)
  const [isDirtyWebSearch, setIsDirtyWebSearch] = useState(false)
  const [localValue, setLocalValue] = useState(systemPrompt)
  const [localWebSearchValue, setLocalWebSearchValue] = useState(webSearchPrompt)
  const [charCount, setCharCount] = useState(systemPrompt.length)
  const [charCountWebSearch, setCharCountWebSearch] = useState(webSearchPrompt.length)

  const isDirty = isDirtySystem || isDirtyWebSearch

  // Sync local state when prop changes, but not while user has unsaved edits
  useEffect(() => {
    if (!isDirtySystem) {
      setLocalValue(systemPrompt)
      setCharCount(systemPrompt.length)
    }
  }, [systemPrompt, isDirtySystem])

  useEffect(() => {
    if (!isDirtyWebSearch) {
      setLocalWebSearchValue(webSearchPrompt)
      setCharCountWebSearch(webSearchPrompt.length)
    }
  }, [webSearchPrompt, isDirtyWebSearch])

  const handleChange = (value: string) => {
    setLocalValue(value)
    setCharCount(value.length)
    setIsDirtySystem(true)
  }

  const handleWebSearchChange = (value: string) => {
    setLocalWebSearchValue(value)
    setCharCountWebSearch(value.length)
    setIsDirtyWebSearch(true)
  }

  const handleSave = () => {
    const changes: { systemPrompt?: string; webSearchPrompt?: string } = {}
    if (isDirtySystem) changes.systemPrompt = localValue
    if (isDirtyWebSearch) changes.webSearchPrompt = localWebSearchValue
    onChange(changes)
    setIsDirtySystem(false)
    setIsDirtyWebSearch(false)
  }

  const handleReset = () => {
    setLocalValue(defaultSystemPrompt)
    setCharCount(defaultSystemPrompt.length)
    setIsDirtySystem(true)
  }

  const handleWebSearchReset = () => {
    setLocalWebSearchValue(defaultWebSearchPrompt)
    setCharCountWebSearch(defaultWebSearchPrompt.length)
    setIsDirtyWebSearch(true)
  }

  const handleCancel = () => {
    setLocalValue(systemPrompt)
    setCharCount(systemPrompt.length)
    setLocalWebSearchValue(webSearchPrompt)
    setCharCountWebSearch(webSearchPrompt.length)
    setIsDirtySystem(false)
    setIsDirtyWebSearch(false)
  }

  const estTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localValue }),
    [localValue]
  )

  const estTokensWebSearch = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localWebSearchValue }),
    [localWebSearchValue]
  )

  return (
    <div style={{ padding: '32px', paddingBottom: 100 }}>
      <div className="page-header">
        <h2 className="page-title">System Prompt</h2>
        <div className="page-subtitle">Customize how the AI assistant behaves and responds</div>
      </div>

      {/* System Prompt Editor */}
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
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--theme-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>
              AI Behavior & Instructions
            </h3>
            <div className="section-desc">
              Define the system prompt that shapes the AI's personality, capabilities, and guidelines
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: '0.8rem',
                color: 'var(--theme-text-muted)',
                lineHeight: 1.5
              }}
            >
              When Web Search is enabled, web search instructions are appended at the end of this basic prompt.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: '0.75rem',
              color: 'var(--theme-text-muted)'
            }}
          >
            <span
              style={{
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 6
              }}
            >
              {charCount.toLocaleString()} chars
            </span>
            <span
              style={{
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 6
              }}
            >
              ~{estTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        {/* Editor Area */}
        <div style={{ padding: '20px 24px' }}>
          <textarea
            value={localValue}
            onChange={e => handleChange(e.target.value)}
            className="setting-input-scira"
            style={{
              width: '100%',
              minHeight: '400px',
              padding: '16px',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 8,
              color: 'var(--theme-text-primary)',
              resize: 'vertical',
              transition: 'border-color 0.2s ease'
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--theme-accent)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--theme-border)'
            }}
            placeholder="Enter your system prompt here..."
          />

          {/* Character count bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
              {charCount > 10000 && (
                <span style={{ color: '#f59e0b' }}>
                  Note: Very long system prompts may impact response quality
                </span>
              )}
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleReset}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-text-secondary)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--theme-accent)'
                  e.currentTarget.style.color = 'var(--theme-accent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--theme-border)'
                  e.currentTarget.style.color = 'var(--theme-text-secondary)'
                }}
              >
                Load Default Prompt
              </button>
            </div>
          </div>
        </div>

        {/* Action Footer - shared when either card is dirty */}
        {isDirty && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--theme-border)',
              background: 'rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12
            }}
          >
            <span
              style={{
                fontSize: '0.85rem',
                color: 'var(--theme-text-muted)',
                marginRight: 'auto'
              }}
            >
              You have unsaved changes
            </span>
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--theme-border)',
                color: 'var(--theme-text-secondary)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 20px',
                background: 'var(--theme-accent)',
                border: 'none',
                color: '#fff',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 188, 212, 0.3)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              Save Changes
            </button>
          </div>
        )}
      </Card>

      {/* Web Search Prompt Editor */}
      <Card
        className="settings-section-card"
        style={{
          marginTop: 24,
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: 12,
          padding: 0,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--theme-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <h3 className="section-head" style={{ marginBottom: 4 }}>
              Web Search Prompt
            </h3>
            <div className="section-desc">
              Instructions appended when Web Search is enabled
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: '0.8rem',
                color: 'var(--theme-text-muted)',
                lineHeight: 1.5
              }}
            >
              This prompt is appended at the end of the basic system prompt when Web Search is enabled.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: '0.75rem',
              color: 'var(--theme-text-muted)'
            }}
          >
            <span
              style={{
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 6
              }}
            >
              {charCountWebSearch.toLocaleString()} chars
            </span>
            <span
              style={{
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 6
              }}
            >
              ~{estTokensWebSearch.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <textarea
            value={localWebSearchValue}
            onChange={e => handleWebSearchChange(e.target.value)}
            className="setting-input-scira"
            style={{
              width: '100%',
              minHeight: '280px',
              padding: '16px',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-border)',
              borderRadius: 8,
              color: 'var(--theme-text-primary)',
              resize: 'vertical',
              transition: 'border-color 0.2s ease'
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--theme-accent)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--theme-border)'
            }}
            placeholder="Enter web search instructions here..."
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-muted)' }}>
              {charCountWebSearch > 5000 && (
                <span style={{ color: '#f59e0b' }}>
                  Note: Very long prompts may impact response quality
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleWebSearchReset}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-text-secondary)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--theme-accent)'
                  e.currentTarget.style.color = 'var(--theme-accent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--theme-border)'
                  e.currentTarget.style.color = 'var(--theme-text-secondary)'
                }}
              >
                Load Default Prompt
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SystemPromptSection
