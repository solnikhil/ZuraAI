import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AppShellProvider, useAppShell } from './AppShellContext'
import { SIDEBAR_MAX_WIDTH_PX } from '../constants/sidebar'

const mockSettings = {
  settings: {
    rememberLastDashboardView: true,
    rememberLastSettingsSection: true,
  },
}

vi.mock('./SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

function Probe(): React.ReactElement {
  const {
    activeSettingsSection,
    setActiveSettingsSection,
    sidebarWidth,
    setSidebarWidth,
    dashboardView,
    setDashboardView,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  } = useAppShell()
  return (
    <div>
      <div data-testid="section">{activeSettingsSection}</div>
      <div data-testid="sidebar-width">{sidebarWidth}</div>
      <div data-testid="dashboard-view">{dashboardView}</div>
      <div data-testid="can-go-back">{String(canGoBack)}</div>
      <div data-testid="can-go-forward">{String(canGoForward)}</div>
      <button onClick={() => setActiveSettingsSection('models')}>set-models</button>
      <button onClick={() => setActiveSettingsSection('preferences')}>set-preferences</button>
      <button onClick={() => setActiveSettingsSection('servers')}>set-servers</button>
      <button onClick={() => setActiveSettingsSection('providers')}>set-providers</button>
      <button onClick={() => setSidebarWidth(999)}>set-sidebar-width</button>
      <button onClick={() => setDashboardView('settings')}>set-settings-view</button>
      <button onClick={() => setDashboardView('chat')}>set-chat-view</button>
      <button onClick={goBack}>go-back</button>
      <button onClick={goForward}>go-forward</button>
    </div>
  )
}

function NavigationHarness(): React.ReactElement {
  const [pathname, setPathname] = React.useState('/dashboard')

  return (
    <AppShellProvider pathname={pathname} navigateToPath={setPathname}>
      <div data-testid="pathname">{pathname}</div>
      <button onClick={() => setPathname('/settings')}>path-settings</button>
      <button onClick={() => setPathname('/dashboard')}>path-dashboard</button>
      <Probe />
    </AppShellProvider>
  )
}

describe('AppShellContext providers section normalization', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it.each(['models', 'preferences'])('normalizes stored "%s" to providers', (storedSection) => {
    localStorage.setItem('zura-ui:settingsSection', storedSection)

    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    expect(screen.getByTestId('section').textContent).toBe('providers')
  })

  it('normalizes stored "tools" to extensions', () => {
    localStorage.setItem('zura-ui:settingsSection', 'tools')

    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    expect(screen.getByTestId('section').textContent).toBe('overlay')
  })

  it('normalizes runtime section updates to providers', () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    fireEvent.click(screen.getByText('set-models'))
    expect(screen.getByTestId('section').textContent).toBe('providers')

    fireEvent.click(screen.getByText('set-preferences'))
    expect(screen.getByTestId('section').textContent).toBe('providers')

    fireEvent.click(screen.getByText('set-providers'))
    expect(screen.getByTestId('section').textContent).toBe('providers')
  })

  it('normalizes runtime section updates to mcp', () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    fireEvent.click(screen.getByText('set-servers'))
    expect(screen.getByTestId('section').textContent).toBe('mcp')
  })

  it('clamps stored sidebar width to max bound', () => {
    localStorage.setItem('zura-ui:sidebarWidth', '999')

    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    expect(screen.getByTestId('sidebar-width').textContent).toBe(String(SIDEBAR_MAX_WIDTH_PX))
  })

  it('persists clamped sidebar width updates', async () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    fireEvent.click(screen.getByText('set-sidebar-width'))

    await waitFor(() => {
      expect(localStorage.getItem('zura-ui:sidebarWidth')).toBe(String(SIDEBAR_MAX_WIDTH_PX))
    })
  })

  it('records shell history for dashboard view changes and navigates backward/forward', async () => {
    render(<NavigationHarness />)

    fireEvent.click(screen.getByText('set-settings-view'))

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view').textContent).toBe('settings')
      expect(screen.getByTestId('can-go-back').textContent).toBe('true')
    })

    fireEvent.click(screen.getByText('go-back'))

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view').textContent).toBe('chat')
      expect(screen.getByTestId('can-go-forward').textContent).toBe('true')
    })

    fireEvent.click(screen.getByText('go-forward'))

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view').textContent).toBe('settings')
    })
  })

  it('records shell history for path changes and clears forward history after a new branch', async () => {
    render(<NavigationHarness />)

    fireEvent.click(screen.getByText('path-settings'))

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/settings')
      expect(screen.getByTestId('can-go-back').textContent).toBe('true')
    })

    fireEvent.click(screen.getByText('go-back'))

    await waitFor(() => {
      expect(screen.getByTestId('pathname').textContent).toBe('/dashboard')
      expect(screen.getByTestId('can-go-forward').textContent).toBe('true')
    })

    fireEvent.click(screen.getByText('set-settings-view'))

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-view').textContent).toBe('settings')
      expect(screen.getByTestId('can-go-forward').textContent).toBe('false')
    })
  })
})
