import { calculateNextRunAt } from './schedule'
import type { MonitorIntervalPreset } from './types'

/** Minimum delay the agent may request between automation runs. */
export const AGENT_NEXT_RUN_MIN_MS = 60 * 1000

/** Maximum delay the agent may request between automation runs. */
export const AGENT_NEXT_RUN_MAX_MS = 7 * 24 * 60 * 60 * 1000

/** Marker the automation model should append when it owns the cadence. */
export const AGENT_NEXT_RUN_MARKER_RE =
  /\[\[\s*next_run\s*:\s*([^\]]+?)\s*\]\]/gi

export type AgentNextRunDecision =
  | { kind: 'delay'; nextRunAt: number }
  | { kind: 'done' }
  | { kind: 'none' }

function parseRelativeDelayMs(token: string): number | null {
  const normalized = token.trim().toLowerCase()
  const match = normalized.match(/^\+?\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|min|mins|minute|minutes|hr|hrs|hour|hours|day|days)?$/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return null
  const unit = match[2] || 'm'
  switch (unit) {
    case 'ms':
      return amount
    case 's':
      return amount * 1000
    case 'm':
    case 'min':
    case 'mins':
    case 'minute':
    case 'minutes':
      return amount * 60 * 1000
    case 'h':
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      return amount * 60 * 60 * 1000
    case 'd':
    case 'day':
    case 'days':
      return amount * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

export function clampAgentNextRunAt(fromMs: number, candidateMs: number): number {
  const minAt = fromMs + AGENT_NEXT_RUN_MIN_MS
  const maxAt = fromMs + AGENT_NEXT_RUN_MAX_MS
  if (!Number.isFinite(candidateMs)) return minAt
  return Math.min(maxAt, Math.max(minAt, Math.round(candidateMs)))
}

export function stripAgentNextRunMarkers(text: string): string {
  return text.replace(AGENT_NEXT_RUN_MARKER_RE, '').replace(/[ \t]+\n/g, '\n').trim()
}

/**
 * Parse the last [[next_run:...]] marker from automation output.
 * Accepts relative (+30m, 2h, 1d), absolute epoch ms / ISO timestamps, or done/pause/stop.
 */
export function parseAgentNextRunDecision(
  text: string | undefined,
  fromMs: number
): AgentNextRunDecision {
  if (!text) return { kind: 'none' }
  let last: string | null = null
  const re = new RegExp(AGENT_NEXT_RUN_MARKER_RE.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    last = match[1]?.trim() ?? null
  }
  if (!last) return { kind: 'none' }

  const token = last.toLowerCase()
  if (
    token === 'done' ||
    token === 'pause' ||
    token === 'stop' ||
    token === 'complete' ||
    token === 'finished' ||
    token === 'never'
  ) {
    return { kind: 'done' }
  }

  const relative = parseRelativeDelayMs(last)
  if (relative !== null) {
    return { kind: 'delay', nextRunAt: clampAgentNextRunAt(fromMs, fromMs + relative) }
  }

  const asNumber = Number(last)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const absolute = asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber
    return { kind: 'delay', nextRunAt: clampAgentNextRunAt(fromMs, absolute) }
  }

  const parsedDate = Date.parse(last)
  if (Number.isFinite(parsedDate)) {
    return { kind: 'delay', nextRunAt: clampAgentNextRunAt(fromMs, parsedDate) }
  }

  return { kind: 'none' }
}

export function resolveAgentOwnedNextRunAt(options: {
  fromMs: number
  intervalPreset: MonitorIntervalPreset
  nextRunAt?: number
  nextRunInMs?: number
  complete?: boolean
  outputText?: string
}): { nextRunAt: number; enabled: boolean; cleanedOutputText?: string } {
  const cleanedOutputText =
    typeof options.outputText === 'string'
      ? stripAgentNextRunMarkers(options.outputText)
      : undefined

  if (options.complete === true) {
    return {
      nextRunAt: options.fromMs,
      enabled: false,
      ...(cleanedOutputText !== undefined ? { cleanedOutputText } : {}),
    }
  }

  if (typeof options.nextRunAt === 'number' && Number.isFinite(options.nextRunAt)) {
    return {
      nextRunAt: clampAgentNextRunAt(options.fromMs, options.nextRunAt),
      enabled: true,
      ...(cleanedOutputText !== undefined ? { cleanedOutputText } : {}),
    }
  }

  if (typeof options.nextRunInMs === 'number' && Number.isFinite(options.nextRunInMs)) {
    return {
      nextRunAt: clampAgentNextRunAt(options.fromMs, options.fromMs + options.nextRunInMs),
      enabled: true,
      ...(cleanedOutputText !== undefined ? { cleanedOutputText } : {}),
    }
  }

  const fromText = parseAgentNextRunDecision(options.outputText, options.fromMs)
  if (fromText.kind === 'done') {
    return {
      nextRunAt: options.fromMs,
      enabled: false,
      ...(cleanedOutputText !== undefined ? { cleanedOutputText } : {}),
    }
  }
  if (fromText.kind === 'delay') {
    return {
      nextRunAt: fromText.nextRunAt,
      enabled: true,
      ...(cleanedOutputText !== undefined ? { cleanedOutputText } : {}),
    }
  }

  // Fallback when the model forgot to propose a next run.
  return {
    nextRunAt: calculateNextRunAt(options.fromMs, options.intervalPreset),
    enabled: true,
    ...(cleanedOutputText !== undefined ? { cleanedOutputText } : {}),
  }
}
