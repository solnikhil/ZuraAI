// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (...args: unknown[]) => unknown

const electronMocks = vi.hoisted(() => ({
  ipcHandlers: new Map<string, IpcHandler>(),
  appIsPackaged: { value: true },
  getVersion: vi.fn(() => '0.0.6'),
  handle: vi.fn(),
  webContentsSend: vi.fn(),
  isDestroyed: vi.fn(() => false),
}))

// Wire the handle mock to populate ipcHandlers — done after the hoisted block
// so the closure has a stable identity.
electronMocks.handle.mockImplementation((channel: string, handler: IpcHandler) => {
  electronMocks.ipcHandlers.set(channel, handler)
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return electronMocks.appIsPackaged.value
    },
    getVersion: electronMocks.getVersion,
  },
  ipcMain: {
    handle: electronMocks.handle,
  },
  BrowserWindow: class {},
}))

vi.mock('electron-updater', () => {
  // Local imports inside factory are allowed (factory runs lazily).
  const { EventEmitter } = require('events')
  const emitter = new EventEmitter()

  const state = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowDowngrade: false,
    logger: null as unknown,
  }

  const checkForUpdates = vi.fn(() => Promise.resolve(null))
  const downloadUpdate = vi.fn(() => Promise.resolve(undefined))
  const quitAndInstall = vi.fn<(...args: unknown[]) => unknown>(() => undefined)

  const proxy = new Proxy(emitter, {
    get(target, prop) {
      if (prop === 'on') {
        return (event: string, listener: (...args: unknown[]) => void) => {
          target.on(event, listener)
          return target
        }
      }
      if (prop === 'autoDownload') return state.autoDownload
      if (prop === 'autoInstallOnAppQuit') return state.autoInstallOnAppQuit
      if (prop === 'allowDowngrade') return state.allowDowngrade
      if (prop === 'logger') return state.logger
      if (prop === 'checkForUpdates') return checkForUpdates
      if (prop === 'downloadUpdate') return downloadUpdate
      if (prop === 'quitAndInstall') return quitAndInstall
      if (prop === '__test') {
        return { emitter, checkForUpdates, downloadUpdate, quitAndInstall }
      }
      return Reflect.get(target, prop)
    },
    set(_target, prop, value) {
      if (prop === 'autoDownload') {
        state.autoDownload = value
        return true
      }
      if (prop === 'autoInstallOnAppQuit') {
        state.autoInstallOnAppQuit = value
        return true
      }
      if (prop === 'allowDowngrade') {
        state.allowDowngrade = value
        return true
      }
      if (prop === 'logger') {
        state.logger = value
        return true
      }
      return Reflect.set(emitter, prop, value)
    },
  })

  return { autoUpdater: proxy }
})

interface UpdaterTestHandle {
  emitter: import('events').EventEmitter
  checkForUpdates: ReturnType<typeof vi.fn>
  downloadUpdate: ReturnType<typeof vi.fn>
  quitAndInstall: ReturnType<typeof vi.fn>
}

async function loadUpdater() {
  vi.resetModules()
  const updater = await import('./updater')
  // Reach into the proxy via a hidden marker the factory exposes.
  const updaterModule = (await import('electron-updater')) as unknown as {
    autoUpdater: { __test: UpdaterTestHandle }
  }
  const handle = updaterModule.autoUpdater.__test
  // The mock factory runs once per file, so the underlying vi.fn() instances
  // accumulate calls across tests. Reset them on every load so each test sees
  // a clean ledger.
  handle.checkForUpdates.mockClear().mockResolvedValue(null)
  handle.downloadUpdate.mockClear().mockResolvedValue(undefined)
  handle.quitAndInstall.mockClear().mockReturnValue(undefined)
  handle.emitter.removeAllListeners()
  // Reset the install flag so leaks from a previous test (where we asserted
  // installingUpdate=true after a successful install) don't poison the next.
  updater.setShutdownHook(null)
  return { updater, autoUpdaterTest: handle }
}

