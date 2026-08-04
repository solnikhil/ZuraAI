/**
 * Small numeric + hex-color helpers shared by appearance/theme settings UI.
 */

/** Clamp a number into [min, max]; NaN collapses to min. */
export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** True when `color` is a strict 6-digit `#rrggbb` hex string. */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

/**
 * Normalize loose hex input to `#rrggbb` where possible: adds a leading `#`,
 * expands 3-digit shorthand, and otherwise returns the trimmed input.
 */
export function normalizeHexColor(color: string): string {
  if (!color) return ''
  const trimmed = color.trim()
  if (isValidHexColor(trimmed)) return trimmed
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed}`
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return trimmed
}
