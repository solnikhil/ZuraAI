/**
 * Centralized OpenRouter API key resolution from settings.
 */

export function getOpenRouterApiKey(settingsKey?: string): string {
  return (settingsKey ?? '').trim()
}
