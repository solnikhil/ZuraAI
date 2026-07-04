import { createHash } from 'crypto'
import * as net from 'net'

const MAX_RESPONSE_BYTES = 2_000_000
const MAX_NORMALIZED_TEXT_LENGTH = 60_000
const LOOPBACK_HOSTS = new Set(['localhost'])
const BLOCKED_LOCAL_HOSTS = new Set(['0.0.0.0'])

function isLoopbackIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    parts[0] === 127
  )
}

function isLoopbackIpv6(hostname: string): boolean {
  return hostname.toLowerCase() === '::1'
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  const [a, b] = parts
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')
}

export function validateMonitorUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') {
    throw new Error('Monitor URL must be a string')
  }
  const trimmed = rawUrl.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('Monitor URL must be valid')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Monitor URL must use http or https')
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (BLOCKED_LOCAL_HOSTS.has(hostname) || hostname.endsWith('.local')) {
    throw new Error('Monitor URL cannot target local hosts')
  }
  if (LOOPBACK_HOSTS.has(hostname) || isLoopbackIpv4(hostname) || isLoopbackIpv6(hostname)) {
    parsed.hash = ''
    return parsed.toString()
  }
  const ipVersion = net.isIP(hostname)
  if (
    (ipVersion === 4 && isPrivateIpv4(hostname)) ||
    (ipVersion === 6 && isPrivateIpv6(hostname))
  ) {
    throw new Error('Monitor URL cannot target private network addresses')
  }
  parsed.hash = ''
  return parsed.toString()
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => {
      const value = Number(code)
      return Number.isFinite(value) ? String.fromCharCode(value) : ''
    })
}

export function normalizePageContent(rawContent: string, contentType = 'text/html'): string {
  const isHtml = /html/i.test(contentType)
  let text = rawContent
  if (isHtml) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(nav|footer|header|aside|form|svg|canvas)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  }

  return decodeHtmlEntities(text)
    .split(/\r?\n|[.!?]\s+/)
    .map((line) =>
      line
        .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM)?\b/gi, '')
        .replace(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/g, '')
        .replace(
          /\b(cookie|cookies|privacy policy|terms of service|subscribe to newsletter)\b/gi,
          ''
        )
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.length >= 20)
    .join('\n')
    .slice(0, MAX_NORMALIZED_TEXT_LENGTH)
}

export function hashNormalizedContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export function buildChangedExcerpt(previous: string | undefined, current: string): string {
  const previousLines = new Set(
    (previous || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  )
  const newLines = current
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !previousLines.has(line))
  return (newLines.length > 0 ? newLines : current.split('\n'))
    .slice(0, 8)
    .join('\n')
    .slice(0, 2000)
}

export async function fetchMonitorPage(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ normalizedText: string; contentHash: string; excerpt: string }> {
  const response = await fetchImpl(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'ZuraAI-WebMonitor/1.0',
      accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1',
    },
  })
  if (!response.ok) {
    throw new Error(`Fetch failed with HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType && !/(text\/html|text\/plain|application\/xhtml\+xml)/i.test(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}`)
  }
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('Page is too large to monitor')
  }
  const rawContent = await response.text()
  if (rawContent.length > MAX_RESPONSE_BYTES) {
    throw new Error('Page is too large to monitor')
  }
  const normalizedText = normalizePageContent(rawContent, contentType)
  if (!normalizedText) {
    throw new Error('No monitorable text found')
  }
  return {
    normalizedText,
    contentHash: hashNormalizedContent(normalizedText),
    excerpt: normalizedText.slice(0, 2000),
  }
}
