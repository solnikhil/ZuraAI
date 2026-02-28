import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { ToastProvider, useToast } from '../../components/shared/Toast'
import { SettingsUIProvider } from '../../contexts/SettingsUIContext'
import { NotificationProvider } from '../../contexts/NotificationContext'
import { useNotifications } from '../useNotifications'

const { toastFns } = vi.hoisted(() => ({
  toastFns: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  Toaster: () => null,
  toast: toastFns,
}))

const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
}

function NotificationWrapper({ children }: { children: ReactNode }) {
  return (
    <SettingsUIProvider>
      <NotificationProvider>{children}</NotificationProvider>
    </SettingsUIProvider>
  )
}

describe('useNotifications hook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('exposes notification store API', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: NotificationWrapper })

    expect(Array.isArray(result.current.notifications)).toBe(true)
    expect(Array.isArray(result.current.activeBanners)).toBe(true)
    expect(typeof result.current.unreadCount).toBe('number')
    expect(typeof result.current.addNotification).toBe('function')
    expect(typeof result.current.dismissNotification).toBe('function')
    expect(typeof result.current.markAsRead).toBe('function')
    expect(typeof result.current.markAllAsRead).toBe('function')
    expect(typeof result.current.clearAll).toBe('function')
  })

  it('Property 17: showToast backward compatibility', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 160 }),
        fc.constantFrom<'success' | 'error' | 'warning' | 'info'>('success', 'error', 'warning', 'info'),
        fc.integer({ min: 100, max: 20_000 }),
        (message, type, duration) => {
          vi.clearAllMocks()

          act(() => {
            result.current.showToast(message, type, duration)
          })

          expect(toastFns[type]).toHaveBeenCalledTimes(1)
          expect(toastFns[type]).toHaveBeenCalledWith(message, { duration })
        },
      ),
      PROPERTY_TEST_CONFIG,
    )
  })
})
