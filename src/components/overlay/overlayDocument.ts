import { readOverlayMaterialFromLocation } from '@/utils/platform'

/** Apply overlay route classes before first paint (launch fade + material). */
export function applyOverlayRouteDocumentClasses(): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.add('zo-overlay-route')
  const material = readOverlayMaterialFromLocation()
  if (material === 'acrylic') {
    document.documentElement.classList.add('zo-overlay-acrylic')
  }
}

export function clearOverlayRouteDocumentClasses(): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.remove('zo-overlay-route', 'zo-overlay-acrylic')
}