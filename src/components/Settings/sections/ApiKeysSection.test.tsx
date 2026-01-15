/**
 * Unit tests for ApiKeysSection MiniMax API key input
 * Tests rendering, visibility toggle, and onChange callback
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ApiKeysSection } from './ApiKeysSection'

// Mock fetch for Ollama connection check
global.fetch = vi.fn()

describe('ApiKeysSection MiniMax API Key Input', () => {
    const defaultProps = {
        openRouterApiKey: '',
        perplexityApiKey: '',
        geminiApiKey: '',
        groqApiKey: '',
        minimaxApiKey: '',
        tavilyApiKey: '',
        ollamaUrl: 'http://localhost:11434',
        toolsEnabled: false,
        onChange: vi.fn()
    }

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock fetch to prevent Ollama connection attempts
        ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    })

    describe('Rendering', () => {
        it('renders MiniMax API Key label', () => {
            render(<ApiKeysSection {...defaultProps} />)
            
            expect(screen.getByText('MiniMax API Key')).toBeInTheDocument()
        })

        it('renders MiniMax API Key input with correct placeholder', () => {
            render(<ApiKeysSection {...defaultProps} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            expect(input).toBeInTheDocument()
        })

        it('renders MiniMax API Key input as password type by default', () => {
            render(<ApiKeysSection {...defaultProps} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            expect(input).toHaveAttribute('type', 'password')
        })

        it('displays the provided minimaxApiKey value', () => {
            const props = { ...defaultProps, minimaxApiKey: 'mm-test-key-12345' }
            render(<ApiKeysSection {...props} />)
            
            const input = screen.getByPlaceholderText('mm-...') as HTMLInputElement
            expect(input.value).toBe('mm-test-key-12345')
        })
    })

    describe('Visibility Toggle', () => {
        it('toggles input type from password to text when visibility button is clicked', () => {
            render(<ApiKeysSection {...defaultProps} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            expect(input).toHaveAttribute('type', 'password')
            
            // Find the visibility toggle button (it's the button next to the MiniMax input)
            const minimaxInputContainer = input.closest('div')?.parentElement
            const toggleButton = minimaxInputContainer?.querySelector('button')
            
            expect(toggleButton).toBeInTheDocument()
            fireEvent.click(toggleButton!)
            
            expect(input).toHaveAttribute('type', 'text')
        })

        it('toggles input type back to password on second click', () => {
            render(<ApiKeysSection {...defaultProps} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            const minimaxInputContainer = input.closest('div')?.parentElement
            const toggleButton = minimaxInputContainer?.querySelector('button')
            
            // First click - show
            fireEvent.click(toggleButton!)
            expect(input).toHaveAttribute('type', 'text')
            
            // Second click - hide
            fireEvent.click(toggleButton!)
            expect(input).toHaveAttribute('type', 'password')
        })
    })

    describe('onChange Callback', () => {
        it('calls onChange with minimaxApiKey when input value changes', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, onChange }
            render(<ApiKeysSection {...props} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            fireEvent.change(input, { target: { value: 'mm-new-key-67890' } })
            
            expect(onChange).toHaveBeenCalledWith({ minimaxApiKey: 'mm-new-key-67890' })
        })

        it('calls onChange with empty string when input is cleared', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, minimaxApiKey: 'mm-existing-key', onChange }
            render(<ApiKeysSection {...props} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            fireEvent.change(input, { target: { value: '' } })
            
            expect(onChange).toHaveBeenCalledWith({ minimaxApiKey: '' })
        })

        it('calls onChange for each keystroke', () => {
            const onChange = vi.fn()
            const props = { ...defaultProps, onChange }
            render(<ApiKeysSection {...props} />)
            
            const input = screen.getByPlaceholderText('mm-...')
            
            fireEvent.change(input, { target: { value: 'm' } })
            fireEvent.change(input, { target: { value: 'mm' } })
            fireEvent.change(input, { target: { value: 'mm-' } })
            
            expect(onChange).toHaveBeenCalledTimes(3)
            expect(onChange).toHaveBeenNthCalledWith(1, { minimaxApiKey: 'm' })
            expect(onChange).toHaveBeenNthCalledWith(2, { minimaxApiKey: 'mm' })
            expect(onChange).toHaveBeenNthCalledWith(3, { minimaxApiKey: 'mm-' })
        })
    })

    describe('Integration with Other API Keys', () => {
        it('renders all API key inputs including MiniMax', () => {
            render(<ApiKeysSection {...defaultProps} />)
            
            expect(screen.getByPlaceholderText('sk-or-...')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('pplx-...')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('gsk_...')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('mm-...')).toBeInTheDocument()
        })

        it('MiniMax onChange does not affect other API keys', () => {
            const onChange = vi.fn()
            const props = {
                ...defaultProps,
                openRouterApiKey: 'sk-or-test',
                groqApiKey: 'gsk_test',
                onChange
            }
            render(<ApiKeysSection {...props} />)
            
            const minimaxInput = screen.getByPlaceholderText('mm-...')
            fireEvent.change(minimaxInput, { target: { value: 'mm-test' } })
            
            // Should only call onChange with minimaxApiKey
            expect(onChange).toHaveBeenCalledWith({ minimaxApiKey: 'mm-test' })
            expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ openRouterApiKey: expect.anything() }))
            expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ groqApiKey: expect.anything() }))
        })
    })
})
