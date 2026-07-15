/**
 * Tests for TitleBarInfoMenu's auto-update integration:
 *
 * 1. `getUpdateMenuLabel` (pure helper) — covers all updater UI states without
 *    needing to drive the Radix popover, which is unreliable inside jsdom.
 * 2. Subscription wiring — the component subscribes to all four updater
 *    channels on mount and unsubscribes on unmount.
 * 3. Toast side-effects — when the main process pushes an update-error event,
 *    the renderer surfaces it via a toast.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

import TitleBarInfoMenu, { getUpdateMenuLabel } from './TitleBarInfoMenu'
import { ToastProvider } from './shared/Toast'

const sonnerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    info: sonnerMocks.info,
    success: sonnerMocks.success,
    warning: sonnerMocks.warning,
    error: sonnerMocks.error,
  },
  Toaster: () => null,
}))

interface UpdaterListeners {
  available: ((version: string) => void) | null
  downloaded: ((version: string) => void) | null
  error: ((message: string) => void) | null
  progress: ((progress: { percent: number; transferred: number; total: number }) => void) | null
}

let listeners: UpdaterListeners
let availableUnsubscribe: ReturnType<typeof vi.fn>
let downloadedUnsubscribe: ReturnType<typeof vi.fn>
let errorUnsubscribe: ReturnType<typeof vi.fn>
let progressUnsubscribe: ReturnType<typeof vi.fn>

function installWindowMocks() {
  listeners = { available: null, downloaded: null, error: null, progress: null }
  availableUnsubscribe = vi.fn()
  downloadedUnsubscribe = vi.fn()
  errorUnsubscribe = vi.fn()
  progressUnsubscribe = vi.fn()

  const updater = {
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    quitAndInstall: vi.fn(() => Promise.resolve(true)),
    getVersion: vi.fn(() => Promise.resolve('0.0.6')),
    onUpdateAvailable: vi.fn((cb: (v: string) => void) => {
      listeners.available = cb
      return availableUnsubscribe
    }),
    onUpdateDownloaded: vi.fn((cb: (v: string) => void) => {
      listeners.downloaded = cb
      return downloadedUnsubscribe
    }),
    onUpdateError: vi.fn((cb: (m: string) => void) => {
      listeners.error = cb
      return errorUnsubscribe
    }),
    onUpdateProgress: vi.fn(
      (cb: (p: { percent: number; transferred: number; total: number }) => void) => {
        listeners.progress = cb
        return progressUnsubscribe
      }
    ),
  }

  const appInfo = {
    get: vi.fn(() =>
      Promise.resolve({
        appName: 'ZuraAI',
        appVersion: '0.0.6',
        channel: 'stable',
        isPackaged: true,
        electronVersion: '41.1.0',
        chromiumVersion: '129',
        nodeVersion: '20',
        v8Version: '12',
        osVersion: 'darwin 23',
        commitHash: '',
        commitDate: '',
      })
    ),
    getMemoryReport: vi.fn(() => Promise.resolve(null)),
    openAboutWindow: vi.fn(() => Promise.resolve()),
  }

  Object.defineProperty(window, 'updater', { value: updater, configurable: true, writable: true })
  Object.defineProperty(window, 'appInfo', { value: appInfo, configurable: true, writable: true })
}

function renderMenu() {
  const utils = render(
    <ToastProvider>
      <TitleBarInfoMenu isSettingsView={false} setDashboardView={() => undefined} />
    </ToastProvider>
  )
  return utils
}

beforeEach(() => {
  sonnerMocks.info.mockClear()
  sonnerMocks.success.mockClear()
  sonnerMocks.warning.mockClear()
  sonnerMocks.error.mockClear()
  installWindowMocks()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('getUpdateMenuLabel', () => {
  it('returns "Check for Updates" for idle/upToDate states', () => {
    expect(getUpdateMenuLabel('idle', null)).toBe('Check for Updates')
    expect(getUpdateMenuLabel('upToDate', null)).toBe('Check for Updates')
  })

  it('returns "Checking…" while checking', () => {
    expect(getUpdateMenuLabel('checking', null)).toBe('Checking…')
  })

  it('returns "Downloading update…" without percent before the first progress event', () => {
    expect(getUpdateMenuLabel('available', null)).toBe('Downloading update…')
  })

  it('rounds the download percent in the label', () => {
    expect(getUpdateMenuLabel('available', 0)).toBe('Downloading update… 0%')
    expect(getUpdateMenuLabel('available', 42.4)).toBe('Downloading update… 42%')
    expect(getUpdateMenuLabel('available', 42.6)).toBe('Downloading update… 43%')
    expect(getUpdateMenuLabel('available', 100)).toBe('Downloading update… 100%')
  })

  it('clamps out-of-range percents into 0..100', () => {
    expect(getUpdateMenuLabel('available', -25)).toBe('Downloading update… 0%')
    expect(getUpdateMenuLabel('available', 150)).toBe('Downloading update… 100%')
  })

  it('returns "Install Update" once the download is complete', () => {
    expect(getUpdateMenuLabel('downloaded', null)).toBe('Install Update')
  })

  it('returns "Try again" after an error so the user can recover', () => {
    expect(getUpdateMenuLabel('error', null)).toBe('Try again')
  })
})

describe('TitleBarInfoMenu — updater subscriptions', () => {
  it('subscribes to all four updater channels on mount', () => {
    renderMenu()

    const updater = window.updater
    expect(updater?.onUpdateAvailable).toHaveBeenCalledOnce()
    expect(updater?.onUpdateDownloaded).toHaveBeenCalledOnce()
    expect(updater?.onUpdateError).toHaveBeenCalledOnce()
    expect(updater?.onUpdateProgress).toHaveBeenCalledOnce()
  })

  it('unsubscribes all listeners on unmount', () => {
    const { unmount } = renderMenu()
    unmount()

    expect(availableUnsubscribe).toHaveBeenCalledOnce()
    expect(downloadedUnsubscribe).toHaveBeenCalledOnce()
    expect(errorUnsubscribe).toHaveBeenCalledOnce()
    expect(progressUnsubscribe).toHaveBeenCalledOnce()
  })

  it('shows an error toast when the main process emits update-error', () => {
    renderMenu()

    act(() => {
      listeners.error?.('Network unreachable')
    })

    expect(sonnerMocks.error).toHaveBeenCalledWith(
      'Update failed: Network unreachable',
      expect.any(Object)
    )
  })

  it('shows a friendly fallback when update-error fires with an empty message', () => {
    renderMenu()

    act(() => {
      listeners.error?.('')
    })

    expect(sonnerMocks.error).toHaveBeenCalledWith(
      'Update failed: unknown error',
      expect.any(Object)
    )
  })

  it('shows an info toast on update-available and a success toast on update-downloaded', () => {
    renderMenu()

    act(() => {
      listeners.available?.('0.0.7')
    })
    act(() => {
      listeners.downloaded?.('0.0.7')
    })

    expect(sonnerMocks.info).toHaveBeenCalledWith(
      'Update v0.0.7 found. Downloading now...',
      expect.any(Object)
    )
    expect(sonnerMocks.success).toHaveBeenCalledWith(
      'Update v0.0.7 ready. Install it from the info menu.',
      expect.any(Object)
    )
  })

  it('does not toast on progress events (label-only feedback)', () => {
    renderMenu()

    act(() => {
      listeners.progress?.({ percent: 50, transferred: 1024, total: 2048 })
    })

    expect(sonnerMocks.info).not.toHaveBeenCalled()
    expect(sonnerMocks.success).not.toHaveBeenCalled()
    expect(sonnerMocks.warning).not.toHaveBeenCalled()
    expect(sonnerMocks.error).not.toHaveBeenCalled()
  })
})
