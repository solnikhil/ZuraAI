/**
 * Formats a timestamp into a compact relative time string.
 *
 * Returns:
 * - "Just now" for timestamps less than 1 minute ago
 * - "{n}m" for timestamps 1–59 minutes ago
 * - "{n}h" for timestamps 1–23 hours ago
 * - "{n}d" for timestamps 1–6 days ago
 * - "{n}w" for timestamps 7–29 days ago
 * - "{n}mo" for timestamps 30+ days ago
 *
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  return `${Math.floor(days / 30)}mo`
}
