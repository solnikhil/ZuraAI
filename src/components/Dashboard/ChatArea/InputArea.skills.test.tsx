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
        config: { mode: 'normal' },
      },
      testing: {
        enabled: false,
        config: { mode: 'website_smoke' },
      },
    },
    frostedPrompt: false,
    modelProvider: 'openrouter',
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

import InputArea from './InputArea'

describe('InputArea skills menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettings.settings.skills.testing.enabled = false
  })

  it('shows both Tavily and Testing in the chat skills menu', async () => {
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

    const quickActions = screen.getByRole('button', { name: /open quick actions/i })
    fireEvent.pointerDown(quickActions, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText('Skills'))

    expect(await screen.findByText('Tavily')).toBeInTheDocument()
    expect(await screen.findByText('Testing')).toBeInTheDocument()
    expect(screen.getByText(/chat workflow tests/i)).toBeInTheDocument()
  })

  it('toggles the testing skill from the chat skills menu', async () => {
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

    const quickActions = screen.getByRole('button', { name: /open quick actions/i })
    fireEvent.pointerDown(quickActions, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText('Skills'))
    fireEvent.click(await screen.findByText('Testing'))

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        skills: expect.objectContaining({
          testing: expect.objectContaining({ enabled: true }),
        }),
      })
    )
  })
})
