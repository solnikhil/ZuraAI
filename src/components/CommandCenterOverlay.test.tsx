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
      appInfo: {
        get: vi.fn(async () => ({ isPackaged: false })),
      },
      extensions: {
        list: vi.fn(async () => [
          {
            manifest: {
              schemaVersion: 1,
              id: 'com.zuraai.github',
              name: 'GitHub Workspace',
              publisher: '@zuraai',
              version: '1.0.0',
              description: 'Git repository workflows inside Command Center.',
              icon: 'assets/icon.svg',
              platforms: ['windows'],
              categories: ['Productivity'],
              commands: [{ id: 'workspace', title: 'GitHub', mode: 'workspace', entry: 'host:git-workspace', keywords: ['github'] }],
              permissions: ['github.account'],
              capabilities: { host: ['git-workspace'] },
              networkDomains: ['github.com'],
              privacy: { dataLeavesDevice: true },
            },
            trust: 'reviewed', installed: false, enabled: false, updateAvailable: false, source: 'bundled', validationErrors: [],
          },
          {
            manifest: {
              schemaVersion: 1,
              id: 'com.zuraai.welcome',
              name: 'Welcome Kit',
              publisher: '@zuraai',
              version: '1.0.0',
              description: 'A safe example extension.',
              icon: 'assets/icon.svg',
              platforms: ['windows'],
              categories: ['Productivity'],
              commands: [{ id: 'welcome', title: 'Welcome Kit', mode: 'view', entry: 'ui/welcome.json', keywords: ['welcome'] }],
              permissions: ['storage.local'],
              privacy: { dataLeavesDevice: false },
            },
            trust: 'reviewed', installed: false, enabled: false, updateAvailable: false, source: 'bundled', validationErrors: [],
          },
        ]),
        prepareMutation: vi.fn(),
        applyMutation: vi.fn(),
        setEnabled: vi.fn(),
        importDevelopment: vi.fn(),
        removeDevelopment: vi.fn(),
        getView: vi.fn(),
        executeAction: vi.fn(),
        executeNoView: vi.fn(),
        getStorage: vi.fn(),
        onChanged: vi.fn(() => vi.fn()),
      },
      githubWorkspace: {
        getState: vi.fn(),
        addRepository: vi.fn(),
        startSignIn: vi.fn(),
        signOut: vi.fn(),
        disconnect: vi.fn(),
        copyUserCode: vi.fn(async () => true),
        mutate: vi.fn(),
        selectDiff: vi.fn(),
        onChanged: vi.fn(() => vi.fn()),
      },
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
        onHidden: vi.fn(() => vi.fn()),
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

    const actionsMenu = await screen.findByRole('menu', { name: /chrome actions/i })
    expect(
      actionsMenu.querySelector('.command-center-actions-popover__title-icon img')
    ).toHaveAttribute('src', 'data:image/png;base64,icon')
    const openAction = screen.getByRole('menuitem', { name: /open application/i })
    const showInExplorerAction = screen.getByRole('menuitem', {
      name: /show in file explorer/i,
    })
    await waitFor(() => expect(openAction).toHaveFocus())
    expect(document.querySelector('.command-center-panel')).toHaveClass('has-actions-menu')
    fireEvent.keyDown(openAction, { key: 'ArrowDown' })
    expect(showInExplorerAction).toHaveFocus()
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
    let hiddenHandler: (() => void) | undefined
    window.commandCenter.onShown = vi.fn((callback: () => void) => {
      shownHandler = callback
      return () => undefined
    })
    window.commandCenter.onHidden = vi.fn((callback: () => void) => {
      hiddenHandler = callback
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
      hiddenHandler?.()
      shownHandler?.()
    })
    // Soft reopen must not blank the list while the refresh is in flight.
    expect(screen.getByText('Chrome')).toBeInTheDocument()
    expect(screen.queryByText(/Loading Command Center/i)).not.toBeInTheDocument()

    expect(await screen.findByText('Kiro')).toBeInTheDocument()
  })

  it('restores the last screen when reopened within the session resume window', async () => {
    let shownHandler: (() => void) | undefined
    let hiddenHandler: (() => void) | undefined
    window.commandCenter.onShown = vi.fn((callback: () => void) => {
      shownHandler = callback
      return () => undefined
    })
    window.commandCenter.onHidden = vi.fn((callback: () => void) => {
      hiddenHandler = callback
      return () => undefined
    })
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [],
      windows: [],
      actions: [
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
    await screen.findByRole('heading', { name: 'Zura Extras' })
    fireEvent.doubleClick(screen.getByRole('option', { name: /Emojis/i }))
    const emojiSearch = await screen.findByRole('textbox', { name: /search emojis/i })
    fireEvent.change(emojiSearch, { target: { value: 'rocket' } })
    expect(await screen.findByRole('option', { name: 'Rocket' })).toBeInTheDocument()

    act(() => {
      hiddenHandler?.()
    })
    act(() => {
      shownHandler?.()
    })

    expect(await screen.findByRole('textbox', { name: /search emojis/i })).toHaveValue('rocket')
    expect(screen.getByRole('option', { name: 'Rocket' })).toBeInTheDocument()
  })

  it('shows Suggestions first on empty browse from ranked bestMatches', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      bestMatches: [
        {
          id: 'app:kiro',
          type: 'app',
          title: 'Kiro',
          subtitle: 'Application',
          hint: 'Application',
          aliases: ['kiro'],
          score: 900,
          rank: 900,
        },
      ],
      workflows: [],
      apps: [
        {
          id: 'app:chrome',
          type: 'app',
          title: 'Chrome',
          subtitle: 'Application',
          hint: 'Application',
          aliases: ['browser'],
          score: 10,
          rank: 10,
        },
        {
          id: 'app:kiro',
          type: 'app',
          title: 'Kiro',
          subtitle: 'Application',
          hint: 'Application',
          aliases: ['kiro'],
          score: 900,
          rank: 900,
        },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)

    expect(await screen.findByRole('heading', { name: 'Suggestions' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Best Matches' })).not.toBeInTheDocument()
    const options = screen.getAllByRole('option')
    // Kiro is only listed under Suggestions (deduped out of Apps).
    expect(options[0]).toHaveTextContent('Kiro')
    expect(screen.getByRole('heading', { name: 'Apps' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Chrome/i })).toBeInTheDocument()
  })

  it('opens the manifest-backed Zura Store and filters discovered extensions', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [],
      windows: [],
      actions: [
        {
          id: 'action:zura-store',
          type: 'action',
          title: 'Zura Store',
          subtitle: 'Discover extensions for Command Center',
          hint: 'Command',
          aliases: ['extensions', 'plugins'],
          actionId: 'zura-store',
        },
      ],
      chats: [],
    }))

    render(<CommandCenterOverlay />)

    fireEvent.doubleClick(await screen.findByRole('option', { name: /Zura Store/i }))

    expect(await screen.findByRole('heading', { name: 'Zura Store' })).toBeInTheDocument()
    expect(await screen.findByText('GitHub Workspace')).toBeInTheDocument()
    expect(screen.getByText('Welcome Kit')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: /search zura store/i })
    fireEvent.change(search, { target: { value: 'Welcome' } })

    expect(await screen.findByText('Welcome Kit')).toBeInTheDocument()
    expect(screen.queryByText('GitHub Workspace')).not.toBeInTheDocument()
  })

  it('resets to home when reopened after the session resume window expires', async () => {
    let shownHandler: (() => void) | undefined
    let hiddenHandler: (() => void) | undefined
    window.commandCenter.onShown = vi.fn((callback: () => void) => {
      shownHandler = callback
      return () => undefined
    })
    window.commandCenter.onHidden = vi.fn((callback: () => void) => {
      hiddenHandler = callback
      return () => undefined
    })
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [],
      windows: [],
      actions: [
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
    fireEvent.doubleClick(await screen.findByRole('option', { name: /Emojis/i }))
    expect(await screen.findByRole('textbox', { name: /search emojis/i })).toBeInTheDocument()

    const hiddenAt = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => hiddenAt)
    act(() => {
      hiddenHandler?.()
    })
    // Past the 2-minute soft-resume window.
    vi.spyOn(Date, 'now').mockImplementation(() => hiddenAt + 2 * 60 * 1000 + 1)
    act(() => {
      shownHandler?.()
    })

    expect(
      await screen.findByRole('textbox', { name: /search command center/i })
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /search emojis/i })).not.toBeInTheDocument()
    vi.restoreAllMocks()
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

  it('ignores stale empty-browse scores so frequent apps do not match unrelated queries', async () => {
    // Main still returns empty-browse rows (high score/rank) until the debounced
    // query-specific getIndex resolves. Client scoring must not treat those scores
    // as lexical matches.
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [
        {
          id: 'app:spotify',
          type: 'app',
          title: 'Spotify',
          hint: 'Application',
          aliases: ['Spotify'],
          rank: 1500,
          score: 1600,
        },
        {
          id: 'app:kiro',
          type: 'app',
          title: 'Kiro',
          hint: 'Application',
          aliases: ['Kiro'],
          rank: 10,
          score: 20,
        },
      ],
      windows: [],
      actions: [],
      chats: [],
    }))

    render(<CommandCenterOverlay />)
    await screen.findByText('Spotify')

    const input = await screen.findByRole('textbox', { name: /search command center/i })
    fireEvent.change(input, { target: { value: 'kiro' } })

    expect(screen.getByText('Kiro')).toBeInTheDocument()
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument()
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
    // Initial load + zero-delay search refresh (+ optional one cold windows follow-up).
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
    const callsAfterSettle = (window.commandCenter.getIndex as ReturnType<typeof vi.fn>).mock.calls
      .length
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

  it('keeps removed utilities hidden while retaining the emoji command', async () => {
    window.commandCenter.getIndex = vi.fn(async () => ({
      workflows: [],
      apps: [],
      windows: [],
      actions: [
        {
          id: 'action:system-status',
          type: 'action',
          title: 'System status',
          subtitle: 'Battery, disk, and network snapshot',
          hint: 'Action',
          aliases: ['status'],
          actionId: 'system-status',
        },
        {
          id: 'action:snap-left',
          type: 'action',
          title: 'Snap left',
          subtitle: 'Tile the active window left',
          hint: 'Action',
          aliases: ['tile left'],
          actionId: 'snap-left',
        },
        {
          id: 'action:snap-right',
          type: 'action',
          title: 'Snap right',
          subtitle: 'Tile the active window right',
          hint: 'Action',
          aliases: ['tile right'],
          actionId: 'snap-right',
        },
        {
          id: 'action:maximize-window',
          type: 'action',
          title: 'Maximize',
          subtitle: 'Maximize the active window',
          hint: 'Action',
          aliases: ['fullscreen'],
          actionId: 'maximize-window',
        },
        {
          id: 'action:layout',
          type: 'action',
          title: 'Layout',
          subtitle: 'Snap, tile, and maximize the active window',
          hint: 'Command',
          aliases: ['snap', 'tile'],
          actionId: 'layout',
        },
        {
          id: 'action:settings',
          type: 'action',
          title: 'Settings',
          subtitle: 'Open Windows Settings pages',
          hint: 'Command',
          aliases: ['windows settings'],
          actionId: 'settings',
        },
        {
          id: 'action:settings-display',
          type: 'action',
          title: 'Display',
          subtitle: 'Resolution, scaling, multiple displays',
          hint: 'Action',
          aliases: ['screen'],
          actionId: 'settings-display',
        },
        {
          id: 'action:open-windows-copilot',
          type: 'action',
          title: 'Windows Copilot',
          subtitle: 'Open Windows Copilot',
          hint: 'Action',
          aliases: ['copilot'],
          actionId: 'open-windows-copilot',
        },
        {
          id: 'action:open-downloads',
          type: 'action',
          title: 'Open Downloads',
          subtitle: 'Open your Downloads folder',
          hint: 'Action',
          aliases: ['downloads folder'],
          actionId: 'open-downloads',
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
        {
          id: 'action:zura-ai-chats',
          type: 'action',
          title: 'Zura AI Chats',
          subtitle: 'Browse recent Zura AI chats',
          hint: 'Command',
          aliases: ['chats'],
          actionId: 'zura-ai-chats',
        },
      ],
      chats: [
        {
          id: 'chat:demo',
          type: 'chat',
          title: 'Demo chat',
          subtitle: '2 messages',
          hint: 'Chat',
          aliases: ['Demo chat'],
          sessionId: 'demo',
        },
      ],
    }))

    render(<CommandCenterOverlay />)

    expect(await screen.findByRole('heading', { name: 'Zura Extras' })).toBeInTheDocument()
    // System status + Open Downloads ship under Zura Extras (no System/Files sections).
    expect(screen.queryByRole('heading', { name: 'System' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Files' })).not.toBeInTheDocument()
    // Settings is a Zura Extras section entry — not a top-level category of pages.
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
    expect(screen.queryByText('Windows Copilot')).not.toBeInTheDocument()
    expect(screen.queryByText('Ask about clipboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Focus ZuraAI')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Windows' })).not.toBeInTheDocument()
    // Layout section entry lives under Zura Extras; snap tools are not top-level.
    expect(screen.queryByText('Layout')).not.toBeInTheDocument()
    expect(screen.queryByText('Snap left')).not.toBeInTheDocument()
    expect(screen.queryByText('Maximize')).not.toBeInTheDocument()
    expect(screen.queryByText('System status')).not.toBeInTheDocument()
    expect(screen.queryByText('Display')).not.toBeInTheDocument()
    expect(screen.queryByText('Open Downloads')).not.toBeInTheDocument()
    expect(screen.getByText('Emojis')).toBeInTheDocument()
    expect(screen.queryByText('Zura AI Chats')).not.toBeInTheDocument()
    expect(screen.queryByText('Demo chat')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Chats' })).not.toBeInTheDocument()

    fireEvent.doubleClick(await screen.findByRole('option', { name: /Emojis/i }))
    const emojiSearch = await screen.findByRole('textbox', { name: /search emojis/i })
    expect(await screen.findByRole('heading', { name: /All Emojis/i })).toBeInTheDocument()

    fireEvent.change(emojiSearch, { target: { value: 'rocket' } })
    const rocket = await screen.findByRole('option', { name: 'Rocket' })
    expect(rocket).toBeInTheDocument()
    expect(rocket).toHaveTextContent('🚀')
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
