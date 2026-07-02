import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CommandCenterOverlay from './CommandCenterOverlay'

const createSession = vi.fn(() => 'overlay-session')
const switchSession = vi.fn()
const clearCurrentSession = vi.fn()
const deleteSession = vi.fn()
const sendMessage = vi.fn(async () => undefined)

let currentSessionId: string | null = null
let sessions: unknown[] = []

vi.mock('../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    clearCurrentSession,
    deleteSession,
  }),
}))

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      commandCenterChatPersistence: 'temporary',
    },
  }),
}))

vi.mock('../contexts/StreamingContext', () => ({
  useStreamingState: () => ({ content: '' }),
}))

vi.mock('./Dashboard/ChatArea/hooks', () => ({
  useStreamingChat: () => ({
    isLoading: false,
    sendMessage,
    stopStreaming: vi.fn(),
    regenerateMessage: vi.fn(),
    toolState: { activeToolCalls: [], toolResults: [] },
  }),
}))

vi.mock('./Dashboard/ChatArea/MessageRenderer', () => ({
  MessageRenderer: ({ message }: { message: { content: string } }) => <div>{message.content}</div>,
}))

vi.mock('./Dashboard/ChatArea/StreamingMessage', () => ({
  StreamingMessage: ({ message }: { message: { content: string } }) => <div>{message.content}</div>,
}))

