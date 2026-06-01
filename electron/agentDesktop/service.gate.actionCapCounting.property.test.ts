// @vitest-environment node

/**
 * Property-based test for the Agent Desktop action-cap counting rule
 * (`AgentDesktopService.gateComputerAction`), covering Task 13.7.
 *
 * Covered correctness property (from the design):
 * - Property 25: Action cap counts only Computer Use actions (Req 6.7) — Task 13.7
 *
 * ## What Req 6.7 / Property 25 require
 * The per-session Action_Cap is enforced by counting ONLY Computer Use actions
 * (screenshot, click, type, key, scroll, cursor_position, list_windows,
 * launch_app, close_app, find_app) toward MAX_ACTIONS_PER_SESSION (50).
 * Operations that are NOT a Computer Use action must never increment the shared
 * session counter:
 *   - a `gateComputerAction` call whose `action` name is outside the Computer
 *     Use surface is rejected as out-of-surface and must NOT count (Req 12.6); and
 *   - non-gate service operations (state reads, window placement notifications,
 *     settings mirroring, disclosure acknowledgement, presence transitions) must
 *     NOT count.
 *
 * The shared counter increments by exactly one for each Computer Use action that
 * passes the availability / abort / session / cap gates — independently of the
 * action's eventual outcome (allowed, held, or rejected by presence / targeting
 * / approval), because the increment happens before those later gates.
 *
 * ## Test strategy
 * A fully-controllable in-memory {@link VdaBinding} models the only native
 * surface the gate touches (availability is `true` after `load()`), so the pure
 * counting logic is exercised in isolation across 100+ inputs. The service is
 * driven into a ready, enabled, disclosure-acknowledged, in-session state so
 * Computer Use actions are not gated out by availability. Sequences are bounded
 * well under MAX_ACTIONS_PER_SESSION (50) so the cap is never reached — this
 * property isolates *what counts*, while Property 26 (Task 13.8) covers
 * rejection past the limit. The counter is observed through the public
 * {@link AgentDesktopService.getActionCount} accessor.
 *
 * Native side-effects are mocked via the injected binding, and an injectable
 * clock is supplied so timeline timestamps are deterministic.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome } from './types'
import { MAX_ACTIONS_PER_SESSION } from './constants'
import {
  defaultAgentDesktopSettings,
  type AgentDesktopSettings,
} from './settings'
import type { AgentActionType } from './types'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x25c7 }

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the user-desktop range the generators use (0–20) so a
 * created Agent_Desktop index never collides with a generated User_Desktop index.
 */
const FIRST_CREATED_INDEX = 100

/**
 * The complete Computer Use action surface that the Action_Cap counts toward
 * MAX_ACTIONS_PER_SESSION (Req 6.7). Defined locally so the property checks the
 * public contract rather than the service module's private constant.
 */
const COMPUTER_USE_ACTIONS: readonly AgentActionType[] = [
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
] as const

const COMPUTER_USE_ACTION_SET = new Set<string>(COMPUTER_USE_ACTIONS)

/**
 * A fully-controllable in-memory {@link VdaBinding} for the action-cap counting
 * property. Reports `available` after `load()` so the gate's availability check
 * passes, and provides benign implementations of every surface the lifecycle /
 * placement paths touch so the supporting operations in the mixed sequence
 * (startSession, notifyWindowOpened) never throw.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  /** Set of currently-existing Virtual_Desktop indices. */
  existing: Set<number>
  /** The currently-displayed Virtual_Desktop index. */
  current: number
  /** Next index handed out by {@link createDesktop}. */
  private nextIndex = FIRST_CREATED_INDEX
  /** Flat list returned by {@link enumerateWindows}. */
  windows: VdaWindowInfo[] = []

  constructor(opts: { existing?: number[]; current?: number } = {}) {
    this.existing = new Set(opts.existing ?? [0])
    this.current = opts.current ?? 0
  }

  async load(): Promise<VdaLoadOutcome> {
    this.available = true
    return 'available'
  }

  isAvailable(): boolean {
    return this.available
  }

  /** Read defensively by the service; no load error in the available path. */
  getLoadError(): string | null {
    return null
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
    return index
  }

  removeDesktop(index: number): void {
    this.existing.delete(index)
  }

  goToDesktop(index: number): void {
    this.current = index
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    /* no-op: placement target is not exercised by the counting property */
  }

  isWindowOnDesktop(): boolean {
    // Confirm every placement so notifyWindowOpened succeeds without retries.
    return true
  }

  enumerateWindows(): VdaWindowInfo[] {
    return this.windows.slice()
  }

  dispose(): void {
    this.available = false
  }
}

