import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillsSection } from './SkillsSection'
import { defaultSkillsSettings } from '../../../skills'

describe('SkillsSection', () => {
  it('renders skills list row with actions', () => {
    render(<SkillsSection skills={defaultSkillsSettings} onChange={vi.fn()} />)

    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Tavily')).toBeInTheDocument()
    expect(screen.getByText('Testing')).toBeInTheDocument()
    expect(screen.getByText(/plain-english results/i)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more actions for tavily/i })).toBeInTheDocument()
  })

  it('toggles disable from 3-dot actions menu', () => {
    const onChange = vi.fn()
    render(<SkillsSection skills={defaultSkillsSettings} onChange={onChange} />)

    const moreActions = screen.getByRole('button', { name: /more actions for tavily/i })
    fireEvent.pointerDown(moreActions, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: /disable/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      skills: expect.objectContaining({
        web_research: expect.objectContaining({
          enabled: false,
        }),
      }),
    }))
  })

  it('keeps testing as a chat-only skill with no manual launcher', () => {
    render(
      <SkillsSection
        skills={{
          ...defaultSkillsSettings,
          testing: {
            enabled: true,
            config: { mode: 'website_smoke' },
          },
        }}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /run website smoke test/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Testing guidance')).toBeInTheDocument()
    expect(screen.getByText(/gather enough details in chat/i)).toBeInTheDocument()
  })
})
