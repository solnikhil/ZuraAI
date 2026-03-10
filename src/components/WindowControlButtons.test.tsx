/**
 * Unit Tests for WindowControlButtons Component
 *
 *
 * Tests:
 * - Click handlers: minimize, maximize/restore, close buttons call correct callbacks
 * - Accessibility: aria-label attributes on all buttons
 * - Styling: close button has the `.app-titlebar__window-btn--close` class
 *
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WindowControlButtons from './WindowControlButtons'

describe('WindowControlButtons', () => {
  const createProps = (overrides?: Partial<Parameters<typeof WindowControlButtons>[0]>) => ({
    isMaximized: false,
    onMinimize: vi.fn(),
    onToggleMaximize: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  })

  describe('Click Handlers', () => {
    it('calls onMinimize when minimize button is clicked', () => {
      const props = createProps()
      render(<WindowControlButtons {...props} />)

      fireEvent.click(screen.getByLabelText('Minimize window'))

      expect(props.onMinimize).toHaveBeenCalledTimes(1)
      expect(props.onToggleMaximize).not.toHaveBeenCalled()
      expect(props.onClose).not.toHaveBeenCalled()
    })

    it('calls onToggleMaximize when maximize button is clicked', () => {
      const props = createProps({ isMaximized: false })
      render(<WindowControlButtons {...props} />)

      fireEvent.click(screen.getByLabelText('Maximize window'))

      expect(props.onToggleMaximize).toHaveBeenCalledTimes(1)
      expect(props.onMinimize).not.toHaveBeenCalled()
      expect(props.onClose).not.toHaveBeenCalled()
    })

    it('calls onToggleMaximize when restore button is clicked', () => {
      const props = createProps({ isMaximized: true })
      render(<WindowControlButtons {...props} />)

      fireEvent.click(screen.getByLabelText('Restore window'))

      expect(props.onToggleMaximize).toHaveBeenCalledTimes(1)
      expect(props.onMinimize).not.toHaveBeenCalled()
      expect(props.onClose).not.toHaveBeenCalled()
    })

    it('calls onClose when close button is clicked', () => {
      const props = createProps()
      render(<WindowControlButtons {...props} />)

      fireEvent.click(screen.getByLabelText('Close window'))

      expect(props.onClose).toHaveBeenCalledTimes(1)
      expect(props.onMinimize).not.toHaveBeenCalled()
      expect(props.onToggleMaximize).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('has aria-label on minimize button', () => {
      render(<WindowControlButtons {...createProps()} />)

      expect(screen.getByLabelText('Minimize window')).toBeInTheDocument()
    })

    it('has aria-label "Maximize window" when not maximized', () => {
      render(<WindowControlButtons {...createProps({ isMaximized: false })} />)

      expect(screen.getByLabelText('Maximize window')).toBeInTheDocument()
    })

    it('has aria-label "Restore window" when maximized', () => {
      render(<WindowControlButtons {...createProps({ isMaximized: true })} />)

      expect(screen.getByLabelText('Restore window')).toBeInTheDocument()
    })

    it('has aria-label on close button', () => {
      render(<WindowControlButtons {...createProps()} />)

      expect(screen.getByLabelText('Close window')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('close button has the app-titlebar__window-btn--close class', () => {
      render(<WindowControlButtons {...createProps()} />)

      const closeBtn = screen.getByLabelText('Close window')
      expect(closeBtn).toHaveClass('app-titlebar__window-btn--close')
    })

    it('all buttons have the app-titlebar__icon-btn class', () => {
      render(<WindowControlButtons {...createProps()} />)

      const minimizeBtn = screen.getByLabelText('Minimize window')
      const maximizeBtn = screen.getByLabelText('Maximize window')
      const closeBtn = screen.getByLabelText('Close window')

      expect(minimizeBtn).toHaveClass('app-titlebar__icon-btn')
      expect(maximizeBtn).toHaveClass('app-titlebar__icon-btn')
      expect(closeBtn).toHaveClass('app-titlebar__icon-btn')
    })

    it('only the close button has the close window modifier class', () => {
      render(<WindowControlButtons {...createProps()} />)

      const minimizeBtn = screen.getByLabelText('Minimize window')
      const maximizeBtn = screen.getByLabelText('Maximize window')

      expect(minimizeBtn).not.toHaveClass('app-titlebar__window-btn--close')
      expect(maximizeBtn).not.toHaveClass('app-titlebar__window-btn--close')
    })
  })
})
