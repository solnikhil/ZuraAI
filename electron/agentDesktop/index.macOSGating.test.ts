// @vitest-environment node

// Task 17.5 — Unit tests for Agent Desktop macOS gating.
//
// These lock in the two-layer Windows-only gating that mirrors the existing
// Computer Use precedent (see AGENTS.md "Windows-only gating — three gates"):
//
//   1. Registration-skip (Req 9.1): the production wiring in `electron/main.ts`
//      only calls `registerAgentDesktopHandlers()` when `!IS_MACOS`, so on
//      macOS NO Agent_Desktop IPC handlers are registered in the main process.
//      Booting all of `electron/main.ts` is impractical (it pulls in the full
//      app lifecycle, windows, tray, updater, MCP, etc.), so the registration
//      skip is covered *structurally* by asserting the wiring keeps the
//      registration inside the `if (!IS_MACOS)` guard. The behavioral gate
//      itself is exercised in full below.
//
//   2. Defense-in-depth per-handler rejection (Req 9.4): even though handlers
//      are never registered on macOS, EVERY handler in `electron/agentDesktop/
//      index.ts` calls `assertNotMacOS()` and rejects with
//      "Agent Desktop is unavailable on macOS." when `process.platform ===
//      'darwin'`, WITHOUT performing any desktop operation. `IS_MACOS` is
//      computed from `process.platform` at module load, so each test sets the
//      platform BEFORE `vi.resetModules()` + a dynamic `import('./index')` so
//      the module picks up the platform (the same pattern used by
//      `electron/ipc/systemHandlers.test.ts`).
//
// The service (and therefore the VDA binding it owns) is fully mocked via
// `vi.mock('./service', ...)`, so no native code runs and we can assert that no
// desktop-operation method on the service was ever reached on macOS.
//
// Requirements: 9.1 (no handlers registered on darwin), 9.4 (an invoked
// Agent_Desktop handler rejects in main without performing any desktop
// operation and returns an "unavailable on macOS" error).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks: electron `ipcMain` / `BrowserWindow`, plus a fake
// AgentDesktopService whose every *desktop-operation* method records that it
// ran. On macOS none of these must be reached.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  /** Channel → handler captured from `ipcMain.handle`. */
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  /**
   * Names of every *desktop-operation* (or service-reaching) method that the
   * handlers invoked. On macOS this MUST stay empty because `assertNotMacOS()`
   * throws before any handler touches the service. Subscription wiring done at
   * registration time (`onStateChange` / `onTimelineStep` / `getApprovalManager`
   * / `onPendingChange`) is intentionally NOT recorded here — it is not a
   * desktop operation and runs regardless of platform.
   */
  const desktopOps: string[] = []

  const approvalManager = {
    resolveApproval: vi.fn((requestId: string, approved: boolean) => {
      desktopOps.push(`resolveApproval:${requestId}:${approved}`)
      return { requestId, approved, outcome: approved ? 'approved' : 'rejected' }
    }),
    onPendingChange: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  }

  const state = { enabled: false, platformSupported: false, vdaOutcome: 'unavailable' }

  const service = {
    initialize: vi.fn(async () => {
      desktopOps.push('initialize')
      return state
    }),
    getState: vi.fn(() => {
      desktopOps.push('getState')
      return state
    }),
    applySettings: vi.fn((_settings: unknown) => {
      desktopOps.push('applySettings')
      return state
    }),
    activateTakeOver: vi.fn(async () => {
      desktopOps.push('activateTakeOver')
      return { ok: true, state }
    }),
    endTakeOver: vi.fn(async () => {
      desktopOps.push('endTakeOver')
      return { ok: true, state }
    }),
    acknowledgeDisclosure: vi.fn(() => {
      desktopOps.push('acknowledgeDisclosure')
    }),
    getApprovalManager: vi.fn(() => approvalManager),
    onStateChange: vi.fn(() => () => undefined),
    onTimelineStep: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  }

  return {
    handlers,
    desktopOps,
    approvalManager,
    service,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    getAllWindows: vi.fn(() => [] as unknown[]),
    getAgentDesktopService: vi.fn(() => service),
    resetAgentDesktopService: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
    removeHandler: mocks.removeHandler,
  },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
}))

vi.mock('./service', () => ({
  getAgentDesktopService: mocks.getAgentDesktopService,
  resetAgentDesktopService: mocks.resetAgentDesktopService,
}))

// Every allowlisted invoke channel the IPC module registers (the design's
// "IPC Surface" table). Used to drive the per-handler macOS-rejection assertion.
const INVOKE_CHANNELS = [
  'agent-desktop:get-state',
  'agent-desktop:apply-settings',
  'agent-desktop:take-over',
  'agent-desktop:end-take-over',
  'agent-desktop:resolve-approval',
  'agent-desktop:acknowledge-disclosure',
] as const

/** Extra positional args (beyond the IPC event) each channel's handler expects. */
const HANDLER_ARGS: Record<string, unknown[]> = {
  'agent-desktop:apply-settings': [{ enabled: true }],
  'agent-desktop:resolve-approval': ['approval-1', true],
}

const MACOS_ERROR = 'Agent Desktop is unavailable on macOS.'

async function importIndex() {
  return import('./index')
}

/**
 * Invoke a captured handler and assert it rejects with the macOS error.
 * Wrapping in an async IIFE normalizes both the synchronous-throw handlers
 * (`resolve-approval`, `acknowledge-disclosure`) and the async handlers
 * (`get-state`, `apply-settings`, `take-over`, `end-take-over`) into a rejected
 * promise so a single assertion shape covers all six.
 */
