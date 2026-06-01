// @vitest-environment node

/**
 * Property-based tests for the Agent Desktop window-placement + presence
 * transition surface (`AgentDesktopService.notifyWindowOpened`,
 * `activateTakeOver`, `endTakeOver`), covering Tasks 12.2–12.4. All three
 * properties live in this single file so there is no concurrent-write conflict
 * between the parallel test-authoring tasks.
 *
 * Covered correctness properties (from the design):
 * - Property 7:  Agent windows always target the Agent_Desktop (Req 2.1, 2.2,
 *                2.4, 2.6, 4.3)                                          — Task 12.2
 * - Property 11: Take_Over transition is gated on a successful display switch
 *                (Req 3.3, 3.4)                                         — Task 12.3
 * - Property 37: Window staging and relocation emit identifying timeline steps
 *                (Req 11.2, 11.3)                                       — Task 12.4
 *
 * ## Test strategy
 * A fully-controllable in-memory {@link VdaBinding} models the only native
 * surface these paths touch: the current displayed desktop index, the set of
 * existing desktops, a flat window list (for `enumerateWindows`), per-window
 * placement confirmation (for `isWindowOnDesktop`), and a configurable
 * display-switch behaviour (for `goToDesktop` / `getCurrentDesktopIndex`). It
 * records every `moveWindowToDesktop` / `goToDesktop` call so the placement
 * target and the switch gate are directly observable across 100+ inputs.
 *
 * The service is index-based: a freshly created Agent_Desktop is handed
 * {@link FIRST_CREATED_INDEX} (>= 100), well above the user-desktop index range
 * the generators use (0–20), so an Agent_Desktop index can never collide with a
 * User_Desktop index. That lets every property assert "targets the
 * Agent_Desktop, never the User_Desktop" purely from the recorded calls.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome, AgentDesktopSession } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x12c4 }

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the user-desktop range the generators use (0–20) so a
 * created Agent_Desktop index never collides with a generated User_Desktop index.
 */
const FIRST_CREATED_INDEX = 100

/** How the mock binding behaves when a Take_Over display switch is attempted. */
type SwitchMode = 'success' | 'fail-stuck' | 'fail-wrong' | 'throw'

