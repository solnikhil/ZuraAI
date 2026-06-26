/** True when this renderer window is the dedicated overlay route. */
export function isOverlayRoute(
  location: Pick<Location, 'hash'> = typeof window !== 'undefined' ? window.location : { hash: '' }
): boolean {
  return location.hash.startsWith('#/overlay')
}