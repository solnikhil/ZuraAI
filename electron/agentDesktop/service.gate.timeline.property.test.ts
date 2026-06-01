// @vitest-environment node

/**
 * Property-based test for the Agent Desktop Computer Use action gate's timeline
 * recording (Task 13.2).
 *
 * Feature: agent-desktop, Property 16: Every gated action produces a complete timeline record
 * Validates: Requirements 4.5
 *
 * ## What this validates
 * Property 16 (design): *For any* sequence of gated agent actions, each action
 * produces exactly one Agent_Run timeline step recording its request, its
 * approval outcome, and its execution result.
 *
 * `AgentDesktopService.gateComputerAction` is the single gate every `computer_*`
 * action passes through (`electron/agentDesktop/service.ts`). For each call it
 * emits exactly one structured {@link AgentDesktopTimelineStep} —
 * `action-allowed`, `action-rejected`, or `action-held` — that the IPC/renderer
 * layer forwards into the per-message `AgentRun` timeline. This test drives
 * arbitrary sequences of gated actions across arbitrary environments (presence,
 * approval policy, registered windows, ZuraAI-owned windows, valid + out-of-
 * surface action names, confirmed / unconfirmed / User_Desktop targets) and
 * asserts that, regardless of which gate branch fires:
 *
 * 1. **Exactly one** timeline step is emitted per gate call (the "exactly one
 *    Agent_Run timeline step" invariant of Property 16).
 * 2. The step is a **complete** record: a non-empty title, the active
 *    `agentRunId`, an `occurredAt` time, and the request's target window handle.
 * 3. The step is **consistent with the returned `GateDecision`**: its
 *    `kind` / `status` / `outcome` / `reason` and the recorded request action
 *    exactly mirror the decision — capturing the request, the approval outcome
 *    (`auto-approved` vs `approval-required`), and the execution/rejection result.
 *
 * ## Test strategy
 * A fully-controllable in-memory {@link VdaBinding} models the only native
 * surface the gate + its setup paths touch (current/existing desktops, window
 * enumeration, placement confirmation, and a success display switch). Settings
 * are injected directly (not normalized) so the per-action approval policy is
 * controlled exactly, letting the test assert the recorded approval-outcome
 * facet against the configured classification. The service's index-based
 * provisioning hands a created Agent_Desktop an index >= 100, well clear of the
 * 0–20 User_Desktop range, so an Agent_Desktop index can never collide.
 *
 * Window registration (`notifyWindowOpened`) and the Take_Over switch
 * (`activateTakeOver`) are performed BEFORE subscribing to the timeline, so the
 * collected steps contain only the gate steps under test.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
  type GateDecision,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type {
  VdaLoadOutcome,
  AgentDesktopSession,
  AgentActionType,
  ActionClassification,
} from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x16a5 }

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the user-desktop range the generators use (0–20) so a
 * created Agent_Desktop index never collides with a generated User_Desktop index.
 */
const FIRST_CREATED_INDEX = 100

/** The complete Computer Use action surface the gate accepts (Req 4.1, 12.6). */
const VALID_ACTIONS: readonly AgentActionType[] = [
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

/** Action names OUTSIDE the Computer Use surface — always rejected (Req 12.6). */
const INVALID_ACTIONS: readonly string[] = ['', 'foo', 'delete_file', 'open_url', 'paste']

/** Input actions presence may hold while the Agent_Desktop is not displayed. */
const INPUT_ACTIONS: ReadonlySet<string> = new Set([
  'click',
  'type',
  'key',
  'scroll',
  'cursor_position',
])

function isValidAction(action: string): action is AgentActionType {
  return (VALID_ACTIONS as readonly string[]).includes(action)
}

/**
 * A fully-controllable in-memory {@link VdaBinding} for the gate timeline
 * property. Models the current/existing desktops, a flat window list (for
 * `enumerateWindows`), always-confirming placement, and a success display
 * switch so Take_Over reliably enters take-over when requested.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  existing: Set<number>
  current: number
  private nextIndex = FIRST_CREATED_INDEX
  windows: VdaWindowInfo[] = []
  lastCreatedIndex: number | null = null

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
    this.lastCreatedIndex = index
    return index
  }

  removeDesktop(index: number): void {
    this.existing.delete(index)
  }

  goToDesktop(index: number): void {
    // Success switch: the displayed index becomes the requested index so
    // activateTakeOver reliably confirms the switch and enters take-over.
    this.current = index
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    /* placement always confirmed via isWindowOnDesktop below */
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

/** Build enabled Agent Desktop settings (disclosure acknowledged) with a policy. */
function makeSettings(
  approvalPolicy: Record<AgentActionType, ActionClassification>
): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    enabled: true,
    disclosureAcknowledged: true,
    approvalPolicy: { ...approvalPolicy },
  }
}

