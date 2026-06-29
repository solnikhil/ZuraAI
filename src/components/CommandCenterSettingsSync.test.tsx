import React from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CommandCenterSettingsSync from './CommandCenterSettingsSync'

const queueMessage = vi.fn()
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
        command_center: { enabled: true },
        chart_generation: { enabled: false },
        memory: { enabled: true, config: { autoManage: true } },
        reminders: { enabled: false },
        artifacts: { enabled: false },
      },
    },
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
    commandCallback = null
    Object.assign(window, {
      commandCenter: {
        setExtensionEnabled: vi.fn(async () => ({
          enabled: true,
          shortcut: 'CommandOrControl+Shift+Space',
          shortcutRegistered: true,
        })),
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
  })
})
