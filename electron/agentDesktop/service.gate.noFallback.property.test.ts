// @vitest-environment node

/**
 * Property-based test for the Agent Desktop Computer Use action gate's
 * no-User_Desktop-fallback guarantee (Task 13.3).
 *
 * Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
 *
 * Covered correctness property (from the design):
 * - Property 17: Failures never fall back to the User_Desktop (Req 4.7, 8.6) — Task 13.3
 *
 *   *For any* action that fails (execution failure, capture failure, or while
 *   the VDA_Binding is unavailable), a failure/error result is returned and no
 *   agent action is ever dispatched against the User_Desktop as a fallback.
 *
 * ## Why the gate is the right place to assert this
 * `AgentDesktopService.gateComputerAction` is a **pure decision function**: it
 * never drives the OS itself. It returns either
 * - `{ allow: false, reason, outcome }` — the caller (Task 16.1) returns the
 *   rejection WITHOUT touching the OS, or
 * - `{ allow: true, autoApprove, desktopOverride? }` — the caller delegates to
 *   the existing Computer Use executor, where a capture's `desktopOverride` is
 *   ALWAYS the Agent_Desktop index (Req 4.2) and an input/close action is only
 *   allowed after targeting positively confirmed Agent_Desktop residence (Req 7).
 *
 * So "never falls back to the User_Desktop" is encoded as two observable facts:
 * 1. On every failure path the gate returns a rejection (`allow: false`) and
 *    drives **no** binding side-effect that could target the User_Desktop
 *    (no `goToDesktop`, no `moveWindowToDesktop`).
 * 2. On every allowed path the only desktop the decision authorizes is the
 *    Agent_Desktop — an allowed capture's `desktopOverride` equals the
 *    Agent_Desktop index (never the User_Desktop), and an allowed input/close
 *    action carried `onAgentDesktop === true`.
 *
 * The kill-switch safety return (`goToDesktop(userDesktopId)`) is the one
 * legitimate User_Desktop interaction — it returns the *display*, it is not an
 * agent *action* dispatched against the User_Desktop (Req 6.5). The post-abort
 * property below asserts that distinction: the safe return happens once, and no
 * further agent action is dispatched against any desktop afterward.
 *
 * ## Test strategy
 * A fully-controllable in-memory {@link VdaBinding} records every side-effecting
 * call (`goToDesktop`, `moveWindowToDesktop`, `createDesktop`, `removeDesktop`)
 * and can be configured `available` | `unavailable`, so each property can drive
 * a specific failure mode and assert the gate authorized nothing against the
 * User_Desktop. The service is index-based: a created Agent_Desktop index is
 * `>= 100`, well above the User_Desktop index range the generators use (0–20),
 * so an Agent_Desktop index can never collide with a User_Desktop index and the
 * "never the User_Desktop" assertions are unambiguous.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { createAgentDesktopService, type AgentDesktopService } from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome, AgentDesktopSession } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x17fa }

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the user-desktop range the generators use (0–20) so a
 * created Agent_Desktop index never collides with a generated User_Desktop index.
 */
const FIRST_CREATED_INDEX = 100

/**
 * A ZuraAI-owned window handle. Kept above the {@link hwndArb} range (max 1e6)
 * so a generated target HWND can never accidentally equal it.
 */
const ZURA_OWNED_HANDLE = 999_999_001