/** Build enabled Agent Desktop settings with the disclosure acknowledged. */
function makeSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
  }
}

/**
 * Create an initialized, enabled service with an active session over a mock
 * binding. After this, the availability / abort / session gates all pass so a
 * Computer Use action increments the shared counter and a non-Computer-Use
 * action name is rejected as out-of-surface without counting.
 */
async function makeReadySession(binding: MockVdaBinding): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding,
    settings: makeSettings(),
    platformSupported: true,
    // Deterministic clock for timeline timestamps (no timing logic is asserted).
    now: () => 1_000,
  })
  await service.initialize()
  const start = await service.startSession('run-1')
  expect(start.provisioned).toBe(true)
  // startSession resets the shared counter to 0 (fresh session baseline).
  expect(service.getActionCount()).toBe(0)
  return service
}

// Shared generators.
const hwndArb = fc.integer({ min: 1, max: 1_000_000 })
const computerUseActionArb = fc.constantFrom(...COMPUTER_USE_ACTIONS)

/**
 * Arbitrary action names that are NOT part of the Computer Use surface. Mixes
 * plausible adversarial names (near-misses and unrelated operation names) with
 * arbitrary strings, filtering out anything that happens to be a real Computer
 * Use action or empty.
 */
const nonComputerUseActionArb = fc
  .oneof(
    fc.constantFrom(
      'move_window',
      'open_url',
      'read_file',
      'delete_file',
      'navigate',
      'wait',
      'drag',
      'double_click',
      'right_click',
      'screenshot_all',
      'list',
      'launch',
      'close',
      'find',
      'Click',
      'TYPE',
      'press',
      '',
    ),
    fc.string({ minLength: 1, maxLength: 24 }),
    fc.string()
  )
  .filter((name) => name.length > 0 && !COMPUTER_USE_ACTION_SET.has(name))

// ---------------------------------------------------------------------------
// Property 25 — Task 13.7
// ---------------------------------------------------------------------------

