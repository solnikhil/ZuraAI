// @vitest-environment node

// Feature: agent-desktop, Property 26: Action cap rejects past the limit

/**
 * Property-based test for the Computer Use action-cap rejection gate
 * (`AgentDesktopService.gateComputerAction`), covering Task 13.8.
 *
 * Lives in its own dedicated file to avoid concurrent-write collisions with the
 * other parallel gate/lifecycle/placement test-authoring tasks.
 *
 * Covered correctness property (from the design):
 * - Property 26: Action cap rejects past the limit (Req 6.8, 6.9)
 *
 *   *For any* sequence of counted Computer Use actions that exceeds
 *   `MAX_ACTIONS_PER_SESSION`, every action requested once the count has reached
 *   the cap is rejected with a message indicating the action limit was reached.
 *
 * ## Test strategy
 * The cap gate is exercised end-to-end through the public
 * `gateComputerAction` API with the native VDA surface fully injected via a
 * controllable in-memory {@link MockVdaBinding}; no real DLL / koffi / nut.js /
 * desktopCapturer is touched. A deterministic injected clock keeps every
 * timeline `occurredAt` reproducible (the cap gate has no real time-dependent
 * logic, but the clock is injected per the task's timing-injection guidance).
 *
 * To reach the cap deterministically the fill phase issues only **non-input**
 * counted actions (`screenshot`, `list_windows`, `find_app`). Those are always
 * permitted by presence and are not window-targeted, so each one passes every
 * gate and returns `allow: true` while still counting toward the cap — giving an
 * unambiguous precondition (`actionCount === MAX_ACTIONS_PER_SESSION`).
 *
 * The cap gate (step 5 in `gateComputerAction`) runs BEFORE the presence/held
 * gate (step 6) and the targeting gate (step 7), so once the count has reached
 * the cap, an over-limit action of **any** counted type is rejected with
 * outcome `limit-reached` without needing a resolved target window. The
 * past-cap phase therefore draws from the full counted action surface.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome, AgentActionType } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'
import { MAX_ACTIONS_PER_SESSION } from './constants'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x26ca }

/** Index handed out by {@link MockVdaBinding.createDesktop} for the session. */
const FIRST_CREATED_INDEX = 100

/**
 * Counted, non-input Computer Use actions. Always permitted by presence and not
 * window-targeted, so each returns `allow: true` while still counting toward the
 * cap — used to fill the counter to exactly `MAX_ACTIONS_PER_SESSION`.
 */
const NON_INPUT_COUNTED: readonly AgentActionType[] = ['screenshot', 'list_windows', 'find_app']

/**
 * The full counted Computer Use action surface (Req 6.7). Used for the over-cap
 * phase: once the count has reached the cap, EVERY one of these is rejected by
 * the cap gate before presence/targeting can apply.
 */
