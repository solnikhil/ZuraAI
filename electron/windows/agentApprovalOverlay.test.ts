// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  dialog: vi.fn(),
  isAutonomous: vi.fn(),
  setAutonomous: vi.fn(),
  issueAuthorization: vi.fn(() => 'one-use-token'),
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

vi.mock('../tools/toolApprovalAuthorizations', () => ({
  buildToolApprovalSignature: vi.fn(() => 'a'.repeat(64)),
  clearToolApprovalAuthorizations: vi.fn(),
  issueToolApprovalAuthorization: mocks.issueAuthorization,
}))

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => '[]'),
  setSecureValueAsync: vi.fn(async () => true),
}))

import {
  registerAgentApprovalOverlayHandlers,
  unregisterAgentApprovalOverlayHandlers,
} from './agentApprovalOverlay'

function handler(channel: string) {
  const registered = mocks.handlers.get(channel)
  if (!registered) throw new Error(`Missing handler: ${channel}`)
  return registered
}

describe('Agent Mode autonomous approval handlers', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    vi.clearAllMocks()
    mocks.isAutonomous.mockResolvedValue(false)
    mocks.setAutonomous.mockImplementation(async (enabled: boolean) => enabled)
    mocks.dialog.mockResolvedValue({ response: 1 })
    registerAgentApprovalOverlayHandlers()
  })

  it('requires main-owned confirmation before enabling', async () => {
    await expect(
      handler('agent-approval:set-autonomous-mode')({ sender: { id: 7 } }, true)
    ).resolves.toEqual({ enabled: true })
    expect(mocks.dialog).toHaveBeenCalledOnce()
    expect(mocks.setAutonomous).toHaveBeenCalledWith(true)
  })

  it('issues an exact one-use token without showing the approval overlay when enabled', async () => {
    mocks.isAutonomous.mockResolvedValue(true)
    const toolArguments = { command: 'Get-Date' }

    await expect(
      handler('agent-approval:request')(
        { sender: { id: 7 } },
        {
          id: 'request-1',
          title: 'Run command',
          summary: 'Run a bounded command',
          toolName: 'system_shell',
          kind: 'terminal',
          arguments: [],
          toolArguments,
        }
      )
    ).resolves.toEqual({
      approved: true,
      autonomous: true,
      approvalToken: 'one-use-token',
    })
    expect(mocks.issueAuthorization).toHaveBeenCalledWith(7, 'system_shell', toolArguments)
  })

  it('disables immediately without confirmation', async () => {
    await expect(
      handler('agent-approval:set-autonomous-mode')({ sender: { id: 7 } }, false)
    ).resolves.toEqual({ enabled: false })
    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(mocks.setAutonomous).toHaveBeenCalledWith(false)
    unregisterAgentApprovalOverlayHandlers()
  })
})
