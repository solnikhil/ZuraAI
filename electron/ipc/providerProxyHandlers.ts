import { ipcMain } from 'electron'
import type { ProviderProxyFetchRequest, ProviderProxyFetchResponse } from '../../src/electron/types'

const OPENCODE_ORIGIN = 'https://opencode.ai'
const OPENCODE_PATH_PREFIX = '/zen/go/'
const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const ALLOWED_METHODS = new Set(['GET', 'POST'])
const ALLOWED_HEADERS = new Set(['authorization', 'content-type', 'accept'])

function getHeaderByteLength(headers: Record<string, string>): number {
  return Object.entries(headers).reduce(
    (total, [key, value]) => total + Buffer.byteLength(key) + Buffer.byteLength(value),
    0
  )
}

function sanitizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {}

  const sanitized: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(headers as Record<string, unknown>)) {
    const key = rawKey.toLowerCase()
    if (!ALLOWED_HEADERS.has(key) || typeof rawValue !== 'string') continue
    sanitized[rawKey] = rawValue
  }

  return sanitized
}

function validateOpencodeUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('OpenCode Go request URL must be a string.')
  }

  const parsed = new URL(value)
  if (parsed.origin !== OPENCODE_ORIGIN || !parsed.pathname.startsWith(OPENCODE_PATH_PREFIX)) {
    throw new Error('OpenCode Go proxy only allows the official opencode.ai/zen/go API path.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('OpenCode Go request URL must not include credentials.')
  }

  return parsed.toString()
}

function sanitizeRequest(input: unknown): {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
} {
  if (!input || typeof input !== 'object') {
    throw new Error('OpenCode Go proxy request must be an object.')
  }

  const request = input as Partial<ProviderProxyFetchRequest>
  const method = String(request.method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error('OpenCode Go proxy only allows GET and POST requests.')
  }

  const body = request.body
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('OpenCode Go proxy request body must be a string.')
  }
  if (body && Buffer.byteLength(body) > MAX_REQUEST_BODY_BYTES) {
    throw new Error('OpenCode Go proxy request body is too large.')
  }

  const headers = sanitizeHeaders(request.headers)
  if (getHeaderByteLength(headers) > 16 * 1024) {
    throw new Error('OpenCode Go proxy request headers are too large.')
  }

  return {
    url: validateOpencodeUrl(request.url),
    method: method as 'GET' | 'POST',
    headers,
    body,
  }
}

export function registerProviderProxyHandlers(): void {
  ipcMain.handle('provider-proxy:opencode-fetch', async (_event, input: unknown) => {
    const request = sanitizeRequest(input)
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' ? undefined : request.body,
    })

    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      body: await response.text(),
    } satisfies ProviderProxyFetchResponse
  })
}

export function unregisterProviderProxyHandlers(): void {
  ipcMain.removeHandler('provider-proxy:opencode-fetch')
}
