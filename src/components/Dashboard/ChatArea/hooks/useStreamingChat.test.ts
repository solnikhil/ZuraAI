import { describe, expect, it, vi } from 'vitest'

vi.mock('../attachmentUtils', () => ({
  buildProviderMessages: vi.fn(),
  canAnalyzeImageAttachments: vi.fn(),
  isImageAttachment: vi.fn(() => false),
}))

import {
  buildCommittedStreamingUpdates,
  buildRegenerationResponseVersions,
  normalizeGeneratedSessionTitle,
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
        content: 'Partial',
        agentRun: runningAgentRun,
        isStreaming: true,
      },
      undefined,
      cancelledAgentRun
    )

    expect(committed.agentRun).toEqual(cancelledAgentRun)
    expect(committed.agentRun?.status).toBe('cancelled')
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
