// @vitest-environment node

/**
 * Property-based tests for the Agent Desktop provisioning + teardown lifecycle
 * (`AgentDesktopService.startSession` / `completeSession`), covering Tasks
 * 11.2–11.6. All five properties live in this single file so there is no
 * concurrent-write conflict between the parallel test-authoring tasks.
 *
 * Covered correctness properties (from the design):
 * - Property 1: Reuse-or-create provisioning decision (Req 1.1)            — Task 11.2
 * - Property 2: Provisioning records stable session identifiers (Req 1.2, 1.3) — Task 11.3
 * - Property 3: Return to the recorded User_Desktop (Req 1.10, 3.9, 6.5)   — Task 11.4
 * - Property 5: Completion stops new staging (Req 1.4)                     — Task 11.5
 * - Property 6: Ephemeral teardown removes only Zura-created empty desktops;
 *               retains desktops with non-agent windows (Req 1.5, 1.6)     — Task 11.6
 *
 * ## Test strategy
 * The service is index-based: it records `userDesktopId = String(currentIndex)`
 * (read BEFORE provisioning) and `agentDesktopId = String(agentDesktopIndex)`,
 * resolving the recorded index via {@link VdaBinding.desktopExists} on the next
 * provisioning call. A fully-controllable mock {@link VdaBinding} models a set of
 * existing desktop indices, the current index, and a window list so the pure
 * reuse/teardown decision logic is exercised in isolation across 100+ inputs.
 *
 * The public `SessionStartResult.state` does not surface the recorded session
 * identifiers, so the decision is observed primarily through the mock binding's
 * `createDesktop` / `removeDesktop` call counts (exactly what the tasks specify),
 * and the recorded identifiers are read from the service's internal session for
 * the identifier-stability properties.
 *
 * The return-to-User_Desktop side-effect (`goToDesktop`) is invoked by
 * `endTakeOver` / kill-switch / app-quit, which are deferred to later tasks
 * (Task 12/13) and are not implemented yet. Property 3 therefore asserts the
 * recorded-id invariant (and that no `goToDesktop` switch occurs during the
 * implemented start/complete paths); the goToDesktop(recordedUserDesktop)
 * assertion can be added once `endTakeOver` exists.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

import { createAgentDesktopService, type AgentDesktopService } from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome } from './types'
import type { AgentDesktopSession } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Shared property-test configuration. A stable seed keeps any failure
 * reproducible and `numRuns` comfortably satisfies the spec's minimum of 100.
 */
const PROPERTY_TEST_CONFIG = { numRuns: 200, seed: 0x11a2 }

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the user-desktop range the generators use (0–20) so a
 * created Agent_Desktop index never collides with a generated User_Desktop index.
 */
const FIRST_CREATED_INDEX = 100

/**
 * A fully-controllable in-memory {@link VdaBinding} for the lifecycle properties.
 *
 * Models the only native surface the lifecycle logic touches: a set of existing
 * desktop indices, the current desktop index, and a flat window list. Records
 * `createDesktop` / `removeDesktop` / `goToDesktop` calls so the reuse-or-create
 * and teardown decisions are directly observable. `desktopExists` is backed by
 * the existing-index set (not the real count-based heuristic) so tests can model
 * arbitrary desktop add/remove without index-shift bookkeeping — faithful to how
 * the service uses the recorded index as an opaque stable identifier.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  /** Set of currently-existing Virtual_Desktop indices. */
  existing: Set<number>
  /** The currently-displayed Virtual_Desktop index. */
  current: number
  /** Next index handed out by {@link createDesktop}. */
  private nextIndex: number
  /** Flat list returned by {@link enumerateWindows}. */
  windows: VdaWindowInfo[] = []

  // --- Observable call records ---------------------------------------------
  createDesktopCalls = 0
  lastCreatedIndex: number | null = null
  removeDesktopCalls: number[] = []
  goToDesktopCalls: number[] = []

  constructor(opts: { existing?: number[]; current?: number } = {}) {
    this.existing = new Set(opts.existing ?? [0])
    this.current = opts.current ?? 0
    this.nextIndex = FIRST_CREATED_INDEX
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
    this.removeDesktopCalls.push(index)
  }

  goToDesktop(index: number): void {
    this.current = index
    this.goToDesktopCalls.push(index)
  }

  desktopExists(index: number): boolean {
    return this.existing.has(index)
  }

  moveWindowToDesktop(): void {
    /* not exercised by the lifecycle paths */
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

/** Build enabled Agent Desktop settings with the requested persistence mode. */
function makeSettings(persistence: 'persist' | 'ephemeral'): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
    persistence,
  }
}

