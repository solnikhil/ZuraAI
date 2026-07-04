import type { ClickArgs, CursorPositionArgs, ScrollArgs } from './types'

function parseFiniteNumber(value: unknown, name: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: expected a finite number`)
  }

  return parsed
}

export function normalizeClickArgs(args: unknown): { args: ClickArgs; autoApprove: boolean } {
  const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  const button = r.button === 'right' || r.button === 'middle' ? r.button : ('left' as const)
  return {
    args: {
      x: parseFiniteNumber(r.x, 'x coordinate'),
      y: parseFiniteNumber(r.y, 'y coordinate'),
      button,
    },
    autoApprove: r.autoApprove === true,
  }
}

export function normalizeScrollArgs(args: unknown): { args: ScrollArgs; autoApprove: boolean } {
  const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  const dir = ['up', 'down', 'left', 'right'].includes(r.direction as string)
    ? (r.direction as ScrollArgs['direction'])
    : 'down'
  const amount = r.amount === undefined ? undefined : parseFiniteNumber(r.amount, 'scroll amount')
  return {
    args: {
      x: parseFiniteNumber(r.x, 'x coordinate'),
      y: parseFiniteNumber(r.y, 'y coordinate'),
      direction: dir,
      amount,
    },
    autoApprove: r.autoApprove === true,
  }
}

export function normalizeCursorArgs(args: unknown): {
  args: CursorPositionArgs
  autoApprove: boolean
} {
  const r = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
  return {
    args: {
      x: parseFiniteNumber(r.x, 'x coordinate'),
      y: parseFiniteNumber(r.y, 'y coordinate'),
    },
    autoApprove: r.autoApprove === true,
  }
}