/**
 * Create an initialized service over a mock binding. `initialize()` drives the
 * mock `load()` so `vdaOutcome` is `available` and the gate is not blocked by
 * availability.
 */
async function makeReadyService(
  binding: MockVdaBinding,
  approvalPolicy: Record<AgentActionType, ActionClassification>,
  zuraOwnedHandles: Iterable<number>
): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding,
    settings: makeSettings(approvalPolicy),
    platformSupported: true,
    zuraOwnedHandles,
  })
  await service.initialize()
  return service
}

/** Read the service's internal session (recorded index is not on public state). */
function readSession(service: AgentDesktopService): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

// Shared generators.
const classificationArb = fc.constantFrom<ActionClassification>('auto-approve', 'approval-required')

/** A complete, well-formed per-action approval policy. */
const policyArb: fc.Arbitrary<Record<AgentActionType, ActionClassification>> = fc.record({
  screenshot: classificationArb,
  click: classificationArb,
  type: classificationArb,
  key: classificationArb,
  scroll: classificationArb,
  cursor_position: classificationArb,
  list_windows: classificationArb,
  launch_app: classificationArb,
  close_app: classificationArb,
  find_app: classificationArb,
})

// HWND pools kept disjoint by range so registered vs ZuraAI-owned never overlap.
const registeredHwndArb = fc.integer({ min: 1, max: 100_000 })
const zuraHwndArb = fc.integer({ min: 100_001, max: 200_000 })
const anyHwndArb = fc.integer({ min: 1, max: 200_000 })
const userDesktopIndexArb = fc.integer({ min: 0, max: 20 })

/** A single gated-action request descriptor (target resolved at runtime). */
const requestArb = fc.record({
  action: fc.oneof(
    fc.constantFrom<string>(...VALID_ACTIONS),
    fc.constantFrom<string>(...INVALID_ACTIONS)
  ),
  // How to resolve the target window handle for this request.
  targetKind: fc.constantFrom<'none' | 'random' | 'registered' | 'zura'>(
    'none',
    'random',
    'registered',
    'zura'
  ),
  randomHwnd: anyHwndArb,
  pick: fc.nat({ max: 8 }),
  // The caller-resolved residence confirmation (true / false / unconfirmed).
  onAgentDesktop: fc.constantFrom<boolean | undefined>(true, false, undefined),
})

type Request = {
  action: string
  targetKind: 'none' | 'random' | 'registered' | 'zura'
  randomHwnd: number
  pick: number
  onAgentDesktop: boolean | undefined
}

/** Resolve a request's concrete target window handle against the live pools. */
function resolveTargetHwnd(
  req: Request,
  registered: readonly number[],
  zura: readonly number[]
): number | undefined {
  switch (req.targetKind) {
    case 'none':
      return undefined
    case 'random':
      return req.randomHwnd
    case 'registered':
      return registered.length > 0 ? registered[req.pick % registered.length] : req.randomHwnd
    case 'zura':
      return zura.length > 0 ? zura[req.pick % zura.length] : req.randomHwnd
    default:
      return undefined
  }
}

