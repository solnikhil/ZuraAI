/**
 * Pure helpers for per-model DeepSeek reasoning ("thinking mode") preferences.
 *
 * The user's explicit per-model toggle (set in Provider Hub) is the source of
 * truth — we do NOT infer thinking capability for DeepSeek. Effort is the
 * documented DeepSeek scale: `low` | `medium` | `high` | `xhigh`. Server-side
 * DeepSeek maps `low`/`medium` → `high` and `xhigh` → `max`; the legacy stored
 * value `max` is migrated to its equivalent `xhigh`.
 */
import type { DeepSeekReasoningEffort } from '../contexts/SettingsConfigContext'

export const DEEPSEEK_REASONING_EFFORTS: readonly DeepSeekReasoningEffort[] = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
]

/** Human-friendly labels for each effort level (the raw `xhigh` reads poorly). */
export const DEEPSEEK_REASONING_EFFORT_LABELS: Record<DeepSeekReasoningEffort, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Xhigh',
}

/** Resolve the display label for an effort value (falls back to the raw value). */
export function getReasoningEffortLabel(effort: DeepSeekReasoningEffort): string {
  return DEEPSEEK_REASONING_EFFORT_LABELS[effort] ?? effort
}

export function isDeepSeekReasoningEffort(value: unknown): value is DeepSeekReasoningEffort {
  return value === 'none' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
}

/**
 * Coerce a stored/legacy effort value into the current effort scale. The legacy
 * `max` value (used before the low→xhigh scale) maps to `xhigh`. Returns `null`
 * for unrecognized values so callers can fall back.
 */
export function coerceReasoningEffort(value: unknown): DeepSeekReasoningEffort | null {
  if (value === 'max') return 'xhigh'
  return isDeepSeekReasoningEffort(value) ? value : null
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
  const fallbackEffort: DeepSeekReasoningEffort =
    coerceReasoningEffort(settings.deepseekLastEffort) ?? 'high'

  const entry = settings.deepseekReasoning?.[modelCode]
  if (!entry) {
    return { enabled: false, effort: fallbackEffort }
  }

  return {
    enabled: entry.enabled === true,
    effort: coerceReasoningEffort(entry.effort) ?? fallbackEffort,
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
    const coerced = coerceReasoningEffort(effort)
    if (!coerced) continue
    result[code] = { enabled, effort: coerced }
  }
  return result
}
