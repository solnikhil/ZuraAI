/**
 * Unit tests for ExperimentalSection frosted sidebar toggle
 * Tests rendering and onChange callback for the frosted sidebar toggle
 * 
 * Requirements: 1.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ExperimentalSection } from './ExperimentalSection'

describe('ExperimentalSection Frosted Sidebar Toggle', () => {
    const defaultProps = {
        frostedSidebar: false,
        frostedPrompt: false,
        sidebarAutoHideOnResize: true,
        softenedContrast: false,
        onChange: vi.fn()
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('Rendering', () => {
        it('renders Frosted Sidebar toggle with correct label', () => {
            render(<ExperimentalSection {...defaultProps} />)
            
            expect(screen.getByText('Frosted Sidebar')).toBeInTheDocument()
        })

        it('renders Frosted Prompt toggle with correct label', () => {
            render(<ExperimentalSection {...defaultProps} />)

            expect(screen.getByText('Frosted Prompt')).toBeInTheDocument()
        })

        it('renders Frosted Sidebar toggle with description explaining glassmorphism effect', () => {
            render(<ExperimentalSection {...defaultProps} />)
            
            expect(screen.getByText(/glassmorphism effect/i)).toBeInTheDocument()
            expect(screen.getByText(/frosted glass appearance/i)).toBeInTheDocument()
        })

        it('renders Frosted Sidebar toggle switch with correct aria-label', () => {
            render(<ExperimentalSection {...defaultProps} />)
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            expect(toggle).toBeInTheDocument()
        })

        it('renders Frosted Prompt toggle switch with correct aria-label', () => {
            render(<ExperimentalSection {...defaultProps} />)

            const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
            expect(toggle).toBeInTheDocument()
        })

        it('renders Softened contrast toggle with correct label', () => {
            render(<ExperimentalSection {...defaultProps} />)
            expect(screen.getByText('Softened contrast')).toBeInTheDocument()
        })

        it('renders Softened contrast toggle switch with correct aria-label', () => {
            render(<ExperimentalSection {...defaultProps} />)
            const toggle = screen.getByRole('switch', { name: /enable softened contrast/i })
            expect(toggle).toBeInTheDocument()
        })

        it('renders toggle in checked state when softenedContrast is true', () => {
            const props = { ...defaultProps, softenedContrast: true }
            render(<ExperimentalSection {...props} />)
            const toggle = screen.getByRole('switch', { name: /enable softened contrast/i })
            expect(toggle).toHaveAttribute('data-state', 'checked')
        })

        it('renders Sidebar auto-hide toggle with correct label', () => {
            render(<ExperimentalSection {...defaultProps} />)
            expect(screen.getByText('Sidebar auto-hide on resize')).toBeInTheDocument()
        })

        it('renders Sidebar auto-hide toggle switch with correct aria-label', () => {
            render(<ExperimentalSection {...defaultProps} />)
            const toggle = screen.getByRole('switch', { name: /enable sidebar auto-hide on resize/i })
            expect(toggle).toBeInTheDocument()
        })

        it('renders toggle in unchecked state when frostedSidebar is false', () => {
            render(<ExperimentalSection {...defaultProps} />)
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            expect(toggle).toHaveAttribute('data-state', 'unchecked')
        })

        it('renders toggle in checked state when frostedSidebar is true', () => {
            const props = { ...defaultProps, frostedSidebar: true }
            render(<ExperimentalSection {...props} />)
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            expect(toggle).toHaveAttribute('data-state', 'checked')
        })

        it('renders toggle in checked state when frostedPrompt is true', () => {
            const props = { ...defaultProps, frostedPrompt: true }
            render(<ExperimentalSection {...props} />)

            const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
            expect(toggle).toHaveAttribute('data-state', 'checked')
        })
    })

    describe('onChange Callback', () => {
        it('calls onChange with { frostedSidebar: true } when toggle is clicked from off state', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, frostedSidebar: false, onChange }
            render(<ExperimentalSection {...props} />)
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            fireEvent.click(toggle)
            
            expect(onChange).toHaveBeenCalledWith({ frostedSidebar: true })
        })

        it('calls onChange with { frostedPrompt: true } when toggle is clicked from off state', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, frostedPrompt: false, onChange }
            render(<ExperimentalSection {...props} />)

            const toggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
            fireEvent.click(toggle)

            expect(onChange).toHaveBeenCalledWith({ frostedPrompt: true })
        })

        it('calls onChange with { frostedSidebar: false } when toggle is clicked from on state', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, frostedSidebar: true, onChange }
            render(<ExperimentalSection {...props} />)
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            fireEvent.click(toggle)
            
            expect(onChange).toHaveBeenCalledWith({ frostedSidebar: false })
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
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            fireEvent.click(toggle)
            
            expect(onChange).toHaveBeenCalledTimes(1)
        })

    })

    describe('Softened Contrast Toggle', () => {
        it('calls onChange with { softenedContrast: true } when toggle is clicked from off state', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, softenedContrast: false, onChange }
            render(<ExperimentalSection {...props} />)
            const toggle = screen.getByRole('switch', { name: /enable softened contrast/i })
            fireEvent.click(toggle)
            expect(onChange).toHaveBeenCalledWith({ softenedContrast: true })
        })

        it('calls onChange with { softenedContrast: false } when toggle is clicked from on state', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, softenedContrast: true, onChange }
            render(<ExperimentalSection {...props} />)
            const toggle = screen.getByRole('switch', { name: /enable softened contrast/i })
            fireEvent.click(toggle)
            expect(onChange).toHaveBeenCalledWith({ softenedContrast: false })
        })
    })
})
