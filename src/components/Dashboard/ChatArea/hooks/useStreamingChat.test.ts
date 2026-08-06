import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  addMessageToSession: vi.fn(() => 'msg-id'),
  createSession: vi.fn(() => 'session-new'),
  updateStreamingMessage: vi.fn(),
  deleteMessageFromSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  startStreaming: vi.fn(),
  updateStreaming: vi.fn(),
  completeStreaming: vi.fn(() => ({
    sessionId: 'session-1',
    messageId: 'msg-id',
    content: 'Hello',
    isStreaming: false,
  })),
  cancelStreaming: vi.fn(),
  showToast: vi.fn(),
  requestApproval: vi.fn(),
  runProviderStream: vi.fn(async () => ({
    content: 'Hello',
    model: 'test/model',
    finishReason: 'stop',
  })),
}))

vi.mock('../attachmentUtils', () => ({
  buildProviderMessages: vi.fn((msgs: unknown[]) => msgs),
  canAnalyzeImageAttachments: vi.fn(() => true),
  isImageAttachment: vi.fn(() => false),
}))

vi.mock('../../../../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    sessions: [{ id: 'session-1', messages: [] }],
    folders: [],
    currentSessionId: 'session-1',
    addMessageToSession: mocks.addMessageToSession,
    updateStreamingMessage: mocks.updateStreamingMessage,
    createSession: mocks.createSession,
    updateSessionTitle: mocks.updateSessionTitle,
    deleteMessageFromSession: mocks.deleteMessageFromSession,
  }),
}))

vi.mock('../../../../contexts/StreamingContext', () => ({
  useStreamingActions: () => ({
    startStreaming: mocks.startStreaming,
    updateStreaming: mocks.updateStreaming,
    completeStreaming: mocks.completeStreaming,
    cancelStreaming: mocks.cancelStreaming,
  }),
}))

vi.mock('../../../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      aiModel: 'test-model',
      modelProvider: 'openrouter',
      temperature: 0.7,
      maxTokens: 4096,
      streamResponses: true,
      webSearchPrompt: '',
      ollamaUrl: '',
      openRouterDebug: false,
      openRouterApiKey: 'test-key',
      configuredModels: [],
      alibabaModels: [],
      alibabaRegion: '',
      groqApiKey: '',
      alibabaApiKey: '',
      deepseekApiKey: '',
      opencodeGoApiKey: '',
      fireworksApiKey: '',
      nvidiaApiKey: '',
      nvidiaModels: [],
      skills: [],
      enabledTools: [],
      assistantMode: 'chat',
      titleGenerationDisplayMode: 'instant',
    },
    updateSettings: vi.fn(),
  }),
}))

vi.mock('../../../shared/Toast', () => ({
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}))

vi.mock('../../../../agent/AgentToolApprovalContext', () => ({
  useAgentToolApproval: () => ({
    requestApproval: mocks.requestApproval,
  }),
}))

vi.mock('../../../../services/titleGenerator', () => ({
  generateChatTitle: vi.fn(async () => null),
}))

vi.mock('../../../../services/memoryExtraction', () => ({
  runMemoryExtraction: vi.fn(async () => undefined),
}))

vi.mock('../../../../utils/tokenUtils', () => ({
  buildOptimizedContextWithTrace: vi.fn(() => ({
    messages: [],
    trace: { inputTokenEstimate: 0, outputTokenBudget: 4096 },
  })),
}))

vi.mock('../../../../utils/promptSelection', () => ({
  getEffectiveSystemPrompt: vi.fn(() => 'system prompt'),
}))

vi.mock('../../../../prompts/buildMemoryBlock', () => ({
  loadMemoryBlock: vi.fn(async () => ''),
}))

vi.mock('../../../../prompts/buildRecentActivityBlock', () => ({
  loadRecentActivityBlock: vi.fn(async () => ''),
}))

vi.mock('../../../../utils/memoryScope', () => ({
  getSessionMemoryScope: vi.fn(() => ({ type: 'global' })),
  isFolderAssociationResolvable: vi.fn(() => true),
}))

