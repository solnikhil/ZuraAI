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

export function missingResponseBodyError(provider: string): ProviderError {
  return new ProviderError({
    provider,
    code: 'invalid_response',
    message: `${provider} streaming response did not include a body.`,
    retryable: false,
  })
}
