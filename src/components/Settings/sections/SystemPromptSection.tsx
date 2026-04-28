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
import { defaultCodeExecutionPrompt } from '../../../prompts/defaultCodeExecutionPrompt'
import { defaultComputerUsePrompt } from '../../../prompts/defaultComputerUsePrompt'
import { defaultChartGenerationPrompt } from '../../../prompts/defaultChartGenerationPrompt'
import { estimateMessageTokens } from '../../../utils/tokenUtils'

/**
 * Props for SystemPromptSection component
 */
export interface SystemPromptSectionProps {
  /** Current system prompt value */
  systemPrompt: string
  /** Current web search prompt value */
  webSearchPrompt: string
  /** Current title generation prompt value */
  titleGenerationPrompt: string
  /** Current code execution prompt value */
  codeExecutionPrompt: string
  /** Current computer use prompt value */
  computerUsePrompt?: string
  /** Current chart generation prompt value */
  chartGenerationPrompt?: string
  /** Callback when system prompt changes */
  onChange: (changes: {
    systemPrompt?: string
    webSearchPrompt?: string
    titleGenerationPrompt?: string
    codeExecutionPrompt?: string
    computerUsePrompt?: string
    chartGenerationPrompt?: string
  }) => void
}

/**
 * SystemPromptSection - Allows users to configure the AI's system prompt
 */
