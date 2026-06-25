import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArtifactsView from './ArtifactsView'

const mockSwitchSession = vi.fn()
const mockDeleteArtifact = vi.fn()
const mockSetDashboardView = vi.fn()
let mockSessions: Array<Record<string, unknown>> = []

vi.mock('@/contexts/AppShellContext', () => ({
  useAppShell: () => ({ setDashboardView: mockSetDashboardView }),
}))

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    currentSessionId: 'session-1',
    sessions: mockSessions,
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

const mockOpenArtifactInExternalApp = vi.fn(async () => ({ ok: true }))

vi.mock('@/artifacts/openArtifactExternally', () => ({
  getExternalOpenLabel: () => 'Open in default editor',
  openArtifactInExternalApp: (...args: unknown[]) => mockOpenArtifactInExternalApp(...args),
}))

// Ensure window exists for the component (some tests run before full jsdom init)
if (typeof globalThis.window === 'undefined') {
  // @ts-expect-error - test shim
  globalThis.window = {}
}
Object.defineProperty(globalThis.window, 'ipcRenderer', {
  value: undefined,
  configurable: true,
  writable: true,
})

describe('ArtifactsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOpenArtifactInExternalApp.mockClear()
    mockSessions = [
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
    ]
    Object.defineProperty(globalThis.window, 'ipcRenderer', {
      value: undefined,
      configurable: true,
      writable: true,
    })
  })

  it('lists artifacts and opens the detail drawer', () => {
    render(<ArtifactsView />)

    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /preview launch plan/i }))

    expect(screen.getAllByText('Source chat').length).toBeGreaterThan(0)
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Launch')
  })

  it('jumps to the source chat from the drawer', () => {
    render(<ArtifactsView />)

    fireEvent.click(screen.getByRole('button', { name: /preview launch plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /open chat/i }))

    expect(mockSwitchSession).toHaveBeenCalledWith('session-1')
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('opens an artifact externally from the chevron action', () => {
    render(<ArtifactsView />)

    fireEvent.click(screen.getByRole('button', { name: /open in default editor: launch plan/i }))

    expect(mockOpenArtifactInExternalApp).toHaveBeenCalledWith('session-1', 'artifact-1', expect.any(Array))
  })

  it('lists metadata-only artifacts and loads full content when opened', async () => {
    mockSessions = []
    const fullSession = {
      id: 'session-2',
      title: 'Historical chat',
      createdAt: 10,
      updatedAt: 20,
      messages: [],
      artifacts: [
        {
          id: 'artifact-2',
          title: 'Historical plan',
          kind: 'markdown',
          createdAt: 10,
          updatedAt: 20,
          currentVersionId: 'version-2',
          versions: [{ id: 'version-2', content: '# Historical', createdAt: 20 }],
        },
      ],
    }

    Object.defineProperty(globalThis.window, 'ipcRenderer', {
      value: {
        invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
          if (channel === 'chat-store:get-metadata') {
            return [{
              id: 'session-2',
              title: 'Historical chat',
              createdAt: 10,
              updatedAt: 20,
              pinned: false,
              folderId: null,
              tags: [],
              messageCount: 0,
              artifactCount: 1,
              artifactSummaries: [{
                id: 'artifact-2',
                title: 'Historical plan',
                kind: 'markdown',
                updatedAt: 20,
                currentVersionId: 'version-2',
                versionCount: 1,
              }],
            }]
          }
          if (channel === 'chat-store:get-session') {
            expect(args[0]).toBe('session-2')
            return fullSession
          }
          return null
        }),
        on: vi.fn(),
        off: vi.fn(),
      },
      configurable: true,
      writable: true,
    })

    render(<ArtifactsView />)

    expect(await screen.findByRole('button', { name: /preview historical plan/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /preview historical plan/i }))

    expect(await screen.findByTestId('markdown-preview')).toHaveTextContent('# Historical')
  })
})
