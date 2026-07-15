import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockAppShell = {
  dashboardView: 'chat' as const,
  sidebarCollapsed: false,
  sidebarWidth: 300,
  sidebarHidden: false,
  toggleSidebarHidden: vi.fn(),
  isResizingSidebar: false,
  canGoBack: false,
  canGoForward: false,
  goBack: vi.fn(),
  goForward: vi.fn(),
}

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      titleBarDensity: 'comfortable',
    },
  }),
}))

vi.mock('../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/dashboard' }),
}))

import TitleBar from './TitleBar'
import TitleBarAppMenu from './TitleBarAppMenu'

const originalPlatform = navigator.platform
const appMenuCommand = vi.fn()

function setNavigatorPlatform(value: string): void {
  Object.defineProperty(navigator, 'platform', {
    value,
    writable: true,
    configurable: true,
  })
}

function openMenu(label: string): void {
  const trigger = screen.getByRole('menuitem', { name: label })
  trigger.focus()
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  fireEvent.click(trigger)
}

describe('TitleBarAppMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'appMenu', {
      value: { command: appMenuCommand },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'windowControls', {
      value: {
        isMaximized: vi.fn().mockResolvedValue(false),
        onWindowState: vi.fn(() => () => undefined),
      },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'shell', {
      value: { readClipboardText: vi.fn().mockResolvedValue('') },
      writable: true,
      configurable: true,
    })
    if (!document.execCommand) {
      Object.defineProperty(document, 'execCommand', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      })
    }
    vi.spyOn(document, 'execCommand').mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    setNavigatorPlatform(originalPlatform)
  })

  it('renders the Windows titlebar menu labels from TitleBar', () => {
    setNavigatorPlatform('Win32')

    render(<TitleBar />)

    expect(screen.getByRole('menubar', { name: 'Application menu' })).toBeInTheDocument()
    for (const label of ['File', 'Edit', 'View', 'Window', 'Help']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    }
  })

  it('does not render the app menu on macOS', () => {
    setNavigatorPlatform('MacIntel')

    render(<TitleBar />)

    expect(screen.queryByRole('menubar', { name: 'Application menu' })).not.toBeInTheDocument()
  })

  it('selecting app menu items calls the app-menu bridge', async () => {
    appMenuCommand.mockResolvedValue(true)
    render(<TitleBarAppMenu />)

    openMenu('File')
    fireEvent.click(await screen.findByText('New Chat'))

    await waitFor(() => {
      expect(appMenuCommand).toHaveBeenCalledWith('new-chat')
    })
  })

  it('selecting edit menu items executes renderer edit commands', async () => {
    render(<TitleBarAppMenu />)

    openMenu('Edit')
    fireEvent.click(await screen.findByText('Undo'))

    await waitFor(() => {
      expect(document.execCommand).toHaveBeenCalledWith('undo')
    })
  })
})
