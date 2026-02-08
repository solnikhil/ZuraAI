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
        streamResponses: false,
        frostedSidebar: false,
        frostedPrompt: false,
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

        it('calls onChange only once per click', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, onChange }
            render(<ExperimentalSection {...props} />)
            
            const toggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            fireEvent.click(toggle)
            
            expect(onChange).toHaveBeenCalledTimes(1)
        })
    })

    describe('Integration with Smooth Streaming Toggle', () => {
        it('renders both Smooth streaming and Frosted Sidebar toggles', () => {
            render(<ExperimentalSection {...defaultProps} />)
            
            expect(screen.getByText('Smooth streaming')).toBeInTheDocument()
            expect(screen.getByText('Frosted Sidebar')).toBeInTheDocument()
        })

        it('Frosted Sidebar onChange does not affect streamResponses', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, streamResponses: true, onChange }
            render(<ExperimentalSection {...props} />)
            
            const frostedToggle = screen.getByRole('switch', { name: /enable frosted sidebar/i })
            fireEvent.click(frostedToggle)
            
            // Should only call onChange with frostedSidebar
            expect(onChange).toHaveBeenCalledWith({ frostedSidebar: true })
            expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ streamResponses: expect.anything() }))
        })

        it('Frosted Prompt onChange does not affect streamResponses', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, streamResponses: true, onChange }
            render(<ExperimentalSection {...props} />)

            const frostedToggle = screen.getByRole('switch', { name: /enable frosted prompt/i })
            fireEvent.click(frostedToggle)

            expect(onChange).toHaveBeenCalledWith({ frostedPrompt: true })
            expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ streamResponses: expect.anything() }))
        })

        it('Smooth streaming onChange does not affect frostedSidebar', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, frostedSidebar: true, onChange }
            render(<ExperimentalSection {...props} />)
            
            const streamingToggle = screen.getByRole('switch', { name: /enable smooth streaming/i })
            fireEvent.click(streamingToggle)
            
            // Should only call onChange with streamResponses
            expect(onChange).toHaveBeenCalledWith({ streamResponses: true })
            expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ frostedSidebar: expect.anything() }))
        })

        it('Smooth streaming onChange does not affect frostedPrompt', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, frostedPrompt: true, onChange }
            render(<ExperimentalSection {...props} />)

            const streamingToggle = screen.getByRole('switch', { name: /enable smooth streaming/i })
            fireEvent.click(streamingToggle)

            expect(onChange).toHaveBeenCalledWith({ streamResponses: true })
            expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ frostedPrompt: expect.anything() }))
        })
    })
})
