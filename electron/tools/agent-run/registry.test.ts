import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentRunRegistry } from './registry'

describe('AgentRunRegistry', () => {
  it('enforces sender ownership and finite tool and mutation budgets', () => {
    const registry = new AgentRunRegistry({
      maxToolCalls: 3,
      maxMutations: 1,
      maxDurationMs: 1_000,
    })

    expect(registry.beginTool('run-1', 7, { mutating: true }).ok).toBe(true)
    registry.completeTool('run-1', 7)
    expect(registry.beginTool('run-1', 7, { mutating: true })).toEqual({
      ok: false,
      reason: 'mutation_budget',
    })
    expect(() => registry.beginTool('run-1', 8, { mutating: false })).toThrow(
      'owned by another renderer'
    )
    expect(() => registry.get('run-1', 8)).toThrow('owned by another renderer')
    expect(() => registry.cancel('run-1', 8)).toThrow('owned by another renderer')
  })

  it('stops the run at the total tool budget and aborts already active work', () => {
    const registry = new AgentRunRegistry({
      maxToolCalls: 2,
      maxMutations: 2,
      maxDurationMs: 1_000,
    })
    const first = registry.beginTool('run-tools', 7, { mutating: false })
    const second = registry.beginTool('run-tools', 7, { mutating: false })
    expect(first.ok && second.ok).toBe(true)

    expect(registry.beginTool('run-tools', 7, { mutating: false })).toEqual({
      ok: false,
      reason: 'tool_budget',
    })
    if (!first.ok || !second.ok) throw new Error('expected tool permits')
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(true)
    expect(registry.get('run-tools', 7)).toMatchObject({
      status: 'cancelled',
      stopReason: 'budget_exhausted',
      budgetReason: 'tool_calls',
      toolCalls: 2,
      activeToolCalls: 2,
    })
  })

  it('aborts active work when a run is cancelled', () => {
    const registry = new AgentRunRegistry()
    const started = registry.beginTool('run-cancel', 9, { mutating: false })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error('expected tool permit')

    expect(registry.cancel('run-cancel', 9)).toBe(true)
    expect(started.signal.aborted).toBe(true)
    expect(registry.beginTool('run-cancel', 9, { mutating: false })).toEqual({
      ok: false,
      reason: 'cancelled',
    })
  })

  it('records cancellation before the first tool so a late dispatch cannot race through', () => {
    const registry = new AgentRunRegistry()

    expect(registry.cancel('run-before-tool', 9)).toBe(true)
    expect(registry.beginTool('run-before-tool', 9, { mutating: false })).toEqual({
      ok: false,
      reason: 'cancelled',
    })
    expect(registry.cancel('run-before-tool', 9)).toBe(false)
  })

  it('expires a run at its wall-clock limit', () => {
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_000).mockReturnValue(2_001)
    const registry = new AgentRunRegistry(
      { maxToolCalls: 10, maxMutations: 10, maxDurationMs: 1_000 },
      now
    )
    expect(registry.beginTool('run-time', 3, { mutating: false }).ok).toBe(true)
    registry.completeTool('run-time', 3)
    expect(registry.beginTool('run-time', 3, { mutating: false })).toEqual({
      ok: false,
      reason: 'time_budget',
    })
    expect(registry.get('run-time', 3)).toMatchObject({
      stopReason: 'budget_exhausted',
      budgetReason: 'elapsed_time',
    })
  })

  it('cancels only runs owned by a destroyed sender', () => {
    const registry = new AgentRunRegistry()
    const first = registry.beginTool('run-a', 1, { mutating: false })
    const second = registry.beginTool('run-b', 2, { mutating: false })
    expect(first.ok && second.ok).toBe(true)

    expect(registry.cancelSender(1)).toBe(1)
    if (!first.ok || !second.ok) throw new Error('expected tool permits')
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })
})