vi.mock('../../../../providers', () => ({
  getAvailableModelOptions: vi.fn(() => []),
  getProviderCredentialError: vi.fn(() => null),
  normalizeActiveProviderId: vi.fn(() => 'openrouter'),
  TITLE_REVEAL_INTERVAL_MS: 30,
}))

vi.mock('../../../../agent/agentRun', () => ({
  completeAgentToolStep: vi.fn(),
  createAgentRun: vi.fn(),
  finishAgentRun: vi.fn(),
  isAgentWorkspaceMode: vi.fn(() => false),
  upsertAgentToolStep: vi.fn(),
  upsertAgentVerificationStep: vi.fn(),
}))

vi.mock('../../../../analytics/track', () => ({
  trackAnalytics: vi.fn(),
  trackRendererError: vi.fn(),
}))

vi.mock('./streaming', () => ({
  formatProviderStreamError: vi.fn(() => ({ message: 'err', tone: 'error' })),
  useProviderStreaming: () => ({
    runProviderStream: mocks.runProviderStream,
  }),
  useStreamingToolCalls: () => ({
    canUseTools: false,
    getToolsForRequest: vi.fn(() => []),
    getToolsForRequestAsync: vi.fn(async () => []),
    handleToolCalls: vi.fn(),
    toolState: { activeToolCalls: [], completedToolCalls: [] },
    clearToolState: vi.fn(),
    startResearchMode: vi.fn(),
    getResearchContext: vi.fn(() => ''),
  }),
  useResearchMode: () => ({
    calculateResearchConfig: vi.fn(() => ({ maxRounds: -1, forceWebSearch: false })),
  }),
}))

vi.mock('./streaming/chatRunConfig', () => ({
  buildStreamingSettings: vi.fn((s: unknown) => s),
}))

vi.mock('./chatRunRequest', () => ({
  buildChatRunRequest: vi.fn((args: unknown) => args),
}))

vi.mock('./chatRunFinalization', () => ({
  buildChatRunResultUpdates: vi.fn(() => ({})),
  finalizeChatRun: vi.fn(
    (_run: unknown, _outcome: unknown, finalizer: () => void, cleanup: () => void) => {
      finalizer()
      cleanup()
    }
  ),
  mergeStreamingFinalState: vi.fn((finalState: unknown, result: unknown) => ({
    ...(finalState as object),
    ...(result as object),
  })),
}))

import {
  buildCommittedStreamingUpdates,
  buildRegenerationResponseVersions,
  normalizeGeneratedSessionTitle,
  useStreamingChat,
} from './useStreamingChat'

describe('useStreamingChat final commit helpers', () => {
  it('prefers the final provider stream result over stale isolated streaming content', () => {
    const committed = buildCommittedStreamingUpdates(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        content: 'Hello wor',
        model: 'openrouter/openai/gpt-4.1',
        usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
        isStreaming: true,
      },
      {
        content: 'Hello world',
        model: 'openrouter/openai/gpt-4.1',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
        latency: 250,
      }
    )

    expect(committed).toEqual(
      expect.objectContaining({
        content: 'Hello world',
        usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
        latency: 250,
      })
    )
  })

  it('persists the terminal agent run even when the isolated snapshot is still running', () => {
    const runningAgentRun = {
      id: 'agent-run-1',
      mode: 'agent' as const,
      status: 'running' as const,
      startedAt: 10,
      capabilities: {
        web: 'approval-required' as const,
        code: 'approval-required' as const,
        mcp: 'approval-required' as const,
        computer: 'approval-required' as const,
      },
      steps: [],
    }
    const completedAgentRun = {
      ...runningAgentRun,
      status: 'completed' as const,
      completedAt: 20,
    }

    const committed = buildCommittedStreamingUpdates(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        content: 'Done',
        agentRun: runningAgentRun,
        isStreaming: true,
      },
      {
        content: 'Done',
        model: 'openrouter/openai/gpt-4.1',
        finishReason: 'stop',
      },
      completedAgentRun
    )

    expect(committed.finishReason).toBe('stop')
    expect(committed.agentRun).toEqual(completedAgentRun)
    expect(committed.agentRun?.status).toBe('completed')
  })

  it('persists cancellation over a stale running snapshot without a provider result', () => {
    const runningAgentRun = {
      id: 'agent-run-1',
      mode: 'agent' as const,
      status: 'running' as const,
      startedAt: 10,
      capabilities: {
        web: 'approval-required' as const,
        code: 'approval-required' as const,
        mcp: 'approval-required' as const,
        computer: 'approval-required' as const,
      },
      steps: [],
    }
    const cancelledAgentRun = {
      ...runningAgentRun,
      status: 'cancelled' as const,
      completedAt: 20,
    }

    const committed = buildCommittedStreamingUpdates(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        content: 'Partial\n\n[[ZURA_TOOL_FOLLOW_UP_SPLIT:blocks=1]]\n\n',
        agentRun: runningAgentRun,
        isStreaming: true,
      },
      undefined,
      cancelledAgentRun
    )

    expect(committed.agentRun).toEqual(cancelledAgentRun)
    expect(committed.agentRun?.status).toBe('cancelled')
    expect(committed.content).toBe('Partial\n\nTask stopped before completion.')
    expect(committed.content).not.toContain('ZURA_TOOL_FOLLOW_UP_SPLIT')
  })
})