/**
 * Assert the single emitted timeline `step` is a complete record and is
 * consistent with the returned `decision` for `request` (Property 16: request +
 * approval outcome + execution/rejection result).
 */
function assertCompleteAndConsistent(
  step: AgentDesktopTimelineStep,
  decision: GateDecision,
  request: { action: string; targetHwnd: number | undefined },
  runId: string,
  agentDesktopIndex: number,
  t0: number,
  t1: number
): void {
  // --- Completeness common to every gate step -------------------------------
  expect(typeof step.title).toBe('string')
  expect(step.title.length).toBeGreaterThan(0)
  // The step is attributed to the active Agent_Run (Req 4.5).
  expect(step.agentRunId).toBe(runId)
  // The step records the time it occurred.
  expect(typeof step.occurredAt).toBe('number')
  expect(step.occurredAt).toBeGreaterThanOrEqual(t0)
  expect(step.occurredAt).toBeLessThanOrEqual(t1)
  // The request's target window handle is recorded exactly as supplied.
  expect(step.hwnd).toBe(request.targetHwnd)

  const validAction = isValidAction(request.action)

  if (decision.allow) {
    // Execution-result facet: an allowed action is recorded as completed.
    expect(step.kind).toBe('action-allowed')
    expect(step.status).toBe('completed')
    expect(step.outcome).toBe('allowed')
    // An allowed action is always a valid Computer Use action, and the request
    // action name is recorded verbatim.
    expect(validAction).toBe(true)
    expect(step.action).toBe(request.action)
    // Approval-outcome facet: the recorded reason mirrors the decision's
    // auto-approve flag exactly (auto-approved vs approval-required).
    expect(step.reason).toBe(decision.autoApprove ? 'auto-approved' : 'approval-required')
    // Capture redirect is recorded only for screenshot, and targets the Agent_Desktop.
    if (decision.desktopOverride !== undefined) {
      expect(request.action).toBe('screenshot')
      expect(decision.desktopOverride).toBe(agentDesktopIndex)
    }
    if (request.action === 'screenshot') {
      expect(decision.desktopOverride).toBe(agentDesktopIndex)
    }
  } else {
    // Rejection/hold facet: outcome + reason are recorded verbatim from the decision.
    expect(step.outcome).toBe(decision.outcome)
    expect(step.reason).toBe(decision.reason)

    if (decision.outcome === 'held') {
      expect(step.kind).toBe('action-held')
      expect(step.status).toBe('held')
      // Only valid input actions can be held.
      expect(validAction).toBe(true)
      expect(INPUT_ACTIONS.has(request.action)).toBe(true)
    } else if (decision.outcome === 'aborted') {
      expect(step.kind).toBe('action-rejected')
      expect(step.status).toBe('aborted')
    } else {
      // 'rejected' | 'limit-reached'
      expect(step.kind).toBe('action-rejected')
      expect(step.status).toBe('rejected')
    }

    // Request action recording: a valid action name is recorded; an
    // out-of-surface name is recorded as undefined (it is not an AgentActionType).
    if (validAction) {
      expect(step.action).toBe(request.action)
    } else {
      expect(step.action).toBeUndefined()
    }
  }
}

// ---------------------------------------------------------------------------
// Property 16 — Task 13.2
// ---------------------------------------------------------------------------

