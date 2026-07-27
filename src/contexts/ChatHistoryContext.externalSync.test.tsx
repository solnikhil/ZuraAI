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
let storeRevision = 0
const ipcListeners = new Map<string, (event: unknown, ...args: unknown[]) => void>()

function publishSelfStoreChange() {
  storeRevision += 1
  ipcListeners.get('chat-store:changed')?.({ revision: storeRevision, source: 'self' })
  return { changed: true, revision: storeRevision }
}

function sessionMetadata(session: ChatSession) {
  const artifactSummaries = session.artifacts?.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    language: artifact.language,
    updatedAt: artifact.updatedAt,
    currentVersionId: artifact.currentVersionId,
    versionCount: artifact.versions.length,
  }))
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
    artifactCount: session.artifacts?.length ?? artifactSummaries?.length ?? 0,
    artifactSummaries,
  }
}

vi.mock('./SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

describe('ChatHistoryContext external sync', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
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
    storeRevision = 0
    ipcListeners.clear()
    ;(window as typeof window & { ipcRenderer: IElectronAPI }).ipcRenderer = {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
        if (channel === 'chat-store:get-metadata') return persistedSessions.map(sessionMetadata)
        if (channel === 'chat-store:get-revision') return storeRevision
        if (channel === 'chat-store:get-session') {
          return persistedSessions.find((session) => session.id === args[0]) ?? null
        }
        if (channel === 'chat-store:save-session') {
          const nextSession = args[0] as ChatSession
          persistedSessions = [
            nextSession,
            ...persistedSessions.filter((session) => session.id !== nextSession.id),
          ]
          return publishSelfStoreChange()
        }
        if (channel === 'chat-store:delete-session') {
          persistedSessions = persistedSessions.filter((session) => session.id !== args[0])
          return publishSelfStoreChange()
        }
        if (channel === 'chat-store:save-index') {
          const index = args[0] as {
            sessions: ReturnType<typeof sessionMetadata>[]
            folders: Folder[]
          }
          persistedFolders = index.folders
          persistedSessions = index.sessions.map((metadata) => ({
            ...metadata,
            messages:
              persistedSessions.find((session) => session.id === metadata.id)?.messages ?? [],
          }))
          return publishSelfStoreChange()
        }
        if (channel === 'chat-store:get-all') return persistedSessions
        if (channel === 'chat-store:get-all-folders') return persistedFolders
        if (channel === 'chat-store:save-all') {
          persistedSessions = args[0] as ChatSession[]
          return publishSelfStoreChange()
        }
        if (channel === 'chat-store:save-folders') return publishSelfStoreChange()
        if (channel === 'chat-store:migrate') return publishSelfStoreChange()
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

  it('refreshes persisted sessions after an external chat-store change without auto-switching chats', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, currentSessionId, switchSession, refreshSessions } = useChatHistory()
      return (
        <div>
          <div data-testid="session-count">{sessions.length}</div>
          <div data-testid="current-session-id">{currentSessionId ?? 'none'}</div>
          <div data-testid="current-title">
            {sessions.find((session) => session.id === currentSessionId)?.title ?? 'none'}
          </div>
          <button onClick={() => switchSession('session-1')}>switch-session-1</button>
          <button onClick={() => void refreshSessions()}>refresh-sessions</button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(
      () => {
        expect(screen.getByTestId('session-count').textContent).toBe('1')
      },
      { timeout: 1000 }
    )

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByText('switch-session-1'))

    await waitFor(
      () => {
        expect(screen.getByTestId('current-session-id').textContent).toBe('session-1')
        expect(screen.getByTestId('current-title').textContent).toBe('Original chat')
      },
      { timeout: 1000 }
    )

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
      await Promise.resolve()
    })

    expect(screen.getByTestId('session-count').textContent).toBe('1')
    expect(screen.getByTestId('current-title').textContent).toBe('Original chat')

    fireEvent.click(screen.getByText('refresh-sessions'))

    await waitFor(
      () => {
        expect(screen.getByTestId('session-count').textContent).toBe('2')
        expect(screen.getByTestId('current-session-id').textContent).toBe('session-1')
        expect(screen.getByTestId('current-title').textContent).toBe('Updated from overlay')
      },
      { timeout: 1000 }
    )
  })

  it('does not hydrate stale localStorage data after an Electron repository failure', async () => {
    localStorage.setItem(
      'zura-chat-history',
      JSON.stringify([
        {
          id: 'stale-local',
          title: 'Stale local fallback',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ])
    )
    const originalInvoke = window.ipcRenderer.invoke.bind(window.ipcRenderer)
    window.ipcRenderer.invoke = vi.fn(async (channel, ...args) => {
      if (channel === 'chat-store:get-metadata') throw new Error('repository unavailable')
      return originalInvoke(channel, ...args) as never
    }) as IElectronAPI['invoke']
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, isLoading } = useChatHistory()
      return (
        <div>
          <div data-testid="failure-loading">{String(isLoading)}</div>
          <div data-testid="failure-count">{sessions.length}</div>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => expect(screen.getByTestId('failure-loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('failure-count')).toHaveTextContent('0')
    expect(localStorage.getItem('zura-chat-history')).toContain('stale-local')
  })

  it('persists one committed snapshot when React StrictMode replays renders', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, switchSession, updateSessionTitle } = useChatHistory()
      return (
        <div>
          <div data-testid="strict-title">{sessions[0]?.title ?? 'none'}</div>
          <button onClick={() => switchSession('session-1')}>strict-load</button>
          <button onClick={() => updateSessionTitle('session-1', 'Strict update')}>
            strict-update
          </button>
        </div>
      )
    }

    render(
      <React.StrictMode>
        <ChatHistoryProvider>
          <Probe />
        </ChatHistoryProvider>
      </React.StrictMode>
    )

    await waitFor(() =>
      expect(screen.getByTestId('strict-title')).toHaveTextContent('Original chat')
    )
    fireEvent.click(screen.getByText('strict-load'))
    await waitFor(() => {
      expect(
        (window.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>).mock.calls.some(
          ([channel]) => channel === 'chat-store:get-session'
        )
      ).toBe(true)
    })
    fireEvent.click(screen.getByText('strict-update'))
    await waitFor(() =>
      expect(screen.getByTestId('strict-title')).toHaveTextContent('Strict update')
    )
    await waitFor(
      () => {
        const saves = (
          window.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>
        ).mock.calls.filter(([channel]) => channel === 'chat-store:save-session')
        expect(saves).toHaveLength(1)
        expect((saves[0][1] as ChatSession).title).toBe('Strict update')
      },
      { timeout: 3000 }
    )
  })

  it('keeps active-session optimistic messages when a stale external reload is signaled before save', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, currentSessionId, switchSession, addMessageToSession } = useChatHistory()
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
      expect(window.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
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
      await Promise.resolve()
    })
    fireEvent.focus(window)

    expect(screen.getByTestId('messages').textContent).toContain('new user message')
    expect(screen.getByTestId('message-count').textContent).toBe('3')

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })

    vi.useRealTimers()

    await waitFor(() => {
      expect(
        persistedSessions[0].messages.some((message) => message.content === 'new user message')
      ).toBe(true)
    })
  })

  it('requeues a failed session save and persists the latest snapshot on the next mutation', async () => {
    const originalInvoke = window.ipcRenderer.invoke.bind(window.ipcRenderer)
    let saveAttempts = 0
    window.ipcRenderer.invoke = vi.fn(async (channel, ...args) => {
      if (channel === 'chat-store:save-session') {
        saveAttempts += 1
        if (saveAttempts === 1) {
          throw new Error('temporary write failure')
        }
      }
      return originalInvoke(channel, ...args) as never
    }) as IElectronAPI['invoke']

    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, currentSessionId, switchSession, addMessageToSession } = useChatHistory()
      return (
        <div>
          <div data-testid="retry-session-count">{sessions.length}</div>
          <div data-testid="retry-current-session">{currentSessionId ?? 'none'}</div>
          <button onClick={() => switchSession('session-1')}>retry-switch</button>
          <button
            onClick={() => addMessageToSession('session-1', { role: 'user', content: 'first' })}
          >
            retry-add-first
          </button>
          <button
            onClick={() => addMessageToSession('session-1', { role: 'user', content: 'second' })}
          >
            retry-add-second
          </button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => expect(screen.getByTestId('retry-session-count').textContent).toBe('1'))
    fireEvent.click(screen.getByText('retry-switch'))
    await waitFor(
      () => expect(screen.getByTestId('retry-current-session').textContent).toBe('session-1'),
      { timeout: 3000 }
    )

    fireEvent.click(screen.getByText('retry-add-first'))
    await waitFor(() => expect(saveAttempts).toBe(1), { timeout: 3000 })

    fireEvent.click(screen.getByText('retry-add-second'))
    await waitFor(
      () => {
        expect(saveAttempts).toBe(2)
        expect(persistedSessions[0].messages.map((message) => message.content)).toEqual([
          'first',
          'second',
        ])
      },
      { timeout: 3000 }
    )
  })

  it('attempts to flush a pending session snapshot when the provider unmounts', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, currentSessionId, switchSession, addMessageToSession } = useChatHistory()
      return (
        <div>
          <div data-testid="flush-session-count">{sessions.length}</div>
          <div data-testid="flush-current-session">{currentSessionId ?? 'none'}</div>
          <button onClick={() => switchSession('session-1')}>flush-switch</button>
          <button
            onClick={() => addMessageToSession('session-1', { role: 'user', content: 'flush me' })}
          >
            flush-add
          </button>
        </div>
      )
    }

    const view = render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => expect(screen.getByTestId('flush-session-count').textContent).toBe('1'))
    fireEvent.click(screen.getByText('flush-switch'))
    await waitFor(
      () => expect(screen.getByTestId('flush-current-session').textContent).toBe('session-1'),
      { timeout: 3000 }
    )
    fireEvent.click(screen.getByText('flush-add'))
    view.unmount()

    await waitFor(
      () =>
        expect(persistedSessions[0].messages.map((message) => message.content)).toEqual([
          'flush me',
        ]),
      { timeout: 3000 }
    )
  })

  it('accounts for concurrent self-change events without hiding the next external change', async () => {
    const originalInvoke = window.ipcRenderer.invoke.bind(window.ipcRenderer)
    let resolveSessionSave: ((value: { changed: true; revision: number }) => void) | undefined
    let resolveIndexSave: ((value: { changed: true; revision: number }) => void) | undefined
    let sessionSaveStarted = false
    let indexSaveStarted = false
    window.ipcRenderer.invoke = vi.fn(async (channel, ...args) => {
      if (channel === 'chat-store:save-session') {
        sessionSaveStarted = true
        return new Promise<{ changed: true; revision: number }>((resolve) => {
          resolveSessionSave = resolve
        })
      }
      if (channel === 'chat-store:save-index') {
        indexSaveStarted = true
        return new Promise<{ changed: true; revision: number }>((resolve) => {
          resolveIndexSave = resolve
        })
      }
      return originalInvoke(channel, ...args) as never
    }) as IElectronAPI['invoke']

    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions, switchSession, addMessageToSession } = useChatHistory()
      return (
        <div>
          <div data-testid="tracked-session-count">{sessions.length}</div>
          <button onClick={() => switchSession('session-1')}>tracked-switch</button>
          <button
            onClick={() => addMessageToSession('session-1', { role: 'user', content: 'queued' })}
          >
            tracked-add
          </button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => expect(screen.getByTestId('tracked-session-count').textContent).toBe('1'))
    fireEvent.click(screen.getByText('tracked-switch'))
    fireEvent.click(screen.getByText('tracked-add'))
    await waitFor(
      () => {
        expect(sessionSaveStarted).toBe(true)
        expect(indexSaveStarted).toBe(true)
      },
      { timeout: 1500 }
    )

    await act(async () => {
      ipcListeners.get('chat-store:changed')?.({ revision: 2, source: 'self' })
      ipcListeners.get('chat-store:changed')?.({ revision: 1, source: 'self' })
      resolveSessionSave?.({ changed: true, revision: 1 })
      resolveIndexSave?.({ changed: true, revision: 2 })
      storeRevision = 2
      await Promise.resolve()
    })

    persistedSessions = [
      persistedSessions[0],
      {
        id: 'external-session',
        title: 'External session',
        messages: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ]
    fireEvent.focus(window)
    await act(async () => Promise.resolve())
    expect(screen.getByTestId('tracked-session-count').textContent).toBe('1')

    await act(async () => {
      storeRevision = 3
      ipcListeners.get('chat-store:changed')?.({ revision: 3, source: 'external' })
      await Promise.resolve()
    })
    fireEvent.focus(window)
    await waitFor(() => expect(screen.getByTestId('tracked-session-count').textContent).toBe('2'))
  })

  it('detects an external revision missed while the window was not observing events', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    function Probe() {
      const { sessions } = useChatHistory()
      return <div data-testid="missed-session-count">{sessions.length}</div>
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )
    await waitFor(() => expect(screen.getByTestId('missed-session-count').textContent).toBe('1'))

    persistedSessions = [
      ...persistedSessions,
      {
        id: 'missed-external-session',
        title: 'Missed external session',
        messages: [],
        createdAt: 2,
        updatedAt: 2,
      },
    ]
    storeRevision += 1

    fireEvent.focus(window)
    await waitFor(() => expect(screen.getByTestId('missed-session-count').textContent).toBe('2'))
  })

  it('loads full-session artifacts without metadata shell artifacts replacing them', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    persistedSessions = [
      {
        id: 'session-1',
        title: 'Artifact chat',
        messages: [{ id: 'msg-1', role: 'user', content: 'old message', timestamp: 1 }],
        artifacts: [
          {
            id: 'artifact-1',
            title: 'Persisted artifact',
            kind: 'markdown',
            createdAt: 1,
            updatedAt: 2,
            currentVersionId: 'version-1',
            versions: [{ id: 'version-1', content: '# Saved', createdAt: 1 }],
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
    ]

    function Probe() {
      const { sessions, loadFullSession } = useChatHistory()
      const session = sessions.find((entry) => entry.id === 'session-1')
      return (
        <div>
          <div data-testid="session-title">{session?.title ?? 'none'}</div>
          <div data-testid="artifact-count">{session?.artifacts?.length ?? 0}</div>
          <div data-testid="artifact-title">{session?.artifacts?.[0]?.title ?? 'none'}</div>
          <button onClick={() => void loadFullSession('session-1')}>load-full</button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-title').textContent).toBe('Artifact chat')
    })

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByText('load-full'))

    await waitFor(() => {
      expect(screen.getByTestId('artifact-count').textContent).toBe('1')
      expect(screen.getByTestId('artifact-title').textContent).toBe('Persisted artifact')
    })
  })

  it('persists a newly created artifact when only metadata is loaded', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    persistedSessions = [
      {
        id: 'session-1',
        title: 'Metadata-only chat',
        messages: [{ id: 'msg-1', role: 'user', content: 'old message', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    function Probe() {
      const { sessions, createArtifact } = useChatHistory()
      const session = sessions.find((entry) => entry.id === 'session-1')
      return (
        <div>
          <div data-testid="session-title">{session?.title ?? 'none'}</div>
          <div data-testid="artifact-count">{session?.artifacts?.length ?? 0}</div>
          <button
            onClick={() =>
              createArtifact('session-1', {
                title: 'New artifact',
                kind: 'text',
                content: 'hello',
              })
            }
          >
            create-artifact
          </button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-title').textContent).toBe('Metadata-only chat')
    })

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByText('create-artifact'))

    expect(screen.getByTestId('artifact-count').textContent).toBe('1')

    await waitFor(() => {
      expect(persistedSessions[0].artifacts?.[0]?.title).toBe('New artifact')
      expect(persistedSessions[0].messages).toHaveLength(1)
    })
  })

  it('does not let a stale full-session load remove a newly created artifact', async () => {
    const { ChatHistoryProvider, useChatHistory } = await import('./ChatHistoryContext')

    const staleSession: ChatSession = {
      id: 'session-1',
      title: 'Race chat',
      messages: [{ id: 'msg-1', role: 'user', content: 'old message', timestamp: 1 }],
      createdAt: 1,
      updatedAt: 1,
    }
    persistedSessions = [staleSession]

    let resolveStaleLoad!: (session: ChatSession) => void
    const staleLoad = new Promise<ChatSession>((resolve) => {
      resolveStaleLoad = resolve
    })
    let getSessionCalls = 0

    ;(window.ipcRenderer.invoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (channel: string, ...args: unknown[]) => {
        if (channel === 'chat-store:get-metadata') return persistedSessions.map(sessionMetadata)
        if (channel === 'chat-store:get-session') {
          getSessionCalls += 1
          if (getSessionCalls === 1) return staleLoad
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
        if (channel === 'chat-store:save-index') return true
        if (channel === 'chat-store:get-all-folders') return persistedFolders
        throw new Error(`Unexpected channel: ${channel}`)
      }
    )

    function Probe() {
      const { sessions, createArtifact, loadFullSession } = useChatHistory()
      const session = sessions.find((entry) => entry.id === 'session-1')
      return (
        <div>
          <div data-testid="session-title">{session?.title ?? 'none'}</div>
          <div data-testid="artifact-count">{session?.artifacts?.length ?? 0}</div>
          <button onClick={() => void loadFullSession('session-1')}>load-full</button>
          <button
            onClick={() =>
              createArtifact('session-1', {
                title: 'Race artifact',
                kind: 'text',
                content: 'survives',
              })
            }
          >
            create-artifact
          </button>
        </div>
      )
    }

    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-title').textContent).toBe('Race chat')
    })

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByText('load-full'))
    fireEvent.click(screen.getByText('create-artifact'))

    expect(screen.getByTestId('artifact-count').textContent).toBe('1')

    await waitFor(() => {
      expect(persistedSessions[0].artifacts?.[0]?.title).toBe('Race artifact')
    })

    await act(async () => {
      resolveStaleLoad(staleSession)
      await staleLoad
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('artifact-count').textContent).toBe('1')
    })
  })
})
