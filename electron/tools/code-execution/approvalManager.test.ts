import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CodeExecutionApprovalManager } from './approvalManager'

describe('CodeExecutionApprovalManager', () => {
  let manager: CodeExecutionApprovalManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new CodeExecutionApprovalManager({ defaultTimeoutMs: 5000 })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('resolves with approved when user approves', async () => {
    const promise = manager.requestApproval({ code: 'print(1)', language: 'python' })
    const pending = manager.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].language).toBe('python')

    manager.resolveApproval(pending[0].id, true)
    const decision = await promise
    expect(decision.approved).toBe(true)
    expect(decision.outcome).toBe('approved')
  })

  it('resolves with rejected when user rejects', async () => {
    const promise = manager.requestApproval({ code: 'x', language: 'javascript' })
    const pending = manager.listPending()
    manager.resolveApproval(pending[0].id, false)
    const decision = await promise
    expect(decision.approved).toBe(false)
    expect(decision.outcome).toBe('rejected')
  })

  it('auto-rejects on timeout', async () => {
    const promise = manager.requestApproval({ code: 'x', language: 'python' })
    expect(manager.listPending()).toHaveLength(1)

    vi.advanceTimersByTime(6000)
    const decision = await promise
    expect(decision.approved).toBe(false)
    expect(decision.outcome).toBe('timed_out')
    expect(manager.listPending()).toHaveLength(0)
  })

  it('dispose cancels all pending', async () => {
    const p1 = manager.requestApproval({ code: 'a', language: 'python' })
    const p2 = manager.requestApproval({ code: 'b', language: 'javascript' })
    expect(manager.listPending()).toHaveLength(2)

    manager.dispose()
    const [d1, d2] = await Promise.all([p1, p2])
    expect(d1.outcome).toBe('cancelled')
    expect(d2.outcome).toBe('cancelled')
    expect(manager.listPending()).toHaveLength(0)
  })

  it('emits pending approvals changes', async () => {
    const handler = vi.fn()
    manager.onPendingApprovalsChange(handler)

    const promise = manager.requestApproval({ code: 'x', language: 'python' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toHaveLength(1)

    const pending = manager.listPending()
    manager.resolveApproval(pending[0].id, true)
    await promise
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[1][0]).toHaveLength(0)
  })
})
