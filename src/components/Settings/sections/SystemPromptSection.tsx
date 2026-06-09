/**
 * Read-only System Prompt section for Settings.
 */

import React, { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'
import { defaultSystemPrompt } from '../../../prompts/defaultSystemPrompt'
import { defaultWebSearchPrompt } from '../../../prompts/defaultWebSearchPrompt'
import { defaultTitleGenerationPrompt } from '../../../prompts/defaultTitleGenerationPrompt'
import { defaultCodeExecutionPrompt } from '../../../prompts/defaultCodeExecutionPrompt'
import { defaultComputerUsePrompt } from '../../../prompts/defaultComputerUsePrompt'
import { defaultChartGenerationPrompt } from '../../../prompts/defaultChartGenerationPrompt'
import { defaultMemoryPrompt } from '../../../prompts/defaultMemoryPrompt'
import {
  buildSelectedPersonalityPrompt,
  type AssistantPersonalityId,
} from '../../../prompts/assistantPersonalities'
import { estimateMessageTokens } from '../../../utils/tokenUtils'

export interface SystemPromptSectionProps {
  systemPrompt: string
  assistantPersonality?: AssistantPersonalityId
  webSearchPrompt: string
  titleGenerationPrompt: string
  codeExecutionPrompt: string
  computerUsePrompt?: string
  chartGenerationPrompt?: string
  memoryPrompt?: string
  onChange: (changes: {
    systemPrompt?: string
    webSearchPrompt?: string
    titleGenerationPrompt?: string
    codeExecutionPrompt?: string
    computerUsePrompt?: string
    chartGenerationPrompt?: string
    memoryPrompt?: string
  }) => void
}

interface PromptViewerCardProps {
  title: string
  description: React.ReactNode
  note: string
  value: string
  showLabel: string
  hideLabel: string
}

function PromptViewerCard({
  title,
  description,
  note,
  value,
  showLabel,
  hideLabel,
}: PromptViewerCardProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false)
  const tokenCount = useMemo(
    () => estimateMessageTokens({ role: 'system', content: value }),
    [value]
  )

  return (
    <Card className="settings-list-card settings-prompt-card">
      <div className="settings-prompt-header">
        <div className="settings-list-row__meta">
          <h3 className="settings-list-row__label">{title}</h3>
          <div className="settings-list-row__description">{description}</div>
          <div className="settings-prompt-note">{note}</div>
        </div>
        <div className="settings-prompt-metrics" aria-live="polite">
          <span className="settings-prompt-badge">{value.length.toLocaleString()} chars</span>
          <span className="settings-prompt-badge">
            ~{tokenCount.toLocaleString()} tokens input
          </span>
        </div>
      </div>

      <div className="settings-prompt-controls">
        <button
          type="button"
          className="settings-prompt-toggle"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          <ChevronDown
            size={14}
            className={`settings-prompt-toggle__icon ${isExpanded ? 'is-open' : ''}`}
            aria-hidden="true"
          />
          {isExpanded ? hideLabel : showLabel}
        </button>
      </div>

      {isExpanded && (
        <div className="settings-prompt-editor-wrap">
          <textarea
            value={value}
            readOnly
            aria-readonly="true"
            className="settings-prompt-editor"
          />
        </div>
      )}
    </Card>
  )
}

export function SystemPromptSection(props: SystemPromptSectionProps): React.ReactElement {
  const systemPromptPreview = useMemo(
    () => `${defaultSystemPrompt}\n\n${buildSelectedPersonalityPrompt(props.assistantPersonality)}`,
    [props.assistantPersonality]
  )

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">System Prompt</h2>
        <div className="page-subtitle">View the built-in prompts used by the assistant</div>
      </div>

      <PromptViewerCard
        title="System prompt"
        description="Built-in system prompt plus the selected assistant personality that shapes communication style."
        note="This prompt is managed in code and reflects the current app default plus your selected personality."
        value={systemPromptPreview}
        showLabel="Show System Prompt"
        hideLabel="Hide System Prompt"
      />

      <PromptViewerCard
        title="Web Search Prompt"
        description="Instructions appended when Tavily is enabled. Guides search depth and synthesis behavior."
        note="This only applies to sessions where Tavily is active."
        value={defaultWebSearchPrompt}
        showLabel="Show Web Search Prompt"
        hideLabel="Hide Web Search Prompt"
      />

      <PromptViewerCard
        title="Code Execution Prompt"
        description="Instructions appended when Code Execution is enabled. Guides how the assistant uses the code execution sandbox."
        note="This only applies when the Code Execution skill is active."
        value={defaultCodeExecutionPrompt}
        showLabel="Show Code Execution Prompt"
        hideLabel="Hide Code Execution Prompt"
      />

      <PromptViewerCard
        title="Computer Use Prompt"
        description="Instructions appended when Computer Use is enabled. Guides screenshots, clicks, typing, and desktop navigation."
        note="This only applies when the Computer Use skill is active."
        value={defaultComputerUsePrompt}
        showLabel="Show Computer Use Prompt"
        hideLabel="Hide Computer Use Prompt"
      />

      <PromptViewerCard
        title="Chart Generation Prompt"
        description="Instructions appended when Chart Generation is enabled. Guides Mermaid bar, line, and pie chart creation from data."
        note="This only applies when the Chart Generation skill is active."
        value={defaultChartGenerationPrompt}
        showLabel="Show Chart Generation Prompt"
        hideLabel="Hide Chart Generation Prompt"
      />

      <PromptViewerCard
        title="Memory Prompt"
        description={
          <>
            Instructions appended to the saved-memories block when the Memory skill is enabled.
            Guides how the assistant should use the injected memories to personalize replies.
          </>
        }
        note="This only applies when the Memory skill is active."
        value={defaultMemoryPrompt}
        showLabel="Show Memory Prompt"
        hideLabel="Hide Memory Prompt"
      />

      <PromptViewerCard
        title="Title Generation Prompt"
        description={
          <>
            Instructions used when auto-generating chat titles. Includes{' '}
            <code>{'{{userMessage}}'}</code> placement in the built-in template.
          </>
        }
        note="This prompt only affects session title generation, not assistant responses."
        value={defaultTitleGenerationPrompt}
        showLabel="Show Title Prompt"
        hideLabel="Hide Title Prompt"
      />
    </div>
  )
}

export default SystemPromptSection
