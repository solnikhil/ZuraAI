import { getSecureValueAsync } from '../../secureStorage'
import type {
  BrevoEmailInput,
  EmailNotificationResult,
  EmailNotificationSettings,
} from './types'
import { buildNotificationEmailHtml } from './template'

const BREVO_TRANSACTIONAL_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const SUBJECT_LIMIT = 180
const TEXT_BODY_LIMIT = 8000
const HTML_BODY_LIMIT = 12000

interface SendBrevoEmailDeps {
  fetchImpl?: typeof fetch
}

function compact(value: string, limit: number): string {
  return value.replace(/\s+\n/g, '\n').trim().slice(0, limit)
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validateBrevoInput(input: BrevoEmailInput): void {
  if (!input.apiKey.trim()) throw new Error('Brevo API key is required.')
  if (!input.senderName.trim()) throw new Error('Sender name is required.')
  if (!isValidEmail(input.senderEmail.trim())) throw new Error('Valid sender email is required.')
  if (!isValidEmail(input.recipientEmail.trim())) throw new Error('Valid recipient email is required.')
  if (!input.subject.trim()) throw new Error('Email subject is required.')
  if (!input.textContent.trim()) throw new Error('Email body is required.')
}

export async function sendBrevoEmail(
  input: BrevoEmailInput,
  deps: SendBrevoEmailDeps = {}
): Promise<EmailNotificationResult> {
  try {
    validateBrevoInput(input)
    const fetchImpl = deps.fetchImpl ?? fetch
    const subject = compact(input.subject, SUBJECT_LIMIT)
    const textContent = compact(input.textContent, TEXT_BODY_LIMIT)
    const htmlContent = compact(
      input.htmlContent || buildNotificationEmailHtml({
        notificationType: 'Automation notification',
        title: subject,
        summary: textContent,
        notificationMessage: textContent,
        metadata: [
          { label: 'automation status', value: 'Triggered' },
          { label: 'notification', value: 'Email' },
        ],
      }),
      HTML_BODY_LIMIT
    )

    const response = await fetchImpl(BREVO_TRANSACTIONAL_EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': input.apiKey.trim(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: input.senderName.trim(),
          email: input.senderEmail.trim(),
        },
        to: [{ email: input.recipientEmail.trim() }],
        subject,
        textContent,
        htmlContent,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const suffix = detail ? `: ${detail.slice(0, 500)}` : ''
      throw new Error(`Brevo email request failed (${response.status})${suffix}`)
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function buildStoredBrevoInput(
  settings: EmailNotificationSettings,
  subject: string,
  textContent: string,
  htmlContent?: string
): Promise<BrevoEmailInput> {
  return {
    ...settings,
    apiKey: await getSecureValueAsync('brevoApiKey'),
    subject,
    textContent,
    ...(htmlContent ? { htmlContent } : {}),
  }
}

export async function sendTestEmail(
  settings: EmailNotificationSettings,
  deps?: SendBrevoEmailDeps
): Promise<EmailNotificationResult> {
  const textContent = [
    'ZuraAI email notifications are configured.',
    '',
    'Reminder and lookout emails will be sent when Email Notifications are enabled.',
  ].join('\n')
  return sendBrevoEmail(
    await buildStoredBrevoInput(
      settings,
      'ZuraAI email notifications are configured',
      textContent,
      buildNotificationEmailHtml({
        notificationType: 'Test notification',
        title: 'ZuraAI email notifications are configured',
        summary: 'Your Brevo sender, recipient, and API key are working.',
        notificationMessage: textContent,
        detailTitle: 'Next step',
        detailItems: [
          'Create a reminder in chat and let it fire.',
          'Changed web lookouts will also send this HTML email format.',
        ],
        metadata: [
          { label: 'automation status', value: 'Configured' },
          { label: 'notification', value: 'Email' },
        ],
      })
    ),
    deps
  )
}

export const __test__ = {
  BREVO_TRANSACTIONAL_EMAIL_ENDPOINT,
  validateBrevoInput,
}
