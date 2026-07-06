import { render, screen } from '@testing-library/react'
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
  setFolderMemoryMode: vi.fn(),
}

vi.mock('../../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

vi.mock('../../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => mockChatHistory,
}))

vi.mock('../shared/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

describe('FoldersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'memory', {
      value: {
        list: vi.fn(async () => []),
        add: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        onChanged: vi.fn(() => () => {}),
      },
      writable: true,
      configurable: true,
    })
  })

  it('shows project cards and detail panel with chats for the selected folder', () => {
    render(<FoldersView />)

    expect(screen.getByRole('heading', { name: 'Folders' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'ZuraAI' })).toHaveLength(2)
    expect(screen.getByText('Diagram AI automation')).toBeInTheDocument()
  })

  it('renders the FolderMemoryPanel for the selected folder instead of a placeholder', () => {
    render(<FoldersView />)

    expect(screen.queryByTestId('folder-memory-placeholder')).not.toBeInTheDocument()
    expect(screen.getByText('Folder memory')).toBeInTheDocument()
    expect(screen.getByLabelText('Folder memory mode')).toBeInTheDocument()
  })
})