/**
 * A fully-controllable in-memory {@link VdaBinding} for the no-fallback property.
 *
 * Records every side-effecting call so the test can assert the gate authorized
 * no OS operation against the User_Desktop on a failure. Configurable load
 * outcome lets a property model both "VDA unavailable at init" and "VDA fails at
 * runtime" (by flipping {@link available} after provisioning).
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  private readonly loadOutcome: VdaLoadOutcome
  /** Set of currently-existing Virtual_Desktop indices. */
  existing: Set<number>
  /** The currently-displayed Virtual_Desktop index. */
  current: number
  /** Next index handed out by {@link createDesktop}. */
  private nextIndex = FIRST_CREATED_INDEX
  /** Flat list returned by {@link enumerateWindows}. */
  windows: VdaWindowInfo[] = []

  // --- Observable side-effecting call records ------------------------------
  /** Every `moveWindowToDesktop(hwnd, index)` call (window placement). */
  moveCalls: Array<{ hwnd: number; index: number }> = []
  /** Every `goToDesktop(index)` call (display switch). */
  goToDesktopCalls: number[] = []
  createDesktopCalls = 0
  removeDesktopCalls: number[] = []
  lastCreatedIndex: number | null = null

  constructor(opts: { existing?: number[]; current?: number; loadOutcome?: VdaLoadOutcome } = {}) {
    this.existing = new Set(opts.existing ?? [0])
    this.current = opts.current ?? 0
    this.loadOutcome = opts.loadOutcome ?? 'available'
  }

  async load(): Promise<VdaLoadOutcome> {
    this.available = this.loadOutcome === 'available'
    return this.loadOutcome
  }

  /** Toggle runtime availability to model a VDA call failing mid-session. */
  setAvailable(value: boolean): void {
    this.available = value
  }

  isAvailable(): boolean {
    return this.available
  }

  /** A user-visible load error naming the integration when unavailable. */
  getLoadError(): string | null {
    return this.loadOutcome === 'unavailable'
      ? 'The VirtualDesktopAccessor virtual-desktop integration is unavailable.'
      : null
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
    this.lastCreatedIndex = index
    return index
  }

  removeDesktop(index: number): void {
    this.existing.delete(index)
    this.removeDesktopCalls.push(index)
  }

  goToDesktop(index: number): void {
    this.goToDesktopCalls.push(index)
    // Switch succeeds: the displayed index becomes the requested index.
    this.current = index
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(hwnd: number, index: number): void {
    this.moveCalls.push({ hwnd, index })
  }

  isWindowOnDesktop(): boolean {
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    return this.windows.slice()
  }

  dispose(): void {
    this.available = false
  }
}

/** Build enabled Agent Desktop settings (disclosure acknowledged). */
function makeSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
  }
}

/**
 * Create an initialized service over a mock binding. `initialize()` drives the
 * mock `load()` so the recorded `vdaOutcome` reflects the binding's load outcome.
 */
async function makeService(
  binding: MockVdaBinding,
  options: { zuraOwnedHandles?: Iterable<number> } = {}
): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding,
    settings: makeSettings(),
    platformSupported: true,
    zuraOwnedHandles: options.zuraOwnedHandles,
  })
  await service.initialize()
  return service
}

/** Read the service's internal session (recorded ids are not on the public state). */
function readSession(service: AgentDesktopService): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

// Shared action vocabulary.
const INPUT_ACTIONS = ['click', 'type', 'key', 'scroll', 'cursor_position'] as const
const NON_INPUT_ACTIONS = ['screenshot', 'list_windows', 'find_app'] as const
const LAUNCH_CLOSE_ACTIONS = ['launch_app', 'close_app'] as const
const ALL_ACTIONS = [...INPUT_ACTIONS, ...NON_INPUT_ACTIONS, ...LAUNCH_CLOSE_ACTIONS]
/** Action names outside the Computer Use surface (Req 12.6). */
const OUT_OF_SURFACE_NAMES = ['', 'drag', 'open_url', 'navigate', 'exec', 'SCREENSHOT', 'rm_rf']

// Shared generators.
const hwndArb = fc.integer({ min: 1, max: 1_000_000 })
const userDesktopIndexArb = fc.integer({ min: 0, max: 20 })
const anyActionNameArb = fc.constantFrom(...ALL_ACTIONS, ...OUT_OF_SURFACE_NAMES)
const inputActionArb = fc.constantFrom(...INPUT_ACTIONS)
const argsArb = fc.dictionary(
  fc.string({ maxLength: 8 }),
  fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.boolean()),
  { maxKeys: 4 }
)
const onAgentDesktopArb = fc.constantFrom<boolean | undefined>(true, false, undefined)

/**
 * Assert a gate decision is a rejection that returns an error and authorizes no
 * dispatch against the User_Desktop. `binding` must have had its side-effect
 * call lists snapshotted into `before` prior to the gate call.
 */
