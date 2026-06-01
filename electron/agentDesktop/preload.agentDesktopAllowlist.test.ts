// @vitest-environment node

// Task 17.6 — Smoke tests for the Agent Desktop IPC allowlist boundary.
//
// These lock in the security-critical preload boundary for the dedicated
// `window.agentDesktop` bridge (electron/preload.ts):
//   1. `agent-desktop:resolve-approval` (and the other agent-desktop channels)
//      are allowlisted in AGENT_DESKTOP_INVOKE_CHANNELS / AGENT_DESKTOP_ON_CHANNELS
//      and routed through the bridge to ipcRenderer.invoke / ipcRenderer.on.
//   2. An off-allowlist channel (e.g. `agent-desktop:evil`) is blocked by
//      assertAllowed and never reaches ipcRenderer.invoke / a handler. The
//      agent-desktop surface is reachable ONLY through the hardcoded dedicated
//      bridge — arbitrary channel strings cannot be smuggled through the generic
//      `window.ipcRenderer` bridge either.
//
// Requirements: 5.8 (approvals resolve through a narrow allowlisted channel),
// 12.5 (messages on channels not in the preload allowlist are rejected and never
// routed to a handler).

import { beforeEach, describe, expect, it, vi } from 'vitest'

const preloadMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  exposeInMainWorld: vi.fn((key: string, value: unknown) => {
    preloadMocks.exposed.set(key, value)
  }),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: preloadMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: preloadMocks.invoke,
    on: preloadMocks.on,
    off: preloadMocks.off,
    removeListener: preloadMocks.removeListener,
    send: preloadMocks.send,
  },
}))

interface AgentDesktopBridge {
  getState: () => Promise<unknown>
  applySettings: (settings: Record<string, unknown>) => Promise<unknown>
  takeOver: () => Promise<unknown>
  endTakeOver: () => Promise<unknown>
  resolveApproval: (requestId: string, approved: boolean) => Promise<unknown>
  acknowledgeDisclosure: () => Promise<unknown>
  onStateChange: (callback: (state: unknown) => void) => () => void
  onPendingApproval: (callback: (pending: unknown) => void) => () => void
  onKilled: (callback: (payload: unknown) => void) => () => void
}

interface GenericIpcBridge {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, listener: (...args: unknown[]) => void) => void
  send: (channel: string, ...args: unknown[]) => void
}

