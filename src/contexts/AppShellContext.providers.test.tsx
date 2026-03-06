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
  const { activeSettingsSection, setActiveSettingsSection, sidebarWidth, setSidebarWidth } = useAppShell()
  return (
    <div>
      <div data-testid="section">{activeSettingsSection}</div>
      <div data-testid="sidebar-width">{sidebarWidth}</div>
      <button onClick={() => setActiveSettingsSection('models')}>set-models</button>
      <button onClick={() => setActiveSettingsSection('preferences')}>set-preferences</button>
      <button onClick={() => setActiveSettingsSection('providers')}>set-providers</button>
      <button onClick={() => setSidebarWidth(999)}>set-sidebar-width</button>
    </div>
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

  it('normalizes stored "tools" to skills', () => {
    localStorage.setItem('zura-ui:settingsSection', 'tools')

    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>
    )

    expect(screen.getByTestId('section').textContent).toBe('skills')
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
})