beforeEach(() => {
  electronMocks.ipcHandlers.clear()
  electronMocks.appIsPackaged.value = true
  electronMocks.handle.mockClear()
  electronMocks.handle.mockImplementation((channel: string, handler: IpcHandler) => {
    electronMocks.ipcHandlers.set(channel, handler)
  })
  electronMocks.webContentsSend.mockClear()
  electronMocks.isDestroyed.mockReset().mockReturnValue(false)
  electronMocks.getVersion.mockReset().mockReturnValue('0.0.6')

  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeFakeWindow() {
  return {
    webContents: { send: electronMocks.webContentsSend },
    isDestroyed: electronMocks.isDestroyed,
  } as unknown as Electron.BrowserWindow
}

describe('updater event forwarding', () => {
  it('forwards autoUpdater error events as update-error to the main window', async () => {
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()

    updater.initializeAutoUpdater(() => fakeWindow)

    autoUpdaterTest.emitter.emit('error', new Error('Network unreachable'))

    expect(electronMocks.webContentsSend).toHaveBeenCalledWith(
      'update-error',
      'Network unreachable'
    )
  })

  it('forwards download-progress events as update-download-progress with normalized payload', async () => {
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()

    updater.initializeAutoUpdater(() => fakeWindow)

    autoUpdaterTest.emitter.emit('download-progress', {
      percent: 42.5,
      transferred: 1_024,
      total: 4_096,
      bytesPerSecond: 256,
    })

    expect(electronMocks.webContentsSend).toHaveBeenCalledWith('update-download-progress', {
      percent: 42.5,
      transferred: 1_024,
      total: 4_096,
    })
  })

  it('emits update-error when downloadUpdate rejects after update-available', async () => {
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()

    updater.initializeAutoUpdater(() => fakeWindow)

    autoUpdaterTest.downloadUpdate.mockRejectedValueOnce(new Error('disk full'))

    autoUpdaterTest.emitter.emit('update-available', { version: '0.0.7' })

    // Allow the rejection-then-send chain to settle.
    await Promise.resolve()
    await Promise.resolve()

    expect(electronMocks.webContentsSend).toHaveBeenCalledWith('update-available', '0.0.7')
    expect(electronMocks.webContentsSend).toHaveBeenCalledWith('update-error', 'disk full')
  })

  it('skips initialization in development mode', async () => {
    electronMocks.appIsPackaged.value = false
    const { updater, autoUpdaterTest } = await loadUpdater()

    updater.initializeAutoUpdater(() => null)

    // No event listeners should have been wired, so emitting events is a no-op.
    // We add a no-op listener to keep Node's EventEmitter from throwing on the
    // bare `error` event (which is the standard behavior when no listener is
    // present).
    autoUpdaterTest.emitter.on('error', () => undefined)
    autoUpdaterTest.emitter.emit('error', new Error('boom'))
    expect(electronMocks.webContentsSend).not.toHaveBeenCalled()
  })
})

describe('updater:quit-and-install handler', () => {
  it('runs the registered shutdown hook before calling quitAndInstall', async () => {
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()
    updater.registerUpdaterHandlers(() => fakeWindow)

    const callOrder: string[] = []
    const shutdownHook = vi.fn(async () => {
      callOrder.push('shutdown')
    })
    autoUpdaterTest.quitAndInstall.mockImplementation(() => {
      callOrder.push('quitAndInstall')
    })
    updater.setShutdownHook(shutdownHook)

    expect(updater.isInstallingUpdate()).toBe(false)

    const handler = electronMocks.ipcHandlers.get('updater:quit-and-install')
    expect(handler).toBeDefined()
    const result = await handler!()

    expect(result).toBe(true)
    expect(shutdownHook).toHaveBeenCalledOnce()
    expect(autoUpdaterTest.quitAndInstall).toHaveBeenCalledWith(false, true)
    expect(callOrder).toEqual(['shutdown', 'quitAndInstall'])
    expect(updater.isInstallingUpdate()).toBe(true)
  })

  it('still calls quitAndInstall when the shutdown hook throws', async () => {
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()
    updater.registerUpdaterHandlers(() => fakeWindow)

    const shutdownHook = vi.fn(async () => {
      throw new Error('mcp shutdown failed')
    })
    updater.setShutdownHook(shutdownHook)

    const handler = electronMocks.ipcHandlers.get('updater:quit-and-install')
    const result = await handler!()

    expect(result).toBe(true)
    expect(shutdownHook).toHaveBeenCalledOnce()
    expect(autoUpdaterTest.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('emits update-error and resets the install flag when quitAndInstall throws', async () => {
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()
    updater.registerUpdaterHandlers(() => fakeWindow)
    updater.setShutdownHook(null)

    autoUpdaterTest.quitAndInstall.mockImplementation(() => {
      throw new Error('installer missing')
    })

    const handler = electronMocks.ipcHandlers.get('updater:quit-and-install')
    const result = await handler!()

    expect(result).toBe(false)
    expect(electronMocks.webContentsSend).toHaveBeenCalledWith('update-error', 'installer missing')
    expect(updater.isInstallingUpdate()).toBe(false)
  })

  it('returns true and skips installer in development mode', async () => {
    electronMocks.appIsPackaged.value = false
    const { updater, autoUpdaterTest } = await loadUpdater()
    const fakeWindow = makeFakeWindow()
    updater.registerUpdaterHandlers(() => fakeWindow)

    const handler = electronMocks.ipcHandlers.get('updater:quit-and-install')
    const result = await handler!()

    expect(result).toBe(true)
    expect(autoUpdaterTest.quitAndInstall).not.toHaveBeenCalled()
    expect(updater.isInstallingUpdate()).toBe(false)
  })
})
