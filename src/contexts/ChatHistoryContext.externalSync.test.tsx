import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ChatSession, Folder } from '../chat/types'
import type { IElectronAPI } from '../electron/types'

const mockSettings = {
  settings: {
    rememberLastChatSession: false,
  },
}

let persistedSessions: ChatSession[] = []
let persistedFolders: Folder[] = []
const ipcListeners = new Map<string, (event: unknown, ...args: unknown[]) => void>()

function sessionMetadata(session: ChatSession) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    totalTokens: session.totalTokens,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: session.tags ?? [],
    messageCount: session.messages.length,
  }
}

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

    ;(window as typeof window & { ipcRenderer: IElectronAPI }).ipcRenderer = {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
        if (channel === 'chat-store:get-metadata') return persistedSessions.map(sessionMetadata)
        if (channel === 'chat-store:get-session') {
          return persistedSessions.find((session) => session.id === args[0]) ?? null
        }
        if (channel === 'chat-store:save-session') {
          const nextSession = args[0] as ChatSession
          persistedSessions = [
            nextSession,
            ...persistedSessions.filter((session) => session.id !== nextSession.id),
          ]
          ipcListeners.get('chat-store:changed')?.({})
          return true
        }
        if (channel === 'chat-store:delete-session') {
          persistedSessions = persistedSessions.filter((session) => session.id !== args[0])
          ipcListeners.get('chat-store:changed')?.({})
          return true
        }
        if (channel === 'chat-store:save-index') {
          const index = args[0] as { sessions: ReturnType<typeof sessionMetadata>[]; folders: Folder[] }
          persistedFolders = index.folders
          persistedSessions = index.sessions.map((metadata) => ({
            ...metadata,
            messages: persistedSessions.find((session) => session.id === metadata.id)?.messages ?? [],
          }))
          ipcListeners.get('chat-store:changed')?.({})
          return true
        }
        if (channel === 'chat-store:get-all') return persistedSessions
        if (channel === 'chat-store:get-all-folders') return persistedFolders
        if (channel === 'chat-store:save-all') {
          persistedSessions = args[0] as ChatSession[]
          ipcListeners.get('chat-store:changed')?.({})
          return true
        }
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
    } as unknown as IElectronAPI
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('keeps active-session optimistic messages when a stale external reload is signaled before save', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const {
        sessions,
        currentSessionId,
        switchSession,
        addMessageToSession,
      } = useChatHistory()
      const currentSession = sessions.find((session) => session.id === currentSessionId)

      return (
        <div>
          <div data-testid="message-count">{currentSession?.messages.length ?? 0}</div>
          <div data-testid="messages">
            {(currentSession?.messages ?? []).map((message) => message.content).join('|')}
          </div>
          <button onClick={() => switchSession('session-1')}>switch-session-1</button>
          <button
            onClick={() => {
              addMessageToSession('session-1', { role: 'user', content: 'new user message' })
              addMessageToSession('session-1', { role: 'assistant', content: '' })
            }}
          >
            append-optimistic-send
          </button>
        </div>
      )
    }

    persistedSessions = [
      {
        id: 'session-1',
        title: 'Original chat',
        messages: [{ id: 'msg-1', role: 'user', content: 'old message', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('message-count').textContent).toBe('0')
      expect(screen.getByText('switch-session-1')).toBeTruthy()
    })

    await waitFor(() => {
      expect((window.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        'chat-store:get-metadata'
      )
    })

    fireEvent.click(screen.getByText('switch-session-1'))

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toBe('old message')
    })

    vi.useFakeTimers()

    fireEvent.click(screen.getByText('append-optimistic-send'))

    expect(screen.getByTestId('messages').textContent).toContain('new user message')
    expect(screen.getByTestId('message-count').textContent).toBe('3')

    persistedSessions = [
      {
        id: 'session-1',
        title: 'Original chat',
        messages: [{ id: 'msg-1', role: 'user', content: 'old message', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    await act(async () => {
      ipcListeners.get('chat-store:changed')?.({})
      fireEvent.focus(window)
    })

    expect(screen.getByTestId('messages').textContent).toContain('new user message')
    expect(screen.getByTestId('message-count').textContent).toBe('3')

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })

    vi.useRealTimers()

    await waitFor(() => {
      expect(persistedSessions[0].messages.some((message) => message.content === 'new user message')).toBe(
        true
      )
    })
  })
})
