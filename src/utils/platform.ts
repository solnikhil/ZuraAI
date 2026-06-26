export function isMacOSRuntime(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toLowerCase().includes('mac')
}

export function isWindowsRuntime(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  return platform.includes('win') || userAgent.includes('windows')
}

export type OverlayMaterialKind = 'vibrancy' | 'acrylic' | 'css'

/**
 * Material kind is passed on the overlay route hash by the main process
 * (`#/overlay?material=acrylic`) so styling is correct before first paint.
 */
export function readOverlayMaterialFromLocation(
  location: Pick<Location, 'hash'> = window.location
): OverlayMaterialKind | null {
  const match = location.hash.match(/[?&]material=(vibrancy|acrylic|css)\b/)
  return match ? (match[1] as OverlayMaterialKind) : null
}


