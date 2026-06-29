import React from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CommandCenterSettingsSync from './CommandCenterSettingsSync'

const queueMessage = vi.fn()
const updateSettings = vi.fn()
const setExtensionEnabled = vi.fn(async () => ({
  enabled: true,
  shortcut: 'CommandOrControl+Shift+Space',
  shortcutRegistered: true,
}))
let assistantMode: 'chat' | 'agent' = 'chat'
let commandCallback: ((command: {
  text: string
  receivedAt: number
  activeWindow?: { hwnd?: number; title?: string; processName?: string }
}) => void) | null = null

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      skills: {
        web_research: { enabled: true },
        code_execution: { enabled: false },
        terminal: { enabled: false },
        computer_use: { enabled: false },
        command_center: { enabled: false },
        chart_generation: { enabled: false },
        memory: { enabled: true, config: { autoManage: true } },
        reminders: { enabled: false },
        artifacts: { enabled: false },
      },
      assistantMode,
    },
    updateSettings,
  }),
}))

vi.mock('../contexts/QuickSendContext', () => ({
  useQuickSend: () => ({
    queueMessage,
  }),
}))

vi.mock('../utils/platform', () => ({
  isWindowsRuntime: () => true,
}))

describe('CommandCenterSettingsSync', () => {
  beforeEach(() => {
    queueMessage.mockClear()
    updateSettings.mockClear()
    setExtensionEnabled.mockClear()
    assistantMode = 'chat'
    commandCallback = null
    Object.assign(window, {
      commandCenter: {
        setExtensionEnabled,
        onCommand: vi.fn((callback) => {
          commandCallback = callback
          return vi.fn()
        }),
      },
    })
  })

  it('queues overlay commands with active desktop context', () => {
    render(<CommandCenterSettingsSync />)

    commandCallback?.({
      text: 'summarize this',
      receivedAt: Date.now(),
      activeWindow: {
        hwnd: 123,
        title: 'Quarterly notes',
        processName: 'notepad',
      },
    })

    expect(queueMessage).toHaveBeenCalledWith(
      'Command Center desktop context (app: notepad, window: Quarterly notes, hwnd: 123):\nsummarize this'
    )
    expect(updateSettings).toHaveBeenCalledWith({ assistantMode: 'agent' })
  })

  it('syncs Command Center enabled state from Agent Mode, not the legacy extension toggle', () => {
    const { rerender } = render(<CommandCenterSettingsSync />)

    expect(setExtensionEnabled).toHaveBeenLastCalledWith(false)

    assistantMode = 'agent'
    rerender(<CommandCenterSettingsSync />)

    expect(setExtensionEnabled).toHaveBeenLastCalledWith(true)
  })

  it('does not rewrite assistant mode when already in Agent Mode', () => {
    assistantMode = 'agent'
    render(<CommandCenterSettingsSync />)

    commandCallback?.({
      text: 'snap this window left',
      receivedAt: Date.now(),
      activeWindow: {
        hwnd: 123,
        title: 'Quarterly notes',
        processName: 'notepad',
      },
    })

    expect(queueMessage).toHaveBeenCalledWith(
      'Command Center desktop context (app: notepad, window: Quarterly notes, hwnd: 123):\nsnap this window left'
    )
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
