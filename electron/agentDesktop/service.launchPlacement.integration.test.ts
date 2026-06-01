// @vitest-environment node

/**
 * Integration test for the Agent Desktop **launch + placement end-to-end** flow
 * (Task 16.3), with the native `VirtualDesktopAccessor` surface fully mocked
 * through an injected {@link VdaBinding}.
 *
 * This is an example-based integration test (not a property test). It exercises
 * the full path a launched application takes — provisioning, the `launch_app`
 * gate decision, and the subsequent window placement — to assert the single
 * end-to-end invariant of Requirement 4.3:
 *
 *   > WHEN the agent launches an application, THE Agent_Desktop_Service SHALL
 *   > launch it such that its windows are placed on the Agent_Desktop per
 *   > Requirement 2.
 *
 * Concretely it ties together three real service surfaces over one mock binding:
 * 1. {@link AgentDesktopService.startSession} provisions a dedicated
 *    Agent_Desktop (created at a high index, distinct from the User_Desktop).
 * 2. {@link AgentDesktopService.gateComputerAction} admits the agent's
 *    `launch_app` action (it is allowed, and — per the default policy — is
 *    `approval-required`, never silently auto-approved).
 * 3. {@link AgentDesktopService.notifyWindowOpened} places the launched window
 *    onto the recorded Agent_Desktop, never the User_Desktop, and records an
 *    identifying timeline step.
 *
 * No real `koffi` / DLL is involved: the {@link MockVdaBinding} models the
 * displayed desktop, the existing-desktop set, a flat window enumeration, and
 * per-window placement confirmation, and records every `moveWindowToDesktop`
 * call so placement targets are directly observable.
 *
 * _Requirements: 4.3_
 */

import { describe, it, expect } from 'vitest'

import {
  createAgentDesktopService,
  type AgentDesktopService,
  type AgentDesktopTimelineStep,
} from './service'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { AgentDesktopSession, VdaLoadOutcome } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the user-desktop index used below (0) so a created
 * Agent_Desktop index can never collide with the User_Desktop index — every
 * placement assertion can then distinguish the two purely from the move target.
 */
const FIRST_CREATED_INDEX = 100

/** The User_Desktop index active when the session is provisioned. */
const USER_DESKTOP_INDEX = 0

/**
 * A controllable in-memory {@link VdaBinding} for the launch + placement flow.
 *
 * Records `moveWindowToDesktop` / `goToDesktop` / `createDesktop` so placement
 * targets and provisioning are directly observable. `enumerateWindows` returns a
 * configurable flat window list (used to model where a launched window first
 * becomes visible), and `isWindowOnDesktop` confirms placement per HWND.
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

  // --- Observable call records ---------------------------------------------
  moveCalls: Array<{ hwnd: number; index: number }> = []
  goToDesktopCalls: number[] = []
  createDesktopCalls = 0
  lastCreatedIndex: number | null = null

  constructor(opts: { existing?: number[]; current?: number } = {}) {
    this.existing = new Set(opts.existing ?? [USER_DESKTOP_INDEX])
    this.current = opts.current ?? USER_DESKTOP_INDEX
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
    this.current = index
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
 * Create an initialized, ready service over a mock binding. `initialize()`
 * drives the mock `load()` so `vdaOutcome` is `available` and `startSession`
 * provisions rather than being gated.
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
 * Read the service's internal session. `agentDesktopIndex` and the per-window
 * registry are not surfaced on the public `AgentDesktopState`, so the placement
 * assertions read them from the session directly.
 */
function readSession(service: AgentDesktopService): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

/** A VDA window on a specific desktop index. */
function makeWindow(hwnd: number, desktopIndex: number, title = 'win'): VdaWindowInfo {
  return { hwnd, title, pid: 4242, desktopIndex }
}

