import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '@/chat/types'
import type { IElectronAPI } from '@/electron/types'
import { ChatHistoryProvider, useChatHistory } from '@/contexts/ChatHistoryContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { StreamingProvider } from '@/contexts/StreamingContext'
import { defaultSettingsConfig } from '@/contexts/settingsStore'
import { ToastProvider } from '@/components/shared/Toast'
import { AgentToolApprovalProvider } from '@/agent/AgentToolApprovalContext'
import OverlayView from '@/components/OverlayView'
import { isOverlayRoute } from './overlaySessionPolicy'
import './overlay.css'

vi.mock('../Dashboard/ChatArea/hooks/streaming', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Dashboard/ChatArea/hooks/streaming')>()
  return {
    ...actual,
    useProviderStreaming: () => ({
      runProviderStream: vi.fn(async () => ({
        content: 'unused in idle policy test',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      })),
    }),
  }
})

vi.mock('@/utils/secureApiKeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/secureApiKeys')>()
  return {
    ...actual,
    resolveProviderApiKeysForSettings: vi.fn(async (settings: Record<string, unknown>) => settings),
  }
})

vi.mock('@/prompts/buildMemoryBlock', () => ({ loadMemoryBlock: vi.fn(async () => '') }))
vi.mock('@/prompts/buildRecentActivityBlock', () => ({ loadRecentActivityBlock: vi.fn(async () => '') }))
vi.mock('@/services/titleGenerator', () => ({ generateChatTitle: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/memoryExtraction', () => ({ runMemoryExtraction: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/analytics/track', () => ({ trackAnalytics: vi.fn(), trackRendererError: vi.fn() }))

const LAST_SESSION_ID_KEY = 'zura-ui:lastChatSessionId'
let persistedSessions: ChatSession[] = []

function SessionProbe() {
  const { currentSessionId } = useChatHistory()
  return <div data-testid="current-session-id">{currentSessionId ?? 'none'}</div>
}

function OverlayIdleApp() {
  return (
    <SettingsProvider>
      <ChatHistoryProvider>
        <StreamingProvider>
          <ToastProvider>
            <AgentToolApprovalProvider>
              <SessionProbe />
              <OverlayView />
            </AgentToolApprovalProvider>
          </ToastProvider>
        </StreamingProvider>
      </ChatHistoryProvider>
    </SettingsProvider>
  )
}

describe('overlay session policy', () => {
  beforeEach(() => {
    persistedSessions = [
      {
        id: 'remembered-session',
        title: 'Dashboard chat',
        messages: [{ id: 'm1', role: 'user', content: 'Old dashboard message', timestamp: 1 }],
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    localStorage.setItem(
      'zura-settings',
      JSON.stringify({
        ...defaultSettingsConfig,
        modelProvider: 'groq',
        aiModel: 'test-model/groq',
        rememberLastChatSession: true,
        groqModels: [{ code: 'test-model/groq', displayName: 'Test Model', enabled: true }],
        providerEnabled: { groq: true },
      })
    )
    localStorage.setItem(LAST_SESSION_ID_KEY, 'remembered-session')
    window.location.hash = '#/overlay?material=acrylic'

    ;(window as typeof window & { ipcRenderer: IElectronAPI }).ipcRenderer = {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
        if (channel === 'chat-store:get-metadata') {
          return persistedSessions.map((session) => ({
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messages.length,
          }))
        }
        if (channel === 'chat-store:get-session') {
          return persistedSessions.find((session) => session.id === args[0]) ?? null
        }
        if (channel === 'chat-store:save-session') {
          const nextSession = args[0] as ChatSession
          persistedSessions = [
            nextSession,
            ...persistedSessions.filter((session) => session.id !== nextSession.id),
          ]
          return true
        }
        if (channel === 'chat-store:save-index') return true
        if (channel === 'chat-store:get-all') return persistedSessions
        if (channel === 'chat-store:get-all-folders') return []
        if (channel === 'chat-store:migrate') return true
        throw new Error(`Unexpected channel: ${channel}`)
      }),
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    } as unknown as IElectronAPI

    ;(window as unknown as { overlay: unknown }).overlay = {
      setContentHeight: vi.fn().mockResolvedValue({}),
      hide: vi.fn().mockResolvedValue({}),
    }
  })

  afterEach(() => {
    localStorage.clear()
    delete (window as unknown as { overlay?: unknown }).overlay
  })

  it('detects the overlay route from the hash', () => {
    expect(isOverlayRoute({ hash: '#/overlay?material=acrylic' })).toBe(true)
    expect(isOverlayRoute({ hash: '#/dashboard' })).toBe(false)
  })

  it('does not restore or clear the remembered dashboard session on overlay mount', async () => {
    render(<OverlayIdleApp />)

    await waitFor(() => {
      expect(screen.getByTestId('current-session-id').textContent).toBe('none')
    })

    expect(localStorage.getItem(LAST_SESSION_ID_KEY)).toBe('remembered-session')
    expect(screen.queryByText('Old dashboard message')).toBeNull()
    expect(document.querySelector('.zo-card')).toBeNull()
  })

  it('new chat resets overlay to idle without clearing the dashboard last-session id', async () => {
    render(<OverlayIdleApp />)

    await waitFor(() => {
      expect(screen.getByTestId('current-session-id').textContent).toBe('none')
    })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Hello overlay' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText('Hello overlay')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('New chat'))

    await waitFor(() => {
      expect(screen.getByTestId('current-session-id').textContent).toBe('none')
    })

    expect(localStorage.getItem(LAST_SESSION_ID_KEY)).toBe('remembered-session')
    expect(screen.queryByText('Hello overlay')).toBeNull()
    expect(document.querySelector('.zo-card')).toBeNull()
  })
})