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
  it('renders grouped skills catalog with actions', () => {
    render(<SkillsSection skills={defaultSkillsSettings} onChange={vi.fn()} />)

    expect(screen.getByText('Skills')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Web Research')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable web research/i })).toBeInTheDocument()
  })

  it('toggles disable from skill action', () => {
    const onChange = vi.fn()
    render(<SkillsSection skills={defaultSkillsSettings} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /disable web research/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      skills: expect.objectContaining({
        web_research: expect.objectContaining({
          enabled: false,
        }),
      }),
    }))
  })
})
