import { shell } from 'electron'
import { openArtifactExternally } from '../artifacts/openArtifactExternally'
import { trustedIpcMain as ipcMain } from './trustedIpc'

export function registerExternalOpenHandlers(): void {
  ipcMain.handle('shell:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string') return
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
      await shell.openExternal(url)
    } catch (error) {
      console.warn('[external-open] Invalid URL passed to shell:open-external', error)
    }
  })
  ipcMain.handle('artifacts:open-external', async (_event, payload: unknown) =>
    openArtifactExternally(payload)
  )
}

export function unregisterExternalOpenHandlers(): void {
  ipcMain.removeHandler('shell:open-external')
  ipcMain.removeHandler('artifacts:open-external')
}
