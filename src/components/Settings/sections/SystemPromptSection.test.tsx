import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SystemPromptSection } from './SystemPromptSection'

describe('SystemPromptSection', () => {
  it('does not render the effective runtime prompt preview', () => {
    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        codeExecutionPrompt="Code prompt"
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Effective Runtime Prompt')).toBeNull()
    expect(screen.queryByRole('button', { name: /show effective prompt/i })).toBeNull()
  })

  it('renders prompts as read-only built-in defaults', () => {
    const onChange = vi.fn()

    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
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
})
