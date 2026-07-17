// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const stdoutListeners = new Map<string, (...args: unknown[]) => void>()
  const childListeners = new Map<string, (...args: unknown[]) => void>()
  const stdout = {
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      stdoutListeners.set(event, listener)
    }),
    emit: (event: string, ...args: unknown[]) => stdoutListeners.get(event)?.(...args),
  }
  const child = {
    stdout,
    killed: false,
    kill: vi.fn(function (this: { killed: boolean }) {
      this.killed = true
    }),
    once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      childListeners.set(event, listener)
    }),
  }
  return {
    stdout,
    child,
    spawn: vi.fn(() => child),
    send: vi.fn(),
    hideSpotlight: vi.fn(),
  }
})

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }],
  },
}))
vi.mock('../../windows/spotlightOverlay', () => ({ hideSpotlight: mocks.hideSpotlight }))

import { registerKillSwitch, unregisterKillSwitch } from './killSwitch'

describe('Computer Use kill switch', () => {
  beforeEach(() => {
    mocks.spawn.mockClear()
    mocks.send.mockClear()
    mocks.hideSpotlight.mockClear()
    mocks.child.killed = false
    mocks.child.kill.mockClear()
  })

  afterEach(() => unregisterKillSwitch())

  it('observes Esc+Esc through a helper without registering a global shortcut', () => {
    const onKill = vi.fn()
    registerKillSwitch(onKill)

    expect(mocks.spawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive']),
      expect.objectContaining({ windowsHide: true })
    )

    mocks.stdout.emit('data', Buffer.from('kill\n'))

    expect(onKill).toHaveBeenCalledTimes(1)
    expect(mocks.child.kill).toHaveBeenCalledTimes(1)
    expect(mocks.hideSpotlight).toHaveBeenCalledTimes(1)
    expect(mocks.send).toHaveBeenCalledWith('computer-use:killed')
  })
})
