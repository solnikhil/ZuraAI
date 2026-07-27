import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('./SettingsContext', () => ({
  useSettings: () => ({ settings: { rememberLastChatSession: false } }),
}))

import { ChatHistoryProvider, useChatHistory } from './ChatHistoryContext'

function Probe() {
  const history = useChatHistory()
  const session = history.sessions[0]
  return (
    <div>
      <div data-testid="loading">{String(history.isLoading)}</div>
      <div data-testid="sessions">{JSON.stringify(history.sessions)}</div>
      <div data-testid="folders">{JSON.stringify(history.folders)}</div>
      <button onClick={() => history.createSession('Original chat', null, 'session-1')}>
        create
      </button>
      <button
        onClick={() => {
          const id = history.createSession('Immediate chat', null, 'immediate-session')
          history.updateSessionTitle(id, 'Updated immediately')
        }}
      >
        create-and-update
      </button>
      <button onClick={() => history.pinSession('session-1')}>pin</button>
      <button onClick={() => history.unpinSession('session-1')}>unpin</button>
      <button onClick={() => history.addTag('session-1', 'work')}>add tag</button>
      <button onClick={() => history.removeTag('session-1', 'work')}>remove tag</button>
      <button
        onClick={() => {
          const folderId = history.createFolder('Project')
          history.assignFolder('session-1', folderId)
        }}
      >
        folder
      </button>
      <button onClick={() => history.removeFromFolder('session-1')}>unfolder</button>
      <button onClick={() => history.duplicateSession('session-1')}>duplicate</button>
      {session?.folderId && (
        <button onClick={() => history.deleteFolder(session.folderId!)}>delete folder</button>
      )}
    </div>
  )
}

function readSessions() {
  return JSON.parse(screen.getByTestId('sessions').textContent ?? '[]') as Array<{
    id: string
    title: string
    pinned?: boolean
    folderId?: string | null
    tags?: string[]
    messages: Array<{ id: string; content: string }>
  }>
}

describe('ChatHistoryProvider actions', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  async function renderReady() {
    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    fireEvent.click(screen.getByText('create'))
    await waitFor(() => expect(readSessions()).toHaveLength(1))
  }

  it('executes pin and tag mutations through the public provider callbacks', async () => {
    await renderReady()

    fireEvent.click(screen.getByText('pin'))
    fireEvent.click(screen.getByText('add tag'))
    await waitFor(() => {
      expect(readSessions()[0].pinned).toBe(true)
      expect(readSessions()[0].tags).toEqual(['work'])
    })

    fireEvent.click(screen.getByText('unpin'))
    fireEvent.click(screen.getByText('remove tag'))
    await waitFor(() => {
      expect(readSessions()[0].pinned).toBe(false)
      expect(readSessions()[0].tags).toEqual([])
    })
  })

  it('coordinates folder creation, assignment, removal, and deletion through real actions', async () => {
    await renderReady()
    fireEvent.click(screen.getByText('folder'))
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('folders').textContent ?? '[]')).toHaveLength(1)
      expect(readSessions()[0].folderId).toBeTruthy()
    })

    fireEvent.click(screen.getByText('delete folder'))
    await waitFor(() => {
      expect(JSON.parse(screen.getByTestId('folders').textContent ?? '[]')).toHaveLength(0)
      expect(readSessions()[0].folderId).toBeNull()
    })

    fireEvent.click(screen.getByText('folder'))
    fireEvent.click(screen.getByText('unfolder'))
    await waitFor(() => expect(readSessions()[0].folderId).toBeNull())
  })

  it('duplicates the loaded session with independent message identities', async () => {
    await renderReady()
    fireEvent.click(screen.getByText('duplicate'))
    await act(async () => {
      await Promise.resolve()
    })
    await waitFor(() => expect(readSessions()).toHaveLength(2))

    const [copy, original] = readSessions()
    expect(copy.title).toBe('Copy of Original chat')
    expect(copy.id).not.toBe(original.id)
    expect(copy.messages[0].content).toBe(original.messages[0].content)
    expect(copy.messages[0].id).not.toBe(original.messages[0].id)
    expect(copy.pinned).toBe(false)
  })

  it('makes a committed session authoritative to the next synchronous action', async () => {
    render(
      <ChatHistoryProvider>
        <Probe />
      </ChatHistoryProvider>
    )
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    fireEvent.click(screen.getByText('create-and-update'))

    await waitFor(() => {
      expect(readSessions()).toHaveLength(1)
      expect(readSessions()[0].title).toBe('Updated immediately')
    })
  })
})
