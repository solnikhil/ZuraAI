import { app, BrowserWindow, screen } from 'electron'
import path from 'path'

import { resolveDistPath } from './mainWindow'
import { showOverlayAtPosition } from './overlayWindow'

const POPUP_WIDTH = 500
const POPUP_HEIGHT = 236
const POPUP_MARGIN = 10

let promptPopup: BrowserWindow | null = null

function clampToWorkArea(x: number, y: number, width: number, height: number) {
  const display = screen.getDisplayNearestPoint({ x, y })
  const workArea = display.workArea

  const clampedX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width - POPUP_MARGIN))
  const clampedY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height - POPUP_MARGIN))

  return { x: clampedX, y: clampedY }
}

function createPromptPopup(cursorX: number, cursorY: number): BrowserWindow {
  if (promptPopup && !promptPopup.isDestroyed()) {
    promptPopup.destroy()
    promptPopup = null
  }

  const distPath = resolveDistPath(__dirname)
  const { x, y } = clampToWorkArea(
    cursorX - POPUP_WIDTH / 2,
    cursorY - Math.round(POPUP_HEIGHT / 2),
    POPUP_WIDTH,
    POPUP_HEIGHT
  )

  promptPopup = new BrowserWindow({
    x,
    y,
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    minWidth: 480,
    minHeight: POPUP_HEIGHT,
    maxWidth: 640,
    maxHeight: POPUP_HEIGHT,
    title: 'ZuraAI Prompt',
    icon: path.join(process.env.PUBLIC || '', 'icon.png'),
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    focusable: true,
    backgroundMaterial: 'none',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: true,
      backgroundThrottling: false,
      additionalArguments: ['--process-name=ZuraAI-PromptPopup'],
    },
  })

  promptPopup.setAlwaysOnTop(true, 'floating')

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? promptPopup.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/prompt-popup`)
    : promptPopup.loadFile(path.join(distPath, 'index.html'), { hash: 'prompt-popup' })

  void loadPromise.catch((error) => {
    console.error('[PROMPT-POPUP] Failed to load prompt popup window:', error)
  })

  promptPopup.on('blur', () => {
    hidePromptPopup()
  })

  promptPopup.on('closed', () => {
    promptPopup = null
  })

  return promptPopup
}

export function showPromptPopup(): void {
  const { x: cursorX, y: cursorY } = screen.getCursorScreenPoint()

  if (promptPopup && !promptPopup.isDestroyed()) {
    const { x, y } = clampToWorkArea(
      cursorX - POPUP_WIDTH / 2,
      cursorY - Math.round(POPUP_HEIGHT / 2),
      POPUP_WIDTH,
      POPUP_HEIGHT
    )
    promptPopup.setBounds({ x, y, width: POPUP_WIDTH, height: POPUP_HEIGHT })
    promptPopup.show()
    promptPopup.focus()
    promptPopup.webContents.send('prompt-popup:focus')
    return
  }

  const win = createPromptPopup(cursorX, cursorY)
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
}

export function hidePromptPopup(): void {
  if (promptPopup && !promptPopup.isDestroyed()) {
    promptPopup.hide()
  }
}

export function destroyPromptPopup(): void {
  if (promptPopup && !promptPopup.isDestroyed()) {
    promptPopup.destroy()
  }
  promptPopup = null
}

export async function submitPrompt(prompt: string): Promise<void> {
  if (!prompt.trim()) {
    hidePromptPopup()
    return
  }

  const popupBounds =
    promptPopup && !promptPopup.isDestroyed()
      ? promptPopup.getBounds()
      : null

  const fallbackCursorPoint = screen.getCursorScreenPoint()
  const anchorX = popupBounds ? popupBounds.x + Math.round(popupBounds.width / 2) : fallbackCursorPoint.x
  const anchorY = popupBounds ? popupBounds.y + popupBounds.height : fallbackCursorPoint.y

  hidePromptPopup()

  const overlayWin = await showOverlayAtPosition(anchorX, anchorY, popupBounds ?? undefined)
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('overlay:pending-prompt', prompt)
  }
}

export function getPromptPopupWindow(): BrowserWindow | null {
  return promptPopup && !promptPopup.isDestroyed() ? promptPopup : null
}
