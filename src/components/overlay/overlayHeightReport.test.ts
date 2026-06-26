import { describe, expect, it, vi } from 'vitest'

import { OVERLAY_IDLE_HEIGHT } from './overlayLayout'
import { readOverlayContentHeight, reportOverlayContentHeight } from './useOverlayAutoHeight'
import './overlay.css'

function buildIdleMeasureTree(): HTMLDivElement {
  const measure = document.createElement('div')
  measure.className = 'zo-measure'

  const pillWrap = document.createElement('div')
  pillWrap.className = 'zo-pill-wrap'

  const pill = document.createElement('div')
  pill.className = 'zo-pill'
  pillWrap.appendChild(pill)
  measure.appendChild(pillWrap)

  return measure
}

function buildExpandedMeasureTree(): HTMLDivElement {
  const measure = buildIdleMeasureTree()

  const card = document.createElement('div')
  card.className = 'zo-card'

  const content = document.createElement('div')
  content.className = 'zo-card__content'
  content.innerHTML = '<div class="zo-reveal">User message</div><div class="zo-reveal">Assistant reply</div>'
  card.appendChild(content)
  measure.appendChild(card)

  return measure
}

describe('reportOverlayContentHeight', () => {
  it('reports idle pill height near OVERLAY_IDLE_HEIGHT', () => {
    const measure = buildIdleMeasureTree()
    document.body.appendChild(measure)

    try {
      const setContentHeight = vi.fn()
      const height = reportOverlayContentHeight(measure, setContentHeight)

      expect(height).toBeGreaterThanOrEqual(OVERLAY_IDLE_HEIGHT - 2)
      expect(height).toBeLessThanOrEqual(OVERLAY_IDLE_HEIGHT + 4)
      expect(setContentHeight).toHaveBeenCalledWith(height)
    } finally {
      document.body.removeChild(measure)
    }
  })

  it('reports expanded card height greater than the idle baseline', () => {
    const measure = buildExpandedMeasureTree()
    document.body.appendChild(measure)

    try {
      const setContentHeight = vi.fn()
      const height = reportOverlayContentHeight(measure, setContentHeight)

      expect(height).toBeGreaterThan(OVERLAY_IDLE_HEIGHT)
      expect(setContentHeight).toHaveBeenCalledWith(height)
      expect(readOverlayContentHeight(measure)).toBe(height)
    } finally {
      document.body.removeChild(measure)
    }
  })
})