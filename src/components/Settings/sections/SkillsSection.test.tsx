import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillsSection } from './SkillsSection'
import { defaultSkillsSettings, withTerminalEnabled } from '../../../skills'
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

vi.mock('./ExtensionConfigDialog', () => ({
  ExtensionConfigDialog: ({
    open,
    extensionId,
  }: {
    open: boolean
    extensionId: string | null
  }) =>
    open && extensionId ? (
      <div role="dialog" data-testid="extension-config-overlay">
        {extensionId}
      </div>
    ) : null,
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
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Extensions')).toBeInTheDocument()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
    expect(screen.getByText('Web Research')).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
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

  it('opens an extension config overlay from the row menu', () => {
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        settings={defaultSettingsConfig}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        emailNotifications={defaultSettingsConfig.emailNotifications}
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByRole('menuitem', { name: 'Configure' })[0])

    expect(screen.getByTestId('extension-config-overlay')).toBeInTheDocument()
    expect(screen.getByText('Extensions')).toBeInTheDocument()
  })

  it('renders the Terminal skill on Windows and toggles it on', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
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
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
  })

  it('renders the Overlay extension card on Windows and toggles it', () => {
    const onChange = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        overlay={defaultSettingsConfig.overlay}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={onChange}
      />
    )

    expect(screen.getByText('Overlay')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /enable overlay/i }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      overlay: expect.objectContaining({
        enabled: true,
      }),
    }))
  })

  it('hides the Overlay extension card on macOS', () => {
    isMac = true
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        overlay={defaultSettingsConfig.overlay}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        onChange={vi.fn()}
      />
    )

    expect(screen.queryByText('Overlay')).not.toBeInTheDocument()
  })

  it('opens overlay extension config from deep-link params', () => {
    const onConsumed = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        overlay={defaultSettingsConfig.overlay}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        initialExtension="overlay"
        onExtensionNavigationConsumed={onConsumed}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('extension-config-overlay')).toHaveTextContent('overlay')
    expect(onConsumed).toHaveBeenCalled()
  })

  it('opens memory extension config from deep-link params', () => {
    const onConsumed = vi.fn()
    render(
      <SkillsSection
        skills={defaultSkillsSettings}
        settings={defaultSettingsConfig}
        codeExecutionAutoApprove={false}
        terminalAutoApprove={false}
        computerUseAutoApprove={false}
        emailNotifications={defaultSettingsConfig.emailNotifications}
        initialExtension="memory"
        onExtensionNavigationConsumed={onConsumed}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('extension-config-overlay')).toHaveTextContent('memory')
    expect(onConsumed).toHaveBeenCalled()
  })
})