// @vitest-environment node

/**
 * Property-based test for the Agent Desktop Computer Use gate's
 * unavailable-capability rejection (Task 13.9).
 *
 * Covered correctness property (from the design):
 * - Property 31: Unavailable Agent_Desktop rejects all actions (Req 8.5)
 *
 * Property 31 (design): *For any* agent action requested while the
 * Agent_Desktop capability is `unavailable` (VDA_Binding load/call failure or
 * non-Windows platform), the gate rejects the action and no OS desktop or input
 * operation is attempted.
 *
 * ## Test strategy
 * `AgentDesktopService.gateComputerAction` is the single policy gate the
 * Computer Use tool path calls before delegating to the OS-driving executor.
 * Its first gate is the availability check (`checkAvailability`), which fails
 * closed when the platform is unsupported, when the VDA binding reports
 * `unavailable`, when the skill is disabled, or when the disclosure is
 * unacknowledged.
 *
 * The service never drives nut.js / input directly — the caller only does so
 * after the gate returns `{ allow: true }`. The OS desktop operations the
 * service itself can attempt are the mutating {@link VdaBinding} methods
 * (`createDesktop`, `removeDesktop`, `goToDesktop`, `moveWindowToDesktop`). So
 * "no OS desktop or input operation is attempted" is faithfully observed as:
 *   1. the gate returns `{ allow: false }` (the caller therefore drives nothing), AND
 *   2. no mutating VDA binding method is invoked during the gate call.
 *
 * A fully-controllable in-memory {@link VdaBinding} spy records every native
 * call so the no-OS-operation invariant is directly observable. The three
 * unavailable sources from the property are exercised:
 *   - non-Windows platform (`platformSupported: false`),
 *   - VDA load failure (`load()` ⇒ `unavailable`),
 *   - VDA call failure mid-session (binding reports `isAvailable(): false`).
 *
 * fast-check + Vitest, minimum 100 iterations per property.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type GateInput,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { AgentActionType, VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x31a2 }

/**
 * The complete Computer Use action surface Agent Desktop reuses, plus the index
 * the spy hands out for a created Agent_Desktop (kept clear of the 0–20 range
 * the user-desktop generators use).
 */
const ALL_AGENT_ACTION_TYPES: readonly AgentActionType[] = [
  'screenshot',
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position',
  'list_windows',
  'launch_app',
  'close_app',
  'find_app',
]
const FIRST_CREATED_INDEX = 100

/**
 * A fully-controllable in-memory {@link VdaBinding} spy.
 *
 * It can be configured to load as `available` or `unavailable`, can be flipped
 * to unavailable at runtime (modelling a VDA call failure mid-session), and
 * records every mutating OS desktop operation so the no-OS-operation invariant
 * is directly observable.
 */
class SpyVdaBinding implements VdaBinding {
  private available = false
  /** What `load()` should resolve to. */
  private readonly loadOutcome: VdaLoadOutcome
  /** Set of currently-existing Virtual_Desktop indices. */
  existing: Set<number>
  /** The currently-displayed Virtual_Desktop index. */
  current: number
  private nextIndex = FIRST_CREATED_INDEX

  // --- Observable mutating-OS-operation call records -----------------------
  createDesktopCalls = 0
  removeDesktopCalls: number[] = []
  goToDesktopCalls: number[] = []
  moveWindowCalls: Array<{ hwnd: number; index: number }> = []

  constructor(opts: { loadOutcome?: VdaLoadOutcome; existing?: number[]; current?: number } = {}) {
    this.loadOutcome = opts.loadOutcome ?? 'available'
    this.existing = new Set(opts.existing ?? [0])
    this.current = opts.current ?? 0
  }

  async load(): Promise<VdaLoadOutcome> {
    this.available = this.loadOutcome === 'available'
    return this.loadOutcome
  }

  isAvailable(): boolean {
    return this.available
  }

  /** Set the runtime availability the gate reads via `isAvailable()`. */
  setAvailable(value: boolean): void {
    this.available = value
  }

  /** User-visible load error naming the integration (read defensively by the service). */
  getLoadError(): string | null {
    return this.available
      ? null
      : 'The VirtualDesktopAccessor virtual-desktop integration is unavailable.'
  }

  getCurrentDesktopIndex(): number {
    return this.current
  }

  getDesktopCount(): number {
    return this.existing.size
  }

  createDesktop(): number {
    const index = this.nextIndex++
    this.existing.add(index)
    this.createDesktopCalls++
    return index
  }

  removeDesktop(index: number): void {
    this.existing.delete(index)
    this.removeDesktopCalls.push(index)
  }

