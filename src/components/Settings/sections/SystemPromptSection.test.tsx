import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SystemPromptSection } from './SystemPromptSection'
import { defaultSkillsSettings } from '../../../skills'

describe('SystemPromptSection', () => {
  it('shows the effective runtime prompt with appended skill instructions', () => {
    render(
      <SystemPromptSection
        systemPrompt="Base prompt"
        skills={defaultSkillsSettings}
        webSearchPrompt="Web prompt"
        titleGenerationPrompt="Title prompt"
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /show effective prompt/i }))

    const effectivePromptPreview = screen.getByLabelText(
      'Effective runtime prompt preview'
    ) as HTMLTextAreaElement

    expect(screen.getByText('Appended Skill Instructions')).toBeInTheDocument()
    expect(screen.getByText(/Skill instructions are currently being appended/i)).toBeInTheDocument()
    expect(effectivePromptPreview.value).toContain('Base prompt')
    expect(effectivePromptPreview.value).toContain('Tavily (`web_research`)')
  })
})
