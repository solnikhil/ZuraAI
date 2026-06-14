import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOverlayAutoHeight } from './useOverlayAutoHeight'

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
})
