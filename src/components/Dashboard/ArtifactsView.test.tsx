import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArtifactsView from './ArtifactsView'

const mockSwitchSession = vi.fn()
const mockLoadFullSession = vi.fn()
const mockRenameArtifact = vi.fn()
const mockRestoreArtifact = vi.fn()
const mockDeleteArtifact = vi.fn()
const mockSetDashboardView = vi.fn()
let mockSessions: Array<Record<string, unknown>> = []

vi.mock('@/contexts/AppShellContext', () => ({
  useAppShell: () => ({ setDashboardView: mockSetDashboardView }),
}))

vi.mock('@/contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    sessions: mockSessions,
    loadFullSession: mockLoadFullSession,
    switchSession: mockSwitchSession,
    renameArtifact: mockRenameArtifact,
    restoreArtifact: mockRestoreArtifact,
    deleteArtifact: mockDeleteArtifact,
  }),
}))

const mockOpenArtifactInExternalApp = vi.fn(async () => ({ ok: true }))

vi.mock('@/artifacts/openArtifactExternally', () => ({
  getExternalOpenLabel: () => 'Open in default editor',
  openArtifactInExternalApp: (...args: unknown[]) => mockOpenArtifactInExternalApp(...args),
}))

if (typeof globalThis.window === 'undefined') {
  // @ts-expect-error test shim
  globalThis.window = {}
}

describe('ArtifactsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadFullSession.mockResolvedValue(null)
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

  it('selects artifacts for in-app preview and opens externally from the toolbar', async () => {
    render(<ArtifactsView />)

    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Launch plan' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /open in editor/i }))

    expect(mockOpenArtifactInExternalApp).toHaveBeenCalledWith(
      'session-1',
      'artifact-1',
      expect.any(Array)
    )
  })

  it('searches by source chat and navigates back to that chat', async () => {
    render(<ArtifactsView />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search artifacts' }), {
      target: { value: 'source chat' },
    })
    expect(screen.getByRole('button', { name: /launch plan/i })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Source chat' }))
    expect(mockSwitchSession).toHaveBeenCalledWith('session-1')
    expect(mockSetDashboardView).toHaveBeenCalledWith('chat')
  })

  it('keeps the mobile back action on the library', async () => {
    const { container } = render(<ArtifactsView />)

    await screen.findByRole('heading', { name: 'Launch plan' })
    expect(container.querySelector('.artifacts-view')).toHaveClass('artifacts-view--detail-open')

    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    expect(container.querySelector('.artifacts-view')).not.toHaveClass(
      'artifacts-view--detail-open'
    )
  })

  it('lazily loads metadata-only artifacts before previewing them', async () => {
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
    mockLoadFullSession.mockResolvedValue(fullSession)

    Object.defineProperty(globalThis.window, 'ipcRenderer', {
      value: {
        invoke: vi.fn(async () => [
          {
            id: 'session-2',
            title: 'Historical chat',
            createdAt: 10,
            updatedAt: 20,
            messageCount: 0,
            artifactSummaries: [
              {
                id: 'artifact-2',
                title: 'Historical plan',
                kind: 'markdown',
                updatedAt: 20,
                currentVersionId: 'version-2',
                versionCount: 1,
              },
            ],
          },
        ]),
        on: vi.fn(() => vi.fn()),
      },
      configurable: true,
      writable: true,
    })

    render(<ArtifactsView />)

    expect(await screen.findByRole('heading', { name: 'Historical plan' })).toBeInTheDocument()
    await waitFor(() => expect(mockLoadFullSession).toHaveBeenCalledWith('session-2'))
    expect(await screen.findByRole('heading', { name: 'Historical', level: 1 })).toBeInTheDocument()
  })
})
