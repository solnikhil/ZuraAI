import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChatSession, Folder } from './ChatHistoryContext'

const mockSettings = {
  settings: {
    rememberLastChatSession: false,
  },
}

let persistedSessions: ChatSession[] = []
let persistedFolders: Folder[] = []
const ipcListeners = new Map<string, (event: unknown, ...args: unknown[]) => void>()

vi.mock('./SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

describe('ChatHistoryContext external sync', () => {
  beforeEach(() => {
    vi.resetModules()
    persistedSessions = [
      {
        id: 'session-1',
        title: 'Original chat',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    persistedFolders = []
    ipcListeners.clear()

    ;(window as typeof window & { ipcRenderer: unknown }).ipcRenderer = {
      invoke: vi.fn(async (channel: string) => {
        if (channel === 'chat-store:get-all') return persistedSessions
        if (channel === 'chat-store:get-all-folders') return persistedFolders
        if (channel === 'chat-store:save-all') return true
        if (channel === 'chat-store:save-folders') return true
        if (channel === 'chat-store:migrate') return true
        throw new Error(`Unexpected channel: ${channel}`)
      }),
      on: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        ipcListeners.set(channel, listener)
      }),
      off: vi.fn((channel: string) => {
        ipcListeners.delete(channel)
      }),
      send: vi.fn(),
    } as unknown as Window['ipcRenderer']
  })

  it('refreshes persisted sessions on focus after an external chat-store change without auto-switching chats', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, currentSessionId, switchSession } = useChatHistory()
      return (
        <div>
          <div data-testid="session-count">{sessions.length}</div>
          <div data-testid="current-session-id">{currentSessionId ?? 'none'}</div>
          <div data-testid="current-title">
            {sessions.find((session) => session.id === currentSessionId)?.title ?? 'none'}
          </div>
          <button onClick={() => switchSession('session-1')}>switch-session-1</button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-count').textContent).toBe('1')
    })

    fireEvent.click(screen.getByText('switch-session-1'))

    await waitFor(() => {
      expect(screen.getByTestId('current-session-id').textContent).toBe('session-1')
      expect(screen.getByTestId('current-title').textContent).toBe('Original chat')
    })

    persistedSessions = [
      {
        id: 'session-1',
        title: 'Updated from overlay',
        messages: [],
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'session-2',
        title: 'Overlay created chat',
        messages: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ]

    await act(async () => {
      ipcListeners.get('chat-store:changed')?.({})
    })

    expect(screen.getByTestId('session-count').textContent).toBe('1')
    expect(screen.getByTestId('current-title').textContent).toBe('Original chat')

    await act(async () => {
      fireEvent.focus(window)
    })

    await waitFor(() => {
      expect(screen.getByTestId('session-count').textContent).toBe('2')
      expect(screen.getByTestId('current-session-id').textContent).toBe('session-1')
      expect(screen.getByTestId('current-title').textContent).toBe('Updated from overlay')
    })
  })
})
