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
    mockSettings.settings.assistantMode = 'chat'
  })

  it('shows assistant mode controls in the composer', () => {
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

    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /agent/i })).toBeInTheDocument()
  })

  it('switches to Agent mode from the composer control', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /agent/i }))

    expect(updateSettings).toHaveBeenCalledWith({ assistantMode: 'agent' })
  })
})
