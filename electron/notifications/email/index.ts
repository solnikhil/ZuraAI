export {
  applyEmailNotificationSettings,
  getEmailNotificationSettings,
  sanitizeEmailNotificationSettings,
} from './settings'
export { sendBrevoEmail, sendTestEmail } from './service'
export { sendScheduledTaskEmail } from './scheduledTaskEmail'
export { buildNotificationEmailHtml } from './template'
export type { BrevoEmailInput, EmailNotificationResult, EmailNotificationSettings } from './types'
