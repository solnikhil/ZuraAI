/**
 * SystemPromptSection component for Settings
 * Manages the AI system prompt configuration
 *
 */

import React, { useState, useEffect, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'
import { defaultSystemPrompt } from '../../../prompts/defaultSystemPrompt'
import { defaultWebSearchPrompt } from '../../../prompts/defaultWebSearchPrompt'
import { defaultTitleGenerationPrompt } from '../../../prompts/defaultTitleGenerationPrompt'
import type { SkillsSettings } from '@/skills'
import { buildEnabledSkillsPrompt } from '@/skills'
import { getEffectiveSystemPrompt } from '@/utils/promptSelection'
import { estimateMessageTokens } from '../../../utils/tokenUtils'

/**
 * Props for SystemPromptSection component
 */
export interface SystemPromptSectionProps {
  /** Current system prompt value */
  systemPrompt: string
  /** Current skills config */
  skills: SkillsSettings
  /** Current web search prompt value */
  webSearchPrompt: string
  /** Current title generation prompt value */
  titleGenerationPrompt: string
  /** Callback when system prompt changes */
  onChange: (changes: {
    systemPrompt?: string
    webSearchPrompt?: string
    titleGenerationPrompt?: string
  }) => void
}

/**
 * SystemPromptSection - Allows users to configure the AI's system prompt
 */
export function SystemPromptSection({
  systemPrompt,
  skills,
  webSearchPrompt,
  titleGenerationPrompt,
  onChange,
}: SystemPromptSectionProps): React.ReactElement {
  const [localValue, setLocalValue] = useState(systemPrompt)
  const [charCount, setCharCount] = useState(systemPrompt.length)
  const [isEditorExpanded, setIsEditorExpanded] = useState(false)
  const [localWebSearchValue, setLocalWebSearchValue] = useState(webSearchPrompt)
  const [webSearchCharCount, setWebSearchCharCount] = useState(webSearchPrompt.length)
  const [isWebSearchEditorExpanded, setIsWebSearchEditorExpanded] = useState(false)
  const [localTitleGenerationValue, setLocalTitleGenerationValue] = useState(titleGenerationPrompt)
  const [titleGenerationCharCount, setTitleGenerationCharCount] = useState(
    titleGenerationPrompt.length
  )
  const [isTitleGenerationEditorExpanded, setIsTitleGenerationEditorExpanded] = useState(false)
  const [isEffectivePromptExpanded, setIsEffectivePromptExpanded] = useState(false)

  // Sync local state when props change (e.g. discard/reset from parent settings bar)
  useEffect(() => {
    if (systemPrompt !== localValue) {
      setLocalValue(systemPrompt)
      setCharCount(systemPrompt.length)
    }
  }, [systemPrompt, localValue])

  useEffect(() => {
    if (webSearchPrompt !== localWebSearchValue) {
      setLocalWebSearchValue(webSearchPrompt)
      setWebSearchCharCount(webSearchPrompt.length)
    }
  }, [webSearchPrompt, localWebSearchValue])

  useEffect(() => {
    if (titleGenerationPrompt !== localTitleGenerationValue) {
      setLocalTitleGenerationValue(titleGenerationPrompt)
      setTitleGenerationCharCount(titleGenerationPrompt.length)
    }
  }, [titleGenerationPrompt, localTitleGenerationValue])

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

  const handleWebSearchChange = (value: string) => {
    setLocalWebSearchValue(value)
    setWebSearchCharCount(value.length)
    onChange({ webSearchPrompt: value })
  }

  const handleWebSearchReset = () => {
    setLocalWebSearchValue(defaultWebSearchPrompt)
    setWebSearchCharCount(defaultWebSearchPrompt.length)
    onChange({ webSearchPrompt: defaultWebSearchPrompt })
  }

  const handleTitleGenerationChange = (value: string) => {
    setLocalTitleGenerationValue(value)
    setTitleGenerationCharCount(value.length)
    onChange({ titleGenerationPrompt: value })
  }

  const handleTitleGenerationReset = () => {
    setLocalTitleGenerationValue(defaultTitleGenerationPrompt)
    setTitleGenerationCharCount(defaultTitleGenerationPrompt.length)
    onChange({ titleGenerationPrompt: defaultTitleGenerationPrompt })
  }

  const estTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localValue }),
    [localValue]
  )

  const estWebSearchTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localWebSearchValue }),
    [localWebSearchValue]
  )

  const estTitleGenerationTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localTitleGenerationValue }),
    [localTitleGenerationValue]
  )

  const enabledSkillsPrompt = useMemo(() => buildEnabledSkillsPrompt(skills), [skills])
  const effectiveSystemPrompt = useMemo(
    () => getEffectiveSystemPrompt({ systemPrompt: localValue, skills }),
    [localValue, skills]
  )
  const effectivePromptTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: effectiveSystemPrompt }),
    [effectiveSystemPrompt]
  )

  const showLengthWarning = charCount > 10000

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">System Prompt</h2>
        <div className="page-subtitle">Customize how the AI assistant behaves and responds</div>
      </div>

      <Card className="settings-list-card settings-prompt-card settings-prompt-card--effective">
        <div className="settings-prompt-header settings-prompt-header--effective">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Effective Runtime Prompt</h3>
            <div className="settings-list-row__description">
              Preview the actual system prompt sent at runtime after enabled skill instructions are appended.
            </div>
            <div className="settings-prompt-note settings-prompt-note--effective">
              This is read-only. Edit the base prompt below or change skills in the Skills section.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge settings-prompt-badge--effective">
              {effectiveSystemPrompt.length.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge settings-prompt-badge--effective">
              ~{effectivePromptTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        {enabledSkillsPrompt && (
          <div className="settings-prompt-preview-note settings-prompt-preview-note--effective">
            Skill instructions are currently being appended from enabled skills.
          </div>
        )}

        <div className="settings-prompt-controls settings-prompt-controls--effective">
          <button
            type="button"
            className="settings-prompt-toggle settings-prompt-toggle--effective"
            onClick={() => setIsEffectivePromptExpanded((prev) => !prev)}
            aria-expanded={isEffectivePromptExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isEffectivePromptExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isEffectivePromptExpanded ? 'Hide Effective Prompt' : 'Show Effective Prompt'}
          </button>
        </div>

        {isEffectivePromptExpanded && (
          <>
            {enabledSkillsPrompt && (
              <div className="settings-prompt-skills-block settings-prompt-skills-block--effective">
                <div className="settings-prompt-skills-block__label">Appended Skill Instructions</div>
                <pre className="settings-prompt-preview settings-prompt-preview--effective">{enabledSkillsPrompt}</pre>
              </div>
            )}

            <div className="settings-prompt-editor-wrap settings-prompt-editor-wrap--effective">
              <textarea
                value={effectiveSystemPrompt}
                readOnly
                className="settings-prompt-editor settings-prompt-editor--readonly settings-prompt-editor--effective"
                aria-label="Effective runtime prompt preview"
              />
            </div>
          </>
        )}
      </Card>

      <Card className="settings-list-card settings-prompt-card">
        <div className="settings-prompt-header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">System prompt</h3>
            <div className="settings-list-row__description">
              Define the system prompt that shapes the assistant personality, capabilities, and
              response policy.
            </div>
            <div className="settings-prompt-note">
              Keep this concise and policy-focused. Skill behavior is managed from the Skills
              section.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">{charCount.toLocaleString()} chars</span>
            <span className="settings-prompt-badge">
              ~{estTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-controls">
          <button
            type="button"
            className="settings-prompt-toggle"
            onClick={() => setIsEditorExpanded((prev) => !prev)}
            aria-expanded={isEditorExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isEditorExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isEditorExpanded ? 'Hide System Prompt' : 'Show System Prompt'}
          </button>
          <button type="button" onClick={handleReset} className="settings-row-button">
            Load Default Prompt
          </button>
        </div>

        {isEditorExpanded && (
          <>
            <div className="settings-prompt-editor-wrap">
              <textarea
                value={localValue}
                onChange={(e) => handleChange(e.target.value)}
                className="settings-prompt-editor"
                placeholder="Enter your system prompt here..."
              />
            </div>

            <div className="settings-prompt-footer">
              <div className="settings-prompt-warning" role="status" aria-live="polite">
                {showLengthWarning
                  ? 'Note: Very long system prompts may impact response quality.'
                  : ''}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="settings-list-card settings-prompt-card">
        <div className="settings-prompt-header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Web Search Prompt</h3>
            <div className="settings-list-row__description">
              Instructions appended when Tavily is enabled. Use this to guide search depth and
              synthesis behavior.
            </div>
            <div className="settings-prompt-note">
              This only applies to sessions where Tavily is active.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">
              {webSearchCharCount.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge">
              ~{estWebSearchTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-controls">
          <button
            type="button"
            className="settings-prompt-toggle"
            onClick={() => setIsWebSearchEditorExpanded((prev) => !prev)}
            aria-expanded={isWebSearchEditorExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isWebSearchEditorExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isWebSearchEditorExpanded ? 'Hide Web Search Prompt' : 'Show Web Search Prompt'}
          </button>
          <button type="button" onClick={handleWebSearchReset} className="settings-row-button">
            Load Default Web Search Prompt
          </button>
        </div>

        {isWebSearchEditorExpanded && (
          <>
            <div className="settings-prompt-editor-wrap">
              <textarea
                value={localWebSearchValue}
                onChange={(e) => handleWebSearchChange(e.target.value)}
                className="settings-prompt-editor"
                placeholder="Enter your web search prompt here..."
              />
            </div>
          </>
        )}
      </Card>

      <Card className="settings-list-card settings-prompt-card">
        <div className="settings-prompt-header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Title Generation Prompt</h3>
            <div className="settings-list-row__description">
              Instructions used when auto-generating chat titles. Include{' '}
              <code>{'{{userMessage}}'}</code> to control where the first user message is inserted.
            </div>
            <div className="settings-prompt-note">
              This prompt only affects session title generation, not assistant responses.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">
              {titleGenerationCharCount.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge">
              ~{estTitleGenerationTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-controls">
          <button
            type="button"
            className="settings-prompt-toggle"
            onClick={() => setIsTitleGenerationEditorExpanded((prev) => !prev)}
            aria-expanded={isTitleGenerationEditorExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isTitleGenerationEditorExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isTitleGenerationEditorExpanded ? 'Hide Title Prompt' : 'Show Title Prompt'}
          </button>
          <button
            type="button"
            onClick={handleTitleGenerationReset}
            className="settings-row-button"
          >
            Load Default Title Prompt
          </button>
        </div>

        {isTitleGenerationEditorExpanded && (
          <div className="settings-prompt-editor-wrap">
            <textarea
              value={localTitleGenerationValue}
              onChange={(e) => handleTitleGenerationChange(e.target.value)}
              className="settings-prompt-editor"
              placeholder="Enter your title generation prompt here..."
            />
          </div>
        )}
      </Card>
    </div>
  )
}

export default SystemPromptSection
