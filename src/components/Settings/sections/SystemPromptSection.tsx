/**
 * SystemPromptSection component for Settings
 * Manages the AI system prompt configuration
 *
 * @module SystemPromptSection
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { defaultSystemPrompt } from '../../../prompts/defaultSystemPrompt'
import { estimateMessageTokens } from '../../../utils/tokenUtils'

/**
 * Props for SystemPromptSection component
 */
export interface SystemPromptSectionProps {
  /** Current system prompt value */
  systemPrompt: string
  /** Callback when system prompt changes */
  onChange: (changes: { systemPrompt?: string }) => void
}

/**
 * SystemPromptSection - Allows users to configure the AI's system prompt
 */
export function SystemPromptSection({
  systemPrompt,
  onChange
}: SystemPromptSectionProps): React.ReactElement {
  const [localValue, setLocalValue] = useState(systemPrompt)
  const [charCount, setCharCount] = useState(systemPrompt.length)

  // Sync local state when props change (e.g. discard/reset from parent settings bar)
  useEffect(() => {
    if (systemPrompt !== localValue) {
      setLocalValue(systemPrompt)
      setCharCount(systemPrompt.length)
    }
  }, [systemPrompt, localValue])

  const handleChange = (value: string) => {
    setLocalValue(value)
    setCharCount(value.length)
    onChange({ systemPrompt: value })
  }

  const handleReset = () => {
    setLocalValue(defaultSystemPrompt)
    setCharCount(defaultSystemPrompt.length)
    onChange({ systemPrompt: defaultSystemPrompt })
  }

  const estTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localValue }),
    [localValue]
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
              Keep this concise and policy-focused. Skill behavior is managed from the Skills section.
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

      </Card>
    </div>
  )
}

export default SystemPromptSection
