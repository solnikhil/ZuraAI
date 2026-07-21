/** Keep in sync with electron/monitors/agentNextRun.ts */

export const AGENT_NEXT_RUN_MARKER_RE = /\[\[\s*next_run\s*:\s*([^\]]+?)\s*\]\]/gi

export const AGENT_NEXT_RUN_MIN_MS = 60 * 1000
export const AGENT_NEXT_RUN_MAX_MS = 7 * 24 * 60 * 60 * 1000

export type ParsedAgentNextRun =
  | { kind: 'delay'; nextRunInMs?: number; nextRunAt?: number }
  | { kind: 'done' }
  | { kind: 'none' }

function parseRelativeDelayMs(token: string): number | null {
  const normalized = token.trim().toLowerCase()
  const match = normalized.match(
    /^\+?\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|min|mins|minute|minutes|hr|hrs|hour|hours|day|days)?$/
  )
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

export function stripAgentNextRunMarkers(text: string): string {
  return text.replace(AGENT_NEXT_RUN_MARKER_RE, '').replace(/[ \t]+\n/g, '\n').trim()
}

export function parseAgentNextRunFromOutput(text: string): ParsedAgentNextRun {
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
    return { kind: 'delay', nextRunInMs: relative }
  }

  const asNumber = Number(last)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    const absolute = asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber
    return { kind: 'delay', nextRunAt: absolute }
  }

  const parsedDate = Date.parse(last)
  if (Number.isFinite(parsedDate)) {
    return { kind: 'delay', nextRunAt: parsedDate }
  }

  return { kind: 'none' }
}

export const AGENT_OWNED_SCHEDULE_PROMPT = [
  'You own the run cadence for this automation (no fixed interval is imposed).',
  'After producing the deliverable, append exactly one marker on its own line:',
  '  [[next_run:+30m]]   relative delay (m/h/d also work: +2h, +1d)',
  '  [[next_run:2026-07-21T15:00:00Z]]   absolute ISO time',
  '  [[next_run:done]]    stop further automatic runs',
  'Choose a sensible next check based on the task (news can be frequent; slow-changing topics can wait hours or days).',
  'Do not mention the marker or scheduling internals in the user-facing prose above it.',
].join('\n')
