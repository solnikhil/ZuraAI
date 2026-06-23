/**
 * Unit Tests for ResizeHandles Component
 *
 *
 * Tests:
 * - 8 handles rendered when not disabled (frosted + windows + not maximized)
 * - 0 handles when disabled (maximized)
 * - Correct data-direction attributes on all handles
 * - Edge handles have correct classes
 * - Corner handles have correct classes
 * - Minimum dimensions: 4px edges, 8px corners (via CSS classes)
 *
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ResizeHandles from './ResizeHandles'

describe('ResizeHandles', () => {
  const ALL_DIRECTIONS = [
    'top',
    'bottom',
    'left',
    'right',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ]

  const EDGE_DIRECTIONS = ['top', 'bottom', 'left', 'right']
  const CORNER_DIRECTIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

  describe('Rendering when enabled (not maximized)', () => {
    it('renders 8 resize handles when disabled is false', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handles = container.querySelectorAll('.resize-handle')
      expect(handles).toHaveLength(8)
    })

    it('renders 8 resize handles when disabled prop is undefined', () => {
      const { container } = render(<ResizeHandles />)

      const handles = container.querySelectorAll('.resize-handle')
      expect(handles).toHaveLength(8)
    })

    it('renders a wrapper div with class resize-handles', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const wrapper = container.querySelector('.resize-handles')
      expect(wrapper).toBeInTheDocument()
    })

    it('wrapper has aria-hidden="true" for accessibility', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const wrapper = container.querySelector('.resize-handles')
      expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders a handle for each of the 8 directions', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      for (const direction of ALL_DIRECTIONS) {
        const handle = container.querySelector(`[data-direction="${direction}"]`)
        expect(handle).toBeInTheDocument()
      }
    })
  })

  describe('Rendering when disabled (maximized)', () => {
    it('renders nothing when disabled is true', () => {
      const { container } = render(<ResizeHandles disabled={true} />)

      const wrapper = container.querySelector('.resize-handles')
      expect(wrapper).not.toBeInTheDocument()
    })

    it('renders 0 handles when disabled is true', () => {
      const { container } = render(<ResizeHandles disabled={true} />)

      const handles = container.querySelectorAll('.resize-handle')
      expect(handles).toHaveLength(0)
    })
  })

  describe('Edge handle classes (minimum 4px dimension)', () => {
    it('top handle has resize-handle--top class', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="top"]')
      expect(handle).toHaveClass('resize-handle', 'resize-handle--top')
    })

    it('bottom handle has resize-handle--bottom class', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="bottom"]')
      expect(handle).toHaveClass('resize-handle', 'resize-handle--bottom')
    })

    it('left handle has resize-handle--left class', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="left"]')
      expect(handle).toHaveClass('resize-handle', 'resize-handle--left')
    })

    it('right handle has resize-handle--right class', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="right"]')
      expect(handle).toHaveClass('resize-handle', 'resize-handle--right')
    })

    it('edge handles do not have the corner class', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      for (const direction of EDGE_DIRECTIONS) {
        const handle = container.querySelector(`[data-direction="${direction}"]`)
        expect(handle).not.toHaveClass('resize-handle--corner')
      }
    })
  })

  describe('Corner handle classes (minimum 8px dimension)', () => {
    it('top-left handle has resize-handle--corner and resize-handle--top-left classes', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="top-left"]')
      expect(handle).toHaveClass(
        'resize-handle',
        'resize-handle--corner',
        'resize-handle--top-left'
      )
    })

    it('top-right handle has resize-handle--corner and resize-handle--top-right classes', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="top-right"]')
      expect(handle).toHaveClass(
        'resize-handle',
        'resize-handle--corner',
        'resize-handle--top-right'
      )
    })

    it('bottom-left handle has resize-handle--corner and resize-handle--bottom-left classes', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="bottom-left"]')
      expect(handle).toHaveClass(
        'resize-handle',
        'resize-handle--corner',
        'resize-handle--bottom-left'
      )
    })

    it('bottom-right handle has resize-handle--corner and resize-handle--bottom-right classes', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      const handle = container.querySelector('[data-direction="bottom-right"]')
      expect(handle).toHaveClass(
        'resize-handle',
        'resize-handle--corner',
        'resize-handle--bottom-right'
      )
    })

    it('all corner handles have the resize-handle--corner class', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      for (const direction of CORNER_DIRECTIONS) {
        const handle = container.querySelector(`[data-direction="${direction}"]`)
        expect(handle).toHaveClass('resize-handle--corner')
      }
    })
  })

  describe('Cursor styles', () => {
    const EXPECTED_CURSORS: Record<string, string> = {
      top: 'n-resize',
      bottom: 's-resize',
      left: 'w-resize',
      right: 'e-resize',
      'top-left': 'nw-resize',
      'top-right': 'ne-resize',
      'bottom-left': 'sw-resize',
      'bottom-right': 'se-resize',
    }

    it('each handle has the correct cursor style for its direction', () => {
      const { container } = render(<ResizeHandles disabled={false} />)

      for (const [direction, expectedCursor] of Object.entries(EXPECTED_CURSORS)) {
        const handle = container.querySelector(`[data-direction="${direction}"]`) as HTMLElement
        expect(handle).toBeInTheDocument()
        expect(handle.style.cursor).toBe(expectedCursor)
      }
    })
  })
})
