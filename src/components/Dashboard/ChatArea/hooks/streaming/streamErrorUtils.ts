import {
  getProviderCredentialError,
  getProviderDefinition,
  type ProviderSettingsLike,
} from '../../../../../providers'

export function formatProviderStreamError(
  error: unknown,
  provider: string,
  settings: ProviderSettingsLike
): { message: string; tone: 'error' | 'warning' } {
  const providerLabel = getProviderDefinition(provider).label
  const rawMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'

  if (rawMessage.includes('429') || rawMessage.toLowerCase().includes('rate limit')) {
    return {
      message: `${providerLabel} is rate limiting or overloaded. Try again in a moment or switch models.`,
      tone: 'warning',
    }
  }

  if (rawMessage.includes('502') || rawMessage.toLowerCase().includes('bad gateway')) {
    return {
      message: `${providerLabel} returned 502 Bad Gateway before streaming started. This is usually an upstream route/provider failure, not a token rendering issue. Retry, switch models, or disable tools/web search for this turn.`,
      tone: 'warning',
    }
  }

  if (rawMessage.includes('401') || rawMessage.includes('403')) {
    return {
      message: `${providerLabel} credentials look invalid. Check the provider settings and save again.`,
      tone: 'error',
    }
  }

  if (
    rawMessage.toLowerCase().includes('network') ||
    rawMessage.toLowerCase().includes('fetch') ||
    rawMessage.toLowerCase().includes('failed to fetch')
  ) {
    return {
      message: `Network error while contacting ${providerLabel}. Check connectivity or proxy settings.`,
      tone: 'error',
    }
  }

  if (
    provider === 'openrouter' &&
    rawMessage.toLowerCase().includes('no endpoints found that support tool use')
  ) {
    return {
      message:
        'This OpenRouter model route does not support tool calling. Switch to a model with Tool Calling support or disable Web Research/web_search for this chat.',
      tone: 'warning',
    }
  }

  if (
    rawMessage.toLowerCase().includes('missing') ||
    rawMessage.toLowerCase().includes('api key')
  ) {
    return {
      message:
        getProviderCredentialError(settings, provider) ||
        `${providerLabel} credentials are required. Add them in Settings > Providers and save.`,
      tone: 'error',
    }
  }

  return {
    message: `Error from ${providerLabel}: ${rawMessage}`,
    tone: 'error',
  }
}
