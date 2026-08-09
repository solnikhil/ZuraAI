import { ProviderError, parseRetryAfterMs, providerErrorCodeForStatus } from '@zura/provider-core'
import { parseErrorResponse } from './types'

const MAX_ERROR_MESSAGE_LENGTH = 2_000

function firstHeader(response: Response, names: string[]): string | undefined {
  const headers = (response as Response & { headers?: Headers }).headers
  if (!headers) return undefined

  for (const name of names) {
    const value = headers.get(name)?.trim()
    if (value) return value
  }
  return undefined
}

export async function createProviderHttpError(
  provider: string,
  response: Response,
  fallbackLabel: string
): Promise<ProviderError> {
  const body = await response.text().catch(() => '')
  const parsed = parseErrorResponse(body)
  const providerMessage = parsed.error?.message ?? parsed.detail
  const message = (providerMessage || response.statusText || fallbackLabel)
    .trim()
    .slice(0, MAX_ERROR_MESSAGE_LENGTH)

  return new ProviderError({
    provider,
    code: providerErrorCodeForStatus(response.status),
    message: `${fallbackLabel} (${response.status}): ${message}`,
    status: response.status,
    requestId: firstHeader(response, [
      'x-request-id',
      'request-id',
      'x-dashscope-request-id',
      'x-groq-request-id',
    ]),
    retryAfterMs: parseRetryAfterMs(
      (response as Response & { headers?: Headers }).headers?.get('retry-after')
    ),
    retryable: response.status === 429 || response.status === 408 || response.status >= 500,
  })
}

/**
 * Socket/DNS level failure codes that mean "the request never reached the
 * provider", so replaying it is safe and usually succeeds.
 */
const TRANSIENT_TRANSPORT_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

function transportErrorCode(error: unknown): string | undefined {
  let current: unknown = error
  // undici nests the real errno one or two `cause` levels down.
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as Error & { code?: unknown }).code
    if (typeof code === 'string') return code
    current = (current as Error & { cause?: unknown }).cause
  }
  return undefined
}

/**
 * Classifies a `fetch` rejection that happened before any response arrived.
 *
 * `retryable` is only set for failures where no request was delivered. Aborts
 * and deterministic request/configuration errors stay non-retryable so a
 * cancelled or malformed request is never replayed.
 */
export function createProviderNetworkError(provider: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error

  // Read `name` structurally: `DOMException` is not reliably `instanceof Error`
  // across runtimes, so an instanceof-gated check would misclassify aborts as
  // unknown errors.
  const name =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : ''
  const message =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error)

  if (name === 'AbortError') {
    return new ProviderError({
      provider,
      code: 'aborted',
      message: `${provider} request was cancelled.`,
      retryable: false,
      cause: error,
    })
  }

  if (name === 'TimeoutError') {
    return new ProviderError({
      provider,
      code: 'timeout',
      message: `${provider} request timed out before a response.`,
      retryable: true,
      cause: error,
    })
  }

  const code = transportErrorCode(error)
  // `fetch` surfaces every transport failure as a TypeError; the concrete errno
  // is only present on the nested cause.
  const isTransportFailure =
    (code !== undefined && TRANSIENT_TRANSPORT_CODES.has(code)) || error instanceof TypeError

  if (isTransportFailure) {
    return new ProviderError({
      provider,
      code: 'network',
      message: `${provider} request failed before a response: ${message}`,
      retryable: true,
      cause: error,
    })
  }

  return new ProviderError({
    provider,
    code: 'unknown',
    message,
    retryable: false,
    cause: error,
  })
}

export function missingResponseBodyError(provider: string): ProviderError {
  return new ProviderError({
    provider,
    code: 'invalid_response',
    message: `${provider} streaming response did not include a body.`,
    retryable: false,
  })
}
