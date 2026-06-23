import { app } from 'electron'
import * as fs from 'fs/promises'
import path from 'path'

import { getMainWindow, createMainWindow } from './windows'

export interface ExternalChatMessageRequest {
  sessionId: string
  message: string
  receivedAt: number
}

const CHAT_LINK_MESSAGE_CHANNEL = 'chat-links:message'
const MAX_DEEP_LINK_MESSAGE_LENGTH = 20_000
const TRACE_FILE_NAME = 'chat-link-events.jsonl'

const pendingRequests: ExternalChatMessageRequest[] = []
let deliveryRetryScheduled = false

function traceChatLinkEvent(event: string, details: Record<string, unknown> = {}): void {
  const filePath = path.join(app.getPath('userData'), TRACE_FILE_NAME)
  const record = {
    timestamp: new Date().toISOString(),
    event,
    pendingCount: pendingRequests.length,
    ...details,
  }
  fs.appendFile(filePath, `${JSON.stringify(record)}\n`).catch(() => undefined)
}

function decodeBase64Url(value: string): string {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).toLowerCase()
}

function getSessionIdFromUrl(parsed: URL): string {
  const authorityAndPath = `${parsed.host}${parsed.pathname || ''}`
  return decodeURIComponent(authorityAndPath)
    .replace(/^\/+|\/+$/g, '')
    .trim()
}

export function parseZuraChatMessageUrl(input: string): ExternalChatMessageRequest | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    traceChatLinkEvent('parse-rejected', { reason: 'invalid-url' })
    return null
  }

  if (parsed.protocol !== 'zura-chat:') {
    traceChatLinkEvent('parse-rejected', { reason: 'wrong-protocol', protocol: parsed.protocol })
    return null
  }

  const sessionId = getSessionIdFromUrl(parsed)
  if (!sessionId) {
    traceChatLinkEvent('parse-rejected', { reason: 'missing-session' })
    return null
  }

  const encodedUserData = parsed.searchParams.get('userData')
  if (!encodedUserData) {
    traceChatLinkEvent('parse-rejected', { reason: 'missing-user-data', sessionId })
    return null
  }

  let decodedUserData: string
  try {
    decodedUserData = decodeBase64Url(encodedUserData)
  } catch {
    traceChatLinkEvent('parse-rejected', { reason: 'invalid-user-data', sessionId })
    return null
  }

  if (
    normalizePathForCompare(decodedUserData) !== normalizePathForCompare(app.getPath('userData'))
  ) {
    traceChatLinkEvent('parse-rejected', {
      reason: 'user-data-mismatch',
      sessionId,
      decodedUserData,
      currentUserData: app.getPath('userData'),
    })
    return null
  }

  const encodedMessage = parsed.searchParams.get('messageBase64')
  const rawMessage = encodedMessage
    ? decodeBase64Url(encodedMessage)
    : parsed.searchParams.get('message')
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : ''
  if (!message) {
    traceChatLinkEvent('parse-rejected', { reason: 'missing-message', sessionId })
    return null
  }

  traceChatLinkEvent('parse-accepted', { sessionId, messageLength: message.length })
  return {
    sessionId,
    message: message.slice(0, MAX_DEEP_LINK_MESSAGE_LENGTH),
    receivedAt: Date.now(),
  }
}

function deliverPendingRequests(): void {
  const window = getMainWindow()
  if (!window || window.isDestroyed()) {
    traceChatLinkEvent('deliver-skipped', { reason: 'no-window' })
    return
  }
  if (pendingRequests.length === 0) {
    traceChatLinkEvent('deliver-skipped', { reason: 'empty-queue' })
    return
  }
  if (window.webContents.isLoading()) {
    traceChatLinkEvent('deliver-deferred', { reason: 'window-loading' })
    if (!deliveryRetryScheduled) {
      deliveryRetryScheduled = true
      window.webContents.once('did-stop-loading', () => {
        deliveryRetryScheduled = false
        deliverPendingRequests()
      })
      setTimeout(() => {
        if (!deliveryRetryScheduled) return
        deliveryRetryScheduled = false
        deliverPendingRequests()
      }, 500)
    }
    return
  }

  const requests = [...pendingRequests]
  traceChatLinkEvent('deliver', { requestCount: requests.length })
  for (const request of requests) {
    window.webContents.send(CHAT_LINK_MESSAGE_CHANNEL, request)
  }
}

function showMainWindowAndDeliver(): void {
  const window = getMainWindow() ?? createMainWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()

  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', deliverPendingRequests)
  } else {
    deliverPendingRequests()
  }
}

export function consumePendingChatLinkRequests(): ExternalChatMessageRequest[] {
  traceChatLinkEvent('consume', { requestCount: pendingRequests.length })
  return pendingRequests.splice(0, pendingRequests.length)
}

export function peekPendingChatLinkRequests(): ExternalChatMessageRequest[] {
  traceChatLinkEvent('peek', { requestCount: pendingRequests.length })
  return [...pendingRequests]
}

export function handleZuraChatMessageUrl(url: string): boolean {
  const request = parseZuraChatMessageUrl(url)
  if (!request) {
    traceChatLinkEvent('handle-rejected')
    return false
  }

  pendingRequests.push(request)
  traceChatLinkEvent('handle-queued', { sessionId: request.sessionId })

  if (!app.isReady()) {
    traceChatLinkEvent('handle-wait-ready')
    void app.whenReady().then(showMainWindowAndDeliver)
    return true
  }

  showMainWindowAndDeliver()
  return true
}

export function registerZuraChatProtocolHandlers(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    const appArg = path.resolve(process.argv[1])
    const registered = app.setAsDefaultProtocolClient('zura-chat', process.execPath, [appArg])
    traceChatLinkEvent('protocol-register', {
      mode: 'default-app',
      registered,
      execPath: process.execPath,
      appArg,
    })
  } else {
    const registered = app.setAsDefaultProtocolClient('zura-chat')
    traceChatLinkEvent('protocol-register', { mode: 'packaged', registered })
  }

  app.on('open-url', (event, url) => {
    event.preventDefault()
    traceChatLinkEvent('open-url')
    handleZuraChatMessageUrl(url)
  })

  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find((arg) => arg.startsWith('zura-chat://'))
    traceChatLinkEvent('second-instance', { hasUrl: Boolean(url), argCount: commandLine.length })
    if (url) {
      handleZuraChatMessageUrl(url)
      return
    }

    const window = getMainWindow()
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
}
