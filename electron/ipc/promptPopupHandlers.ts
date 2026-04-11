import { ipcMain } from 'electron'

import { showPromptPopup, hidePromptPopup, submitPrompt } from '../windows/promptPopup'

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
}

export function unregisterPromptPopupHandlers(): void {
  ipcMain.removeHandler('prompt-popup:show')
  ipcMain.removeHandler('prompt-popup:hide')
  ipcMain.removeHandler('prompt-popup:submit')
}