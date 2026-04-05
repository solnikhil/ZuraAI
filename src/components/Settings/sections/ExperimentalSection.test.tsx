import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ExperimentalSection } from './ExperimentalSection'

describe('ExperimentalSection', () => {
  const defaultProps = {
    frostedPrompt: false,
    sidebarAutoHideOnResize: true,
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders Frosted Prompt toggle with correct label', () => {
      render(<ExperimentalSection {...defaultProps} />)

      expect(screen.getByText('Frosted prompt area')).toBeInTheDocument()
    })

    it('renders Frosted Prompt toggle switch with correct aria-label', () => {
      render(<ExperimentalSection {...defaultProps} />)

      const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
      expect(toggle).toBeInTheDocument()
    })

    it('renders Sidebar auto-hide toggle with correct label', () => {
      render(<ExperimentalSection {...defaultProps} />)
      expect(screen.getByText('Auto-hide sidebar on narrow windows')).toBeInTheDocument()
    })

    it('renders Sidebar auto-hide toggle switch with correct aria-label', () => {
      render(<ExperimentalSection {...defaultProps} />)
      const toggle = screen.getByRole('switch', { name: /enable sidebar auto-hide on resize/i })
      expect(toggle).toBeInTheDocument()
    })

    it('renders toggle in checked state when frostedPrompt is true', () => {
      const props = { ...defaultProps, frostedPrompt: true }
      render(<ExperimentalSection {...props} />)

      const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
      expect(toggle).toHaveAttribute('data-state', 'checked')
    })
  })

  describe('onChange Callback', () => {
    it('calls onChange with { frostedPrompt: true } when toggle is clicked from off state', () => {
      const onChange = vi.fn()
      const props = { ...defaultProps, frostedPrompt: false, onChange }
      render(<ExperimentalSection {...props} />)

      const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
      fireEvent.click(toggle)

      expect(onChange).toHaveBeenCalledWith({ frostedPrompt: true })
    })

    it('calls onChange with { sidebarAutoHideOnResize: false } when toggle is clicked from on state', () => {
      const onChange = vi.fn()
      const props = { ...defaultProps, sidebarAutoHideOnResize: true, onChange }
      render(<ExperimentalSection {...props} />)

      const toggle = screen.getByRole('switch', { name: /enable sidebar auto-hide on resize/i })
      fireEvent.click(toggle)

      expect(onChange).toHaveBeenCalledWith({ sidebarAutoHideOnResize: false })
    })

    it('calls onChange only once per click', () => {
      const onChange = vi.fn()
      const props = { ...defaultProps, onChange }
      render(<ExperimentalSection {...props} />)

      const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
      fireEvent.click(toggle)

      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })
})
