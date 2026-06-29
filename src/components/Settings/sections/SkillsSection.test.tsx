import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillsSection } from './SkillsSection'
import { defaultSkillsSettings } from '../../../skills'
import { defaultSettingsConfig } from '../../../contexts/SettingsConfigContext'

let isMac = false
vi.mock('@/utils/platform', () => ({
  isMacOSRuntime: () => isMac,
  isWindowsRuntime: () => !isMac,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

vi.mock('./ExtensionDetailSection', () => ({
  ExtensionDetailSection: ({ extensionId }: { extensionId: string }) => (
    <div data-testid="extension-detail-content">{extensionId}</div>
  ),
}))

describe('SkillsSection', () => {
  beforeEach(() => {
    isMac = false
  })

  it('renders grouped extensions catalog with actions', () => {
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onActiveExtensionChange={vi.fn()}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Extensions')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Web Research')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
    expect(screen.queryByText('Command Center')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /disable web research/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /more actions for/i }).length).toBeGreaterThan(0)
  })

  it('toggles disable from skill action', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onActiveExtensionChange={vi.fn()}
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

  it('opens an extension settings view when clicking the row', () => {
    const onActiveExtensionChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        settings={defaultSettingsConfig}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        emailNotifications={defaultSettingsConfig.emailNotifications}
        onActiveExtensionChange={onActiveExtensionChange}
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /open web research settings/i }))

    expect(onActiveExtensionChange).toHaveBeenCalledWith('web_research')
  })

  it('opens an extension settings view from the row menu', () => {
    const onActiveExtensionChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        settings={defaultSettingsConfig}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        emailNotifications={defaultSettingsConfig.emailNotifications}
        onActiveExtensionChange={onActiveExtensionChange}
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Configure' })[0])

    expect(onActiveExtensionChange).toHaveBeenCalledWith('web_research')
  })

  it('renders inline extension settings when activeExtension is set', () => {
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        settings={defaultSettingsConfig}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        emailNotifications={defaultSettingsConfig.emailNotifications}
        activeExtension="memory"
        onActiveExtensionChange={vi.fn()}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('extension-detail-view')).toBeInTheDocument()
    expect(screen.getByTestId('extension-detail-content')).toHaveTextContent('memory')
    expect(screen.getByRole('button', { name: /back to extensions/i })).toBeInTheDocument()
  })

  it('renders the Terminal skill on Windows and toggles it on', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onActiveExtensionChange={vi.fn()}
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
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onActiveExtensionChange={vi.fn()}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
  })

  it('returns to the catalog from inline extension settings', () => {
    const onActiveExtensionChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        activeExtension="memory"
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onActiveExtensionChange={onActiveExtensionChange}
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /back to extensions/i }))

    expect(onActiveExtensionChange).toHaveBeenCalledWith(null)
  })
})