describe('preload Agent Desktop allowlist boundary', () => {
  beforeEach(async () => {
    vi.resetModules()
    preloadMocks.exposed.clear()
    preloadMocks.exposeInMainWorld.mockClear()
    preloadMocks.invoke.mockReset()
    preloadMocks.on.mockReset()
    preloadMocks.off.mockReset()
    preloadMocks.removeListener.mockReset()
    preloadMocks.send.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await import('../preload')
  })

  it('routes agent-desktop:resolve-approval through the dedicated bridge (allowlisted + narrow)', async () => {
    const agentDesktop = getExposedBridge<AgentDesktopBridge>('agentDesktop')

    const decision = { requestId: 'approval-1', approved: true, outcome: 'approved' }
    preloadMocks.invoke.mockResolvedValueOnce(decision)

    await expect(agentDesktop.resolveApproval('approval-1', true)).resolves.toEqual(decision)

    // The approval resolves through exactly one narrow, allowlisted channel.
    expect(preloadMocks.invoke).toHaveBeenCalledTimes(1)
    expect(preloadMocks.invoke).toHaveBeenCalledWith(
      'agent-desktop:resolve-approval',
      'approval-1',
      true
    )
  })

  it('routes every allowlisted agent-desktop invoke channel through the bridge', async () => {
    const agentDesktop = getExposedBridge<AgentDesktopBridge>('agentDesktop')

    preloadMocks.invoke
      .mockResolvedValueOnce({ enabled: false }) // get-state
      .mockResolvedValueOnce({ enabled: true }) // apply-settings
      .mockResolvedValueOnce({ ok: true }) // take-over
      .mockResolvedValueOnce({ ok: true }) // end-take-over
      .mockResolvedValueOnce({ requestId: 'a-1', approved: false }) // resolve-approval
      .mockResolvedValueOnce({ disclosureAcknowledged: true }) // acknowledge-disclosure

    await agentDesktop.getState()
    await agentDesktop.applySettings({ enabled: true })
    await agentDesktop.takeOver()
    await agentDesktop.endTakeOver()
    await agentDesktop.resolveApproval('a-1', false)
    await agentDesktop.acknowledgeDisclosure()

    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(1, 'agent-desktop:get-state')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(2, 'agent-desktop:apply-settings', {
      enabled: true,
    })
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(3, 'agent-desktop:take-over')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(4, 'agent-desktop:end-take-over')
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(
      5,
      'agent-desktop:resolve-approval',
      'a-1',
      false
    )
    expect(preloadMocks.invoke).toHaveBeenNthCalledWith(6, 'agent-desktop:acknowledge-disclosure')
  })

  it('subscribes allowlisted agent-desktop broadcast channels and unregisters cleanly', () => {
    const agentDesktop = getExposedBridge<AgentDesktopBridge>('agentDesktop')

    const onState = vi.fn()
    const onPending = vi.fn()
    const onKilled = vi.fn()

    const unsubscribeState = agentDesktop.onStateChange(onState)
    const unsubscribePending = agentDesktop.onPendingApproval(onPending)
    const unsubscribeKilled = agentDesktop.onKilled(onKilled)

    expect(preloadMocks.on).toHaveBeenCalledWith('agent-desktop:state-changed', expect.any(Function))
    expect(preloadMocks.on).toHaveBeenCalledWith(
      'agent-desktop:pending-approval',
      expect.any(Function)
    )
    expect(preloadMocks.on).toHaveBeenCalledWith('agent-desktop:killed', expect.any(Function))

    const stateListener = findListener('agent-desktop:state-changed')
    const pendingListener = findListener('agent-desktop:pending-approval')
    const killedListener = findListener('agent-desktop:killed')

    const stateSnapshot = { enabled: true }
    const pendingSnapshot = [{ id: 'a-1', action: 'launch_app' }]
    const killedPayload = { agentRunId: 'run-1', reason: 'kill-switch', occurredAt: 1 }

    stateListener?.({}, stateSnapshot)
    pendingListener?.({}, pendingSnapshot)
    killedListener?.({}, killedPayload)

    expect(onState).toHaveBeenCalledWith(stateSnapshot)
    expect(onPending).toHaveBeenCalledWith(pendingSnapshot)
    expect(onKilled).toHaveBeenCalledWith(killedPayload)

    unsubscribeState()
    unsubscribePending()
    unsubscribeKilled()

    expect(preloadMocks.removeListener).toHaveBeenCalledWith(
      'agent-desktop:state-changed',
      stateListener
    )
    expect(preloadMocks.removeListener).toHaveBeenCalledWith(
      'agent-desktop:pending-approval',
      pendingListener
    )
    expect(preloadMocks.removeListener).toHaveBeenCalledWith('agent-desktop:killed', killedListener)
  })

  it('blocks an off-allowlist agent-desktop channel via the generic bridge before it reaches a handler', () => {
    const ipcRenderer = getExposedBridge<GenericIpcBridge>('ipcRenderer')

    // An attacker-style channel that is in no allowlist must be rejected by
    // assertAllowed and must never reach ipcRenderer.invoke (the handler).
    expect(() => ipcRenderer.invoke('agent-desktop:evil')).toThrow(
      'Blocked IPC invoke channel: agent-desktop:evil'
    )

    // Even a real agent-desktop channel cannot be smuggled through the generic
    // bridge with an arbitrary channel string — the agent-desktop surface is
    // reachable ONLY through the dedicated, fully-hardcoded window.agentDesktop
    // bridge. This proves the generic surface stays narrow.
    expect(() => ipcRenderer.invoke('agent-desktop:resolve-approval', 'a-1', true)).toThrow(
      /Blocked IPC invoke channel/
    )

    // No off-allowlist channel ever reached the underlying ipcRenderer.invoke.
    expect(preloadMocks.invoke).not.toHaveBeenCalled()
  })

  it('blocks off-allowlist agent-desktop subscriptions via the generic bridge', () => {
    const ipcRenderer = getExposedBridge<GenericIpcBridge>('ipcRenderer')

    expect(() => ipcRenderer.on('agent-desktop:state-changed', () => undefined)).toThrow(
      /Blocked IPC on channel/
    )
    expect(() => ipcRenderer.on('agent-desktop:evil', () => undefined)).toThrow(
      /Blocked IPC on channel/
    )

    // No off-allowlist subscription was ever registered on the real ipcRenderer.
    expect(preloadMocks.on).not.toHaveBeenCalled()
  })
})

function getExposedBridge<T>(name: string): T {
  const bridge = preloadMocks.exposed.get(name)
  if (!bridge) {
    throw new Error(`Expected preload bridge "${name}" to be exposed`)
  }

  return bridge as T
}

function findListener(channel: string): ((...args: unknown[]) => void) | undefined {
  return preloadMocks.on.mock.calls.find((call) => call[0] === channel)?.[1] as
    | ((...args: unknown[]) => void)
    | undefined
}