/**
 * A fully-controllable in-memory {@link VdaBinding} for the placement /
 * presence properties.
 *
 * Records `moveWindowToDesktop` / `goToDesktop` calls so the placement target
 * and the display-switch gate are directly observable. Placement confirmation
 * (`isWindowOnDesktop`) and the display-switch outcome (`goToDesktop` +
 * `getCurrentDesktopIndex`) are independently configurable so each test can
 * choose confirm-success vs confirm-failure and switch-success vs switch-failure.
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

  // --- Placement confirmation control --------------------------------------
  /** When true, every {@link isWindowOnDesktop} confirms placement. */
  confirmAll = true
  /** HWNDs that confirm placement when {@link confirmAll} is false. */
  confirmHwnds = new Set<number>()

  // --- Display-switch control ----------------------------------------------
  /** How {@link goToDesktop} / {@link getCurrentDesktopIndex} behave. */
  switchMode: SwitchMode = 'success'

  // --- Observable call records ---------------------------------------------
  moveCalls: Array<{ hwnd: number; index: number }> = []
  goToDesktopCalls: number[] = []
  createDesktopCalls = 0
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
    this.createDesktopCalls++
    this.lastCreatedIndex = index
    return index
  }

  removeDesktop(index: number): void {
    this.existing.delete(index)
  }

  goToDesktop(index: number): void {
    this.goToDesktopCalls.push(index)
    switch (this.switchMode) {
      case 'success':
        // Switch succeeds: the displayed index becomes the requested index.
        this.current = index
        break
      case 'fail-stuck':
        // goToDesktop does NOT change the displayed index (switch silently fails).
        break
      case 'fail-wrong':
        // The OS reports a different displayed index than requested.
        this.current = index + 1
        break
      case 'throw':
        throw new Error('simulated goToDesktop failure')
    }
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(hwnd: number, index: number): void {
    this.moveCalls.push({ hwnd, index })
  }

  isWindowOnDesktop(hwnd: number): boolean {
    return this.confirmAll || this.confirmHwnds.has(hwnd)
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
 * mock `load()` so `vdaOutcome` is `available` and `startSession` is not gated.
 */
async function makeReadyService(
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

/**
 * Read the service's internal session. The recorded `agentDesktopIndex` and the
 * `windows` registry are not exposed on the public `AgentDesktopState`, so the
 * placement property reads them from the session directly.
 */
function readSession(service: AgentDesktopService): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

/** A VDA window on a specific desktop index. */
function makeWindow(hwnd: number, desktopIndex: number, title = 'win'): VdaWindowInfo {
  return { hwnd, title, pid: 1000, desktopIndex }
}

// Shared generators.
const hwndArb = fc.integer({ min: 1, max: 1_000_000 })
// User-desktop indices stay in 0–20, never colliding with created indices (>=100).
const userDesktopIndexArb = fc.integer({ min: 0, max: 20 })

// ---------------------------------------------------------------------------
// Property 7 — Task 12.2
// ---------------------------------------------------------------------------

describe('AgentDesktopService placement — Property 7: agent windows always target the Agent_Desktop', () => {
  // Feature: agent-desktop, Property 7: Agent windows always target the Agent_Desktop
  // Validates: Requirements 2.1, 2.2, 2.4, 2.6, 4.3
  it('issues every move toward the recorded Agent_Desktop index (never the User_Desktop) and never relocates ZuraAI-owned windows', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        // Arbitrary opened windows: a unique HWND, whether ZuraAI owns it, and
        // whether it becomes visible on the User_Desktop (relocation) vs is
        // staged (Req 2.1 staging / Req 2.2 relocation — both target the Agent_Desktop).
        fc.uniqueArray(
          fc.record({ hwnd: hwndArb, zuraOwned: fc.boolean(), onUser: fc.boolean() }),
          { selector: (w) => w.hwnd, minLength: 1, maxLength: 12 }
        ),
        async (userIndex, openedWindows) => {
          const zuraOwned = openedWindows.filter((w) => w.zuraOwned).map((w) => w.hwnd)
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          // Every placement confirms on the first attempt → exactly one move per
          // relocated window, so the move target is unambiguous.
          binding.confirmAll = true
          const service = await makeReadyService(binding, { zuraOwnedHandles: zuraOwned })

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)

          const session = readSession(service)
          expect(session).not.toBeNull()
          if (!session) return
          const agentIndex = session.agentDesktopIndex
          // The created Agent_Desktop index is distinct from the User_Desktop.
          expect(agentIndex).not.toBe(userIndex)

          // Windows enumerated on the User_Desktop drive the relocation path
          // (Req 2.2). ZuraAI-owned windows return early and never read enumeration.
          binding.windows = openedWindows
            .filter((w) => !w.zuraOwned && w.onUser)
            .map((w) => makeWindow(w.hwnd, userIndex))

          for (const w of openedWindows) {
            await service.notifyWindowOpened(w.hwnd)
          }

          // Every issued move targets the recorded Agent_Desktop, never the User_Desktop.
          for (const call of binding.moveCalls) {
            expect(call.index).toBe(agentIndex)
            expect(call.index).not.toBe(userIndex)
          }

          for (const w of openedWindows) {
            const movesForWindow = binding.moveCalls.filter((c) => c.hwnd === w.hwnd)
            if (w.zuraOwned) {
              // ZuraAI-owned windows are NEVER relocated and NEVER registered (Req 2.6).
              expect(movesForWindow).toHaveLength(0)
              expect(session.windows.has(w.hwnd)).toBe(false)
            } else {
              // Non-owned windows are always moved toward the Agent_Desktop and registered.
              expect(movesForWindow.length).toBeGreaterThanOrEqual(1)
              for (const c of movesForWindow) {
                expect(c.index).toBe(agentIndex)
              }
              expect(session.windows.has(w.hwnd)).toBe(true)
            }
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

// ---------------------------------------------------------------------------
// Property 11 — Task 12.3
// ---------------------------------------------------------------------------

describe('AgentDesktopService presence — Property 11: Take_Over is gated on a successful display switch', () => {
  // Feature: agent-desktop, Property 11: Take_Over transition is gated on a successful display switch
  // Validates: Requirements 3.3, 3.4
  it('enters take-over iff the display switch succeeds; otherwise stays background, displays nothing, and surfaces an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        fc.constantFrom<SwitchMode>('success', 'fail-stuck', 'fail-wrong', 'throw'),
        async (userIndex, switchMode) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          binding.switchMode = switchMode
          const service = await makeReadyService(binding)

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)
          // A fresh session starts background, with the Agent_Desktop not displayed.
          expect(service.getState().presence).toBe('background')
          expect(service.getState().agentDesktopDisplayed).toBe(false)

          const result = await service.activateTakeOver()
          const state = service.getState()
          // The service always attempts the switch toward the Agent_Desktop.
          const session = readSession(service)
          expect(binding.goToDesktopCalls).toContain(session?.agentDesktopIndex)

          if (switchMode === 'success') {
            // Switch confirmed → enter take-over and display the Agent_Desktop (Req 3.3).
            expect(result.ok).toBe(true)
            expect(state.presence).toBe('take-over')
            expect(state.agentDesktopDisplayed).toBe(true)
          } else {
            // Switch failed/timed out/threw → stay background, deliver/display
            // nothing, and surface an error (Req 3.4).
            expect(result.ok).toBe(false)
            expect(state.presence).toBe('background')
            expect(state.agentDesktopDisplayed).toBe(false)
            expect(state.lastError).not.toBeNull()
            if (!result.ok) {
              expect(typeof result.error).toBe('string')
              expect(result.error.length).toBeGreaterThan(0)
            }
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 11: Take_Over transition is gated on a successful display switch
  // Validates: Requirements 3.3, 3.4
  it('without an active session, Take_Over never switches the display and never enters take-over', async () => {
    await fc.assert(
      fc.asyncProperty(userDesktopIndexArb, async (userIndex) => {
        const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
        binding.switchMode = 'success'
        const service = await makeReadyService(binding)

        // No startSession: there is nothing to take over.
        const result = await service.activateTakeOver()
        expect(result.ok).toBe(false)
        expect(binding.goToDesktopCalls).toHaveLength(0)
        expect(service.getState().presence).toBeNull()
        expect(service.getState().agentDesktopDisplayed).toBe(false)
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})

// ---------------------------------------------------------------------------
// Property 37 — Task 12.4
// ---------------------------------------------------------------------------

describe('AgentDesktopService placement — Property 37: staging/relocation emit identifying timeline steps', () => {
  // Feature: agent-desktop, Property 37: Window staging and relocation emit identifying timeline steps
  // Validates: Requirements 11.2, 11.3
  it('emits a staging/relocation/placement-failure step per opened window, each identifying the affected window and the time it occurred', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        // Arbitrary opened windows: a unique HWND, whether it is observed on the
        // User_Desktop (relocation) vs staged, and whether placement succeeds.
        fc.uniqueArray(
          fc.record({ hwnd: hwndArb, relocate: fc.boolean(), succeed: fc.boolean() }),
          { selector: (w) => w.hwnd, minLength: 1, maxLength: 12 }
        ),
        async (userIndex, openedWindows) => {
          const binding = new MockVdaBinding({ existing: [userIndex], current: userIndex })
          // Per-window placement control: only "succeed" windows confirm residence.
          binding.confirmAll = false
          binding.confirmHwnds = new Set(openedWindows.filter((w) => w.succeed).map((w) => w.hwnd))
          const service = await makeReadyService(binding)

          const start = await service.startSession('run-1')
          expect(start.provisioned).toBe(true)
          const session = readSession(service)
          expect(session).not.toBeNull()
          if (!session) return
          const agentIndex = session.agentDesktopIndex

          // "relocate" windows are observed on the User_Desktop so the service
          // takes the relocation path (Req 11.3); "stage" windows are not
          // enumerated so the service takes the staging path (Req 11.2).
          binding.windows = openedWindows
            .filter((w) => w.relocate)
            .map((w) => makeWindow(w.hwnd, userIndex, `title-${w.hwnd}`))

          // Subscribe and collect every emitted timeline step.
          const steps: AgentDesktopTimelineStep[] = []
          const unsubscribe = service.onTimelineStep((step) => steps.push(step))

          const t0 = Date.now()
          for (const w of openedWindows) {
            await service.notifyWindowOpened(w.hwnd)
          }
          const t1 = Date.now()
          unsubscribe()

          // Exactly one step per opened window (none are skipped here).
          expect(steps).toHaveLength(openedWindows.length)

          // Every emitted staging/relocation/placement-failure step identifies
          // the affected Agent_Window (hwnd) and carries an occurredAt time.
          for (const step of steps) {
            expect(typeof step.hwnd).toBe('number')
            expect(typeof step.occurredAt).toBe('number')
            expect(step.occurredAt).toBeGreaterThanOrEqual(t0)
            expect(step.occurredAt).toBeLessThanOrEqual(t1)
            expect(['stage-window', 'relocate-window', 'placement-failure']).toContain(step.kind)
            expect(typeof step.title).toBe('string')
            expect(step.title.length).toBeGreaterThan(0)
            expect(step.agentRunId).toBe('run-1')
          }

          // The step for each window matches its expected kind/status.
          for (const w of openedWindows) {
            const step = steps.find((s) => s.hwnd === w.hwnd)
            expect(step).toBeDefined()
            if (!step) continue
            if (!w.succeed) {
              expect(step.kind).toBe('placement-failure')
              expect(step.status).toBe('failed')
              expect(step.title).toBe('Place window')
            } else if (w.relocate) {
              expect(step.kind).toBe('relocate-window')
              expect(step.status).toBe('completed')
              expect(step.title).toBe('Relocate window')
              // A relocated window was observed with a title → it is carried through.
              expect(step.windowTitle).toBe(`title-${w.hwnd}`)
            } else {
              expect(step.kind).toBe('stage-window')
              expect(step.status).toBe('completed')
              expect(step.title).toBe('Stage window')
            }
          }

          // Sanity: successful placements never targeted the User_Desktop.
          for (const call of binding.moveCalls) {
            expect(call.index).toBe(agentIndex)
            expect(call.index).not.toBe(userIndex)
          }
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})
