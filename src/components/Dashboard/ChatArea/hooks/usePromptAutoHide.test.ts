import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePromptAutoHide } from './usePromptAutoHide'

function createOpenSurface(slot: string): HTMLDivElement {
  const element = document.createElement('div')
  element.setAttribute('data-slot', slot)
  element.setAttribute('data-state', 'open')
  document.body.appendChild(element)
  return element
}

describe('usePromptAutoHide', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('hides the prompt after timeout when nothing is open', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() =>
      usePromptAutoHide({
        enabled: true,
        isLoading: false,
        isFocused: false,
        hasInput: false,
        hasFiles: false,
        timeoutSeconds: 30,
      })
    )

    expect(result.current.isPromptHidden).toBe(false)

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(result.current.isPromptHidden).toBe(true)
  })

  it('does not auto-hide while model selector popover is open', () => {
    vi.useFakeTimers()
    const openPopover = createOpenSurface('popover-content')

    const { result } = renderHook(() =>
      usePromptAutoHide({
        enabled: true,
        isLoading: false,
        isFocused: false,
        hasInput: false,
        hasFiles: false,
        timeoutSeconds: 30,
      })
    )

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(result.current.isPromptHidden).toBe(false)

    openPopover.remove()

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(result.current.isPromptHidden).toBe(true)
  })

  it('restores textarea focus when a blocking surface owns focus', () => {
    vi.useFakeTimers()

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })

    const openPopover = createOpenSurface('popover-content')
    const popoverButton = document.createElement('button')
    openPopover.appendChild(popoverButton)
    popoverButton.focus()

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    const focusSpy = vi.spyOn(textarea, 'focus')

    const textareaRef = { current: textarea }

    renderHook(() =>
      usePromptAutoHide({
        enabled: true,
        isLoading: false,
        isFocused: false,
        hasInput: false,
        hasFiles: false,
        timeoutSeconds: 30,
        textareaRef,
      })
    )

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(focusSpy).not.toHaveBeenCalled()

    openPopover.remove()

    act(() => {
      vi.advanceTimersByTime(30000)
    })

    expect(focusSpy).toHaveBeenCalledTimes(1)

    rafSpy.mockRestore()
  })
})
