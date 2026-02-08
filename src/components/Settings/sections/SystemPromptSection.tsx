/**
 * SystemPromptSection component for Settings
 * Manages the AI system prompt configuration
 *
 * @module SystemPromptSection
 */

import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { defaultSystemPrompt } from '../../../prompts/defaultSystemPrompt'

/**
 * Props for SystemPromptSection component
 */
export interface SystemPromptSectionProps {
  /** Current system prompt value */
  systemPrompt: string
  /** Callback when system prompt changes */
  onChange: (changes: { systemPrompt: string }) => void
}

/**
 * SystemPromptSection - Allows users to configure the AI's system prompt
 */
export function SystemPromptSection({
  systemPrompt,
  onChange
}: SystemPromptSectionProps): React.ReactElement {
  const [isDirty, setIsDirty] = useState(false)
  const [localValue, setLocalValue] = useState(systemPrompt)
  const [charCount, setCharCount] = useState(systemPrompt.length)

  const handleChange = (value: string) => {
    setLocalValue(value)
    setCharCount(value.length)
    setIsDirty(true)
  }

  const handleSave = () => {
    onChange({ systemPrompt: localValue })
    setIsDirty(false)
  }

  const handleReset = () => {
    setLocalValue(defaultSystemPrompt)
    setCharCount(defaultSystemPrompt.length)
    setIsDirty(true)
  }

  const handleCancel = () => {
    setLocalValue(systemPrompt)
    setCharCount(systemPrompt.length)
    setIsDirty(false)
  }

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
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--theme-text-muted)',
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 6
            }}
          >
            {charCount.toLocaleString()} characters
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
              background: '#1B1913',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: 'var(--theme-text-primary)',
              resize: 'vertical',
              transition: 'border-color 0.2s ease'
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--theme-accent)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'rgba(255,255,255,0.1)'
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

        {/* Action Footer */}
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

      {/* Tips Section */}
      <Card
        className="settings-section-card"
        style={{
          marginTop: 24,
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: 12,
          padding: '20px 24px'
        }}
      >
        <h3 className="section-head" style={{ marginBottom: 12 }}>
          Tips for Effective System Prompts
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16
          }}
        >
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'rgba(0, 188, 212, 0.08)',
              border: '1px solid rgba(0, 188, 212, 0.15)'
            }}
          >
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--theme-accent)',
                marginBottom: 6
              }}
            >
              Be Specific
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)' }}>
              Clearly define the AI's role, expertise, and boundaries to get more relevant responses.
            </div>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.15)'
            }}
          >
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#22c55e',
                marginBottom: 6
              }}
            >
              Define Style
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)' }}>
              Specify desired tone, formatting preferences, and communication style.
            </div>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.15)'
            }}
          >
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#a855f7',
                marginBottom: 6
              }}
            >
              Set Constraints
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)' }}>
              Define what the AI should and shouldn't do, including safety guidelines.
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SystemPromptSection