function expectRejectionWithNoUserDesktopDispatch(
  decision: Awaited<ReturnType<AgentDesktopService['gateComputerAction']>>,
  binding: MockVdaBinding,
  before: { moves: number; goTos: number }
): void {
  // A failure/error result is returned (Property 17).
  expect(decision.allow).toBe(false)
  if (!decision.allow) {
    expect(typeof decision.reason).toBe('string')
    expect(decision.reason.length).toBeGreaterThan(0)
    expect(['rejected', 'held', 'aborted', 'limit-reached']).toContain(decision.outcome)
  }
  // The gate drove no OS operation at all — in particular nothing toward the
  // User_Desktop as a fallback (Req 4.7, 8.6).
  expect(binding.moveCalls.length).toBe(before.moves)
  expect(binding.goToDesktopCalls.length).toBe(before.goTos)
}

// ---------------------------------------------------------------------------
// Property 17a — VDA unavailable at initialization (Req 8.6)
// ---------------------------------------------------------------------------

describe('AgentDesktopService gate — Property 17: failures never fall back to the User_Desktop', () => {
  // Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
  // Validates: Requirements 4.7, 8.6
  it('rejects every action while the VDA binding is unavailable and drives no OS operation', async () => {
    await fc.assert(
      fc.asyncProperty(
        anyActionNameArb,
        argsArb,
        fc.option(hwndArb, { nil: undefined }),
        onAgentDesktopArb,
        async (action, args, targetHwnd, onAgentDesktop) => {
          // VDA reports unavailable at load → Agent Desktop is disabled but the
          // rest of the app keeps working (Req 8.4). The gate must reject.
          const binding = new MockVdaBinding({ loadOutcome: 'unavailable' })
          const service = await makeService(binding)

          // No session is provisioned (provisioning is gated off when VDA is
          // unavailable) — the availability gate rejects first.
          const before = { moves: binding.moveCalls.length, goTos: binding.goToDesktopCalls.length }
          const decision = await service.gateComputerAction({ action, args, targetHwnd, onAgentDesktop })

          expectRejectionWithNoUserDesktopDispatch(decision, binding, before)
          // Specifically a hard rejection (not a hold), since nothing is provisioned.
          if (!decision.allow) {
            expect(decision.outcome).toBe('rejected')
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // -------------------------------------------------------------------------
  // Property 17b — VDA call fails at runtime mid-session (Req 8.3, 8.6)
  // -------------------------------------------------------------------------

  // Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
  // Validates: Requirements 4.7, 8.6
  it('rejects further actions when the VDA binding becomes unavailable mid-session, with no User_Desktop fallback', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        anyActionNameArb,
        argsArb,
        fc.option(hwndArb, { nil: undefined }),
        onAgentDesktopArb,
        async (userIndex, action, args, targetHwnd, onAgentDesktop) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          const service = await makeService(binding)

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)

          // Simulate a runtime VDA failure: the binding now reports unavailable
          // (Req 8.3). Every subsequent gated action must reject without driving
          // the OS, and never substitute the User_Desktop (Req 8.6).
          binding.setAvailable(false)

          const before = { moves: binding.moveCalls.length, goTos: binding.goToDesktopCalls.length }
          const decision = await service.gateComputerAction({ action, args, targetHwnd, onAgentDesktop })

          expectRejectionWithNoUserDesktopDispatch(decision, binding, before)
          if (!decision.allow) {
            expect(decision.outcome).toBe('rejected')
          }
          // No move/goTo ever targeted the User_Desktop index.
          expect(binding.moveCalls.every((c) => c.index !== userIndex)).toBe(true)
          expect(binding.goToDesktopCalls.every((i) => i !== userIndex)).toBe(true)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // -------------------------------------------------------------------------
  // Property 17c — Gate-stage failures in a live take-over session (Req 4.7, 7.2)
  // -------------------------------------------------------------------------

  /**
   * Each failure case is reachable from a live `take-over` + displayed session
   * (so input actions pass presence and reach the failing gate stage), and every
   * case must reject without dispatching anything against the User_Desktop.
   */
  const failureCaseArb = fc.oneof(
    // Input action targeting a window confirmed on the User_Desktop (Req 7.2).
    fc.record({ kind: fc.constant('user-desktop' as const), action: inputActionArb, hwnd: hwndArb }),
    // Input action whose residence could not be positively confirmed (Req 7.7).
    fc.record({ kind: fc.constant('unconfirmed' as const), action: inputActionArb, hwnd: hwndArb }),
    // Input action targeting a ZuraAI-owned window (Req 7.6).
    fc.record({ kind: fc.constant('zura-owned' as const), action: inputActionArb }),
    // close_app targeting a window that is not a current-run Agent_Window (Req 7.4).
    fc.record({ kind: fc.constant('close-non-agent' as const), hwnd: hwndArb }),
    // An action name outside the Computer Use surface (Req 12.6).
    fc.record({ kind: fc.constant('out-of-surface' as const), name: fc.constantFrom(...OUT_OF_SURFACE_NAMES) })
  )

  // Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
  // Validates: Requirements 4.7, 8.6
  it('rejects failing gate stages in a live take-over session and never delivers to the User_Desktop', async () => {
    await fc.assert(
      fc.asyncProperty(userDesktopIndexArb, argsArb, failureCaseArb, async (userIndex, args, failure) => {
        const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
        const service = await makeService(binding, { zuraOwnedHandles: [ZURA_OWNED_HANDLE] })

        const start = await service.startSession('run-1')
        expect(start.provisioned).toBe(true)
        const session = readSession(service)
        expect(session).not.toBeNull()
        if (!session) return
        const agentIndex = session.agentDesktopIndex
        expect(agentIndex).not.toBe(userIndex)

        // Bring the Agent_Desktop to the foreground so input actions pass the
        // presence gate and reach the targeting/out-of-surface stage that fails.
        const takeOver = await service.activateTakeOver()
        expect(takeOver.ok).toBe(true)

        // Snapshot side-effect counts AFTER the take-over display switch so we
        // measure only what the failing gate call drives (which must be nothing).
        const before = { moves: binding.moveCalls.length, goTos: binding.goToDesktopCalls.length }

        let decision: Awaited<ReturnType<AgentDesktopService['gateComputerAction']>>
        switch (failure.kind) {
          case 'user-desktop':
            decision = await service.gateComputerAction({
              action: failure.action,
              args,
              targetHwnd: failure.hwnd,
              onAgentDesktop: false,
            })
            break
          case 'unconfirmed':
            decision = await service.gateComputerAction({
              action: failure.action,
              args,
              targetHwnd: failure.hwnd,
              onAgentDesktop: undefined,
            })
            break
          case 'zura-owned':
            decision = await service.gateComputerAction({
              action: failure.action,
              args,
              targetHwnd: ZURA_OWNED_HANDLE,
              onAgentDesktop: true,
            })
            break
          case 'close-non-agent':
            decision = await service.gateComputerAction({
              action: 'close_app',
              args,
              targetHwnd: failure.hwnd,
              onAgentDesktop: true,
            })
            break
          case 'out-of-surface':
          default:
            decision = await service.gateComputerAction({ action: failure.name, args })
            break
        }

        expectRejectionWithNoUserDesktopDispatch(decision, binding, before)
        // Every one of these gate-stage failures is a hard rejection.
        if (!decision.allow) {
          expect(decision.outcome).toBe('rejected')
        }
        // No window was ever moved to, and the display never switched to, the User_Desktop.
        expect(binding.moveCalls.every((c) => c.index !== userIndex)).toBe(true)
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // -------------------------------------------------------------------------
  // Property 17d — Input held in background is never delivered (Req 3.6)
  // -------------------------------------------------------------------------

  // Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
  // Validates: Requirements 4.7, 8.6
  it('holds (never delivers) input requested while staging in the background — no User_Desktop dispatch', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        inputActionArb,
        argsArb,
        fc.option(hwndArb, { nil: undefined }),
        onAgentDesktopArb,
        async (userIndex, action, args, targetHwnd, onAgentDesktop) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          const service = await makeService(binding)

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)
          // A fresh session is in background with the Agent_Desktop not displayed.
          expect(service.getState().presence).toBe('background')

          const before = { moves: binding.moveCalls.length, goTos: binding.goToDesktopCalls.length }
          const decision = await service.gateComputerAction({ action, args, targetHwnd, onAgentDesktop })

          // Held, not delivered (Req 3.6) — and certainly not delivered to the
          // User_Desktop as a fallback.
          expect(decision.allow).toBe(false)
          if (!decision.allow) {
            expect(decision.outcome).toBe('held')
          }
          expectRejectionWithNoUserDesktopDispatch(decision, binding, before)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // -------------------------------------------------------------------------
  // Property 17e — Allowed captures always target the Agent_Desktop (Req 4.2, 8.6)
  // -------------------------------------------------------------------------

  // Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
  // Validates: Requirements 4.7, 8.6
  it('redirects every allowed capture to the Agent_Desktop, never the User_Desktop', async () => {
    await fc.assert(
      fc.asyncProperty(userDesktopIndexArb, argsArb, async (userIndex, args) => {
        const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
        const service = await makeService(binding)

        const start = await service.startSession('run-1')
        expect(start.provisioned).toBe(true)
        const session = readSession(service)
        expect(session).not.toBeNull()
        if (!session) return
        const agentIndex = session.agentDesktopIndex
        expect(agentIndex).not.toBe(userIndex)

        // A capture is allowed (non-input, auto-approve) and carries a
        // desktopOverride. That override must be the Agent_Desktop index even
        // though it is not the displayed Virtual_Desktop (Req 4.2) — never the
        // User_Desktop, so a capture failure can never read the User_Desktop.
        const decision = await service.gateComputerAction({ action: 'screenshot', args })
        expect(decision.allow).toBe(true)
        if (decision.allow) {
          expect(decision.desktopOverride).toBe(agentIndex)
          expect(decision.desktopOverride).not.toBe(userIndex)
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })

  // -------------------------------------------------------------------------
  // Property 17f — Post-abort, no agent action is dispatched anywhere (Req 4.7, 6.5, 8.6)
  // -------------------------------------------------------------------------

  // Feature: agent-desktop, Property 17: Failures never fall back to the User_Desktop
  // Validates: Requirements 4.7, 8.6
  it('dispatches no agent action after a kill-switch abort; the only User_Desktop interaction is the safe display return', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        // Use only in-surface action names so the abort gate is what rejects
        // them (out-of-surface rejection is covered separately in case 17c); the
        // abort gate runs after the out-of-surface gate, so a `drag`-style name
        // would be rejected as `rejected` before reaching it.
        fc.array(
          fc.record({ action: fc.constantFrom(...ALL_ACTIONS), hwnd: fc.option(hwndArb, { nil: undefined }) }),
          { minLength: 1, maxLength: 8 }
        ),
        async (userIndex, requests) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          const service = await makeService(binding)

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)

          // Abort via the double-Escape kill switch. This performs the safe
          // display RETURN to the recorded User_Desktop (Req 6.5) — that is a
          // display switch, not an agent action dispatched against the
          // User_Desktop.
          service.abortForKillSwitch()
          expect(service.isAborted()).toBe(true)
          // The safe return targeted exactly the recorded User_Desktop.
          expect(binding.goToDesktopCalls).toContain(userIndex)

          // Snapshot side-effect counts AFTER the abort's safe return; no further
          // gated action may drive any OS operation (Req 4.7, 6.4, 8.6).
          const before = { moves: binding.moveCalls.length, goTos: binding.goToDesktopCalls.length }

          for (const req of requests) {
            const decision = await service.gateComputerAction({
              action: req.action,
              args: {},
              targetHwnd: req.hwnd,
            })
            // Every post-abort action is rejected as aborted and dispatches nothing.
            expect(decision.allow).toBe(false)
            if (!decision.allow) {
              expect(decision.outcome).toBe('aborted')
            }
          }

          // No new window move and no new display switch happened while gating
          // post-abort actions — nothing was driven against any desktop.
          expect(binding.moveCalls.length).toBe(before.moves)
          expect(binding.goToDesktopCalls.length).toBe(before.goTos)
          // And no window was ever moved to the User_Desktop at any point.
          expect(binding.moveCalls.every((c) => c.index !== userIndex)).toBe(true)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