/**
 * Create an initialized service over a mock binding. `initialize()` drives the
 * mock `load()` so `vdaOutcome` is `available` and `startSession` is not gated.
 */
async function makeReadyService(
  binding: MockVdaBinding,
  persistence: 'persist' | 'ephemeral'
): Promise<AgentDesktopService> {
  const service = createAgentDesktopService({
    binding,
    settings: makeSettings(persistence),
    platformSupported: true,
  })
  await service.initialize()
  return service
}

/**
 * Read the service's internal session. The recorded identifiers
 * (`userDesktopId`, `agentDesktopId`, `agentDesktopIndex`, `createdByZura`) are
 * not exposed on the public `AgentDesktopState`, so the identifier-stability
 * properties read them from the session directly.
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
// Property 1 — Task 11.2
// ---------------------------------------------------------------------------

describe('AgentDesktopService lifecycle — Property 1: reuse-or-create provisioning decision', () => {
  // Feature: agent-desktop, Property 1: Reuse-or-create provisioning decision
  // Validates: Requirements 1.1
  it('reuses the recorded Agent_Desktop iff its index still resolves, otherwise creates a new one', async () => {
    // Drive arbitrary sequences of start / complete(persist, so the recorded
    // index is retained) / external desktop-removal, asserting the decision via
    // the mock binding's createDesktop call count (the task's observable).
    const commandArb = fc.array(fc.constantFrom('start', 'complete', 'remove'), {
      minLength: 1,
      maxLength: 30,
    })

    await fc.assert(
      fc.asyncProperty(commandArb, async (commands) => {
        // persistence 'persist' means completeSession never removes the desktop,
        // so a previously provisioned index stays resolvable and reusable.
        const binding = new MockVdaBinding({ existing: [0], current: 0 })
        const service = await makeReadyService(binding, 'persist')

        // Model mirror of the service's private `lastAgentDesktopIndex`.
        let modelLastIndex: number | null = null
        let sessionActive = false
        let runCounter = 0
        let activeRunId = ''

        for (const command of commands) {
          if (command === 'start') {
            if (sessionActive) continue // must complete before starting again

            const willReuse = modelLastIndex !== null && binding.existing.has(modelLastIndex)
            const createsBefore = binding.createDesktopCalls

            activeRunId = `run-${runCounter++}`
            const result = await service.startSession(activeRunId)

            expect(result.provisioned).toBe(true)
            const session = readSession(service)
            expect(session).not.toBeNull()

            if (willReuse) {
              // Reuse: no new desktop created, recorded index unchanged.
              expect(binding.createDesktopCalls).toBe(createsBefore)
              expect(session?.createdByZura).toBe(false)
              expect(session?.agentDesktopIndex).toBe(modelLastIndex)
            } else {
              // Create: exactly one new desktop created, session adopts it.
              expect(binding.createDesktopCalls).toBe(createsBefore + 1)
              expect(session?.createdByZura).toBe(true)
              expect(session?.agentDesktopIndex).toBe(binding.lastCreatedIndex)
              modelLastIndex = binding.lastCreatedIndex
            }

            sessionActive = true
          } else if (command === 'complete') {
            if (!sessionActive) continue
            await service.completeSession(activeRunId)
            sessionActive = false
            // persistence 'persist' retains the desktop and the recorded index.
          } else {
            // External removal of the recorded Agent_Desktop: the next start must
            // create because the recorded index no longer resolves.
            if (modelLastIndex !== null) {
              binding.existing.delete(modelLastIndex)
            }
          }
        }
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2 — Task 11.3
// ---------------------------------------------------------------------------

describe('AgentDesktopService lifecycle — Property 2: provisioning records stable session identifiers', () => {
  // Feature: agent-desktop, Property 2: Provisioning records stable session identifiers
  // Validates: Requirements 1.2, 1.3
  it('records the pre-provisioning User_Desktop and a stable, resolvable Agent_Desktop id across the session', async () => {
    // Arbitrary current-desktop value at provisioning + arbitrary later desktop
    // add/remove churn that must not disturb the recorded Agent_Desktop id.
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        fc.array(userDesktopIndexArb, { maxLength: 6 }),
        fc.array(userDesktopIndexArb, { maxLength: 6 }),
        async (currentIndex, desktopsToRemove, otherCurrents) => {
          const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
          const service = await makeReadyService(binding, 'persist')

          // Capture the User_Desktop displayed BEFORE provisioning (Req 1.3).
          const userBefore = binding.getCurrentDesktopIndex()

          const result = await service.startSession('run-1')
          expect(result.provisioned).toBe(true)

          const session = readSession(service)
          expect(session).not.toBeNull()
          if (!session) return

          // Recorded User_Desktop equals the desktop current before provisioning.
          expect(session.userDesktopId).toBe(String(userBefore))
          // A single Agent_Desktop id that resolves to an existing desktop and
          // mirrors the recorded index (Req 1.2).
          expect(session.agentDesktopId).toBe(String(session.agentDesktopIndex))
          expect(binding.desktopExists(session.agentDesktopIndex)).toBe(true)

          const recordedAgentId = session.agentDesktopId
          const recordedAgentIndex = session.agentDesktopIndex
          const recordedUserId = session.userDesktopId

          // Simulate subsequent actions: churn OTHER desktops (the created
          // Agent_Desktop index is >= 100, so user-range churn never touches it)
          // and move the displayed desktop around.
          for (const idx of desktopsToRemove) {
            if (idx !== recordedAgentIndex) binding.existing.delete(idx)
          }
          binding.existing.add(200)
          binding.existing.add(201)
          for (const c of otherCurrents) {
            binding.current = c
          }

          // The recorded identifiers stay stable for the whole session (Req 1.2).
          const after = readSession(service)
          expect(after?.agentDesktopId).toBe(recordedAgentId)
          expect(after?.agentDesktopIndex).toBe(recordedAgentIndex)
          expect(after?.userDesktopId).toBe(recordedUserId)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3 — Task 11.4
// ---------------------------------------------------------------------------

describe('AgentDesktopService lifecycle — Property 3: return to the recorded User_Desktop', () => {
  // Feature: agent-desktop, Property 3: Return to the recorded User_Desktop
  // Validates: Requirements 1.10, 3.9, 6.5
  it('preserves the recorded User_Desktop id across the session and performs no display switch on start/complete', async () => {
    // NOTE: the actual goToDesktop(recordedUserDesktop) return is invoked by
    // endTakeOver / kill-switch / app-quit (Task 12/13), which are not
    // implemented yet. Per Task 11.4 this asserts the recorded-id invariant and
    // that the implemented start/complete paths never switch the display away
    // from / toward any desktop (no goToDesktop call).
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        fc.array(userDesktopIndexArb, { maxLength: 6 }),
        fc.constantFrom<'persist' | 'ephemeral'>('persist', 'ephemeral'),
        async (currentIndex, displaySwitches, persistence) => {
          const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
          const service = await makeReadyService(binding, persistence)

          const userBefore = binding.getCurrentDesktopIndex()
          const result = await service.startSession('run-1')
          expect(result.provisioned).toBe(true)

          const session = readSession(service)
          // The recorded User_Desktop is exactly the desktop active at creation.
          expect(session?.userDesktopId).toBe(String(userBefore))
          const recordedUserId = session?.userDesktopId

          // The implemented provisioning path never switches the display.
          expect(binding.goToDesktopCalls).toHaveLength(0)

          // Simulate the user switching the displayed desktop around: the
          // recorded return target must not drift.
          for (const idx of displaySwitches) {
            binding.current = idx
          }
          expect(readSession(service)?.userDesktopId).toBe(recordedUserId)

          // Completion likewise performs no display switch (return paths are
          // owned by endTakeOver / kill-switch / quit).
          await service.completeSession('run-1')
          expect(binding.goToDesktopCalls).toHaveLength(0)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

// ---------------------------------------------------------------------------
// Property 5 — Task 11.5
// ---------------------------------------------------------------------------

describe('AgentDesktopService lifecycle — Property 5: completion stops new staging', () => {
  // Feature: agent-desktop, Property 5: Completion stops new staging
  // Validates: Requirements 1.4
  it('reports staging not stopped right after startSession and stopped after completeSession', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        fc.constantFrom<'persist' | 'ephemeral'>('persist', 'ephemeral'),
        fc.string({ minLength: 1, maxLength: 16 }),
        async (currentIndex, persistence, runId) => {
          const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
          const service = await makeReadyService(binding, persistence)

          // Before any session, staging is not stopped.
          expect(service.isStagingStopped()).toBe(false)

          const result = await service.startSession(runId)
          expect(result.provisioned).toBe(true)
          // Right after provisioning, staging is allowed.
          expect(service.isStagingStopped()).toBe(false)

          await service.completeSession(runId)
          // After completion, new staging is stopped (Req 1.4).
          expect(service.isStagingStopped()).toBe(true)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })
})

// ---------------------------------------------------------------------------
// Property 6 — Task 11.6
// ---------------------------------------------------------------------------

describe('AgentDesktopService lifecycle — Property 6: ephemeral teardown rules', () => {
  // Feature: agent-desktop, Property 6: Ephemeral teardown removes only Zura-created empty desktops; retains desktops with non-agent windows
  // Validates: Requirements 1.5, 1.6
  it('ephemeral + Zura-created + no windows on the Agent_Desktop → removes the desktop', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        // Windows that live only on OTHER desktops (never the Agent_Desktop).
        fc.array(fc.tuple(hwndArb, userDesktopIndexArb), { maxLength: 6 }),
        async (currentIndex, otherWindows) => {
          const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
          const service = await makeReadyService(binding, 'ephemeral')

          const result = await service.startSession('run-1')
          expect(result.provisioned).toBe(true)
          const agentIndex = binding.lastCreatedIndex
          expect(agentIndex).not.toBeNull()
          if (agentIndex === null) return

          // No window resides on the Agent_Desktop (created index >= 100, the
          // generated desktop indices are 0–20).
          binding.windows = otherWindows.map(([hwnd, idx]) => makeWindow(hwnd, idx))

          const removesBefore = binding.removeDesktopCalls.length
          await service.completeSession('run-1')

          // The empty Zura-created desktop is removed (Req 1.5).
          expect(binding.removeDesktopCalls.length).toBe(removesBefore + 1)
          expect(binding.removeDesktopCalls).toContain(agentIndex)
          // No "kept" notice is surfaced for a clean removal.
          expect(service.getState().lastError).toBeNull()
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 6: Ephemeral teardown removes only Zura-created empty desktops; retains desktops with non-agent windows
  // Validates: Requirements 1.5, 1.6
  it('ephemeral + Zura-created + >=1 non-agent window on the Agent_Desktop → retains it and surfaces a notice', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        // At least one window on the Agent_Desktop (a fresh session has an empty
        // windows map, so every such window is a non-agent window per Req 1.6).
        fc.array(hwndArb, { minLength: 1, maxLength: 5 }),
        fc.array(fc.tuple(hwndArb, userDesktopIndexArb), { maxLength: 4 }),
        async (currentIndex, agentDesktopHwnds, otherWindows) => {
          const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
          const service = await makeReadyService(binding, 'ephemeral')

          const result = await service.startSession('run-1')
          expect(result.provisioned).toBe(true)
          const agentIndex = binding.lastCreatedIndex
          expect(agentIndex).not.toBeNull()
          if (agentIndex === null) return

          binding.windows = [
            ...agentDesktopHwnds.map((hwnd) => makeWindow(hwnd, agentIndex, 'non-agent')),
            ...otherWindows.map(([hwnd, idx]) => makeWindow(hwnd, idx)),
          ]

          const removesBefore = binding.removeDesktopCalls.length
          await service.completeSession('run-1')

          // The desktop is retained because it holds windows ZuraAI did not place.
          expect(binding.removeDesktopCalls.length).toBe(removesBefore)
          const lastError = service.getState().lastError
          expect(lastError).not.toBeNull()
          expect(lastError).toContain('kept')
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 6: Ephemeral teardown removes only Zura-created empty desktops; retains desktops with non-agent windows
  // Validates: Requirements 1.5, 1.6
  it('persist persistence → never removes the Agent_Desktop regardless of windows', async () => {
    await fc.assert(
      fc.asyncProperty(
        userDesktopIndexArb,
        // Each window may or may not be on the Agent_Desktop.
        fc.array(fc.record({ hwnd: hwndArb, onAgent: fc.boolean() }), { maxLength: 6 }),
        async (currentIndex, windows) => {
          const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
          const service = await makeReadyService(binding, 'persist')

          const result = await service.startSession('run-1')
          expect(result.provisioned).toBe(true)
          const agentIndex = binding.lastCreatedIndex
          if (agentIndex === null) return

          binding.windows = windows.map(({ hwnd, onAgent }) =>
            makeWindow(hwnd, onAgent ? agentIndex : 0)
          )

          await service.completeSession('run-1')

          // Persisted desktops are never torn down (Req 1.5 only applies to ephemeral).
          expect(binding.removeDesktopCalls).toHaveLength(0)
        }
      ),
      PROPERTY_TEST_CONFIG
    )
  })

  // Feature: agent-desktop, Property 6: Ephemeral teardown removes only Zura-created empty desktops; retains desktops with non-agent windows
  // Validates: Requirements 1.5, 1.6
  it('ephemeral + reused (not Zura-created) → never removes the Agent_Desktop even when empty', async () => {
    await fc.assert(
      fc.asyncProperty(userDesktopIndexArb, async (currentIndex) => {
        const binding = new MockVdaBinding({ existing: [currentIndex], current: currentIndex })
        const service = await makeReadyService(binding, 'ephemeral')

        // 1) First run creates the Agent_Desktop (createdByZura = true).
        const first = await service.startSession('run-1')
        expect(first.provisioned).toBe(true)
        const agentIndex = binding.lastCreatedIndex
        expect(agentIndex).not.toBeNull()
        if (agentIndex === null) return

        // 2) A non-agent window forces retention on completion so the recorded
        //    index survives for reuse.
        binding.windows = [makeWindow(999_999, agentIndex, 'non-agent')]
        await service.completeSession('run-1')
        expect(binding.removeDesktopCalls).toHaveLength(0)
        expect(binding.desktopExists(agentIndex)).toBe(true)

        // 3) Second run reuses the still-resolvable recorded index (createdByZura = false).
        binding.windows = [] // the Agent_Desktop is now empty
        const createsBefore = binding.createDesktopCalls
        const second = await service.startSession('run-2')
        expect(second.provisioned).toBe(true)
        expect(binding.createDesktopCalls).toBe(createsBefore) // reused, not created
        expect(readSession(service)?.createdByZura).toBe(false)

        // 4) Completing the reused, empty session must NOT remove the desktop,
        //    even though persistence is ephemeral (Req 1.5: only Zura-created).
        const removesBefore = binding.removeDesktopCalls.length
        await service.completeSession('run-2')
        expect(binding.removeDesktopCalls.length).toBe(removesBefore)
      }),
      PROPERTY_TEST_CONFIG
    )
  })
})
