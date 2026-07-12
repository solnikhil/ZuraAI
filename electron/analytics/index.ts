import { trustedIpcMain as ipcMain } from '../ipc/trustedIpc'

import {
  getAnalyticsState,
  setAnalyticsEnabled,
  trackAnalyticsEvent,
  trackAppCrash,
  trackAppError,
  trackStartupAnalytics,
} from './service'
import { isAnalyticsEventName, type AnalyticsProperties } from './events'

export {
  getAnalyticsState,
  setAnalyticsEnabled,
  trackAnalyticsEvent,
  trackAppCrash,
  trackAppError,
  trackStartupAnalytics,
}

export function registerAnalyticsHandlers(): void {
  ipcMain.handle('analytics:get-state', () => getAnalyticsState())

  ipcMain.handle('analytics:set-enabled', async (_event, enabled: unknown) => {
    return setAnalyticsEnabled(enabled === true)
  })

  ipcMain.handle('analytics:track', async (_event, eventName: unknown, properties?: unknown) => {
    if (!isAnalyticsEventName(eventName)) {
      return false
    }

    return trackAnalyticsEvent(eventName, properties as AnalyticsProperties)
  })
}

export function unregisterAnalyticsHandlers(): void {
  ipcMain.removeHandler('analytics:get-state')
  ipcMain.removeHandler('analytics:set-enabled')
  ipcMain.removeHandler('analytics:track')
}
