import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerminalApprovalManager } from './approvalManager'

describe('TerminalApprovalManager', () => {
  let manager: TerminalApprovalManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new TerminalApprovalManager({ defaultTimeoutMs: 5000 })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('resolves with approved when user approves', async () => {
    const promise = manager.requestApproval({
      command: 'Get-Process',
      cwd: 'C:\\',
      description: 'list processes',
    })
    const pending = manager.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].command).toBe('Get-Process')
    expect(pending[0].cwd).toBe('C:\\')
    expect(pending[0].description).toBe('list processes')

    manager.resolveApproval(pending[0].id, true)
    const decision = await promise
    expect(decision.approved).toBe(true)
    expect(decision.outcome).toBe('approved')
  })

  it('resolves with rejected when user rejects', async () => {
    const promise = manager.requestApproval({ command: 'rm x', cwd: '', description: 'remove' })
    const pending = manager.listPending()
    manager.resolveApproval(pending[0].id, false)
    const decision = await promise
    expect(decision.approved).toBe(false)
    expect(decision.outcome).toBe('rejected')
  })

  it('auto-rejects on timeout', async () => {
    const promise = manager.requestApproval({ command: 'x', cwd: '', description: 'd' })
    expect(manager.listPending()).toHaveLength(1)

    vi.advanceTimersByTime(6000)
    const decision = await promise
    expect(decision.approved).toBe(false)
    expect(decision.outcome).toBe('timed_out')
    expect(manager.listPending()).toHaveLength(0)
  })

  it('dispose cancels all pending', async () => {
    const p1 = manager.requestApproval({ command: 'a', cwd: '', description: 'd1' })
    const p2 = manager.requestApproval({ command: 'b', cwd: '', description: 'd2' })
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

    const promise = manager.requestApproval({ command: 'x', cwd: '', description: 'd' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0]).toHaveLength(1)

    const pending = manager.listPending()
    manager.resolveApproval(pending[0].id, true)
    await promise
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[1][0]).toHaveLength(0)
  })
})
