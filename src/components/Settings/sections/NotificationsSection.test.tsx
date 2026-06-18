import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NotificationsSection } from './NotificationsSection'
import type { EmailNotificationsAPI } from '@/electron/types'

const emailNotificationsBridge: EmailNotificationsAPI = {
  applySettings: vi.fn(async (settings) => settings),
  sendTest: vi.fn(async () => ({ ok: true })),
}

describe('NotificationsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as { window: Window & { emailNotifications: EmailNotificationsAPI } }).window.emailNotifications =
      emailNotificationsBridge
  })

  it('renders email notification fields and reports fixed test-email success', async () => {
    const onChange = vi.fn()
    const emailNotifications = {
      enabled: true,
      senderName: 'ZuraAI',
      senderEmail: 'reminders@example.com',
      recipientEmail: 'user@example.com',
    }

    render(
      <NotificationsSection
        brevoApiKey="xkeysib-demo"
        emailNotifications={emailNotifications}
        hasUnsavedChanges={false}
        onChange={onChange}
      />
    )

    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('xkeysib-...')).toHaveValue('xkeysib-demo')
    expect(screen.getByDisplayValue('reminders@example.com')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('xkeysib-...'), {
      target: { value: 'xkeysib-new' },
    })
    expect(onChange).toHaveBeenCalledWith({ brevoApiKey: 'xkeysib-new' })

    fireEvent.click(screen.getByRole('button', { name: /send test email/i }))

    await waitFor(() => expect(emailNotificationsBridge.sendTest).toHaveBeenCalledTimes(1))
    expect(emailNotificationsBridge.applySettings).toHaveBeenCalledWith(emailNotifications)
    expect(await screen.findByText('Test email sent.')).toBeInTheDocument()
  })

  it('disables test email while settings are unsaved', () => {
    render(
      <NotificationsSection
        brevoApiKey="xkeysib-demo"
        emailNotifications={{
          enabled: true,
          senderName: 'ZuraAI',
          senderEmail: 'reminders@example.com',
          recipientEmail: 'user@example.com',
        }}
        hasUnsavedChanges
        onChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /send test email/i })).toBeDisabled()
  })
})
