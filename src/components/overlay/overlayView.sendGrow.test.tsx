import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '@/chat/types'
import type { IElectronAPI } from '@/electron/types'
import { AgentToolApprovalProvider } from '@/agent/AgentToolApprovalContext'
import { ChatHistoryProvider } from '@/contexts/ChatHistoryContext'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { StreamingProvider } from '@/contexts/StreamingContext'
import { defaultSettingsConfig } from '@/contexts/settingsStore'
import { ToastProvider } from '@/components/shared/Toast'
import OverlayView from '@/components/OverlayView'
import { OVERLAY_IDLE_HEIGHT } from './overlayLayout'
import { applyOverlayRouteDocumentClasses, clearOverlayRouteDocumentClasses } from './overlayDocument'
import './overlay.css'

const LAST_SESSION_ID_KEY = 'zura-ui:lastChatSessionId'
const setContentHeight = vi.fn().mockResolvedValue({})

/** Only the provider stream boundary is mocked; send uses real useStreamingChat + ChatHistory. */
const runProviderStream = vi.fn(async () => ({
  content: 'Assistant overlay reply',
  usage: { inputTokens: 4, outputTokens: 8, totalTokens: 12 },
}))

vi.mock('@/utils/secureApiKeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/secureApiKeys')>()
  return {
    ...actual,
    resolveProviderApiKeysForSettings: vi.fn(async (settings: Record<string, unknown>) => ({
      ...settings,
      groqApiKey: 'test-groq-key',
    })),
  }
})

vi.mock('@/prompts/buildMemoryBlock', () => ({
  loadMemoryBlock: vi.fn(async () => ''),
}))

vi.mock('@/prompts/buildRecentActivityBlock', () => ({
  loadRecentActivityBlock: vi.fn(async () => ''),
}))

vi.mock('@/services/titleGenerator', () => ({
  generateChatTitle: vi.fn().mockResolvedValue('Overlay chat'),
}))

vi.mock('@/services/memoryExtraction', () => ({
  runMemoryExtraction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/analytics/track', () => ({
  trackAnalytics: vi.fn(),
  trackRendererError: vi.fn(),
}))

vi.mock('../Dashboard/ChatArea/hooks/streaming', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../Dashboard/ChatArea/hooks/streaming')>()
  return {
    ...actual,
    useProviderStreaming: () => ({ runProviderStream }),
  }
})

let persistedSessions: ChatSession[] = []

function sessionMetadata(session: ChatSession) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pinned: session.pinned ?? false,
    folderId: session.folderId ?? null,
    tags: session.tags ?? [],
    messageCount: session.messages.length,
  }
}

function OverlayTestApp() {
  return (
    <SettingsProvider>
      <ChatHistoryProvider>
        <StreamingProvider>
          <ToastProvider>
            <AgentToolApprovalProvider>
              <OverlayView />
            </AgentToolApprovalProvider>
          </ToastProvider>
        </StreamingProvider>
      </ChatHistoryProvider>
    </SettingsProvider>
  )
}

describe('overlayView send-grow', () => {
  beforeEach(() => {
    persistedSessions = [
      {
        id: 'remembered-session',
        title: 'Dashboard chat',
        messages: [
          {
            id: 'old-user',
            role: 'user',
            content: 'Old dashboard message',
            timestamp: 1,
          },
        ],
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
        if (channel === 'chat-store:get-metadata') return persistedSessions.map(sessionMetadata)
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
      setContentHeight,
      hide: vi.fn().mockResolvedValue({}),
      onPendingPrompt: undefined,
    }

    applyOverlayRouteDocumentClasses()
    setContentHeight.mockClear()
    runProviderStream.mockClear()

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    clearOverlayRouteDocumentClasses()
    vi.restoreAllMocks()
    localStorage.clear()
    delete (window as unknown as { overlay?: unknown }).overlay
  })

  it('idle pill → Enter send via useStreamingChat → user + assistant visible → setContentHeight grows', async () => {
    render(<OverlayTestApp />)

    await waitFor(() => {
      expect(screen.queryByText('Old dashboard message')).toBeNull()
      expect(document.querySelector('.zo-card')).toBeNull()
    })

    await waitFor(() => {
      expect(setContentHeight).toHaveBeenCalled()
      const idleHeights = setContentHeight.mock.calls.map((call) => call[0] as number)
      expect(Math.max(...idleHeights)).toBeGreaterThanOrEqual(OVERLAY_IDLE_HEIGHT - 2)
    })

    const textarea = await screen.findByLabelText('Ask ZuraAI')
    fireEvent.change(textarea, { target: { value: 'hello overlay' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(runProviderStream).toHaveBeenCalled()
    }, { timeout: 5000 })

    await waitFor(() => {
      expect(screen.getByText('hello overlay')).toBeTruthy()
      expect(screen.getByText('Assistant overlay reply')).toBeTruthy()
    }, { timeout: 5000 })

    await waitFor(() => {
      const expandedHeights = setContentHeight.mock.calls.map((call) => call[0] as number)
      expect(Math.max(...expandedHeights)).toBeGreaterThan(OVERLAY_IDLE_HEIGHT)
    })

    expect(localStorage.getItem(LAST_SESSION_ID_KEY)).toBe('remembered-session')
  })
})