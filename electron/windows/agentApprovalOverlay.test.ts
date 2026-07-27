// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  windows: [] as any[],
  dialog: vi.fn(),
  isAutonomous: vi.fn(),
  setAutonomous: vi.fn(),
  issueAuthorization: vi.fn(() => 'one-use-token'),
  clearAuthorizations: vi.fn(),
  getSecureValue: vi.fn(async () => '[]'),
  setSecureValue: vi.fn(async () => true),
  nextLoadError: false,
  trustedActions: new Map<string, Record<string, unknown>>(),
  trustAction: vi.fn(),
  revokeAction: vi.fn(),
  revokeAllActions: vi.fn(),
}))

vi.mock('../ipc/trustedIpc', () => ({
  trustedIpcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) =>
      mocks.handlers.set(channel, handler),
    removeHandler: (channel: string) => mocks.handlers.delete(channel),
  },
}))

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindowMock {
    static fromWebContents = vi.fn(() => null)

    readonly events = new Map<string, (...args: any[]) => void>()
    readonly webContents = {
      openHandler: null as null | ((details: { url: string }) => { action: string }),
      navigationHandler: null as
        | null
        | ((event: { preventDefault: () => void }, url: string) => void),
      setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => { action: string }) => {
        this.webContents.openHandler = handler
      }),
      on: vi.fn(
        (event: string, handler: (event: { preventDefault: () => void }, url: string) => void) => {
          if (event === 'will-navigate') this.webContents.navigationHandler = handler
        }
      ),
    }
    readonly setBounds = vi.fn()
    readonly setAlwaysOnTop = vi.fn()
    readonly removeMenu = vi.fn()
    readonly show = vi.fn(() => {
      this.visible = true
    })
    readonly focus = vi.fn()
    readonly hide = vi.fn(() => {
      this.visible = false
    })
    readonly isVisible = vi.fn(() => this.visible)
    readonly isDestroyed = vi.fn(() => this.destroyed)
    readonly loadURL = vi.fn((url: string) => {
      this.loadedUrls.push(url)
      if (mocks.nextLoadError) {
        mocks.nextLoadError = false
        return Promise.reject(new Error('load failed'))
      }
      return Promise.resolve()
    })
    readonly destroy = vi.fn(() => {
      if (this.destroyed) return
      this.destroyed = true
      this.visible = false
      this.events.get('closed')?.()
    })
    readonly loadedUrls: string[] = []
    visible = false
    destroyed = false

    constructor(_options: unknown) {
      mocks.windows.push(this)
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.events.set(event, handler)
    }
  },
  dialog: { showMessageBox: mocks.dialog },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } }),
  },
}))

vi.mock('../tools/agentAutonomousMode', () => ({
  isAgentAutonomousModeEnabled: mocks.isAutonomous,
  setAgentAutonomousModeEnabled: mocks.setAutonomous,
}))

vi.mock('../tools/agentTrustedActions', () => ({
  listAgentTrustedActions: vi.fn(async () =>
    [...mocks.trustedActions.values()].map(({ signature: _signature, ...action }) => action)
  ),
  useAgentTrustedAction: vi.fn(async (signature: string) => mocks.trustedActions.has(signature)),
  trustAgentExactRepeat: mocks.trustAction.mockImplementation(
    async (signature: string, toolName: string, riskClass: string) => {
      const action = {
        id: `00000000-0000-4000-8000-${String(mocks.trustedActions.size + 1).padStart(12, '0')}`,
        signature,
        toolName,
        riskClass,
        createdAt: 100,
        lastUsedAt: 100,
      }
      mocks.trustedActions.set(signature, action)
      return action
    }
  ),
  revokeAgentTrustedAction: mocks.revokeAction.mockImplementation(async (id: string) => {
    const entry = [...mocks.trustedActions.entries()].find(([, action]) => action.id === id)
    if (!entry) return false
    mocks.trustedActions.delete(entry[0])
    return true
  }),
  revokeAllAgentTrustedActions: mocks.revokeAllActions.mockImplementation(async () => {
    const count = mocks.trustedActions.size
    mocks.trustedActions.clear()
    return count
  }),
}))

vi.mock('../tools/toolApprovalAuthorizations', () => ({
  buildToolApprovalSignature: vi.fn(
    (toolName: string, args: Record<string, unknown>) => `${toolName}:${JSON.stringify(args)}`
  ),
  clearToolApprovalAuthorizations: mocks.clearAuthorizations,
  issueToolApprovalAuthorization: mocks.issueAuthorization,
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: mocks.getSecureValue,
  setSecureValueAsync: mocks.setSecureValue,
}))

