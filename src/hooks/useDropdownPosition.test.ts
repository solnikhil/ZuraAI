/**
 * Unit tests for useDropdownPosition hook
 * Tests centralized dropdown position calculation
 *
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useDropdownPosition,
  calculateMaxHeight,
  getDropdownTransform,
  getDropdownAnimation,
} from './useDropdownPosition'

describe('useDropdownPosition', () => {
  // Mock window dimensions
  const mockWindowDimensions = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { value: width, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, writable: true })
  }

  // Mock document.body dimensions
  const mockBodyDimensions = (width: number) => {
    Object.defineProperty(document.body, 'clientWidth', { value: width, writable: true })
  }

  beforeEach(() => {
    mockWindowDimensions(1024, 768)
    mockBodyDimensions(1024)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('returns default position when not open', () => {
      const triggerRef = { current: null }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: false,
        })
      )

      expect(result.current.position).toEqual({
        top: 0,
        left: 0,
        width: 400,
        showAbove: false,
      })
    })

    it('uses custom preferred width', () => {
      const triggerRef = { current: null }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: false,
          preferredWidth: 500,
        })
      )

      expect(result.current.position.width).toBe(500)
    })
  })

  describe('position calculation', () => {
    it('calculates position when opened with trigger element', () => {
      const mockElement = {
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 140,
          left: 50,
          right: 200,
          width: 150,
          height: 40,
        }),
      } as HTMLElement

      const triggerRef = { current: mockElement }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
          preferredWidth: 300,
          preferredHeight: 200,
        })
      )

      // Should show below since there's more space below
      expect(result.current.position.showAbove).toBe(false)
      expect(result.current.position.top).toBe(152) // bottom + offset (12)
      expect(result.current.position.left).toBe(50)
    })

    it('shows dropdown above when more space above', () => {
      mockWindowDimensions(1024, 300) // Small viewport height

      const mockElement = {
        getBoundingClientRect: () => ({
          top: 250, // Near bottom
          bottom: 290,
          left: 50,
          right: 200,
          width: 150,
          height: 40,
        }),
      } as HTMLElement

      const triggerRef = { current: mockElement }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
          preferredWidth: 300,
          preferredHeight: 200,
        })
      )

      // Should show above since there's more space above
      expect(result.current.position.showAbove).toBe(true)
    })

    it('adjusts left position to stay within viewport', () => {
      const mockElement = {
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 140,
          left: 800, // Near right edge
          right: 950,
          width: 150,
          height: 40,
        }),
      } as HTMLElement

      const triggerRef = { current: mockElement }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
          preferredWidth: 400,
          viewportPadding: 16,
        })
      )

      // Left should be adjusted to keep dropdown within viewport
      expect(result.current.position.left).toBeLessThanOrEqual(1024 - 400 - 16)
    })
  })

  describe('recalculate function', () => {
    it('provides recalculate function', () => {
      const triggerRef = { current: null }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: false,
        })
      )

      expect(typeof result.current.recalculate).toBe('function')
    })

    it('recalculate updates position', () => {
      const mockElement = {
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 140,
          left: 50,
          right: 200,
          width: 150,
          height: 40,
        }),
      } as HTMLElement

      const triggerRef = { current: mockElement }

      const { result } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
        })
      )

      const initialPosition = { ...result.current.position }

      act(() => {
        result.current.recalculate()
      })

      // Position should be recalculated (same values since element didn't move)
      expect(result.current.position.top).toBe(initialPosition.top)
    })
  })

  describe('event listeners', () => {
    it('adds resize listener when open', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const triggerRef = { current: null }

      renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
          recalculateOnResize: true,
        })
      )

      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('adds scroll listener when open', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const triggerRef = { current: null }

      renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
          recalculateOnScroll: true,
        })
      )

      expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    })

    it('removes listeners on cleanup', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      const triggerRef = { current: null }

      const { unmount } = renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
        })
      )

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalled()
    })

    it('does not add listeners when recalculateOnResize is false', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const triggerRef = { current: null }

      renderHook(() =>
        useDropdownPosition({
          triggerRef,
          isOpen: true,
          recalculateOnResize: false,
          recalculateOnScroll: false,
        })
      )

      expect(addEventListenerSpy).not.toHaveBeenCalledWith('resize', expect.any(Function))
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('scroll', expect.any(Function), true)
    })
  })
})

describe('calculateMaxHeight', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })
  })

  it('calculates max height for dropdown below', () => {
    const position = { top: 200, left: 0, width: 400, showAbove: false }
    const maxHeight = calculateMaxHeight(position, 16, 400)

    // Should be limited by space below: 768 - 200 - 16 = 552, capped at 400
    expect(maxHeight).toBe(400)
  })

  it('calculates max height for dropdown above', () => {
    const position = { top: 300, left: 0, width: 400, showAbove: true }
    const maxHeight = calculateMaxHeight(position, 16, 400)

    // Should be limited by space above: 300 - 16 = 284
    expect(maxHeight).toBe(284)
  })

  it('respects minimum height of 200', () => {
    const position = { top: 100, left: 0, width: 400, showAbove: true }
    const maxHeight = calculateMaxHeight(position, 16, 400)

    // Space above is 100 - 16 = 84, but minimum is 200
    expect(maxHeight).toBe(200)
  })
})

describe('getDropdownTransform', () => {
  it('returns correct transform for dropdown above', () => {
    expect(getDropdownTransform(true)).toBe('translateY(-100%)')
  })

  it('returns correct transform for dropdown below', () => {
    expect(getDropdownTransform(false)).toBe('translateY(0)')
  })
})

describe('getDropdownAnimation', () => {
  it('returns correct animation for dropdown above', () => {
    expect(getDropdownAnimation(true)).toBe('dropdown-slide-up')
  })

  it('returns correct animation for dropdown below', () => {
    expect(getDropdownAnimation(false)).toBe('dropdown-slide-down')
  })
})