async function invokeAndExpectMacOSRejection(channel: string): Promise<void> {
  const handler = mocks.handlers.get(channel)
  expect(handler, `handler for ${channel} should be registered`).toBeTypeOf('function')
  const args = HANDLER_ARGS[channel] ?? []
  await expect(
    (async () => handler!({} as never, ...args))()
  ).rejects.toThrow(MACOS_ERROR)
}

describe('Agent Desktop macOS gating', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    mocks.handlers.clear()
    mocks.handle.mockClear()
    mocks.removeHandler.mockClear()
    mocks.getAllWindows.mockClear()
    mocks.getAgentDesktopService.mockClear()
    mocks.resetAgentDesktopService.mockClear()
    mocks.service.initialize.mockClear()
    mocks.service.getState.mockClear()
    mocks.service.applySettings.mockClear()
    mocks.service.activateTakeOver.mockClear()
    mocks.service.endTakeOver.mockClear()
    mocks.service.acknowledgeDisclosure.mockClear()
    mocks.service.onStateChange.mockClear()
    mocks.service.onTimelineStep.mockClear()
    mocks.service.getApprovalManager.mockClear()
    mocks.approvalManager.resolveApproval.mockClear()
    mocks.approvalManager.onPendingChange.mockClear()
    mocks.desktopOps.length = 0
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('rejects every invoked Agent Desktop handler on macOS without performing any desktop operation (Req 9.4)', async () => {
    // IS_MACOS is captured at module load — set the platform BEFORE importing.
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const mod = await importIndex()

    // Registration in THIS module is not itself platform-gated (that is done by
    // `electron/main.ts`); it is the defense-in-depth per-handler check we are
    // exercising. Registering on darwin lets us prove every handler fails closed.
    mod.registerAgentDesktopHandlers()

    // Registration wired up subscriptions but performed no desktop operation.
    expect(mocks.desktopOps).toEqual([])

    // Every allowlisted handler rejects with the macOS error.
    for (const channel of INVOKE_CHANNELS) {
      await invokeAndExpectMacOSRejection(channel)
    }

    // The critical assertion (Req 9.4): no handler reached the service, so no
    // desktop operation (provision, switch, placement, approval resolution,
    // settings mutation, disclosure ack, or even a state read) was performed.
    expect(mocks.desktopOps).toEqual([])
    expect(mocks.service.initialize).not.toHaveBeenCalled()
    expect(mocks.service.getState).not.toHaveBeenCalled()
    expect(mocks.service.applySettings).not.toHaveBeenCalled()
    expect(mocks.service.activateTakeOver).not.toHaveBeenCalled()
    expect(mocks.service.endTakeOver).not.toHaveBeenCalled()
    expect(mocks.service.acknowledgeDisclosure).not.toHaveBeenCalled()
    expect(mocks.approvalManager.resolveApproval).not.toHaveBeenCalled()
  })

  it('rejects with the macOS error even when the renderer sends a valid approval payload (Req 9.4)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    const mod = await importIndex()
    mod.registerAgentDesktopHandlers()

    const handler = mocks.handlers.get('agent-desktop:resolve-approval')
    expect(handler).toBeTypeOf('function')

    // A well-formed approval request that WOULD resolve on Windows must still be
    // rejected on macOS before the approval manager is ever consulted.
    expect(() => handler!({} as never, 'approval-1', true)).toThrow(MACOS_ERROR)
    expect(mocks.approvalManager.resolveApproval).not.toHaveBeenCalled()
    expect(mocks.desktopOps).toEqual([])
  })

  it('reaches the service on Windows, proving the rejection is platform-specific (Req 9.4 control)', async () => {
    // Positive control: on a supported (non-macOS) platform the same handler
    // passes the gate and reaches the service. This guarantees the macOS test
    // above is asserting a real, platform-specific gate rather than a handler
    // that always throws.
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const mod = await importIndex()
    mod.registerAgentDesktopHandlers()

    const handler = mocks.handlers.get('agent-desktop:get-state')
    expect(handler).toBeTypeOf('function')

    await expect(handler!({} as never)).resolves.toBeDefined()

    // The gate passed: the handler initialized and read service state.
    expect(mocks.service.initialize).toHaveBeenCalledTimes(1)
    expect(mocks.service.getState).toHaveBeenCalled()
  })

  it('registers no handlers in the main wiring on macOS — registration is gated behind `if (!IS_MACOS)` (Req 9.1)', () => {
    // Booting `electron/main.ts` is impractical, so cover the registration skip
    // structurally: the wiring derives IS_MACOS from the platform and keeps the
    // `registerAgentDesktopHandlers()` call inside the `if (!IS_MACOS)` guard,
    // so on macOS the call is never reached and no handlers are registered.
    const mainSource = readFileSync(join(process.cwd(), 'electron', 'main.ts'), 'utf8')

    // IS_MACOS is derived from the platform flag.
    expect(mainSource).toMatch(/IS_MACOS\s*=\s*process\.platform\s*===\s*'darwin'/)

    // The registration call lives inside an `if (!IS_MACOS) { ... }` block.
    // `[^{}]*` keeps the match within a single brace scope so the call is proven
    // to be the gated one (not merely co-present somewhere in the file).
    expect(mainSource).toMatch(
      /if \(!IS_MACOS\) \{[^{}]*registerAgentDesktopHandlers\(\)[^{}]*\}/
    )

    // And there is exactly one registration call site, so it cannot also be
    // wired up on an ungated path.
    const registrationCallSites = mainSource.match(/registerAgentDesktopHandlers\(\)/g) ?? []
    expect(registrationCallSites).toHaveLength(1)
  })
})
