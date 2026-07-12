import { app, BrowserWindow } from 'electron'
import { trustedIpcMain as ipcMain } from './trustedIpc'

import {
  appendChatDiagnosticEvent,
  getChatDebugReference,
  readChatDiagnosticEvents,
  setChatDiagnosticBroadcaster,
} from '../chatDiagnostics'
import { consumePendingChatLinkRequests, peekPendingChatLinkRequests } from '../chatLinks'
import { showChatDebugWindow } from '../windows/chatDebugWindow'
import type { ChatDiagnosticEvent } from '../../src/diagnostics/chatDiagnostics'

/**
 * Broadcast a sanitized diagnostic event to every live renderer so the
 * dev-only debug window can update in real time without polling the JSONL file.
 */
function broadcastChatDiagnosticEvent(event: ChatDiagnosticEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue
    const contents = window.webContents
    if (!contents || contents.isDestroyed()) continue
    contents.send('chat-diagnostics:event', event)
  }
}

export function registerChatDiagnosticsHandlers(): void {
  ipcMain.handle('chat-diagnostics:append-event', async (_event, diagnosticEvent) => {
    return appendChatDiagnosticEvent(diagnosticEvent)
  })
  ipcMain.handle('chat-diagnostics:get-debug-reference', async (_event, sessionId) => {
    return getChatDebugReference(sessionId)
  })
  ipcMain.handle('chat-diagnostics:list-events', async (_event, sessionId) => {
    return readChatDiagnosticEvents(sessionId)
  })

  ipcMain.handle('chat-debug-window:open', async (_event, sessionId: unknown) => {
    if (app.isPackaged) return false
    if (typeof sessionId !== 'string' || !sessionId.trim()) return false
    const window = showChatDebugWindow(sessionId)
    return window !== null
  })
  ipcMain.handle('chat-links:consume-pending', async () => {
    return consumePendingChatLinkRequests()
  })
  ipcMain.handle('chat-links:peek-pending', async () => {
    return peekPendingChatLinkRequests()
  })

  setChatDiagnosticBroadcaster(broadcastChatDiagnosticEvent)
}

export function unregisterChatDiagnosticsHandlers(): void {
  ipcMain.removeHandler('chat-diagnostics:append-event')
  ipcMain.removeHandler('chat-diagnostics:get-debug-reference')
  ipcMain.removeHandler('chat-diagnostics:list-events')
  ipcMain.removeHandler('chat-debug-window:open')
  ipcMain.removeHandler('chat-links:consume-pending')
  ipcMain.removeHandler('chat-links:peek-pending')
  setChatDiagnosticBroadcaster(null)
}
