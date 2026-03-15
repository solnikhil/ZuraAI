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
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Effective Runtime Prompt')).toBeNull()
    expect(screen.queryByRole('button', { name: /show effective prompt/i })).toBeNull()
  })

  it('still allows editing the base system prompt', () => {
    const onChange = vi.fn()

    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /show system prompt/i }))
    fireEvent.change(screen.getByPlaceholderText(/enter your system prompt here/i), {
      target: { value: 'Updated prompt' },
    })

    expect(onChange).toHaveBeenCalledWith({ systemPrompt: 'Updated prompt' })
  })
})
