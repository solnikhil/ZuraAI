import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateSettings = vi.fn()

const mockSettings = {
  settings: {
    skills: {
      web_research: {
        enabled: true,
      },
      computer_use: {
        enabled: false,
      },
      chart_generation: {
        enabled: false,
      },
      memory: {
        enabled: true,
        config: { autoManage: true },
      },
      code_execution: {
        enabled: false,
      },
    },
    modelProvider: 'openrouter',
    assistantMode: 'chat',
  },
  updateSettings,
}

vi.mock('../../../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

vi.mock('@/hooks/useAutoResizeTextarea', () => ({
  useAutoResizeTextarea: () => ({
    textareaRef: { current: null },
    adjustHeight: vi.fn(),
  }),
}))

vi.mock('./attachmentUtils', () => ({
  canAnalyzeImageAttachments: () => false,
  mergeAttachedFiles: (_existing: unknown[], incoming: unknown[]) => incoming,
  processFiles: vi.fn(async () => []),
  providerSupportsVisionUploads: () => false,
}))

vi.mock('../ModelSelector/index', () => ({
  default: () => <div>Model Selector</div>,
}))

vi.mock('./TokenUsageIndicator', () => ({
  TokenUsageIndicator: () => <div>Token Usage</div>,
}))

vi.mock('./ComposerAttachments', () => ({
  ComposerAttachments: () => <div>Composer Attachments</div>,
}))

vi.mock('@/utils/platform', () => ({
  isWindowsRuntime: () => true,
  isMacOSRuntime: () => false,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    onSelect,
  }: {
    children: React.ReactNode
    onClick?: () => void
    onSelect?: (event: { preventDefault: () => void }) => void
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onClick?.()
        onSelect?.({ preventDefault: () => undefined })
      }}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import InputArea from './InputArea'

describe('InputArea skills menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings.settings.skills.web_research.enabled = true
    mockSettings.settings.skills.computer_use.enabled = false
    mockSettings.settings.assistantMode = 'chat'
  })

  it('shows Agent Mode as the current-desktop control in the composer plus menu', () => {
    render(
      <InputArea
        input=""
        setInput={vi.fn()}
        onSend={vi.fn()}
        isLoading={false}
        attachedFiles={[]}
        onFilesChange={vi.fn()}
      />
    )

    expect(screen.getByText('Agent Mode')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /agent mode/i })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /control separate desktop/i })).not.toBeInTheDocument()
  })

  it('enables current-desktop control as the agent-mode desktop-control path', () => {
    render(
      <InputArea
        input=""
        setInput={vi.fn()}
        onSend={vi.fn()}
        isLoading={false}
        attachedFiles={[]}
        onFilesChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('switch', { name: /agent mode/i }))

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMode: 'agent',
        skills: expect.objectContaining({
          computer_use: expect.objectContaining({ enabled: true }),
        }),
      })
    )
  })
})
