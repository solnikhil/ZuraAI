/**
 * Centralized OpenRouter API key resolution.
 * Uses settings key first, then falls back to VITE_OPENROUTER_API_KEY env var.
 */

export function getOpenRouterApiKey(settingsKey?: string): string {
  const fromSettings = (settingsKey ?? '').trim()
  if (fromSettings) return fromSettings
  const fromEnv = (import.meta.env.VITE_OPENROUTER_API_KEY ?? '').trim()
  return fromEnv
}
