import {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import type { NativeContextMenuAction, NativeContextMenuRequest } from '../../src/electron/types'
import { trustedIpcMain as ipcMain } from './trustedIpc'

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function sanitizeContextMenuRequest(value: unknown): NativeContextMenuRequest | null {
  if (typeof value !== 'object' || value === null) return null
  const request = value as Record<string, unknown>
  const {
    hasSelection,
    isEditable,
    isContentEditable,
    hasLink,
    linkUrl,
    mouseX,
    mouseY,
    isDev,
    kind,
    isPinnedChatRow,
    isChatRowInFolder,
  } = request
  if (
    !isBoolean(hasSelection) ||
    !isBoolean(isEditable) ||
    !isBoolean(isContentEditable) ||
    !isBoolean(hasLink) ||
    typeof linkUrl !== 'string' ||
    typeof mouseX !== 'number' ||
    typeof mouseY !== 'number' ||
    !Number.isFinite(mouseX) ||
    !Number.isFinite(mouseY) ||
    !isBoolean(isDev) ||
    (kind !== undefined && kind !== 'default' && kind !== 'chat-row') ||
    (isPinnedChatRow !== undefined && !isBoolean(isPinnedChatRow)) ||
    (isChatRowInFolder !== undefined && !isBoolean(isChatRowInFolder))
  )
    return null
  return {
    hasSelection,
    isEditable,
    isContentEditable,
    hasLink,
    linkUrl,
    mouseX: Math.round(mouseX),
    mouseY: Math.round(mouseY),
    isDev,
    kind: kind === 'chat-row' ? 'chat-row' : 'default',
    isPinnedChatRow: isPinnedChatRow === true,
    isChatRowInFolder: isChatRowInFolder === true,
  }
}

function sendAction(win: BrowserWindow, action: NativeContextMenuAction): void {
  if (!win.isDestroyed()) win.webContents.send('context-menu:action', action)
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function registerNativeInteractionHandlers(): void {
  ipcMain.handle('clipboard:read-text', () => {
    try {
      return clipboard.readText()
    } catch {
      return ''
    }
  })

  ipcMain.handle('context-menu:show', async (event, request: unknown) => {
    if (process.platform !== 'darwin') return
    const win = BrowserWindow.fromWebContents(event.sender)
    const input = sanitizeContextMenuRequest(request)
    if (!win || !input) return
    const template: MenuItemConstructorOptions[] = []
    const showEditActions = input.isEditable || input.isContentEditable
    const linkUrl = input.hasLink ? safeHttpUrl(input.linkUrl) : null

    if (input.kind === 'chat-row') {
      template.push(
        { label: 'Rename', click: () => sendAction(win, 'chat-rename') },
        {
          label: input.isPinnedChatRow ? 'Unpin' : 'Pin',
          click: () => sendAction(win, input.isPinnedChatRow ? 'chat-unpin' : 'chat-pin'),
        },
        { label: 'Duplicate', click: () => sendAction(win, 'chat-duplicate') },
        ...(input.isChatRowInFolder
          ? [
              {
                label: 'Remove from Space',
                click: () => sendAction(win, 'chat-remove-from-folder'),
              },
            ]
          : []),
        { type: 'separator' },
        { label: 'Delete', click: () => sendAction(win, 'chat-delete') }
      )
    } else if (linkUrl) {
      template.push(
        {
          label: 'Open Link in Browser',
          click: () => {
            void shell.openExternal(linkUrl)
          },
        },
        { label: 'Copy Link Address', click: () => clipboard.writeText(linkUrl) },
        { type: 'separator' }
      )
    }

    if (input.kind === 'default' && showEditActions) {
      template.push(
        { label: 'Undo', click: () => sendAction(win, 'undo') },
        { label: 'Redo', click: () => sendAction(win, 'redo') },
        { type: 'separator' },
        { label: 'Cut', enabled: input.hasSelection, click: () => sendAction(win, 'cut') },
        { label: 'Copy', enabled: input.hasSelection, click: () => sendAction(win, 'copy') },
        { label: 'Paste', click: () => sendAction(win, 'paste') },
        { type: 'separator' },
        { label: 'Select All', click: () => sendAction(win, 'select-all') }
      )
    } else if (input.kind === 'default' && input.hasSelection) {
      template.push(
        { label: 'Copy', click: () => sendAction(win, 'copy') },
        { type: 'separator' },
        { label: 'Select All', click: () => sendAction(win, 'select-all') }
      )
    } else if (input.kind === 'default') {
      template.push({ label: 'Select All', click: () => sendAction(win, 'select-all') })
    }

    if (!app.isPackaged && input.isDev) {
      template.push(
        { type: 'separator' },
        {
          label: 'Inspect Element',
          click: () => {
            if (!win.isDestroyed()) win.webContents.inspectElement(input.mouseX, input.mouseY)
          },
        }
      )
    }
    Menu.buildFromTemplate(template).popup({ window: win })
  })

  ipcMain.handle('native-dialog:confirm-delete-chat', async (event) => {
    if (process.platform !== 'darwin') return false
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'none' as const,
      buttons: ['Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      destructiveId: 0,
      message: 'Delete chat?',
      detail: 'This action cannot be undone. This will permanently delete this conversation.',
      noLink: true,
    }
    const result =
      win && !win.isDestroyed()
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
    return result.response === 0
  })
}

export function unregisterNativeInteractionHandlers(): void {
  ipcMain.removeHandler('clipboard:read-text')
  ipcMain.removeHandler('context-menu:show')
  ipcMain.removeHandler('native-dialog:confirm-delete-chat')
}