const ALL_COUNTED: readonly AgentActionType[] = [
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

/**
 * A fully-controllable in-memory {@link VdaBinding} for the cap-gate property.
 *
 * Models only the native surface the gate touches for non-input actions: a
 * single existing desktop, the current index, desktop create/exists, and an
 * (empty) window enumeration. No real native side-effects.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  private existing = new Set<number>([0])
  private current = 0
  private nextIndex = FIRST_CREATED_INDEX

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
    /* not exercised by the cap-gate path */
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
 * Create an initialized, ready-to-gate service over a mock binding with an
 * active session. A deterministic monotonic clock backs the service so every
 * emitted timeline step is reproducible.
 */
async function makeSessionService(): Promise<{
  service: AgentDesktopService
  steps: AgentDesktopTimelineStep[]
}> {
  let tick = 1_000
  const service = createAgentDesktopService({
    binding: new MockVdaBinding(),
    settings: makeSettings(),
    platformSupported: true,
    now: () => tick++,
  })
  await service.initialize()
  const start = await service.startSession('run-1')
  expect(start.provisioned).toBe(true)

  const steps: AgentDesktopTimelineStep[] = []
  service.onTimelineStep((step) => steps.push(step))
  return { service, steps }
}

/** Gate a non-targeted Computer Use action through the service. */
function gate(service: AgentDesktopService, action: AgentActionType) {
  return service.gateComputerAction({ action, args: {} })
}

// ---------------------------------------------------------------------------
// Property 26 — Task 13.8
// ---------------------------------------------------------------------------

describe('AgentDesktopService gate — Property 26: action cap rejects past the limit', () => {
  // Feature: agent-desktop, Property 26: Action cap rejects past the limit
  // Validates: Requirements 6.8, 6.9
  it('allows exactly MAX_ACTIONS_PER_SESSION counted actions, then rejects every further action with a limit-reached message', async () => {
    await fc.assert(
      fc.asyncProperty(
        // The fill phase: exactly MAX counted non-input actions (each allowed).
        fc.array(fc.constantFrom(...NON_INPUT_COUNTED), {
          minLength: MAX_ACTIONS_PER_SESSION,
          maxLength: MAX_ACTIONS_PER_SESSION,
        }),
        // The over-cap phase: at least one further counted action of ANY type.
        fc.array(fc.constantFrom(...ALL_COUNTED), { minLength: 1, maxLength: 20 }),
        async (fillActions, pastActions) => {
          const { service, steps } = await makeSessionService()

          // Fill the counter up to the cap. Each non-input action passes every
          // gate and is allowed, while still counting toward the cap.
          for (const action of fillActions) {
            const decision = await gate(service, action)
            expect(decision.allow).toBe(true)
          }

          // Precondition reached: the shared counter sits exactly at the cap.
          expect(service.getState().actionCount).toBe(MAX_ACTIONS_PER_SESSION)

          const rejectedBefore = steps.filter((s) => s.kind === 'action-rejected').length

          // Every action requested once the count has reached the cap is
          // rejected with outcome `limit-reached` and a message that indicates
          // the action limit was reached (Req 6.8, 6.9).
          for (const action of pastActions) {
            const decision = await gate(service, action)
            expect(decision.allow).toBe(false)
            if (decision.allow) return // narrows the union for TS
            expect(decision.outcome).toBe('limit-reached')
            expect(decision.reason).toMatch(/limit reached/i)
            expect(decision.reason).toContain(String(MAX_ACTIONS_PER_SESSION))
          }

          // The counter never runs past the cap, no matter how many over-cap
          // actions are requested (rejection happens before incrementing).
          expect(service.getState().actionCount).toBe(MAX_ACTIONS_PER_SESSION)

          // Each over-cap request records a rejection step in the Agent_Run
          // timeline carrying the limit-reached outcome.
          const limitSteps = steps
            .filter((s) => s.kind === 'action-rejected')
            .slice(rejectedBefore)
          expect(limitSteps).toHaveLength(pastActions.length)
          for (const step of limitSteps) {
            expect(step.outcome).toBe('limit-reached')
            expect(step.status).toBe('rejected')
            expect(step.reason).toMatch(/limit reached/i)
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 26: Action cap rejects past the limit
  // Validates: Requirements 6.8, 6.9
  it('rejects at the exact boundary: the action after the cap-reaching action is the first to be limit-reached', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...NON_INPUT_COUNTED),
        fc.constantFrom(...ALL_COUNTED),
        async (fillAction, overCapAction) => {
          const { service } = await makeSessionService()

          // The first MAX_ACTIONS_PER_SESSION counted actions are all allowed;
          // the last of them is the action that reaches the cap.
          for (let i = 0; i < MAX_ACTIONS_PER_SESSION; i++) {
            const decision = await gate(service, fillAction)
            expect(decision.allow).toBe(true)
          }
          expect(service.getState().actionCount).toBe(MAX_ACTIONS_PER_SESSION)

          // The very next action — the (MAX + 1)th — is the first to be rejected.
          const overCap = await gate(service, overCapAction)
          expect(overCap.allow).toBe(false)
          if (overCap.allow) return
          expect(overCap.outcome).toBe('limit-reached')
          expect(overCap.reason).toMatch(/limit reached/i)
          expect(overCap.reason).toContain(String(MAX_ACTIONS_PER_SESSION))
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