describe('Agent Desktop launch + placement end-to-end (mocked VDA) — Req 4.3', () => {
  it('places a launched app window on the Agent_Desktop after the launch_app action is gated', async () => {
    // Arrange: an enabled service over a single User_Desktop (index 0).
    const binding = new MockVdaBinding()
    const service = await makeReadyService(binding)

    // Provision the Agent_Desktop for this run (created at index >= 100).
    const start = await service.startSession('run-launch')
    expect(start.provisioned).toBe(true)
    const session = readSession(service)
    expect(session).not.toBeNull()
    if (!session) return
    const agentIndex = session.agentDesktopIndex
    expect(agentIndex).not.toBe(USER_DESKTOP_INDEX)
    expect(binding.createDesktopCalls).toBe(1)

    // Act 1: the agent requests `launch_app`. It is gated like every Computer
    // Use action; launching a new app is `approval-required` by default policy
    // (never silently auto-approved), but the gate still ALLOWS it to proceed.
    const launchDecision = await service.gateComputerAction({
      action: 'launch_app',
      args: { name: 'notepad' },
    })
    expect(launchDecision.allow).toBe(true)
    if (launchDecision.allow) {
      expect(launchDecision.autoApprove).toBe(false)
    }

    // Act 2: the launched app's window becomes visible — first observed on the
    // User_Desktop (the OS opens it on the displayed desktop). The service must
    // relocate it onto the Agent_Desktop (Req 2.2 / 2.1, satisfying Req 4.3).
    const LAUNCHED_HWND = 0xab12
    binding.windows = [makeWindow(LAUNCHED_HWND, USER_DESKTOP_INDEX, 'Untitled - Notepad')]

    const steps: AgentDesktopTimelineStep[] = []
    const unsubscribe = service.onTimelineStep((step) => steps.push(step))
    await service.notifyWindowOpened(LAUNCHED_HWND)
    unsubscribe()

    // Assert: the window was moved onto the recorded Agent_Desktop, and EVERY
    // issued move targeted the Agent_Desktop — never the User_Desktop.
    expect(binding.moveCalls.length).toBeGreaterThanOrEqual(1)
    for (const call of binding.moveCalls) {
      expect(call.index).toBe(agentIndex)
      expect(call.index).not.toBe(USER_DESKTOP_INDEX)
    }
    expect(binding.moveCalls.some((c) => c.hwnd === LAUNCHED_HWND)).toBe(true)

    // The window is registered to this run and confirmed resident on the
    // Agent_Desktop (so input is no longer withheld for it — Req 2.7).
    const record = session.windows.get(LAUNCHED_HWND)
    expect(record).toBeDefined()
    expect(record?.agentRunId).toBe('run-launch')
    expect(record?.residence).toBe('agent-desktop')

    // An identifying placement step was recorded for the launched window
    // (relocation here, since it was first observed on the User_Desktop).
    const placementStep = steps.find((s) => s.hwnd === LAUNCHED_HWND)
    expect(placementStep).toBeDefined()
    expect(placementStep?.kind).toBe('relocate-window')
    expect(placementStep?.status).toBe('completed')
    expect(placementStep?.windowTitle).toBe('Untitled - Notepad')

    // The launch + placement flow never switched the displayed desktop: the user
    // stays on the User_Desktop while the agent stages in the background (Req 2.4).
    expect(binding.goToDesktopCalls).toHaveLength(0)
    expect(service.getState().agentDesktopDisplayed).toBe(false)
  })

  it('stages a launched window that opens directly on the Agent_Desktop (no relocation observed)', async () => {
    const binding = new MockVdaBinding()
    const service = await makeReadyService(binding)

    const start = await service.startSession('run-stage')
    expect(start.provisioned).toBe(true)
    const session = readSession(service)
    if (!session) throw new Error('expected an active session')
    const agentIndex = session.agentDesktopIndex

    const launchDecision = await service.gateComputerAction({
      action: 'launch_app',
      args: { name: 'calc' },
    })
    expect(launchDecision.allow).toBe(true)

    // The launched window is observed already on the Agent_Desktop → the service
    // takes the staging path (Req 2.1) but still issues a move toward the
    // Agent_Desktop and confirms placement there.
    const LAUNCHED_HWND = 0xcd34
    binding.windows = [makeWindow(LAUNCHED_HWND, agentIndex, 'Calculator')]

    const steps: AgentDesktopTimelineStep[] = []
    const unsubscribe = service.onTimelineStep((step) => steps.push(step))
    await service.notifyWindowOpened(LAUNCHED_HWND)
    unsubscribe()

    for (const call of binding.moveCalls) {
      expect(call.index).toBe(agentIndex)
    }
    const record = session.windows.get(LAUNCHED_HWND)
    expect(record?.residence).toBe('agent-desktop')

    const placementStep = steps.find((s) => s.hwnd === LAUNCHED_HWND)
    expect(placementStep?.kind).toBe('stage-window')
    expect(placementStep?.status).toBe('completed')
  })

  it('never relocates a ZuraAI-owned window onto the Agent_Desktop', async () => {
    // A ZuraAI-owned window (e.g. the main window) must be excluded from
    // placement even if it becomes visible during the run (Req 2.6).
    const ZURA_HWND = 0x9999
    const binding = new MockVdaBinding()
    const service = await makeReadyService(binding, { zuraOwnedHandles: [ZURA_HWND] })

    const start = await service.startSession('run-owned')
    expect(start.provisioned).toBe(true)
    const session = readSession(service)
    if (!session) throw new Error('expected an active session')

    binding.windows = [makeWindow(ZURA_HWND, USER_DESKTOP_INDEX, 'ZuraAI')]
    await service.notifyWindowOpened(ZURA_HWND)

    // No move issued, and the window is never registered as an Agent_Window.
    expect(binding.moveCalls).toHaveLength(0)
    expect(session.windows.has(ZURA_HWND)).toBe(false)
  })

  it('records a placement-failure step and withholds residence when placement cannot be confirmed', async () => {
    // End-to-end guard for Req 2.5 / 2.7: when the launched window can never be
    // confirmed on the Agent_Desktop, the move is still ALWAYS targeted at the
    // Agent_Desktop (never the User_Desktop), a failure step is recorded, and the
    // window's residence stays user-desktop so input is withheld.
    const binding = new MockVdaBinding()
    binding.confirmAll = false // no HWND ever confirms placement
    const service = await makeReadyService(binding)

    const start = await service.startSession('run-fail')
    expect(start.provisioned).toBe(true)
    const session = readSession(service)
    if (!session) throw new Error('expected an active session')
    const agentIndex = session.agentDesktopIndex

    const LAUNCHED_HWND = 0x5555
    binding.windows = [makeWindow(LAUNCHED_HWND, USER_DESKTOP_INDEX, 'Stubborn App')]

    const steps: AgentDesktopTimelineStep[] = []
    const unsubscribe = service.onTimelineStep((step) => steps.push(step))
    await service.notifyWindowOpened(LAUNCHED_HWND)
    unsubscribe()

    // Even on failure, every attempted move targeted the Agent_Desktop — there
    // is never a User_Desktop fallback (Req 4.7 / 8.6).
    expect(binding.moveCalls.length).toBeGreaterThanOrEqual(1)
    for (const call of binding.moveCalls) {
      expect(call.index).toBe(agentIndex)
      expect(call.index).not.toBe(USER_DESKTOP_INDEX)
    }

    const record = session.windows.get(LAUNCHED_HWND)
    expect(record?.residence).toBe('user-desktop')

    const failureStep = steps.find((s) => s.hwnd === LAUNCHED_HWND)
    expect(failureStep?.kind).toBe('placement-failure')
    expect(failureStep?.status).toBe('failed')
  })
})
