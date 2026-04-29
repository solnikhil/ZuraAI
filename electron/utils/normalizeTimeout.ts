/**
 * Normalize a timeout/positive-integer value with a fallback.
 * Returns at least 1 when the input is a valid finite number.
 */
export function normalizeTimeout(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(1, Math.round(value))
}
