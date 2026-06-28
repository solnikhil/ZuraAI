import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsConsentPrompt } from './AnalyticsConsentPrompt'

describe('AnalyticsConsentPrompt', () => {
  beforeEach(() => {
    window.location.hash = '#/dashboard'
    Object.defineProperty(window, 'analytics', {
      configurable: true,
      value: {
        getState: vi.fn(async () => ({
          analyticsEnabled: false,
          anonymousInstallId: 'install-1',
          firstLaunchSent: false,
          lastSeenVersion: '',
          consentState: 'undecided',
          hasProjectKey: true,
        })),
        setEnabled: vi.fn(async (enabled: boolean) => ({
          analyticsEnabled: enabled,
          anonymousInstallId: 'install-1',
          firstLaunchSent: enabled,
          lastSeenVersion: '',
          consentState: enabled ? 'accepted' : 'declined',
          hasProjectKey: true,
        })),
        track: vi.fn(),
      },
    })
  })

  it('asks for consent on first run and enables analytics only after acceptance', async () => {
    render(<AnalyticsConsentPrompt />)

    expect(await screen.findByText('Share anonymous app stats?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enable anonymous analytics' }))

    await waitFor(() => {
      expect(window.analytics.setEnabled).toHaveBeenCalledWith(true)
    })
    expect(screen.queryByText('Share anonymous app stats?')).not.toBeInTheDocument()
  })

  it('does not render on utility routes', async () => {
    window.location.hash = '#/about'

    render(<AnalyticsConsentPrompt />)

    expect(window.analytics.getState).not.toHaveBeenCalled()
    expect(screen.queryByText('Share anonymous app stats?')).not.toBeInTheDocument()
  })
})
