import { trustedIpcMain as ipcMain } from './trustedIpc'

import {
  applyEmailNotificationSettings,
  getEmailNotificationSettings,
  sendTestEmail,
} from '../notifications/email'

export function registerEmailNotificationHandlers(): void {
  ipcMain.handle('email-notifications:apply-settings', (_event, settings: unknown) => {
    return applyEmailNotificationSettings(settings)
  })

  ipcMain.handle('email-notifications:send-test', async () => {
    return sendTestEmail(getEmailNotificationSettings())
  })
}

export function unregisterEmailNotificationHandlers(): void {
  ipcMain.removeHandler('email-notifications:apply-settings')
  ipcMain.removeHandler('email-notifications:send-test')
}
