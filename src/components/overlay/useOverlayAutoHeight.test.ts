import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readOverlayContentHeight, useOverlayAutoHeight } from './useOverlayAutoHeight'
import { OVERLAY_IDLE_HEIGHT } from './overlayLayout'
import './overlay.css'

describe('useOverlayAutoHeight', () => {
  let setContentHeight: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setContentHeight = vi.fn().mockResolvedValue({})
    ;(window as unknown as { overlay: unknown }).overlay = { setContentHeight }
    // Run the queued rAF callback synchronously.
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as unknown as { overlay?: unknown }).overlay
  })

  it('reports the measured content height to the bridge', () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'scrollHeight', { value: 423, configurable: true })
    const ref = { current: element }

    renderHook(() => useOverlayAutoHeight(ref, true))

    expect(setContentHeight).toHaveBeenCalledWith(423)
  })

  it('does nothing when disabled', () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'scrollHeight', { value: 423, configurable: true })
    const ref = { current: element }

    renderHook(() => useOverlayAutoHeight(ref, false))

    expect(setContentHeight).not.toHaveBeenCalled()
  })

  it('skips zero-height measurements', () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'scrollHeight', { value: 0, configurable: true })
    const ref = { current: element }

    renderHook(() => useOverlayAutoHeight(ref, true))

    expect(setContentHeight).not.toHaveBeenCalled()
  })

  it('falls back to child block heights when scrollHeight is zero', () => {
    const measure = document.createElement('div')
    measure.style.paddingTop = '14px'

    const pill = document.createElement('div')
    Object.defineProperty(pill, 'offsetHeight', { value: 64, configurable: true })
    const card = document.createElement('div')
    Object.defineProperty(card, 'offsetHeight', { value: 96, configurable: true })

    measure.append(pill, card)
    Object.defineProperty(measure, 'scrollHeight', { value: 0, configurable: true })

    expect(readOverlayContentHeight(measure)).toBe(OVERLAY_IDLE_HEIGHT + 96)
  })

  it('falls back to computed min-height when offsets are zero', () => {
    const measure = document.createElement('div')
    measure.style.paddingTop = '14px'

    const pill = document.createElement('div')
    pill.className = 'zo-pill'
    const card = document.createElement('div')
    card.className = 'zo-card'

    measure.append(pill, card)
    document.body.appendChild(measure)

    try {
      Object.defineProperty(measure, 'scrollHeight', { value: 0, configurable: true })
      expect(readOverlayContentHeight(measure)).toBeGreaterThan(OVERLAY_IDLE_HEIGHT)
    } finally {
      document.body.removeChild(measure)
    }
  })

  it('re-reports when the report key changes', () => {
    const element = document.createElement('div')
    Object.defineProperty(element, 'scrollHeight', { value: 80, configurable: true })
    const ref = { current: element }

    const { rerender } = renderHook(
      ({ key }) => useOverlayAutoHeight(ref, true, key),
      { initialProps: { key: 'idle' } }
    )

    expect(setContentHeight).toHaveBeenCalledWith(80)
    setContentHeight.mockClear()

    Object.defineProperty(element, 'scrollHeight', { value: 240, configurable: true })
    rerender({ key: 'expanded' })

    expect(setContentHeight).toHaveBeenCalledWith(240)
  })
})
