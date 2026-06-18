export interface EmailNotificationSettings {
  enabled: boolean
  senderName: string
  senderEmail: string
  recipientEmail: string
}

export interface EmailNotificationResult {
  ok: boolean
  error?: string
}

export interface BrevoEmailInput extends EmailNotificationSettings {
  apiKey: string
  subject: string
  textContent: string
  htmlContent?: string
}