import {
  cancelQueuedAgentApprovalsForRun,
  destroyAgentApprovalOverlay,
  registerAgentApprovalOverlayHandlers,
  unregisterAgentApprovalOverlayHandlers,
} from './agentApprovalOverlay'

function handler(channel: string) {
  const registered = mocks.handlers.get(channel)
  if (!registered) throw new Error(`Missing handler: ${channel}`)
  return registered
}

function createSender(id: number) {
  const listeners = new Map<string, () => void>()
  return {
    id,
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    removeListener: vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event)
    }),
    destroy: () => listeners.get('destroyed')?.(),
  }
}

function request(id: string, runId = 'run-1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    runId,
    taskTitle: `Task ${runId}`,
    title: `Approve ${id}`,
    summary: 'Run a bounded command',
    toolName: 'system_shell',
    kind: 'terminal',
    arguments: [{ label: 'Command', value: id }],
    toolArguments: { command: id },
    ...overrides,
  }
}

async function flushAsync(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function latestWindow() {
  const win = mocks.windows.at(-1)
  if (!win) throw new Error('Expected an approval window.')
  return win
}

function loadedHtml(win = latestWindow()): string {
  const url = win.loadedUrls.at(-1)
  if (!url) throw new Error('Expected approval HTML to load.')
  return decodeURIComponent(url.slice(url.indexOf(',') + 1))
}

function choose(action: 'approve' | 'trust' | 'reject', requestId: string): void {
  const openHandler = latestWindow().webContents.openHandler
  if (!openHandler) throw new Error('Expected the approval navigation handler.')
  openHandler({
    url: `zura-agent-approval://${action}?requestId=${encodeURIComponent(requestId)}`,
  })
}

describe('Agent approval overlay runtime', () => {
  beforeEach(() => {
    vi.useRealTimers()
    unregisterAgentApprovalOverlayHandlers()
    destroyAgentApprovalOverlay()
    mocks.handlers.clear()
    mocks.windows.length = 0
    mocks.nextLoadError = false
    mocks.trustedActions.clear()
    vi.clearAllMocks()
    mocks.isAutonomous.mockResolvedValue(false)
    mocks.setAutonomous.mockImplementation(async (enabled: boolean) => enabled)
    mocks.dialog.mockResolvedValue({ response: 1 })
    mocks.getSecureValue.mockResolvedValue('[]')
    mocks.setSecureValue.mockResolvedValue(true)
    registerAgentApprovalOverlayHandlers()
  })

  it('requires main-owned confirmation before enabling autonomous mode', async () => {
    await expect(
      handler('agent-approval:set-autonomous-mode')({ sender: createSender(7) }, true)
    ).resolves.toEqual({ enabled: true })
    expect(mocks.dialog).toHaveBeenCalledOnce()
    expect(mocks.setAutonomous).toHaveBeenCalledWith(true)
  })

  it('issues a policy outcome and exact one-use token without showing the overlay in autonomous mode', async () => {
    mocks.isAutonomous.mockResolvedValue(true)
    const toolArguments = { command: 'Get-Date' }

    await expect(
      handler('agent-approval:request')(
        { sender: createSender(7) },
        request('autonomous-request', 'run-auto', { toolArguments })
      )
    ).resolves.toEqual({
      approved: true,
      outcome: 'approved_policy',
      autonomous: true,
      approvalToken: 'one-use-token',
    })
    expect(mocks.issueAuthorization).toHaveBeenCalledWith(7, 'system_shell', toolArguments)
    expect(mocks.windows).toHaveLength(0)
  })

  it('disables autonomous mode immediately without confirmation', async () => {
    await expect(
      handler('agent-approval:set-autonomous-mode')({ sender: createSender(7) }, false)
    ).resolves.toEqual({ enabled: false })
    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(mocks.setAutonomous).toHaveBeenCalledWith(false)
    expect(mocks.clearAuthorizations).toHaveBeenCalledOnce()
  })

  it('serializes concurrent requests in FIFO order and resolves them independently', async () => {
    const sender = createSender(7)
    const first = handler('agent-approval:request')({ sender }, request('request-1', 'run-a'))
    const second = handler('agent-approval:request')({ sender }, request('request-2', 'run-b'))
    let secondSettled = false
    void second.then(() => {
      secondSettled = true
    })
    await flushAsync()

    expect(loadedHtml()).toContain('Approve request-1')
    expect(loadedHtml()).toContain('Task run-a')
    expect(loadedHtml()).toContain('1 queued')
    expect(secondSettled).toBe(false)

    choose('approve', 'request-1')
    await expect(first).resolves.toMatchObject({
      approved: true,
      outcome: 'approved_once',
      approvalToken: 'one-use-token',
    })
    await flushAsync()
    expect(loadedHtml()).toContain('Approve request-2')

    choose('reject', 'request-2')
    await expect(second).resolves.toEqual({ approved: false, outcome: 'rejected' })
  })

  it('cancels only the exact sender/run queue and leaves other scopes in FIFO order', async () => {
    const sender7 = createSender(7)
    const sender8 = createSender(8)
    const active = handler('agent-approval:request')(
      { sender: sender7 },
      request('active-a', 'run-a')
    )
    const queuedSameScope = handler('agent-approval:request')(
      { sender: sender7 },
      request('queued-a', 'run-a')
    )
    const queuedOtherRun = handler('agent-approval:request')(
      { sender: sender7 },
      request('queued-b', 'run-b')
    )
    const queuedOtherSender = handler('agent-approval:request')(
      { sender: sender8 },
      request('queued-other-sender', 'run-a')
    )
    await flushAsync()

    expect(cancelQueuedAgentApprovalsForRun(7, 'run-a')).toBe(2)
    await expect(active).resolves.toEqual({ approved: false, outcome: 'cancelled' })
    await expect(queuedSameScope).resolves.toEqual({ approved: false, outcome: 'cancelled' })
    await flushAsync()
    expect(loadedHtml()).toContain('Approve queued-b')

    choose('reject', 'queued-b')
    await expect(queuedOtherRun).resolves.toEqual({ approved: false, outcome: 'rejected' })
    await flushAsync()
    expect(loadedHtml()).toContain('Approve queued-other-sender')
    choose('reject', 'queued-other-sender')
    await expect(queuedOtherSender).resolves.toEqual({ approved: false, outcome: 'rejected' })
  })

  it('cancels only a destroyed sender and continues with the next sender', async () => {
    const sender7 = createSender(7)
    const sender8 = createSender(8)
    const first = handler('agent-approval:request')({ sender: sender7 }, request('sender-7'))
    const second = handler('agent-approval:request')({ sender: sender8 }, request('sender-8'))
    await flushAsync()

    sender7.destroy()
    await expect(first).resolves.toEqual({ approved: false, outcome: 'cancelled' })
    await flushAsync()
    expect(loadedHtml()).toContain('Approve sender-8')

    choose('reject', 'sender-8')
    await expect(second).resolves.toEqual({ approved: false, outcome: 'rejected' })
  })

  it('bounds pending requests per sender/run scope', async () => {
    const sender = createSender(7)
    const pending = Array.from({ length: 16 }, (_, index) =>
      handler('agent-approval:request')({ sender }, request(`bounded-${index}`, 'bounded-run'))
    )
    const overflow = handler('agent-approval:request')(
      { sender },
      request('overflow', 'bounded-run')
    )
    await flushAsync()

    await expect(overflow).resolves.toEqual({ approved: false, outcome: 'unavailable' })
    expect(cancelQueuedAgentApprovalsForRun(7, 'bounded-run')).toBe(16)
    await expect(Promise.all(pending)).resolves.toEqual(
      Array.from({ length: 16 }, () => ({ approved: false, outcome: 'cancelled' }))
    )
  })

  it('resolves a closed window as cancellation without dropping queued requests', async () => {
    const sender = createSender(7)
    const first = handler('agent-approval:request')({ sender }, request('closed'))
    const second = handler('agent-approval:request')({ sender }, request('after-close'))
    await flushAsync()

    latestWindow().destroy()
    await expect(first).resolves.toEqual({ approved: false, outcome: 'cancelled' })
    await flushAsync()
    expect(mocks.windows).toHaveLength(2)
    expect(loadedHtml()).toContain('Approve after-close')
    choose('reject', 'after-close')
    await expect(second).resolves.toEqual({ approved: false, outcome: 'rejected' })
  })

  it('distinguishes timeout and overlay infrastructure failure from rejection', async () => {
    vi.useFakeTimers()
    const sender = createSender(7)
    const timedOut = handler('agent-approval:request')({ sender }, request('timeout'))
    await flushAsync()
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    await expect(timedOut).resolves.toEqual({ approved: false, outcome: 'timed_out' })

    mocks.nextLoadError = true
    const unavailable = handler('agent-approval:request')({ sender }, request('unavailable'))
    await flushAsync()
    await expect(unavailable).resolves.toEqual({ approved: false, outcome: 'unavailable' })
  })

  it('persists exact-repeat trust before advancing and reports persistence errors fail-closed', async () => {
    const sender = createSender(7)
    let finishPersistence: (() => void) | null = null
    mocks.trustAction.mockImplementationOnce(
      (signature: string, toolName: string, riskClass: string) =>
        new Promise((resolve) => {
          finishPersistence = () => {
            const action = {
              id: '00000000-0000-4000-8000-000000000001',
              signature,
              toolName,
              riskClass,
              createdAt: 100,
              lastUsedAt: 100,
            }
            mocks.trustedActions.set(signature, action)
            resolve(action)
          }
        })
    )
    const trusted = handler('agent-approval:request')(
      { sender },
      request('trust-me', 'run-trust', { toolArguments: { command: 'unique-trusted' } })
    )
    const queued = handler('agent-approval:request')(
      { sender },
      request('after-trust', 'run-after-trust')
    )
    await flushAsync()
    choose('trust', 'trust-me')
    await flushAsync()
    expect(loadedHtml()).toContain('Approve trust-me')
    finishPersistence?.()
    await expect(trusted).resolves.toMatchObject({
      approved: true,
      outcome: 'approved_policy',
      trusted: true,
    })
    expect(mocks.trustAction).toHaveBeenCalledOnce()
    await flushAsync()
    expect(loadedHtml()).toContain('Approve after-trust')
    choose('reject', 'after-trust')
    await expect(queued).resolves.toEqual({ approved: false, outcome: 'rejected' })

    const loadedCountBeforeRepeat = latestWindow().loadedUrls.length
    await expect(
      handler('agent-approval:request')(
        { sender },
        request('trusted-repeat', 'run-trust', {
          toolArguments: { command: 'unique-trusted' },
        })
      )
    ).resolves.toMatchObject({
      approved: true,
      outcome: 'approved_policy',
      trusted: true,
    })
    expect(latestWindow().loadedUrls).toHaveLength(loadedCountBeforeRepeat)

    mocks.trustAction.mockRejectedValueOnce(new Error('secure storage unavailable'))
    const failed = handler('agent-approval:request')(
      { sender },
      request('trust-fails', 'run-trust', { toolArguments: { command: 'unique-failure' } })
    )
    await flushAsync()
    choose('trust', 'trust-fails')
    await expect(failed).resolves.toEqual({ approved: false, outcome: 'error' })
  })

  it('rejects malformed scope as a structured error and escapes task context', async () => {
    const sender = createSender(7)
    await expect(
      handler('agent-approval:request')({ sender }, request('invalid', '../run'))
    ).resolves.toEqual({ approved: false, outcome: 'error' })

    const escaped = handler('agent-approval:request')(
      { sender },
      request('escaped', 'run-safe', { taskTitle: '<script>alert(1)</script>' })
    )
    await flushAsync()
    expect(loadedHtml()).not.toContain('<script>alert(1)</script>')
    expect(loadedHtml()).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    choose('reject', 'escaped')
    await expect(escaped).resolves.toEqual({ approved: false, outcome: 'rejected' })
  })

  it('lists only sanitized trust metadata and revokes one or all grants', async () => {
    mocks.trustedActions.set('secret-signature', {
      id: '00000000-0000-4000-8000-000000000001',
      signature: 'secret-signature',
      toolName: 'system_shell',
      riskClass: 'high',
      createdAt: 100,
      lastUsedAt: 200,
    })

    await expect(handler('agent-approval:list-trusted-actions')({})).resolves.toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        toolName: 'system_shell',
        riskClass: 'high',
        createdAt: 100,
        lastUsedAt: 200,
      },
    ])
    await expect(
      handler('agent-approval:revoke-trusted-action')({}, '00000000-0000-4000-8000-000000000001')
    ).resolves.toBe(true)
    expect(mocks.trustedActions.size).toBe(0)

    mocks.trustedActions.set('another-signature', {
      id: '00000000-0000-4000-8000-000000000002',
    })
    await expect(handler('agent-approval:revoke-all-trusted-actions')({})).resolves.toBe(1)
    expect(mocks.trustedActions.size).toBe(0)
  })
})