describe('AgentDesktopService gate — Property 16: every gated action produces a complete timeline record', () => {
  // Feature: agent-desktop, Property 16: Every gated action produces a complete timeline record
  // Validates: Requirements 4.5
  it('emits exactly one complete, decision-consistent timeline step per gateComputerAction call across arbitrary action sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        fc.constantFrom<'background' | 'take-over'>('background', 'take-over'),
        policyArb,
        fc.uniqueArray(registeredHwndArb, { maxLength: 5 }),
        fc.uniqueArray(zuraHwndArb, { maxLength: 3 }),
        fc.array(requestArb, { minLength: 1, maxLength: 20 }),
        async (userIndex, presence, policy, registered, zura, requests) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          const service = await makeReadyService(binding, policy, zura)

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)
          const session = readSession(service)
          expect(session).not.toBeNull()
          if (!session) return
          const agentDesktopIndex = session.agentDesktopIndex

          // Register a set of Agent_Windows BEFORE subscribing so their staging
          // steps are not counted among the gate steps under test.
          for (const hwnd of registered) {
            await service.notifyWindowOpened(hwnd)
          }

          // Optionally enter take-over (the mock switch always succeeds) so input
          // actions can pass the presence gate; otherwise input is held.
          if (presence === 'take-over') {
            const takeOver = await service.activateTakeOver()
            expect(takeOver.ok).toBe(true)
            expect(service.getState().agentDesktopDisplayed).toBe(true)
          }

          // Now collect ONLY the gate steps.
          const steps: AgentDesktopTimelineStep[] = []
          const unsubscribe = service.onTimelineStep((step) => steps.push(step))

          for (const req of requests) {
            const targetHwnd = resolveTargetHwnd(req, registered, zura)

            const before = steps.length
            const t0 = Date.now()
            const decision = await service.gateComputerAction({
              action: req.action,
              args: {},
              targetHwnd,
              onAgentDesktop: req.onAgentDesktop,
            })
            const t1 = Date.now()

            // Exactly one timeline step is emitted for this gated action.
            expect(steps.length).toBe(before + 1)
            const step = steps[steps.length - 1]

            assertCompleteAndConsistent(
              step,
              decision,
              { action: req.action, targetHwnd },
              'run-1',
              agentDesktopIndex,
              t0,
              t1
            )
          }

          unsubscribe()

          // The total number of emitted gate steps equals the number of gated
          // actions: one complete record per action, no more, no fewer.
          expect(steps).toHaveLength(requests.length)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 16: Every gated action produces a complete timeline record
  // Validates: Requirements 4.5
  it('records the approval-outcome facet of an allowed action exactly per the configured approval policy', async () => {
    // Restrict to non-input, non-window-targeted actions (screenshot,
    // list_windows, find_app) so each is ALWAYS allowed regardless of presence
    // or targeting — isolating the approval-outcome recording for the allowed
    // branch. The recorded reason and the decision's autoApprove flag must both
    // mirror the configured classification.
    const safeActionArb = fc.constantFrom<AgentActionType>('screenshot', 'list_windows', 'find_app')

    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        policyArb,
        fc.array(safeActionArb, { minLength: 1, maxLength: 12 }),
        async (userIndex, policy, actions) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          const service = await makeReadyService(binding, policy, [])

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)
          const session = readSession(service)
          if (!session) return
          const agentDesktopIndex = session.agentDesktopIndex

          const steps: AgentDesktopTimelineStep[] = []
          const unsubscribe = service.onTimelineStep((step) => steps.push(step))

          for (const action of actions) {
            const before = steps.length
            const decision = await service.gateComputerAction({ action, args: {} })

            // Exactly one step, and the action is allowed (read-only / capture).
            expect(steps.length).toBe(before + 1)
            expect(decision.allow).toBe(true)
            if (!decision.allow) continue

            const step = steps[steps.length - 1]
            const expectedAuto = policy[action] === 'auto-approve'

            // Approval outcome recorded exactly per the configured policy.
            expect(decision.autoApprove).toBe(expectedAuto)
            expect(step.kind).toBe('action-allowed')
            expect(step.status).toBe('completed')
            expect(step.outcome).toBe('allowed')
            expect(step.action).toBe(action)
            expect(step.reason).toBe(expectedAuto ? 'auto-approved' : 'approval-required')

            // The capture action records the Agent_Desktop redirect target.
            if (action === 'screenshot') {
              expect(decision.desktopOverride).toBe(agentDesktopIndex)
            }
          }

          unsubscribe()
          expect(steps).toHaveLength(actions.length)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