export function SystemPromptSection({
  systemPrompt,
  webSearchPrompt,
  titleGenerationPrompt,
  codeExecutionPrompt,
  computerUsePrompt = defaultComputerUsePrompt,
  chartGenerationPrompt = defaultChartGenerationPrompt,
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
  const [localCodeExecutionValue, setLocalCodeExecutionValue] = useState(codeExecutionPrompt)
  const [codeExecutionCharCount, setCodeExecutionCharCount] = useState(codeExecutionPrompt.length)
  const [isCodeExecutionEditorExpanded, setIsCodeExecutionEditorExpanded] = useState(false)
  const [localComputerUseValue, setLocalComputerUseValue] = useState(computerUsePrompt)
  const [computerUseCharCount, setComputerUseCharCount] = useState(computerUsePrompt.length)
  const [isComputerUseEditorExpanded, setIsComputerUseEditorExpanded] = useState(false)
  const [localChartGenerationValue, setLocalChartGenerationValue] = useState(chartGenerationPrompt)
  const [chartGenerationCharCount, setChartGenerationCharCount] = useState(chartGenerationPrompt.length)
  const [isChartGenerationEditorExpanded, setIsChartGenerationEditorExpanded] = useState(false)

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

  useEffect(() => {
    if (codeExecutionPrompt !== localCodeExecutionValue) {
      setLocalCodeExecutionValue(codeExecutionPrompt)
      setCodeExecutionCharCount(codeExecutionPrompt.length)
    }
  }, [codeExecutionPrompt, localCodeExecutionValue])

  useEffect(() => {
    if (computerUsePrompt !== localComputerUseValue) {
      setLocalComputerUseValue(computerUsePrompt)
      setComputerUseCharCount(computerUsePrompt.length)
    }
  }, [computerUsePrompt, localComputerUseValue])

  useEffect(() => {
    if (chartGenerationPrompt !== localChartGenerationValue) {
      setLocalChartGenerationValue(chartGenerationPrompt)
      setChartGenerationCharCount(chartGenerationPrompt.length)
    }
  }, [chartGenerationPrompt, localChartGenerationValue])

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

  const handleCodeExecutionChange = (value: string) => {
    setLocalCodeExecutionValue(value)
    setCodeExecutionCharCount(value.length)
    onChange({ codeExecutionPrompt: value })
  }

  const handleCodeExecutionReset = () => {
    setLocalCodeExecutionValue(defaultCodeExecutionPrompt)
    setCodeExecutionCharCount(defaultCodeExecutionPrompt.length)
    onChange({ codeExecutionPrompt: defaultCodeExecutionPrompt })
  }

  const handleComputerUseChange = (value: string) => {
    setLocalComputerUseValue(value)
    setComputerUseCharCount(value.length)
    onChange({ computerUsePrompt: value })
  }

  const handleComputerUseReset = () => {
    setLocalComputerUseValue(defaultComputerUsePrompt)
    setComputerUseCharCount(defaultComputerUsePrompt.length)
    onChange({ computerUsePrompt: defaultComputerUsePrompt })
  }

  const handleChartGenerationChange = (value: string) => {
    setLocalChartGenerationValue(value)
    setChartGenerationCharCount(value.length)
    onChange({ chartGenerationPrompt: value })
  }

  const handleChartGenerationReset = () => {
    setLocalChartGenerationValue(defaultChartGenerationPrompt)
    setChartGenerationCharCount(defaultChartGenerationPrompt.length)
    onChange({ chartGenerationPrompt: defaultChartGenerationPrompt })
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

  const estCodeExecutionTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localCodeExecutionValue }),
    [localCodeExecutionValue]
  )

  const estComputerUseTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localComputerUseValue }),
    [localComputerUseValue]
  )

  const estChartGenerationTokensInput = useMemo(
    () => estimateMessageTokens({ role: 'system', content: localChartGenerationValue }),
    [localChartGenerationValue]
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
            <h3 className="settings-list-row__label">Code Execution Prompt</h3>
            <div className="settings-list-row__description">
              Instructions appended when Code Execution is enabled. Use this to guide how the
              assistant uses the code execution sandbox.
            </div>
            <div className="settings-prompt-note">
              This only applies when the Code Execution skill is active.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">
              {codeExecutionCharCount.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge">
              ~{estCodeExecutionTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-controls">
          <button
            type="button"
            className="settings-prompt-toggle"
            onClick={() => setIsCodeExecutionEditorExpanded((prev) => !prev)}
            aria-expanded={isCodeExecutionEditorExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isCodeExecutionEditorExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isCodeExecutionEditorExpanded ? 'Hide Code Execution Prompt' : 'Show Code Execution Prompt'}
          </button>
          <button type="button" onClick={handleCodeExecutionReset} className="settings-row-button">
            Load Default Code Execution Prompt
          </button>
        </div>

        {isCodeExecutionEditorExpanded && (
          <div className="settings-prompt-editor-wrap">
            <textarea
              value={localCodeExecutionValue}
              onChange={(e) => handleCodeExecutionChange(e.target.value)}
              className="settings-prompt-editor"
              placeholder="Enter your code execution prompt here..."
            />
          </div>
        )}
      </Card>

      <Card className="settings-list-card settings-prompt-card">
        <div className="settings-prompt-header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Computer Use Prompt</h3>
            <div className="settings-list-row__description">
              Instructions appended when Computer Use is enabled. Guides how the assistant
              takes screenshots, clicks, types, and navigates the desktop.
            </div>
            <div className="settings-prompt-note">
              This only applies when the Computer Use skill is active.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">
              {computerUseCharCount.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge">
              ~{estComputerUseTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-controls">
          <button
            type="button"
            className="settings-prompt-toggle"
            onClick={() => setIsComputerUseEditorExpanded((prev) => !prev)}
            aria-expanded={isComputerUseEditorExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isComputerUseEditorExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isComputerUseEditorExpanded ? 'Hide Computer Use Prompt' : 'Show Computer Use Prompt'}
          </button>
          <button type="button" onClick={handleComputerUseReset} className="settings-row-button">
            Load Default Computer Use Prompt
          </button>
        </div>

        {isComputerUseEditorExpanded && (
          <div className="settings-prompt-editor-wrap">
            <textarea
              value={localComputerUseValue}
              onChange={(e) => handleComputerUseChange(e.target.value)}
              className="settings-prompt-editor"
              placeholder="Enter your computer use prompt here..."
            />
          </div>
        )}
      </Card>


      <Card className="settings-list-card settings-prompt-card">
        <div className="settings-prompt-header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Chart Generation Prompt</h3>
            <div className="settings-list-row__description">
              Instructions appended when Chart Generation is enabled. Guides how the assistant
              creates Mermaid bar, line, and pie charts from data.
            </div>
            <div className="settings-prompt-note">
              This only applies when the Chart Generation skill is active.
            </div>
          </div>
          <div className="settings-prompt-metrics" aria-live="polite">
            <span className="settings-prompt-badge">
              {chartGenerationCharCount.toLocaleString()} chars
            </span>
            <span className="settings-prompt-badge">
              ~{estChartGenerationTokensInput.toLocaleString()} tokens input
            </span>
          </div>
        </div>

        <div className="settings-prompt-controls">
          <button
            type="button"
            className="settings-prompt-toggle"
            onClick={() => setIsChartGenerationEditorExpanded((prev) => !prev)}
            aria-expanded={isChartGenerationEditorExpanded}
          >
            <ChevronDown
              size={14}
              className={`settings-prompt-toggle__icon ${isChartGenerationEditorExpanded ? 'is-open' : ''}`}
              aria-hidden="true"
            />
            {isChartGenerationEditorExpanded ? 'Hide Chart Generation Prompt' : 'Show Chart Generation Prompt'}
          </button>
          <button type="button" onClick={handleChartGenerationReset} className="settings-row-button">
            Load Default Chart Generation Prompt
          </button>
        </div>

        {isChartGenerationEditorExpanded && (
          <div className="settings-prompt-editor-wrap">
            <textarea
              value={localChartGenerationValue}
              onChange={(e) => handleChartGenerationChange(e.target.value)}
              className="settings-prompt-editor"
              placeholder="Enter your chart generation prompt here..."
            />
          </div>
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
