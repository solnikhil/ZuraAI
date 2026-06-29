import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SystemPromptSection } from './SystemPromptSection'

describe('SystemPromptSection', () => {
  it('renders the system prompt with the selected personality applied', () => {
    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        assistantPersonality="professional-engineer"
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        codeExecutionPrompt="Code prompt"
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /show system prompt/i }))

    expect(screen.getByDisplayValue(/Selected Personality/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Professional Engineer/i)).toBeInTheDocument()
  })

  it('renders prompts as read-only built-in defaults', () => {
    const onChange = vi.fn()

    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        assistantPersonality="professional-engineer"
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        codeExecutionPrompt="Code prompt"
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /show system prompt/i }))
    const editor = screen.getByDisplayValue(/ZuraAI/i)

    expect(editor).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /load default/i })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders the Reminders & Lookouts prompt viewer', () => {
    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        assistantPersonality="professional-engineer"
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        codeExecutionPrompt="Code prompt"
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /show reminders prompt/i }))

    expect(screen.getByDisplayValue(/Reminders & Lookouts Skill/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/scheduled_task_create/i)).toHaveAttribute('readonly')
  })

  it('renders the Command Center prompt viewer', () => {
    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        assistantPersonality="professional-engineer"
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        codeExecutionPrompt="Code prompt"
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /show command center prompt/i }))

    expect(screen.getByDisplayValue(/Command Center Extension/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/system_active_window/i)).toHaveAttribute('readonly')
  })
})
