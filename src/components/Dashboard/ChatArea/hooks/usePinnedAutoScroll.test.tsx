import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePinnedAutoScroll } from './usePinnedAutoScroll'

function createScrollContainer() {
  const element = document.createElement('div')
  let scrollTop = 900

  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => 1000,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => 100,
  })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    },
  })

  element.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    scrollTop = typeof top === 'number' ? top : scrollTop
  })

  return element
}

describe('usePinnedAutoScroll', () => {
  let rafCallbacks: FrameRequestCallback[]

  beforeEach(() => {
    rafCallbacks = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('coalesces streaming auto-scroll into a single pending animation frame', () => {
    const container = createScrollContainer()
    const ref = { current: container }

    const { rerender } = renderHook(
      (props: { content: string }) =>
        usePinnedAutoScroll({
          containerRef: ref,
          isStreaming: true,
          streamSessionId: 'session-1',
          currentSessionId: 'session-1',
          streamingContent: props.content,
          messageCount: 2,
          lastMessageId: 'assistant-1',
        }),
      { initialProps: { content: 'a' } }
    )

    rerender({ content: 'ab' })
    rerender({ content: 'abc' })

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)

    act(() => {
      rafCallbacks[0]?.(performance.now())
    })

    expect(container.scrollTop).toBe(900)
  })

  it('does not auto-scroll streaming content after the user scrolls upward', () => {
    const container = createScrollContainer()
    const ref = { current: container }

    const { rerender } = renderHook(
      (props: { content: string }) =>
        usePinnedAutoScroll({
          containerRef: ref,
          isStreaming: true,
          streamSessionId: 'session-1',
          currentSessionId: 'session-1',
          streamingContent: props.content,
          messageCount: 2,
          lastMessageId: 'assistant-1',
        }),
      { initialProps: { content: '' } }
    )

    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }))
    })

    rerender({ content: 'new token' })

    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
