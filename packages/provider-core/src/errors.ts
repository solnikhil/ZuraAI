export type ProviderErrorCode =
  | 'aborted'
  | 'authentication'
  | 'bad_request'
  | 'invalid_response'
  | 'invalid_tool_call'
  | 'network'
  | 'not_found'
  | 'rate_limit'
  | 'response_too_large'
  | 'server_error'
  | 'timeout'
  | 'unknown'

export interface ProviderErrorOptions {
  provider: string
  code: ProviderErrorCode
  message: string
  status?: number
  requestId?: string
  retryAfterMs?: number
  retryable?: boolean
  partialResponse?: boolean
  cause?: unknown
  metadata?: Record<string, unknown>
}

export interface SerializedProviderError extends Omit<ProviderErrorOptions, 'cause'> {
  name: 'ProviderError'
}

export class ProviderError extends Error {
  readonly provider: string
  readonly code: ProviderErrorCode
  readonly status?: number
  readonly requestId?: string
  readonly retryAfterMs?: number
  readonly retryable: boolean
  readonly partialResponse: boolean
  readonly metadata?: Record<string, unknown>

  constructor(options: ProviderErrorOptions) {
    super(options.message, { cause: options.cause })
    this.name = 'ProviderError'
    this.provider = options.provider
    this.code = options.code
    this.status = options.status
    this.requestId = options.requestId
    this.retryAfterMs = options.retryAfterMs
    this.retryable = options.retryable ?? false
    this.partialResponse = options.partialResponse ?? false
    this.metadata = options.metadata
  }

  serialize(): SerializedProviderError {
    return {
      name: 'ProviderError',
      provider: this.provider,
      code: this.code,
      message: this.message,
      status: this.status,
      requestId: this.requestId,
      retryAfterMs: this.retryAfterMs,
      retryable: this.retryable,
      partialResponse: this.partialResponse,
      metadata: this.metadata,
    }
  }
}

export function providerErrorCodeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return 'authentication'
  if (status === 404) return 'not_found'
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate_limit'
  if (status >= 400 && status < 500) return 'bad_request'
  if (status >= 500) return 'server_error'
  return 'unknown'
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)

  const dateMs = Date.parse(value)
  if (!Number.isFinite(dateMs)) return undefined
  return Math.max(0, dateMs - now)
}

export function toProviderError(error: unknown, provider: string): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new ProviderError({
      provider,
      code: 'timeout',
      message: `${provider} request timed out.`,
      retryable: true,
      cause: error,
    })
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ProviderError({
      provider,
      code: 'aborted',
      message: `${provider} request was cancelled.`,
      retryable: false,
      cause: error,
    })
  }
  return new ProviderError({
    provider,
    code: 'unknown',
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  })
}
