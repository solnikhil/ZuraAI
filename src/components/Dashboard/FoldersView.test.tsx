import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import FoldersView from './FoldersView'

const mockAppShell = {
  selectedFolderId: 'folder-1',
  setSelectedFolderId: vi.fn(),
  setDashboardView: vi.fn(),
}

const mockChatHistory = {
  folders: [
    {
      id: 'folder-1',
      name: 'ZuraAI',
      order: 0,
      createdAt: 1,
      memoryMode: 'folder-only' as const,
    },
  ],
  sessions: [
    {
      id: 'chat-1',
      title: 'Diagram AI automation',
      messages: [],
      createdAt: 1,
      updatedAt: Date.now(),
      pinned: false,
      folderId: 'folder-1',
      tags: [],
    },
  ],
  createFolder: vi.fn(() => 'folder-new'),
  createSession: vi.fn(),
  switchSession: vi.fn(),
}

vi.mock('../../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

vi.mock('../../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => mockChatHistory,
}))

describe('FoldersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'memory', {
      configurable: true,
      value: {
        list: vi.fn(async () => [
          {
            id: 'memory-1',
            content: 'Use folder-only context for ZuraAI work.',
            createdAt: 1,
            updatedAt: Date.now(),
            source: 'model',
            scope: { type: 'project', projectId: 'folder-1' },
            category: 'project',
            status: 'active',
          },
        ]),
      },
    })
  })

  it('shows project cards and manage details for chats and saved memory', async () => {
    render(<FoldersView />)

    expect(screen.getByRole('heading', { name: 'Folders' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'ZuraAI' })).toHaveLength(2)
    expect(screen.getByText('Diagram AI automation')).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByText('Use folder-only context for ZuraAI work.')).toBeInTheDocument()
    )
    expect(window.memory.list).toHaveBeenCalledWith({
      type: 'project',
      projectId: 'folder-1',
    })
  })
})
