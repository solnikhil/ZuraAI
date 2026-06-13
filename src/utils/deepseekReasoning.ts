/**
 * Pure helpers for per-model DeepSeek reasoning ("thinking mode") preferences.
 *
 * The user's explicit per-model toggle (set in Provider Hub) is the source of
 * truth — we do NOT infer thinking capability for DeepSeek. Effort is a fixed,
 * documented DeepSeek contract (`high` | `max`).
 */
import type { DeepSeekReasoningEffort } from '../contexts/SettingsConfigContext'

export const DEEPSEEK_REASONING_EFFORTS: readonly DeepSeekReasoningEffort[] = ['high', 'max']

export function isDeepSeekReasoningEffort(value: unknown): value is DeepSeekReasoningEffort {
  return value === 'high' || value === 'max'
}

export interface DeepSeekReasoningState {
  enabled: boolean
  effort: DeepSeekReasoningEffort
}

type DeepseekReasoningSettings = {
  deepseekReasoning?: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }>
  deepseekLastEffort?: DeepSeekReasoningEffort
}

/**
 * Resolve the reasoning state for a DeepSeek model. When no entry exists,
 * reasoning is disabled and the default effort is the user's last pick (or
 * `high`).
 */
export function getDeepseekReasoning(
  settings: DeepseekReasoningSettings,
  modelCode: string
): DeepSeekReasoningState {
  const fallbackEffort: DeepSeekReasoningEffort = isDeepSeekReasoningEffort(settings.deepseekLastEffort)
    ? settings.deepseekLastEffort
    : 'high'

  const entry = settings.deepseekReasoning?.[modelCode]
  if (!entry) {
    return { enabled: false, effort: fallbackEffort }
  }

  return {
    enabled: entry.enabled === true,
    effort: isDeepSeekReasoningEffort(entry.effort) ? entry.effort : fallbackEffort,
  }
}

/**
 * Produce a settings patch that toggles reasoning enablement for a model while
 * preserving its existing effort (defaulting to the last-picked effort).
 */
export function setDeepseekReasoningEnabled(
  settings: DeepseekReasoningSettings,
  modelCode: string,
  enabled: boolean
): Pick<DeepseekReasoningSettings, 'deepseekReasoning'> {
  const current = getDeepseekReasoning(settings, modelCode)
  return {
    deepseekReasoning: {
      ...(settings.deepseekReasoning ?? {}),
      [modelCode]: { enabled, effort: current.effort },
    },
  }
}

/**
 * Produce a settings patch that sets the reasoning effort for a model (keeping
 * it enabled) and records it as the global last-picked effort.
 */
export function setDeepseekReasoningEffort(
  settings: DeepseekReasoningSettings,
  modelCode: string,
  effort: DeepSeekReasoningEffort
): Required<Pick<DeepseekReasoningSettings, 'deepseekReasoning' | 'deepseekLastEffort'>> {
  return {
    deepseekReasoning: {
      ...(settings.deepseekReasoning ?? {}),
      [modelCode]: { enabled: true, effort },
    },
    deepseekLastEffort: effort,
  }
}

/**
 * Normalize a stored `deepseekReasoning` map, dropping malformed entries.
 */
export function normalizeDeepseekReasoning(
  value: unknown
): Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  const result: Record<string, { enabled: boolean; effort: DeepSeekReasoningEffort }> = {}
  for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'object' || entry === null) continue
    const { enabled, effort } = entry as { enabled?: unknown; effort?: unknown }
    if (typeof enabled !== 'boolean') continue
    if (!isDeepSeekReasoningEffort(effort)) continue
    result[code] = { enabled, effort }
  }
  return result
}