describe('useStreamingChat generated title helpers', () => {
  it('does not produce a title update for failed title generation', () => {
    expect(normalizeGeneratedSessionTitle(null)).toBeNull()
    expect(normalizeGeneratedSessionTitle(undefined)).toBeNull()
    expect(normalizeGeneratedSessionTitle('   ')).toBeNull()
  })

  it('trims valid generated titles before applying them', () => {
    expect(normalizeGeneratedSessionTitle('  React hydration fix  ')).toBe('React hydration fix')
  })
})

describe('useStreamingChat regeneration versions', () => {
  it('appends the current response without mutating the message-owned versions array', () => {
    const existingVersions = [
      {
        id: 'message-0',
        content: 'Earlier response',
        timestamp: 1,
      },
    ]
    const message = {
      id: 'message-1',
      role: 'assistant' as const,
      content: 'Current response',
      timestamp: 2,
      model: 'openrouter/test-model',
      responseVersions: existingVersions,
    }

    const versions = buildRegenerationResponseVersions(message)

    expect(versions).toEqual([
      existingVersions[0],
      {
        id: 'message-1',
        content: 'Current response',
        timestamp: 2,
        instruction: undefined,
        model: 'openrouter/test-model',
      },
    ])
    expect(versions).not.toBe(existingVersions)
    expect(existingVersions).toHaveLength(1)
  })
})

describe('useStreamingChat duplicate send guard', () => {
  it('rejects a second send in the same tick via the synchronous activeRunRef guard', async () => {
    // Arrange: make the provider stream resolve immediately
    mocks.runProviderStream.mockReset()
    mocks.addMessageToSession.mockReset()
    mocks.addMessageToSession.mockReturnValue('msg-id')
    mocks.runProviderStream.mockResolvedValue({
      content: 'Hi',
      model: 'test/model',
      finishReason: 'stop',
    })

    const { result } = renderHook(() => useStreamingChat())

    // Act: fire two sends synchronously in the same tick (before any microtask runs).
    // The second should be rejected by the synchronous activeRunRef guard because
    // the first call sets activeRunRef.current synchronously before any await.
    await act(async () => {
      const firstSend = result.current.sendMessage('Hello', [])
      const secondSend = result.current.sendMessage('Hello again', [])
      await Promise.all([firstSend, secondSend])
    })

    // Assert: only ONE user message was added (the first send).
    // addMessageToSession is called twice per successful send: once for user msg, once for assistant msg.
    // A rejected duplicate produces zero calls.
    const userMessageCalls = mocks.addMessageToSession.mock.calls.filter(
      (_call: unknown[]) => (_call as [string, { role: string }])[1]?.role === 'user'
    )
    expect(userMessageCalls).toHaveLength(1)
    expect(userMessageCalls[0][1].content).toBe('Hello')

    // Only one provider stream request was made
    expect(mocks.runProviderStream).toHaveBeenCalledTimes(1)
  })
})
