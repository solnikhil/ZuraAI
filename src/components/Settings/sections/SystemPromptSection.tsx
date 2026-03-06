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

  const showLengthWarning = charCount > 10000

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">System Prompt</h2>
        <div className="page-subtitle">Customize how the AI assistant behaves and responds</div>
      </div>

      <Card className="settings-list-card settings-prompt-card">
        <div className="settings-prompt-header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">AI Behavior & Instructions</h3>
            <div className="settings-list-row__description">
              Define the system prompt that shapes the assistant personality, capabilities, and response policy.
            </div>
            <div className="settings-prompt-note">
              Keep this concise and policy-focused. Skill behavior is managed from the Skills section.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">
              {charCount.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge">
              ~{estTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-editor-wrap">
          <textarea
            value={localValue}
            onChange={e => handleChange(e.target.value)}
            className="settings-prompt-editor"
            placeholder="Enter your system prompt here..."
          />
        </div>

        <div className="settings-prompt-footer">
          <div className="settings-prompt-warning" role="status" aria-live="polite">
            {showLengthWarning ? 'Note: Very long system prompts may impact response quality.' : ''}
          </div>
          <button type="button" onClick={handleReset} className="settings-row-button">
            Load Default Prompt
          </button>
        </div>
      </Card>
    </div>
  )
}

export default SystemPromptSection
