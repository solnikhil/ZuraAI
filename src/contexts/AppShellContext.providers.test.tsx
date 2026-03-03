import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppShellProvider, useAppShell } from './AppShellContext'

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
  const { activeSettingsSection, setActiveSettingsSection } = useAppShell()
  return (
    <div>
      <div data-testid="section">{activeSettingsSection}</div>
      <button onClick={() => setActiveSettingsSection('models')}>set-models</button>
      <button onClick={() => setActiveSettingsSection('preferences')}>set-preferences</button>
      <button onClick={() => setActiveSettingsSection('providers')}>set-providers</button>
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
})
