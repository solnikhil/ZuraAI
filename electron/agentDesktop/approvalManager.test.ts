// @vitest-environment node

/**
 * Unit tests for `AgentDesktopApprovalManager` (Req 5.8).
 *
 * Assert the manager follows the existing `BaseApprovalManager` pattern:
 * - extends `BaseApprovalManager`
 * - `requestApproval` creates exactly one pending request resolvable via
 *   `resolveApproval`
 * - a timeout resolves to rejected (`approved: false`, outcome `timed_out`)
 * - the constructor clamps the configured timeout into `[5000, 600000]`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { AgentDesktopApprovalManager } from './approvalManager'
import { BaseApprovalManager } from '../utils/baseApprovalManager'
import {
  DEFAULT_APPROVAL_TIMEOUT_MS,
  MIN_APPROVAL_TIMEOUT_MS,
  MAX_APPROVAL_TIMEOUT_MS,
} from './constants'

describe('AgentDesktopApprovalManager', () => {
  let manager: AgentDesktopApprovalManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new AgentDesktopApprovalManager({ defaultTimeoutMs: 60_000 })
  })

  afterEach(() => {
    manager.dispose()
    vi.useRealTimers()
  })

  it('extends BaseApprovalManager', () => {
    expect(manager).toBeInstanceOf(BaseApprovalManager)
  })

  it('creates exactly one pending request resolvable via resolveApproval', async () => {
    const promise = manager.requestApproval({
      action: 'click',
      args: { x: 10, y: 20 },
    })

    const pending = manager.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].action).toBe('click')
    expect(pending[0].args).toEqual({ x: 10, y: 20 })
    expect(pending[0].classification).toBe('approval-required')

    const decision = manager.resolveApproval(pending[0].id, true)
    expect(decision.approved).toBe(true)
    expect(decision.outcome).toBe('approved')

    await expect(promise).resolves.toMatchObject({
      approved: true,
      outcome: 'approved',
    })
    expect(manager.listPending()).toHaveLength(0)
  })

  it('resolves to rejected when the user rejects', async () => {
    const promise = manager.requestApproval({ action: 'type', args: { text: 'hi' } })
    const pending = manager.listPending()
    expect(pending).toHaveLength(1)

    const decision = manager.resolveApproval(pending[0].id, false)
    expect(decision.approved).toBe(false)
    expect(decision.outcome).toBe('rejected')

    await expect(promise).resolves.toMatchObject({
      approved: false,
      outcome: 'rejected',
    })
  })

  it('treats a timeout as a rejection (approved:false, outcome timed_out)', async () => {
    const promise = manager.requestApproval({ action: 'launch_app', args: {} })
    expect(manager.listPending()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(60_000 + 1)

    await expect(promise).resolves.toMatchObject({
      approved: false,
      outcome: 'timed_out',
    })
    expect(manager.listPending()).toHaveLength(0)
  })

  describe('constructor clamps the configured timeout into [5000, 600000]', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('clamps a too-small timeout up to the minimum', async () => {
      vi.useFakeTimers()
      const m = new AgentDesktopApprovalManager({ defaultTimeoutMs: 100 })
      const promise = m.requestApproval({ action: 'click', args: {} })

      // Below the clamped minimum: still pending.
      await vi.advanceTimersByTimeAsync(MIN_APPROVAL_TIMEOUT_MS - 1)
      expect(m.listPending()).toHaveLength(1)

      // At the clamped minimum: now timed out.
      await vi.advanceTimersByTimeAsync(2)
      await expect(promise).resolves.toMatchObject({ outcome: 'timed_out' })
      m.dispose()
    })

    it('clamps a too-large timeout down to the maximum', async () => {
      vi.useFakeTimers()
      const m = new AgentDesktopApprovalManager({
        defaultTimeoutMs: MAX_APPROVAL_TIMEOUT_MS + 5_000_000,
      })
      const promise = m.requestApproval({ action: 'click', args: {} })

      // Just below the clamped maximum: still pending.
      await vi.advanceTimersByTimeAsync(MAX_APPROVAL_TIMEOUT_MS - 1)
      expect(m.listPending()).toHaveLength(1)

      // At the clamped maximum: now timed out.
      await vi.advanceTimersByTimeAsync(2)
      await expect(promise).resolves.toMatchObject({ outcome: 'timed_out' })
      m.dispose()
    })

    it('falls back to the default timeout for missing/invalid input', async () => {
      vi.useFakeTimers()
      const m = new AgentDesktopApprovalManager({ defaultTimeoutMs: Number.NaN })
      const promise = m.requestApproval({ action: 'click', args: {} })

      await vi.advanceTimersByTimeAsync(DEFAULT_APPROVAL_TIMEOUT_MS - 1)
      expect(m.listPending()).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(2)
      await expect(promise).resolves.toMatchObject({ outcome: 'timed_out' })
      m.dispose()
    })
  })
})