describe('AgentDesktopService gate — Property 25: action cap counts only Computer Use actions', () => {
  // Feature: agent-desktop, Property 25: Action cap counts only Computer Use actions
  // Validates: Requirements 6.7
  it('increments the shared counter by exactly one for each Computer Use action and never for any non-Computer-Use operation', async () => {
    // The operation alphabet for the mixed sequence. Only 'cu' should ever move
    // the counter; everything else must leave it untouched.
    type Op =
      | { kind: 'cu'; action: AgentActionType; targetHwnd?: number }
      | { kind: 'noncu'; action: string }
      | { kind: 'state' }
      | { kind: 'window'; hwnd: number }
      | { kind: 'ack' }
      | { kind: 'settings' }

    const opArb: fc.Arbitrary<Op> = fc.oneof(
      fc.record({
        kind: fc.constant('cu' as const),
        action: computerUseActionArb,
        // Optionally attach a target so input / close_app actions exercise the
        // held / targeting branches — they still count, since the increment
        // precedes those gates.
        targetHwnd: fc.option(hwndArb, { nil: undefined }),
      }),
      fc.record({ kind: fc.constant('noncu' as const), action: nonComputerUseActionArb }),
      fc.record({ kind: fc.constant('state' as const) }),
      fc.record({ kind: fc.constant('window' as const), hwnd: hwndArb }),
      fc.record({ kind: fc.constant('ack' as const) }),
      fc.record({ kind: fc.constant('settings' as const) })
    )

    await fc.assert(
      fc.asyncProperty(
        // Bound the sequence well under MAX_ACTIONS_PER_SESSION (50) so the cap is
        // never reached: this property isolates *what counts*, not the limit.
        fc.array(opArb, { minLength: 1, maxLength: 40 }),
        async (ops) => {
          const binding = new MockVdaBinding({ existing: [0], current: 0 })
          const service = await makeReadySession(binding)

          // Model mirror of the shared counter: increments only for Computer Use
          // actions while strictly under the cap.
          let expected = 0

          for (const op of ops) {
            switch (op.kind) {
              case 'cu': {
                await service.gateComputerAction({
                  action: op.action,
                  args: {},
                  targetHwnd: op.targetHwnd,
                })
                // Sequence length < 50, so the cap is never reached and every
                // Computer Use action counts (Req 6.7).
                expected += 1
                break
              }
              case 'noncu': {
                const decision = await service.gateComputerAction({
                  action: op.action,
                  args: {},
                })
                // A non-Computer-Use name is rejected out-of-surface and must NOT count.
                expect(decision.allow).toBe(false)
                break
              }
              case 'state':
                service.getState()
                break
              case 'window':
                await service.notifyWindowOpened(op.hwnd)
                break
              case 'ack':
                service.acknowledgeDisclosure()
                break
              case 'settings':
                // Re-mirroring known-good preferences must not touch the counter.
                service.applySettings(makeSettings())
                break
            }

            // After every operation the shared counter equals the number of
            // Computer Use actions issued so far — nothing else moved it.
            expect(service.getActionCount()).toBe(expected)
          }

          const cuCount = ops.filter((op) => op.kind === 'cu').length
          expect(service.getActionCount()).toBe(cuCount)
          // Stayed strictly under the cap, so no action was rejected for the limit.
          expect(service.getActionCount()).toBeLessThan(MAX_ACTIONS_PER_SESSION)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 25: Action cap counts only Computer Use actions
  // Validates: Requirements 6.7
  it('counts every Computer Use action type exactly once regardless of its gate outcome (allowed / held / rejected)', async () => {
    // Drive each of the ten Computer Use actions in a randomized order, without a
    // resolved target, so input actions are held and close_app is rejected for
    // targeting while capture / query actions are allowed — yet every one counts.
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray([...COMPUTER_USE_ACTIONS], {
          minLength: COMPUTER_USE_ACTIONS.length,
          maxLength: COMPUTER_USE_ACTIONS.length,
        }),
        async (order) => {
          const binding = new MockVdaBinding({ existing: [0], current: 0 })
          const service = await makeReadySession(binding)

          let expected = 0
          for (const action of order) {
            const before = service.getActionCount()
            await service.gateComputerAction({ action, args: {} })
            const after = service.getActionCount()
            // Exactly one increment per Computer Use action, whatever its outcome.
            expect(after - before).toBe(1)
            expected += 1
            expect(after).toBe(expected)
          }

          // All ten distinct Computer Use action types counted once each.
          expect(service.getActionCount()).toBe(COMPUTER_USE_ACTIONS.length)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 25: Action cap counts only Computer Use actions
  // Validates: Requirements 6.7
  it('never increments the counter for any non-Computer-Use action name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nonComputerUseActionArb, { minLength: 1, maxLength: 30 }),
        async (names) => {
          const binding = new MockVdaBinding({ existing: [0], current: 0 })
          const service = await makeReadySession(binding)

          for (const action of names) {
            const decision = await service.gateComputerAction({ action, args: {} })
            // Out-of-surface rejection (Req 12.6) and never counted (Req 6.7).
            expect(decision.allow).toBe(false)
            expect(service.getActionCount()).toBe(0)
          }

          expect(service.getActionCount()).toBe(0)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