describe('CommandCenterOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentSessionId = null
    sessions = []
    Object.assign(window, {
      commandCenter: {
        getIndex: vi.fn(async () => ({
          workflows: [
            {
              id: 'workflow:morning',
              type: 'workflow',
              title: 'Morning startup',
              subtitle: '2 steps',
              hint: 'Run',
              aliases: ['start'],
              workflow: {
                id: 'morning',
                name: 'Morning startup',
                aliases: ['start'],
                steps: [{ type: 'app', appPath: 'C:\\Chrome.lnk' }],
                createdAt: 1,
                updatedAt: 2,
              },
            },
          ],
          apps: [
            {
              id: 'app:chrome',
              type: 'app',
              title: 'Chrome',
              subtitle: 'Application',
              hint: 'Application',
              aliases: ['browser'],
              appPath: 'C:\\Chrome.lnk',
              iconDataUrl: 'data:image/png;base64,icon',
              existingWindow: { hwnd: 12, title: 'Chrome', processName: 'chrome', processId: 5 },
            },
          ],
          windows: [],
          actions: [],
          chats: [],
        })),
        executeIndexItem: vi.fn(async () => ({ success: true })),
        executeWorkflow: vi.fn(async () => ({ success: true })),
        openChatSession: vi.fn(async () => true),
        setLayout: vi.fn(async () => true),
        hide: vi.fn(async () => true),
        onShown: vi.fn(() => vi.fn()),
      },
    })
  })

  it('opens in Search mode and renders workflows before apps', async () => {
    render(<CommandCenterOverlay />)

    expect(await screen.findByRole('textbox', { name: /search command center/i })).toBeInTheDocument()
    const workflow = await screen.findByText('Morning startup')
    const app = await screen.findByText('Chrome')

    expect(workflow.compareDocumentPosition(app) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('switches to Ask AI with Tab and starts chat on submit', async () => {
    const { container } = render(<CommandCenterOverlay />)

    const input = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.keyDown(input, { key: 'Tab' })

    const askInput = await screen.findByRole('textbox', { name: /ask zura/i })
    expect(askInput).toBeInTheDocument()

    fireEvent.change(askInput, { target: { value: 'summarize this window' } })
    fireEvent.keyDown(askInput, { key: 'Enter' })

    expect(createSession).toHaveBeenCalledTimes(1)
    expect(switchSession).toHaveBeenCalledWith('overlay-session')
    expect(await screen.findByRole('textbox', { name: /ask a follow-up/i })).toBeInTheDocument()
    expect(container.querySelector('.command-center-composer')).not.toBeInTheDocument()
  })

  it('requires workflow confirmation before execution', async () => {
    render(<CommandCenterOverlay />)

    await screen.findByText('Morning startup')
    fireEvent.keyDown(screen.getByRole('textbox', { name: /search command center/i }), { key: 'Enter' })

    expect(screen.getByText('Run Morning startup?')).toBeInTheDocument()
    expect(window.commandCenter.executeWorkflow).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() => {
      expect(window.commandCenter.executeWorkflow).toHaveBeenCalledWith('morning')
    })
  })

  it('matches close app-name typos while filtering unrelated apps', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [
        { id: 'app:kiro', type: 'app', title: 'Kiro', hint: 'Application', aliases: ['Kiro'], rank: 12 },
        { id: 'app:java', type: 'app', title: 'About Java', hint: 'Application', aliases: ['About Java'], rank: 30 },
        { id: 'app:adobe', type: 'app', title: 'Adobe Photoshop 2025', hint: 'Application', aliases: ['Adobe Photoshop 2025'], rank: 25 },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('About Java')

    const input = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.change(input, { target: { value: 'kird' } })

    expect(screen.getByText('Kiro')).toBeInTheDocument()
    expect(screen.queryByText('About Java')).not.toBeInTheDocument()
    expect(screen.queryByText('Adobe Photoshop 2025')).not.toBeInTheDocument()
  })

  it('hides unrelated ranked apps while a search query is active', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [
        {
          id: 'app:claude',
          type: 'app',
          title: 'Claude',
          hint: 'Application',
          aliases: ['Claude'],
          rank: 35,
        },
        {
          id: 'app:java',
          type: 'app',
          title: 'About Java',
          hint: 'Application',
          aliases: ['About Java'],
          rank: 30,
        },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('About Java')

    const input = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.change(input, { target: { value: 'claude' } })

    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.queryByText('About Java')).not.toBeInTheDocument()
  })

  it('supports follow-up searches from the cached browse app list', async () => {
    window.commandCenter.getIndex = vi.fn(async (query?: string) => ({
      workflows: [],
      apps: query
        ? [{
            id: 'app:kiro',
            type: 'app',
            title: 'Kiro',
            hint: 'Application',
            aliases: ['Kiro'],
          }]
        : [
            {
              id: 'app:kiro',
              type: 'app',
              title: 'Kiro',
              hint: 'Application',
              aliases: ['Kiro'],
            },
            {
              id: 'app:claude',
              type: 'app',
              title: 'Claude',
              hint: 'Application',
              aliases: ['Claude'],
            },
          ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('Claude')

    const input = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.change(input, { target: { value: 'kiro' } })
    await waitFor(() => {
      expect(screen.getByText('Kiro')).toBeInTheDocument()
      expect(screen.queryByText('Claude')).not.toBeInTheDocument()
    })

    fireEvent.change(input, { target: { value: 'claude' } })
    await waitFor(() => {
      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.queryByText('Kiro')).not.toBeInTheDocument()
    })
  })

  it('shows matching apps immediately while main search results load', async () => {
    window.commandCenter.getIndex = vi.fn(async (query?: string) => ({
      workflows: [],
      apps: query === 'kiro'
        ? [
            {
              id: 'app:kiro',
              type: 'app',
              title: 'Kiro',
              hint: 'Application',
              aliases: [],
              appUserModelId: 'Kiro',
            },
          ]
        : [
            {
              id: 'app:kiro',
              type: 'app',
              title: 'Kiro',
              hint: 'Application',
              aliases: [],
              appUserModelId: 'Kiro',
            },
            {
              id: 'app:chrome',
              type: 'app',
              title: 'Chrome',
              hint: 'Application',
              aliases: [],
              appPath: 'C:\\Chrome.lnk',
            },
          ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('Chrome')

    const input = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.change(input, { target: { value: 'kiro' } })

    expect(screen.getByText('Kiro')).toBeInTheDocument()
    expect(screen.queryByText('Chrome')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(window.commandCenter.getIndex).toHaveBeenCalledWith('kiro')
    })
  })

  it('refreshes app rows after lazy icon extraction has time to complete', async () => {
    let callCount = 0
    window.commandCenter.getIndex = vi.fn(async () => {
      callCount += 1
      return {
        workflows: [],
        apps: [
          {
            id: 'app:kiro',
            type: 'app',
            title: 'Kiro',
            hint: 'Application',
            aliases: ['Kiro'],
            iconKey: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
            iconDataUrl: callCount > 1 ? 'data:image/png;base64,kiro' : undefined,
          },
        ],
        windows: [],
        actions: [],
        chats: [],
      }
    })

    const { container } = render(<CommandCenterOverlay />)

    await screen.findByText('Kiro')
    await waitFor(() => {
      expect(container.querySelector('.command-center-result__app-icon')).toHaveAttribute('src', 'data:image/png;base64,kiro')
    })
    expect(window.commandCenter.getIndex).toHaveBeenCalledTimes(2)
  })

  it('shows app index diagnostics when apps are partially unavailable', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [],
      windows: [],
      actions: [],
      chats: [],
      diagnostics: {
        apps: {
          ok: false,
          error: 'Get-StartApps failed',
          sourceCounts: {},
        },
      },
    }))

    render(<CommandCenterOverlay />)

    expect(await screen.findByText(/Apps may be incomplete: Get-StartApps failed/i)).toBeInTheDocument()
  })
})