  goToDesktop(index: number): void {
    this.current = index
    this.goToDesktopCalls.push(index)
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(hwnd: number, index: number): void {
    this.moveWindowCalls.push({ hwnd, index })
  }

  isWindowOnDesktop(): boolean {
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    return []
  }

  dispose(): void {
    this.available = false
  }

  /** Snapshot of the mutating-OS-operation counters for before/after comparison. */
  osOpSnapshot(): { create: number; remove: number; goTo: number; move: number } {
    return {
      create: this.createDesktopCalls,
      remove: this.removeDesktopCalls.length,
      goTo: this.goToDesktopCalls.length,
      move: this.moveWindowCalls.length,
    }
  }

  /** Total mutating OS desktop operations recorded so far. */
  totalOsOps(): number {
    const s = this.osOpSnapshot()
    return s.create + s.remove + s.goTo + s.move
  }
}

/** Build fully-enabled Agent Desktop settings (skill on, disclosure acknowledged). */
function makeEnabledSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
    persistence: 'ephemeral',
  }
}

// --- Generators --------------------------------------------------------------

/** Any known Computer Use action, or an out-of-surface arbitrary action name. */
const anyActionArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...ALL_AGENT_ACTION_TYPES),
  fc
    .string({ minLength: 1, maxLength: 16 })
    .filter((s) => !ALL_AGENT_ACTION_TYPES.includes(s as AgentActionType))
)

/** A complete (possibly window-targeted) gate input across the whole action surface. */
const gateInputArb: fc.Arbitrary<GateInput> = fc.record({
  action: anyActionArb,
  args: fc.dictionary(fc.string({ maxLength: 6 }), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
  targetHwnd: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: undefined }),
  onAgentDesktop: fc.option(fc.boolean(), { nil: undefined }),
})

/**
 * Assert a gate decision is a rejection with a non-empty, human-readable reason
 * and a valid rejection outcome. An unavailable capability always rejects with
 * outcome `rejected` (the availability gate is the first, fail-closed gate).
 */
function expectRejected(decision: Awaited<ReturnType<AgentDesktopService['gateComputerAction']>>): void {
  expect(decision.allow).toBe(false)
  if (decision.allow === false) {
    expect(decision.outcome).toBe('rejected')
    expect(typeof decision.reason).toBe('string')
    expect(decision.reason.length).toBeGreaterThan(0)
  }
}

// Feature: agent-desktop, Property 31: Unavailable Agent_Desktop rejects all actions
// Validates: Requirements 8.5
describe('Property 31: Unavailable Agent_Desktop rejects all actions', () => {
  it('rejects every action and attempts no OS operation on a non-Windows platform', async () => {
    await fc.assert(
      fc.asyncProperty(gateInputArb, async (input) => {
        // Non-Windows platform: capability is unavailable regardless of the binding.
        const binding = new SpyVdaBinding({ loadOutcome: 'available' })
        const service = createAgentDesktopService({
          binding,
          settings: makeEnabledSettings(),
          platformSupported: false,
        })
        await service.initialize()

        // The capability genuinely resolves to unavailable (Req 8.5 framing).
        expect(service.getState().capability).toBe('unavailable')

        const decision = await service.gateComputerAction(input)

        expectRejected(decision)
        // No OS desktop operation was attempted (Property 31). The caller never
        // drives input because the gate disallowed the action.
        expect(binding.totalOsOps()).toBe(0)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('rejects every action and attempts no OS operation when the VDA binding fails to load', async () => {
    await fc.assert(
      fc.asyncProperty(gateInputArb, async (input) => {
        // VDA load failure: platform is supported but the binding is unavailable.
        const binding = new SpyVdaBinding({ loadOutcome: 'unavailable' })
        const service = createAgentDesktopService({
          binding,
          settings: makeEnabledSettings(),
          platformSupported: true,
        })
        await service.initialize()

        const state = service.getState()
        expect(state.vdaOutcome).toBe('unavailable')
        expect(state.capability).toBe('unavailable')

        const decision = await service.gateComputerAction(input)

        expectRejected(decision)
        expect(binding.totalOsOps()).toBe(0)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  it('rejects every action and attempts no further OS operation when the binding fails at runtime mid-session', async () => {
    await fc.assert(
      fc.asyncProperty(gateInputArb, async (input) => {
        // Start with an available binding so a session can be provisioned, then
        // model a VDA call failure by flipping the binding to unavailable. The
        // gate reads `isAvailable()` and must reject all subsequent actions.
        const binding = new SpyVdaBinding({ loadOutcome: 'available', existing: [0], current: 0 })
        const service = createAgentDesktopService({
          binding,
          settings: makeEnabledSettings(),
          platformSupported: true,
        })
        await service.initialize()

        const start = await service.startSession('run-1')
        expect(start.provisioned).toBe(true)

        // VDA call failure at runtime: the binding now reports itself unavailable.
        binding.setAvailable(false)

        // Snapshot OS-operation counts AFTER provisioning so we measure only the
        // operations the gate itself attempts (it must attempt none).
        const before = binding.osOpSnapshot()

        const decision = await service.gateComputerAction(input)

        expectRejected(decision)

        const after = binding.osOpSnapshot()
        expect(after.create).toBe(before.create)
        expect(after.remove).toBe(before.remove)
        expect(after.goTo).toBe(before.goTo)
        expect(after.move).toBe(before.move)
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})
