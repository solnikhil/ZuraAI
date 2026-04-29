import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillsSection } from './SkillsSection'
import { defaultSkillsSettings } from '../../../skills'

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <div />,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <button type="button" role="menuitem" onClick={onClick}>
      {children}
    </button>
  ),
}))

describe('SkillsSection', () => {
  it('renders skills list row with actions', () => {
    render(<SkillsSection skills={defaultSkillsSettings} onChange={vi.fn()} />)

    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Web Research')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more actions for web research/i })).toBeInTheDocument()
  })

  it('toggles disable from 3-dot actions menu', () => {
    const onChange = vi.fn()
    render(<SkillsSection skills={defaultSkillsSettings} onChange={onChange} />)

    const moreActions = screen.getByRole('button', { name: /more actions for web research/i })
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
})
