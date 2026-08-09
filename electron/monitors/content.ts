import { createHash } from 'crypto'
import * as dns from 'dns'
import * as net from 'net'

const MAX_RESPONSE_BYTES = 2_000_000
const MAX_NORMALIZED_TEXT_LENGTH = 60_000
const MAX_REDIRECT_HOPS = 5
const FETCH_TIMEOUT_MS = 30_000
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

function isLinkLocalIpv6(hostname: string): boolean {
  return hostname.toLowerCase().startsWith('fe80')
}

function isUnsafeResolvedAddress(address: string): boolean {
  const ipVersion = net.isIP(address)
  if (ipVersion === 4) {
    return isPrivateIpv4(address) || isLoopbackIpv4(address)
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(address) || isLoopbackIpv6(address) || isLinkLocalIpv6(address)
  }
  return false
}

export async function validateResolvedAddresses(
  hostname: string,
  resolver: {
    resolve4: (hostname: string) => Promise<string[]>
    resolve6: (hostname: string) => Promise<string[]>
  } = dns.promises
): Promise<void> {
  const addresses: string[] = []
  try {
    const ipv4 = await resolver.resolve4(hostname)
    addresses.push(...ipv4)
  } catch {
    // No A records is fine
  }
  try {
    const ipv6 = await resolver.resolve6(hostname)
    addresses.push(...ipv6)
  } catch {
    // No AAAA records is fine
  }
  for (const addr of addresses) {
    if (isUnsafeResolvedAddress(addr)) {
      throw new Error(`DNS resolution for "${hostname}" returned private/loopback address: ${addr}`)
    }
  }
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

async function readResponseBodyBounded(response: Response, signal: AbortSignal): Promise<string> {
  const body = response.body
  if (!body) {
    return ''
  }
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let totalBytes = 0
  try {
    while (true) {
      if (signal.aborted) {
        throw new Error('Fetch aborted')
      }
      // Race the read against the abort signal to handle stuck streams
      const readResult = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(new Error('Fetch aborted'))
            return
          }
          const onAbort = () => reject(new Error('Fetch aborted'))
          signal.addEventListener('abort', onAbort, { once: true })
        }),
      ])
      const { done, value } = readResult
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error('Page is too large to monitor')
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  return chunks.join('')
}

function isExplicitLoopback(hostname: string): boolean {
  return (
    LOOPBACK_HOSTS.has(hostname.toLowerCase()) ||
    isLoopbackIpv4(hostname) ||
    isLoopbackIpv6(hostname.replace(/^\[|\]$/g, ''))
  )
}

export async function fetchMonitorPage(
  url: string,
  fetchImpl: typeof fetch = fetch,
  options?: {
    signal?: AbortSignal
    resolver?: {
      resolve4: (hostname: string) => Promise<string[]>
      resolve6: (hostname: string) => Promise<string[]>
    }
  }
): Promise<{ normalizedText: string; contentHash: string; excerpt: string }> {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS)

  const composedAbort = new AbortController()
  const onExternalAbort = () => composedAbort.abort()
  const onTimeoutAbort = () => composedAbort.abort()
  timeoutController.signal.addEventListener('abort', onTimeoutAbort)
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId)
      throw new Error('Fetch aborted')
    }
    options.signal.addEventListener('abort', onExternalAbort)
  }

  const resolver = options?.resolver ?? dns.promises

  try {
    let currentUrl = url
    let hops = 0

    while (true) {
      const parsed = new URL(currentUrl)
      const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()

      // Skip DNS resolution check for explicit loopback targets (allowed by validateMonitorUrl)
      if (!isExplicitLoopback(hostname) && !net.isIP(hostname)) {
        await validateResolvedAddresses(hostname, resolver)
      }

      const response = await fetchImpl(currentUrl, {
        redirect: 'manual',
        signal: composedAbort.signal,
        headers: {
          'user-agent': 'ZuraAI-WebMonitor/1.0',
          accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1',
        },
      })

      // Handle redirects manually
      const status = response.status
      if (status >= 300 && status < 400) {
        hops++
        if (hops > MAX_REDIRECT_HOPS) {
          throw new Error('Too many redirects')
        }
        const location = response.headers.get('location')
        if (!location) {
          throw new Error('Redirect response missing Location header')
        }
        // Resolve relative redirects against current URL
        const redirectUrl = new URL(location, currentUrl).toString()
        // Validate the redirect target (validateMonitorUrl allows loopback for direct use,
        // but redirects to private/loopback addresses must be blocked for SSRF protection)
        const validatedRedirect = validateMonitorUrl(redirectUrl)
        const redirectParsed = new URL(validatedRedirect)
        const redirectHost = redirectParsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
        if (isUnsafeResolvedAddress(redirectHost)) {
          throw new Error('Monitor URL cannot target private network addresses via redirect')
        }
        // Also validate DNS for the redirect target hostname
        if (!net.isIP(redirectHost) && !isExplicitLoopback(redirectHost)) {
          await validateResolvedAddresses(redirectHost, resolver)
        }
        currentUrl = validatedRedirect
        continue
      }

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

      const rawContent = await readResponseBodyBounded(response, composedAbort.signal)

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
  } finally {
    clearTimeout(timeoutId)
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort)
    if (options?.signal) {
      options.signal.removeEventListener('abort', onExternalAbort)
    }
  }
}