describe('AgentRunRegistry leases and retention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts an active tool at the exact wall-clock deadline without another dispatch', () => {
    const registry = new AgentRunRegistry({
      maxToolCalls: 10,
      maxMutations: 10,
      maxDurationMs: 1_000,
    })
    const started = registry.beginTool('run-deadline', 1, { mutating: false })
    if (!started.ok) throw new Error('expected tool permit')
    expect(started.snapshot).not.toHaveProperty('deadlineTimer')
    expect(started.snapshot).not.toHaveProperty('terminalExpiryTimer')

    vi.advanceTimersByTime(999)
    expect(started.signal.aborted).toBe(false)

    vi.advanceTimersByTime(1)
    expect(started.signal.aborted).toBe(true)
    expect(started.signal.reason).toBe('budget_exhausted')
    expect(registry.get('run-deadline', 1)).toMatchObject({
      status: 'cancelled',
      stopReason: 'budget_exhausted',
      budgetReason: 'elapsed_time',
      finishedAt: 11_000,
      activeToolCalls: 1,
    })
    expect(registry.beginTool('run-deadline', 1, { mutating: false })).toEqual({
      ok: false,
      reason: 'time_budget',
    })
  })

  it('bounds simultaneously occupied runs globally and per sender', () => {
    const registry = new AgentRunRegistry(
      { maxToolCalls: 10, maxMutations: 10, maxDurationMs: 60_000 },
      Date.now,
      { maxActiveRuns: 3, maxActiveRunsPerSender: 2 }
    )

    expect(registry.beginTool('sender-a-1', 1, { mutating: false }).ok).toBe(true)
    expect(registry.beginTool('sender-a-2', 1, { mutating: false }).ok).toBe(true)
    expect(registry.beginTool('sender-a-3', 1, { mutating: false })).toEqual({
      ok: false,
      reason: 'sender_capacity',
    })
    expect(registry.beginTool('sender-b-1', 2, { mutating: false }).ok).toBe(true)
    expect(registry.beginTool('sender-c-1', 3, { mutating: false })).toEqual({
      ok: false,
      reason: 'global_capacity',
    })
  })

  it('keeps an aborted run in capacity until its active tool acknowledges completion', () => {
    const registry = new AgentRunRegistry(
      { maxToolCalls: 10, maxMutations: 10, maxDurationMs: 1_000 },
      Date.now,
      { maxActiveRuns: 1, maxActiveRunsPerSender: 1, terminalRetentionMs: 100 }
    )
    expect(registry.beginTool('stuck-run', 1, { mutating: false }).ok).toBe(true)

    vi.advanceTimersByTime(1_000)
    vi.advanceTimersByTime(100)
    expect(registry.beginTool('replacement', 1, { mutating: false })).toEqual({
      ok: false,
      reason: 'global_capacity',
    })

    registry.completeTool('stuck-run', 1)
    vi.advanceTimersByTime(100)
    expect(registry.get('stuck-run', 1)).toBeNull()
    expect(registry.beginTool('replacement', 1, { mutating: false }).ok).toBe(true)
  })

  it('expires quiescent terminal tombstones and permits safe run-id reuse afterwards', () => {
    const registry = new AgentRunRegistry(
      { maxToolCalls: 10, maxMutations: 10, maxDurationMs: 60_000 },
      Date.now,
      { terminalRetentionMs: 500 }
    )

    expect(registry.cancel('reusable-run', 4)).toBe(true)
    expect(registry.beginTool('reusable-run', 4, { mutating: false })).toEqual({
      ok: false,
      reason: 'cancelled',
    })

    vi.advanceTimersByTime(499)
    expect(registry.get('reusable-run', 4)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(registry.get('reusable-run', 4)).toBeNull()
    expect(registry.beginTool('reusable-run', 4, { mutating: false }).ok).toBe(true)
  })

  it('caps retained quiescent terminal records by evicting the oldest', () => {
    const registry = new AgentRunRegistry(
      { maxToolCalls: 10, maxMutations: 10, maxDurationMs: 60_000 },
      Date.now,
      { maxRetainedTerminalRuns: 2, terminalRetentionMs: 60_000 }
    )

    expect(registry.cancel('terminal-1', 1)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(registry.cancel('terminal-2', 1)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(registry.cancel('terminal-3', 1)).toBe(true)

    expect(registry.get('terminal-1', 1)).toBeNull()
    expect(registry.get('terminal-2', 1)).not.toBeNull()
    expect(registry.get('terminal-3', 1)).not.toBeNull()
  })

  it('clears deadline timers when a run finishes and all timers when disposed', () => {
    const registry = new AgentRunRegistry({
      maxToolCalls: 10,
      maxMutations: 10,
      maxDurationMs: 1_000,
    })
    expect(registry.beginTool('finished', 1, { mutating: false }).ok).toBe(true)
    registry.completeTool('finished', 1)
    expect(registry.finish('finished', 1, 'completed')).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    registry.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
