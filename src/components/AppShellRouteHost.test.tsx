import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsProvider } from '../contexts/SettingsContext'
import AppShellRouteHost from './AppShellRouteHost'

const routeHostTestState = vi.hoisted(() => ({
  showToast: vi.fn(),
  queueMessage: vi.fn(),
  createSession: vi.fn(() => 'new-session-id'),
}))

vi.mock('./shared/Toast', () => ({
  useToast: () => ({ showToast: routeHostTestState.showToast }),
}))

vi.mock('../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => ({
    sessions: [],
    currentSessionId: null,
    createSession: routeHostTestState.createSession,
  }),
}))

vi.mock('../contexts/QuickSendContext', () => ({
  useQuickSend: () => ({
    queueMessage: routeHostTestState.queueMessage,
  }),
}))

function pressCtrlK(target: EventTarget = window) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
  )
}

function renderRoute(initialEntry: string) {
  return render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<AppShellRouteHost />}>
            <Route path="/dashboard" element={<div data-testid="dashboard-route" />} />
            <Route path="/settings" element={<div data-testid="settings-route" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SettingsProvider>
  )
}

describe('AppShellRouteHost command palette routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: {
        invoke: vi.fn(async () => null),
      },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('opens the command palette from the dashboard route', async () => {
    renderRoute('/dashboard')
    await screen.findByTestId('dashboard-route')

    act(() => {
      pressCtrlK()
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens the command palette from the settings route', async () => {
    renderRoute('/settings')
    await screen.findByTestId('settings-route')

    act(() => {
      pressCtrlK()
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens even when localStorage has a stale disabled command palette setting', async () => {
    localStorage.setItem(
      'zura-settings',
      JSON.stringify({
        commandBar: {
          enabled: false,
        },
      })
    )
    renderRoute('/dashboard')
    await screen.findByTestId('dashboard-route')

    act(() => {
      pressCtrlK()
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

})
