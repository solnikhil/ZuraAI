// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { PrivilegedToolExecutionCoordinator } from './privilegedToolExecutionCoordinator'

function createHarness(
  beginResult:
    | { ok: true; signal: AbortSignal; snapshot: never }
    | {
        ok: false
        reason:
          | 'cancelled'
          | 'tool_budget'
          | 'mutation_budget'
          | 'time_budget'
          | 'global_capacity'
          | 'sender_capacity'
      } = {
    ok: true,
    signal: new AbortController().signal,
    snapshot: undefined as never,
  }
) {
  const beginTool = vi.fn(() => beginResult)
  const completeTool = vi.fn()
  const consumeApproval = vi.fn(() => true)
  const coordinator = new PrivilegedToolExecutionCoordinator({
    beginTool,
    completeTool,
    consumeApproval,
  })
  return { coordinator, beginTool, completeTool, consumeApproval }
}

describe('PrivilegedToolExecutionCoordinator', () => {
  it('consumes exact approval authority and preserves non-Agent execution parity', async () => {
    const { coordinator, beginTool, completeTool, consumeApproval } = createHarness()
    const callback = vi.fn(async ({ approved }) => (approved ? 'approved' : 'prompt'))

    await expect(
      coordinator.execute(
        {
          senderWebContentsId: 7,
          toolName: 'file_write',
          args: { path: 'demo.txt' },
          approvalToken: 'token-1',
          mutating: true,
        },
        callback
      )
    ).resolves.toEqual({ ok: true, value: 'approved' })

    expect(consumeApproval).toHaveBeenCalledWith('token-1', 7, 'file_write', {
      path: 'demo.txt',
    })
    expect(beginTool).not.toHaveBeenCalled()
    expect(completeTool).not.toHaveBeenCalled()
  })

  it('fails before callback when the Agent budget denies dispatch', async () => {
    const { coordinator, completeTool, consumeApproval } = createHarness({
      ok: false,
      reason: 'mutation_budget',
    })
    const callback = vi.fn(async () => 'unreachable')

    await expect(
      coordinator.execute(
        {
          senderWebContentsId: 7,
          toolName: 'mcp__server__write',
          args: {},
          runId: 'run-1',
          mutating: true,
        },
        callback
      )
    ).resolves.toEqual({ ok: false, reason: 'mutation_budget' })
    expect(callback).not.toHaveBeenCalled()
    expect(completeTool).not.toHaveBeenCalled()
    expect(consumeApproval).toHaveBeenCalledOnce()
  })

  it('completes exactly once after success and callback failure', async () => {
    const success = createHarness()
    await success.coordinator.execute(
      {
        senderWebContentsId: 7,
        toolName: 'file_read',
        args: {},
        runId: 'run-success',
        mutating: false,
      },
      async () => 'ok'
    )
    expect(success.completeTool).toHaveBeenCalledOnce()
    expect(success.completeTool).toHaveBeenCalledWith('run-success', 7)

    const failure = createHarness()
    await expect(
      failure.coordinator.execute(
        {
          senderWebContentsId: 8,
          toolName: 'file_read',
          args: {},
          runId: 'run-failure',
          mutating: false,
        },
        async () => {
          throw new Error('dispatch failed')
        }
      )
    ).rejects.toThrow('dispatch failed')
    expect(failure.completeTool).toHaveBeenCalledOnce()
    expect(failure.completeTool).toHaveBeenCalledWith('run-failure', 8)
  })

  it('composes run and caller cancellation while preserving the abort reason', async () => {
    const runController = new AbortController()
    const callerController = new AbortController()
    const { coordinator } = createHarness({
      ok: true,
      signal: runController.signal,
      snapshot: undefined as never,
    })
    let executionSignal: AbortSignal | undefined

    const execution = coordinator.execute(
      {
        senderWebContentsId: 7,
        toolName: 'web_search',
        args: {},
        runId: 'run-cancel',
        mutating: false,
        signal: callerController.signal,
      },
      async ({ signal }) => {
        executionSignal = signal
        await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve()))
        return 'cancelled'
      }
    )

    callerController.abort('caller_cancelled')
    await expect(execution).resolves.toEqual({ ok: true, value: 'cancelled' })
    expect(executionSignal?.aborted).toBe(true)
    expect(executionSignal?.reason).toBe('caller_cancelled')
    expect(runController.signal.aborted).toBe(false)
  })

  it('forwards an already-aborted caller signal and still releases accounting', async () => {
    const callerController = new AbortController()
    callerController.abort('already_cancelled')
    const { coordinator, completeTool } = createHarness()

    await expect(
      coordinator.execute(
        {
          senderWebContentsId: 7,
          toolName: 'code_execution',
          args: {},
          runId: 'already-cancelled',
          mutating: true,
          signal: callerController.signal,
        },
        async ({ signal }) => ({ aborted: signal?.aborted, reason: signal?.reason })
      )
    ).resolves.toEqual({
      ok: true,
      value: { aborted: true, reason: 'already_cancelled' },
    })
    expect(completeTool).toHaveBeenCalledOnce()
  })

  it('rejects malformed run identity before consuming authority', async () => {
    const { coordinator, consumeApproval } = createHarness()
    await expect(
      coordinator.execute(
        {
          senderWebContentsId: 7,
          toolName: 'file_read',
          args: {},
          approvalToken: 'token',
          runId: '../run',
          mutating: false,
        },
        async () => undefined
      )
    ).rejects.toThrow('Invalid tool execution run id')
    expect(consumeApproval).not.toHaveBeenCalled()
  })
})
