import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        executeItemAction: vi.fn(async () => ({ success: true, dismiss: true })),
        insertEmoji: vi.fn(async () => ({ success: true })),
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

    expect(
      await screen.findByRole('textbox', { name: /search command center/i })
    ).toBeInTheDocument()
    const workflow = await screen.findByText('Morning startup')
    const app = await screen.findByText('Chrome')

    expect(workflow.compareDocumentPosition(app) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows an Actions menu for the selected app and runs a secondary action', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [
        {
          id: 'app:chrome',
          type: 'app',
          title: 'Chrome',
          hint: 'Application',
          aliases: ['Chrome'],
          appPath: 'C:\\Chrome.lnk',
          shortcutPath: 'C:\\Chrome.lnk',
          iconDataUrl: 'data:image/png;base64,icon',
        },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))
    window.commandCenter.executeItemAction = vi.fn(async () => ({
      success: true,
      dismiss: false,
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('Chrome')

    // First result is pre-selected; Actions should be available for apps.
    expect(screen.getByRole('button', { name: /^actions$/i })).toBeInTheDocument()

    // Ctrl+K opens the Actions menu (Raycast-style); more reliable in jsdom than
    // synthesizing a full Radix pointer open sequence.
    const input = screen.getByRole('textbox', { name: /search command center/i })
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })

    expect(await screen.findByText('Show in File Explorer')).toBeInTheDocument()
    expect(screen.getByText('Copy Path')).toBeInTheDocument()
    expect(screen.getByText('Copy Name')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Copy Path'))
    await waitFor(() => {
      expect(window.commandCenter.executeItemAction).toHaveBeenCalledWith(
        'app:chrome',
        'copy-path',
        ''
      )
    })
    expect(screen.queryByText('Path copied.')).not.toBeInTheDocument()
    expect(window.commandCenter.hide).not.toHaveBeenCalled()
  })

  it('opens the Actions menu when right-clicking an app row', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [
        {
          id: 'app:chrome',
          type: 'app',
          title: 'Chrome',
          hint: 'Application',
          aliases: ['Chrome'],
          appPath: 'C:\\Chrome.lnk',
          shortcutPath: 'C:\\Chrome.lnk',
        },
        {
          id: 'app:kiro',
          type: 'app',
          title: 'Kiro',
          hint: 'Application',
          aliases: ['Kiro'],
          appPath: 'C:\\Kiro.lnk',
          shortcutPath: 'C:\\Kiro.lnk',
        },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('Chrome')

    fireEvent.contextMenu(screen.getByText('Kiro'))

    expect(await screen.findByRole('menu', { name: /kiro actions/i })).toBeInTheDocument()
    expect(screen.getByText('Show in File Explorer')).toBeInTheDocument()
    expect(screen.getByText('Copy Name')).toBeInTheDocument()
  })

  it('keeps previous results painted when the overlay is shown again', async () => {
    let shownHandler: (() => void) | undefined
    window.commandCenter.onShown = vi.fn((callback: () => void) => {
      shownHandler = callback
      return () => undefined
    })
    let reopenPhase = false
    window.commandCenter.getIndex = vi.fn(async () => {
      if (!reopenPhase) {
        return {
          workflows: [],
          apps: [
            {
              id: 'app:chrome',
              type: 'app',
              title: 'Chrome',
              hint: 'Application',
              aliases: ['Chrome'],
              iconDataUrl: 'data:image/png;base64,icon',
            },
          ],
          windows: [],
          actions: [],
          chats: [],
        }
      }
      // Reopen: delay the response so we can assert the list stays painted.
      await new Promise((resolve) => setTimeout(resolve, 80))
      return {
        workflows: [],
        apps: [
          {
            id: 'app:chrome',
            type: 'app',
            title: 'Chrome',
            hint: 'Application',
            aliases: ['Chrome'],
            iconDataUrl: 'data:image/png;base64,icon',
          },
          {
            id: 'app:kiro',
            type: 'app',
            title: 'Kiro',
            hint: 'Application',
            aliases: ['Kiro'],
          },
        ],
        windows: [],
        actions: [],
        chats: [],
      }
    })

    render(<CommandCenterOverlay />)
    expect(await screen.findByText('Chrome')).toBeInTheDocument()

    reopenPhase = true
    act(() => {
      shownHandler?.()
    })
    // Soft reopen must not blank the list while the refresh is in flight.
    expect(screen.getByText('Chrome')).toBeInTheDocument()
    expect(screen.queryByText(/Loading Command Center/i)).not.toBeInTheDocument()

    expect(await screen.findByText('Kiro')).toBeInTheDocument()
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
    fireEvent.keyDown(screen.getByRole('textbox', { name: /search command center/i }), {
      key: 'Enter',
    })

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
        {
          id: 'app:kiro',
          type: 'app',
          title: 'Kiro',
          hint: 'Application',
          aliases: ['Kiro'],
          rank: 12,
        },
        {
          id: 'app:java',
          type: 'app',
          title: 'About Java',
          hint: 'Application',
          aliases: ['About Java'],
          rank: 30,
        },
        {
          id: 'app:adobe',
          type: 'app',
          title: 'Adobe Photoshop 2025',
          hint: 'Application',
          aliases: ['Adobe Photoshop 2025'],
          rank: 25,
        },
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
        ? [
            {
              id: 'app:kiro',
              type: 'app',
              title: 'Kiro',
              hint: 'Application',
              aliases: ['Kiro'],
            },
          ]
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
      apps:
        query === 'kiro'
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
            iconPending: callCount === 1,
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
      expect(container.querySelector('.command-center-result__app-icon')).toHaveAttribute(
        'src',
        'data:image/png;base64,kiro'
      )
    })
    expect(window.commandCenter.getIndex).toHaveBeenCalledTimes(2)
  })

  it('does not keep polling when app icons are missing but not pending', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [
        {
          id: 'app:kiro',
          type: 'app',
          title: 'Kiro',
          hint: 'Application',
          aliases: ['Kiro'],
          iconKey: 'C:\\Users\\Nikhil\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
          iconDataUrl: undefined,
          iconPending: false,
        },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('Kiro')
    // Mount triggers an initial load plus a zero-delay search refresh; neither
    // should reschedule once icons are settled (iconPending: false).
    await new Promise((resolve) => setTimeout(resolve, 250))
    const callsAfterSettle = (window.commandCenter.getIndex as ReturnType<typeof vi.fn>).mock
      .calls.length
    expect(callsAfterSettle).toBeLessThanOrEqual(2)
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(window.commandCenter.getIndex).toHaveBeenCalledTimes(callsAfterSettle)
  })

  it('keeps a previously loaded app icon when a refresh temporarily omits it', async () => {
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
            iconDataUrl: callCount === 1 ? 'data:image/png;base64,kiro' : undefined,
            iconPending: callCount === 1,
          },
        ],
        windows: [],
        actions: [],
        chats: [],
      }
    })

    const { container } = render(<CommandCenterOverlay />)
    await waitFor(() => {
      expect(container.querySelector('.command-center-result__app-icon')).toHaveAttribute(
        'src',
        'data:image/png;base64,kiro'
      )
    })
    // Second poll (pending on first response) returns without the data URL;
    // sticky merge should keep the icon painted.
    await waitFor(() => {
      expect(window.commandCenter.getIndex).toHaveBeenCalledTimes(2)
    })
    expect(container.querySelector('.command-center-result__app-icon')).toHaveAttribute(
      'src',
      'data:image/png;base64,kiro'
    )
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

    expect(
      await screen.findByText(/Apps may be incomplete: Get-StartApps failed/i)
    ).toBeInTheDocument()
  })

  it('shows Zura Extras as a list category and opens Emojis from a normal result row', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [],
      windows: [],
      actions: [
        {
          id: 'action:system-status',
          type: 'action',
          title: 'System status',
          subtitle: 'system',
          hint: 'Action',
          aliases: ['status'],
          actionId: 'system-status',
        },
        {
          id: 'action:emoji-picker',
          type: 'action',
          title: 'Emojis',
          subtitle: 'Search and paste emoji',
          hint: 'Command',
          aliases: ['emoji'],
          actionId: 'emoji-picker',
        },
      ],
      chats: [],
    }))

    render(<CommandCenterOverlay />)

    expect(await screen.findByRole('heading', { name: 'Zura Extras' })).toBeInTheDocument()
    expect(screen.getByText('Emojis')).toBeInTheDocument()
    expect(screen.getByText('Search and paste emoji')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Additional' })).not.toBeInTheDocument()
    expect(screen.getByText('System status')).toBeInTheDocument()

    fireEvent.doubleClick(screen.getByRole('button', { name: /Emojis/i }))
    const emojiSearch = await screen.findByRole('textbox', { name: /search emojis/i })
    expect(await screen.findByRole('heading', { name: 'Popular' })).toBeInTheDocument()

    fireEvent.change(emojiSearch, { target: { value: 'rocket' } })
    const rocket = await screen.findByRole('option', { name: 'Rocket' })
    expect(rocket).toBeInTheDocument()
    expect(rocket).toHaveTextContent('🚀')
    // Grid cells are glyph-only (no name/keyword labels in the list).
    expect(screen.queryByText('Paste')).not.toBeInTheDocument()

    fireEvent.keyDown(emojiSearch, { key: 'Enter' })
    await waitFor(() => expect(window.commandCenter.insertEmoji).toHaveBeenCalledWith('🚀'))
    expect(window.commandCenter.executeIndexItem).not.toHaveBeenCalledWith(
      'action:emoji-picker',
      ''
    )

    fireEvent.keyDown(emojiSearch, { key: 'Escape' })
    const rootSearch = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.change(rootSearch, { target: { value: ':fire' } })
    const quickEmojiSearch = await screen.findByRole('textbox', { name: /search emojis/i })
    expect(quickEmojiSearch).toHaveValue('fire')
    expect(await screen.findByRole('option', { name: 'Fire' })).toHaveTextContent('🔥')
  })
})
