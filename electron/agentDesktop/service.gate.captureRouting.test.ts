// @vitest-environment node

/**
 * Integration test for off-screen capture routing (Task 16.2).
 *
 * _Requirements: 4.2_
 *
 * ## What this validates
 * Requirement 4.2: *When the agent requests a screen capture during an agent
 * task, the Agent_Desktop_Service returns a capture of the Agent_Desktop rather
 * than the User_Desktop, including while the Agent_Desktop is not the currently
 * displayed Virtual_Desktop.*
 *
 * This is an **integration** test (example-based, not property-based) that wires
 * the two halves of the capture-routing path together with the native capturer
 * mocked:
 *
 * 1. The Computer Use **gate** — `AgentDesktopService.gateComputerAction` — which
 *    decides a `screenshot` action is allowed and attaches
 *    `desktopOverride = session.agentDesktopIndex` (the capture-redirect target,
 *    Req 4.2). This decision is made in `background` presence, i.e. while the
 *    Agent_Desktop is provisioned but is NOT the displayed Virtual_Desktop.
 * 2. The **capturer** — `executeScreenshot` → `captureScreenshot` — which accepts
 *    that override and surfaces `agentDesktopIndex` on the capture result, proving
 *    the capture was routed to the Agent_Desktop rather than the displayed
 *    User_Desktop.
 *
 * ## Mocking
 * Native side-effects are mocked, never executed:
 * - `electron.desktopCapturer` / `electron.screen` back the capturer so no real
 *   screen is read.
 * - `electron.globalShortcut` / `electron.BrowserWindow` back the kill-switch
 *   registration that `executeScreenshot` performs on each new task.
 * - The VDA native layer is injected via a fully in-memory {@link MockVdaBinding}
 *   (no `koffi`, no `VirtualDesktopAccessor.dll`).
 *
 * The mock provisions the Agent_Desktop at a high index (100) that can never
 * collide with the displayed User_Desktop index (0), so "the Agent_Desktop is not
 * the displayed Virtual_Desktop" is unambiguous.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- electron mock (hoisted) -------------------------------------------------
// Backs the mocked capturer (`desktopCapturer` + `screen`) and the kill-switch
// registration (`globalShortcut` + `BrowserWindow`) that `executeScreenshot`
// pulls in transitively. No real screen is ever captured.
vi.mock('electron', () => {
  // A minimal nativeImage stand-in. The native size (1024x768) is <= the
  // SCREENSHOT_MAX_WIDTH (1280), so the capturer's resize branch is skipped and
  // the final size equals the native size.
  const makeImage = () => ({
    getSize: () => ({ width: 1024, height: 768 }),
    resize: vi.fn(() => makeImage()),
    toPNG: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  })

  const display = {
    id: 1,
    label: 'Primary Display',
    bounds: { x: 0, y: 0, width: 1024, height: 768 },
    scaleFactor: 1,
  }

  return {
    desktopCapturer: {
      getSources: vi.fn(async () => [
        { id: 'screen:0:0', display_id: '1', name: 'Entire Screen', thumbnail: makeImage() },
      ]),
    },
    screen: {
      getAllDisplays: vi.fn(() => [display]),
      getPrimaryDisplay: vi.fn(() => display),
      getDisplayNearestPoint: vi.fn(() => display),
      getDisplayMatching: vi.fn(() => display),
    },
    globalShortcut: { register: vi.fn(), unregister: vi.fn() },
    BrowserWindow: Object.assign(vi.fn(), { getAllWindows: vi.fn(() => []) }),
    shell: { openPath: vi.fn(), openExternal: vi.fn() },
  }
})

import { desktopCapturer } from 'electron'

import {
  createAgentDesktopService,
  type AgentDesktopService,
} from './service'
import { executeScreenshot } from '../tools/computerUse'
import type { VdaBinding, VdaWindowInfo } from './vdaBinding'
import type { VdaLoadOutcome, AgentDesktopSession } from './types'
import { defaultAgentDesktopSettings, type AgentDesktopSettings } from './settings'

/**
 * Index the mock hands out for the first {@link MockVdaBinding.createDesktop}
 * call. Kept far above the User_Desktop index (0) so the provisioned
 * Agent_Desktop index can never collide with the displayed desktop.
 */
const FIRST_CREATED_INDEX = 100

/** The User_Desktop index the displayed Virtual_Desktop sits on at session start. */
const USER_DESKTOP_INDEX = 0

/**
 * A fully in-memory {@link VdaBinding}. `load()` reports `available`,
 * `getCurrentDesktopIndex()` reports the displayed (User_Desktop) index, and
 * `createDesktop()` provisions a fresh Agent_Desktop at {@link FIRST_CREATED_INDEX}.
 * No real DLL / `koffi` is touched.
 */
