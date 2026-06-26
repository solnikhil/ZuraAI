/** Drag strip height (matches `.zo-drag-strip` and `.zo-measure` padding-top). */
export const OVERLAY_DRAG_STRIP_HEIGHT = 14

/** Pill min-height (matches `--zo-pill-height` in overlay.css). */
export const OVERLAY_PILL_HEIGHT = 64

/** Expanded card floor height (matches `.zo-card` min-height). */
export const OVERLAY_CARD_MIN_HEIGHT = 96

/** Idle overlay window height: drag strip + pill. */
export const OVERLAY_IDLE_HEIGHT = OVERLAY_DRAG_STRIP_HEIGHT + OVERLAY_PILL_HEIGHT

/** Fallback block heights when layout engines omit scroll/offset metrics. */
export const OVERLAY_MEASURE_CLASS_MIN_HEIGHTS: Record<string, number> = {
  'zo-pill': OVERLAY_PILL_HEIGHT,
  'zo-card': OVERLAY_CARD_MIN_HEIGHT,
}