import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArtifactsView from './ArtifactsView'

const mockSwitchSession = vi.fn()
const mockDeleteArtifact = vi.fn()
const mockSetDashboardView = vi.fn()

vi.mock('@/contexts/AppShellContext', () => ({
  useAppShell: () => ({ setDashboardView: mockSetDashboardView }),
}))

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    currentSessionId: 'session-1',
    sessions: [
      {
        id: 'session-1',
        title: 'Source chat',
        createdAt: 1,
        updatedAt: 2,
        messages: [],
        artifacts: [
          {
            id: 'artifact-1',
            title: 'Launch plan',
            kind: 'markdown',
            createdAt: 1,
            updatedAt: 2,
            currentVersionId: 'version-1',
            versions: [{ id: 'version-1', content: '# Launch', createdAt: 1 }],
          },
        ],
      },
    ],
    switchSession: mockSwitchSession,
    renameArtifact: vi.fn(),
    restoreArtifact: vi.fn(),
    deleteArtifact: mockDeleteArtifact,
  }),
}))

vi.mock('../LazyMarkdown', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-preview">{content}</div>,
}))

vi.mock('../MermaidDiagram', () => ({
  default: ({ code }: { code: string }) => <div data-testid="mermaid-preview">{code}</div>,
}))

describe('ArtifactsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'ipcRenderer', {
        value: undefined,
        configurable: true,
      })
    } else {
      // @ts-expect-error test env
      global.window = { ipcRenderer: undefined }
    }
  })

  it('lists artifacts and opens the detail drawer', () => {
    render(<ArtifactsView />)

    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /launch plan/i }))

    expect(screen.getAllByText('Source chat').length).toBeGreaterThan(0)
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Launch')
  })

  it('jumps to the source chat from the drawer', () => {
    render(<ArtifactsView />)

    fireEvent.click(screen.getByRole('button', { name: /launch plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /open chat/i }))

    expect(mockSwitchSession).toHaveBeenCalledWith('session-1')
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })
})
