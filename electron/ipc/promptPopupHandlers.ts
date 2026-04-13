import { ipcMain } from 'electron'

import { showPromptPopup, hidePromptPopup, submitPrompt } from '../windows/promptPopup'
import { getMainWindow } from '../windows/mainWindow'

export function registerPromptPopupHandlers(): void {
  ipcMain.handle('prompt-popup:show', () => {
    showPromptPopup()
  })

  ipcMain.handle('prompt-popup:hide', () => {
    hidePromptPopup()
  })

  ipcMain.handle('prompt-popup:submit', (_event, prompt: unknown) => {
    if (typeof prompt !== 'string') return
    void submitPrompt(prompt)
  })

  ipcMain.on('open-model-selector', () => {
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('model-selector:open')
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

export function unregisterPromptPopupHandlers(): void {
  ipcMain.removeHandler('prompt-popup:show')
  ipcMain.removeHandler('prompt-popup:hide')
  ipcMain.removeHandler('prompt-popup:submit')
  ipcMain.removeAllListeners('open-model-selector')
}