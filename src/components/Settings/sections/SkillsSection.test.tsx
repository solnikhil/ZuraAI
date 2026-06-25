import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillsSection } from './SkillsSection'
import { defaultSkillsSettings, withTerminalEnabled } from '../../../skills'
import type { AgentSkillsSettings } from '@/agentSkills/types'

let isMac = false
vi.mock('@/utils/platform', () => ({
  isMacOSRuntime: () => isMac,
  isWindowsRuntime: () => !isMac,
}))

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
  DropdownMenuCheckboxItem: ({
    children,
    onCheckedChange,
  }: {
    children: React.ReactNode
    onCheckedChange?: () => void
  }) => (
    <button type="button" role="menuitemcheckbox" onClick={onCheckedChange}>
      {children}
    </button>
  ),
}))

const defaultAgentSkills: AgentSkillsSettings = {
  enabled: false,
  projectRoot: '',
  disabledSkillNames: [],
  catalog: [],
}

describe('SkillsSection', () => {
  beforeEach(() => {
    isMac = false
  })

  it('renders grouped extensions catalog with actions', () => {
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        agentSkills={defaultAgentSkills}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Extensions')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Web Research')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable web research/i })).toBeInTheDocument()
  })

  it('toggles disable from skill action', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        agentSkills={defaultAgentSkills}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /disable web research/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      skills: expect.objectContaining({
        web_research: expect.objectContaining({
          enabled: false,
        }),
      }),
    }))
  })

  it('renders the Terminal skill on Windows and toggles it on', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        agentSkills={defaultAgentSkills}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={onChange}
      />
    )

    expect(screen.getByText('Terminal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /enable terminal/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      skills: expect.objectContaining({
        terminal: expect.objectContaining({ enabled: true }),
      }),
    }))
  })

  it('hides the Terminal skill on macOS', () => {
    isMac = true
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        agentSkills={defaultAgentSkills}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
  })

  it('toggles terminal auto-approve from the skill menu when enabled', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={withTerminalEnabled(defaultSkillsSettings, true)}
        agentSkills={defaultAgentSkills}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /auto-approve execution/i }))

    expect(onChange).toHaveBeenCalledWith({ terminalAutoApprove: true })
  })
})
