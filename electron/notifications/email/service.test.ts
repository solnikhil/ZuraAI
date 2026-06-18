import { describe, expect, it, vi } from 'vitest'

vi.mock('../../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => 'xkeysib-demo'),
}))

import { sendBrevoEmail } from './service'

describe('sendBrevoEmail', () => {
  it('maps a transactional email request to Brevo', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }))

    await expect(
      sendBrevoEmail(
        {
          apiKey: 'xkeysib-demo',
          enabled: true,
          senderName: 'ZuraAI',
          senderEmail: 'reminders@example.com',
          recipientEmail: 'user@example.com',
          subject: 'Reminder: Review launch',
          textContent: 'Review launch notes',
          htmlContent: '<p>Review launch notes</p>',
        },
        { fetchImpl }
      )
    ).resolves.toEqual({ ok: true })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': 'xkeysib-demo',
          'content-type': 'application/json',
        },
      })
    )
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body).toMatchObject({
      sender: { name: 'ZuraAI', email: 'reminders@example.com' },
      to: [{ email: 'user@example.com' }],
      subject: 'Reminder: Review launch',
      textContent: 'Review launch notes',
      htmlContent: '<p>Review launch notes</p>',
    })
  })

  it('returns clear validation errors before calling Brevo', async () => {
    const fetchImpl = vi.fn()

    await expect(
      sendBrevoEmail(
        {
          apiKey: '',
          enabled: true,
          senderName: 'ZuraAI',
          senderEmail: 'reminders@example.com',
          recipientEmail: 'user@example.com',
          subject: 'Test',
          textContent: 'Test',
        },
        { fetchImpl }
      )
    ).resolves.toEqual({ ok: false, error: 'Brevo API key is required.' })

    await expect(
      sendBrevoEmail(
        {
          apiKey: 'xkeysib-demo',
          enabled: true,
          senderName: 'ZuraAI',
          senderEmail: 'invalid',
          recipientEmail: 'user@example.com',
          subject: 'Test',
          textContent: 'Test',
        },
        { fetchImpl }
      )
    ).resolves.toEqual({ ok: false, error: 'Valid sender email is required.' })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses the branded HTML template when no explicit htmlContent is provided', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 201 }))

    await sendBrevoEmail(
      {
        apiKey: 'xkeysib-demo',
        enabled: true,
        senderName: 'ZuraAI',
        senderEmail: 'reminders@example.com',
        recipientEmail: 'user@example.com',
        subject: 'Reminder: Review launch',
        textContent: 'Review launch notes',
      },
      { fetchImpl }
    )

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))
    expect(body.htmlContent).toContain('ZuraAI')
    expect(body.htmlContent).toContain('Automation alert')
    expect(body.htmlContent).toContain('Review launch notes')
    expect(body.htmlContent).not.toContain('<pre>')
  })
})
