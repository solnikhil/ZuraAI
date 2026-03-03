import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillsSection } from './SkillsSection'
import { defaultSkillsSettings } from '../../../skills'

describe('SkillsSection', () => {
  it('renders skills list row with actions', () => {
    render(<SkillsSection skills={defaultSkillsSettings} onChange={vi.fn()} />)

    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Web Research')).toBeInTheDocument()
    expect(screen.getByText('Installed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more actions for web research/i })).toBeInTheDocument()
  })

  it('updates mode to structured from 3-dot actions menu', () => {
    const onChange = vi.fn()
    render(<SkillsSection skills={defaultSkillsSettings} onChange={onChange} />)

    const moreActions = screen.getByRole('button', { name: /more actions for web research/i })
    fireEvent.pointerDown(moreActions, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: /structured mode/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      skills: expect.objectContaining({
        web_research: expect.objectContaining({
          config: expect.objectContaining({ mode: 'structured' }),
        }),
      }),
    }))
  })
})
