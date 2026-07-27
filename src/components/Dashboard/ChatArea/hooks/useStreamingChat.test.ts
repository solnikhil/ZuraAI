import { describe, expect, it, vi } from 'vitest'

vi.mock('../attachmentUtils', () => ({
  buildProviderMessages: vi.fn(),
  canAnalyzeImageAttachments: vi.fn(),
  isImageAttachment: vi.fn(() => false),
}))

import {
  buildCommittedStreamingUpdates,
  buildFailedStreamingUpdates,
  buildRegenerationResponseVersions,
  normalizeGeneratedSessionTitle,
  resolveProviderRunOutcome,
} from './useStreamingChat'
import { createRegenerationTransaction } from './chatRunFinalization'

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
      verification: 'not-required' as const,
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
      verification: 'pending' as const,
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

  it('adds a truthful warning when a run completes without verification evidence', () => {
    const run = {
      id: 'run-unverified',
      mode: 'agent' as const,
      status: 'completed_unverified' as const,
      verification: 'inconclusive' as const,
      startedAt: 10,
      completedAt: 20,
      capabilities: {
        web: 'approval-required' as const,
        code: 'approval-required' as const,
        mcp: 'approval-required' as const,
        computer: 'approval-required' as const,
      },
      steps: [],
    }

    const updates = buildCommittedStreamingUpdates(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        content: 'The command was dispatched.',
        isStreaming: true,
      },
      undefined,
      run
    )

    expect(updates.content).toContain('The command was dispatched.')
    expect(updates.content).toContain('I could not verify the requested outcome.')
    expect(updates.agentRun).toBe(run)
  })

  it('maps a verification-failed agent run to a failed controller outcome', () => {
    expect(
      resolveProviderRunOutcome({
        id: 'agent-run-failed',
        mode: 'agent',
        status: 'failed',
        verification: 'inconclusive',
        startedAt: 10,
        completedAt: 20,
        capabilities: {
          web: 'approval-required',
          code: 'approval-required',
          mcp: 'approval-required',
          computer: 'approval-required',
        },
        steps: [],
      })
    ).toBe('failed')
  })

  it('keeps the failed Agent ledger and tool trace while replacing speculative prose', () => {
    const terminalRun = {
      id: 'run-failed',
      mode: 'agent' as const,
      status: 'failed' as const,
      verification: 'inconclusive' as const,
      startedAt: 10,
      completedAt: 20,
      capabilities: {
        web: 'approval-required' as const,
        code: 'approval-required' as const,
        mcp: 'approval-required' as const,
        computer: 'approval-required' as const,
      },
      steps: [],
    }
    const updates = buildFailedStreamingUpdates(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        content: 'Speculative partial answer',
        toolResults: [],
        agentRun: { ...terminalRun, status: 'running' as const },
        isStreaming: true,
      },
      'Provider failed safely.',
      terminalRun
    )

    expect(updates.content).toBe('Provider failed safely.')
    expect(updates.agentRun).toBe(terminalRun)
    expect(updates.toolResults).toEqual([])
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

  it('leaves the original response untouched when regeneration is cancelled', () => {
    const originalMessage = {
      id: 'message-1',
      role: 'assistant' as const,
      content: 'Original response',
      timestamp: 2,
      model: 'openrouter/test-model',
    }
    const updateMessage = vi.fn()
    const transaction = createRegenerationTransaction({
      sessionId: 'session-1',
      message: originalMessage,
      model: 'openrouter/test-model',
      responseVersions: buildRegenerationResponseVersions(originalMessage),
      updateMessage,
    })

    expect(transaction.rollback()).toBe(true)
    expect(transaction.rollback()).toBe(false)
    expect(updateMessage).not.toHaveBeenCalled()
    expect(originalMessage.content).toBe('Original response')
  })

  it('atomically commits regenerated content to the original response', () => {
    const originalMessage = {
      id: 'message-1',
      role: 'assistant' as const,
      content: 'Original response',
      timestamp: 2,
      model: 'openrouter/test-model',
    }
    const versions = buildRegenerationResponseVersions(originalMessage)
    const updateMessage = vi.fn()
    const transaction = createRegenerationTransaction({
      sessionId: 'session-1',
      message: originalMessage,
      model: 'openrouter/next-model',
      responseVersions: versions,
      updateMessage,
    })

    expect(
      transaction.commit({
        content: 'Regenerated response',
      })
    ).toBe(true)
    expect(transaction.rollback()).toBe(false)
    expect(updateMessage).toHaveBeenCalledOnce()
    expect(updateMessage).toHaveBeenCalledWith(
      'session-1',
      'message-1',
      expect.objectContaining({
        content: 'Regenerated response',
        model: 'openrouter/next-model',
        responseVersions: versions,
        currentVersionIndex: versions.length,
      }),
      { persist: true }
    )
  })
})
