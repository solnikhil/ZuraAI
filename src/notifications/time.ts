const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatRelativeTimestamp(timestamp: number, now: number = Date.now()): string {
  const diffMs = timestamp - now
  const absMs = Math.abs(diffMs)

  if (absMs < 60_000) {
    const seconds = Math.round(diffMs / 1_000)
    return rtf.format(seconds, 'second')
  }

  if (absMs < 3_600_000) {
    const minutes = Math.round(diffMs / 60_000)
    return rtf.format(minutes, 'minute')
  }

  if (absMs < 86_400_000) {
    const hours = Math.round(diffMs / 3_600_000)
    return rtf.format(hours, 'hour')
  }

  const days = Math.round(diffMs / 86_400_000)
  return rtf.format(days, 'day')
}