class MockVdaBinding implements VdaBinding {
  private available = false
  private existing: Set<number>
  /** The currently displayed Virtual_Desktop index. */
  current: number
  private nextIndex = FIRST_CREATED_INDEX

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
    /* placement always confirmed via isWindowOnDesktop */
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

/** Enabled Agent Desktop settings with the not-a-sandbox disclosure acknowledged. */
function enabledSettings(): AgentDesktopSettings {
  return {
    ...defaultAgentDesktopSettings,
    approvalPolicy: { ...defaultAgentDesktopSettings.approvalPolicy },
    enabled: true,
    disclosureAcknowledged: true,
  }
}

/** Read the service's internal session (the resolved index is not on public state). */
function readSession(service: AgentDesktopService): AgentDesktopSession | null {
  return (service as unknown as { session: AgentDesktopSession | null }).session
}

/**
 * Provision an active Agent Desktop session over a mock binding. Returns the
 * service, the binding, and the resolved Agent_Desktop index. The session is
 * left in `background` presence, so the Agent_Desktop is NOT the displayed
 * Virtual_Desktop.
 */
async function provisionedService(): Promise<{
  service: AgentDesktopService
  binding: MockVdaBinding
  agentDesktopIndex: number
}> {
  const binding = new MockVdaBinding({ existing: [USER_DESKTOP_INDEX], current: USER_DESKTOP_INDEX })
  const service = createAgentDesktopService({
    binding,
    settings: enabledSettings(),
    platformSupported: true,
  })
  await service.initialize()

  const start = await service.startSession('run-1')
  expect(start.provisioned).toBe(true)

  const session = readSession(service)
  expect(session).not.toBeNull()
  if (!session) throw new Error('expected a provisioned session')

  return { service, binding, agentDesktopIndex: session.agentDesktopIndex }
}

describe('Agent Desktop capture routing — off-screen capture targets the Agent_Desktop (Req 4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes a gated screenshot to the Agent_Desktop while it is NOT the displayed Virtual_Desktop', async () => {
    const { service, binding, agentDesktopIndex } = await provisionedService()

    // Precondition: the Agent_Desktop is provisioned but staged off-screen — the
    // displayed desktop is still the User_Desktop, and presence is background.
    const state = service.getState()
    expect(state.presence).toBe('background')
    expect(state.agentDesktopDisplayed).toBe(false)
    expect(binding.getCurrentDesktopIndex()).toBe(USER_DESKTOP_INDEX)
    expect(agentDesktopIndex).not.toBe(USER_DESKTOP_INDEX)

    // 1. The gate allows the capture and attaches the Agent_Desktop redirect
    //    target, even though the Agent_Desktop is not displayed (Req 4.2).
    const decision = await service.gateComputerAction({ action: 'screenshot', args: {} })
    expect(decision.allow).toBe(true)
    if (!decision.allow) throw new Error('expected the screenshot to be allowed')
    expect(decision.desktopOverride).toBe(agentDesktopIndex)

    // 2. The mocked capturer, handed the gate's override, returns a capture
    //    tagged with the Agent_Desktop index — proving the capture targeted the
    //    Agent_Desktop, not the displayed User_Desktop.
    const result = await executeScreenshot({}, decision.desktopOverride)
    expect(result.success).toBe(true)
    const data = result.data as { image: string; agentDesktopIndex?: number }
    expect(data.agentDesktopIndex).toBe(agentDesktopIndex)
    expect(data.agentDesktopIndex).not.toBe(USER_DESKTOP_INDEX)
    // A capture image was actually produced through the (mocked) capturer.
    expect(typeof data.image).toBe('string')
    expect(data.image.length).toBeGreaterThan(0)
    expect(desktopCapturer.getSources).toHaveBeenCalledTimes(1)
  })

  it('keeps redirecting every staged capture to the Agent_Desktop while displayed elsewhere', async () => {
    const { service, binding, agentDesktopIndex } = await provisionedService()

    // Simulate the displayed Virtual_Desktop being some other desktop entirely
    // (neither the User_Desktop nor the Agent_Desktop). The capture redirect must
    // be independent of whatever is currently displayed (Req 4.2).
    binding.goToDesktop(7)
    expect(service.getState().agentDesktopDisplayed).toBe(false)

    for (let i = 0; i < 3; i++) {
      const decision = await service.gateComputerAction({ action: 'screenshot', args: {} })
      expect(decision.allow).toBe(true)
      if (!decision.allow) throw new Error('expected the screenshot to be allowed')
      expect(decision.desktopOverride).toBe(agentDesktopIndex)

      const result = await executeScreenshot({}, decision.desktopOverride)
      expect(result.success).toBe(true)
      const data = result.data as { agentDesktopIndex?: number }
      // Every capture is tagged with the Agent_Desktop index, never the
      // displayed desktop (7) or the User_Desktop (0).
      expect(data.agentDesktopIndex).toBe(agentDesktopIndex)
      expect(data.agentDesktopIndex).not.toBe(7)
      expect(data.agentDesktopIndex).not.toBe(USER_DESKTOP_INDEX)
    }

    expect(desktopCapturer.getSources).toHaveBeenCalledTimes(3)
  })
})
