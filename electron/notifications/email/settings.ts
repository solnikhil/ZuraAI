import type { EmailNotificationSettings } from './types'

const DEFAULT_EMAIL_NOTIFICATION_SETTINGS: EmailNotificationSettings = {
  enabled: false,
  senderName: '',
  senderEmail: '',
  recipientEmail: '',
}

let activeSettings: EmailNotificationSettings = { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function sanitizeEmailNotificationSettings(input: unknown): EmailNotificationSettings {
  if (!isRecord(input)) return { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS }

  return {
    enabled: input.enabled === true,
    senderName: trimString(input.senderName, 120),
    senderEmail: trimString(input.senderEmail, 254),
    recipientEmail: trimString(input.recipientEmail, 254),
  }
}

export function applyEmailNotificationSettings(input: unknown): EmailNotificationSettings {
  activeSettings = sanitizeEmailNotificationSettings(input)
  return getEmailNotificationSettings()
}

export function getEmailNotificationSettings(): EmailNotificationSettings {
  return { ...activeSettings }
}
