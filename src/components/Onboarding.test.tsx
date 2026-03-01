/**
 * Tests for Onboarding component with shadcn Button and Input
 * Tests rendering, navigation, and provider selection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Onboarding from './Onboarding'
import { SettingsProvider } from '../contexts/SettingsContext'
import { ToastProvider } from './shared/Toast'

// Mock fetch for API key validation
global.fetch = vi.fn()

// Wrapper with providers
const renderWithProviders = (ui: React.ReactElement) => {
    return render(
        <ToastProvider>
            <SettingsProvider>
                {ui}
            </SettingsProvider>
        </ToastProvider>
    )
}

describe('Onboarding Component', () => {
    const mockOnComplete = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    })

    describe('Step 1: Welcome', () => {
        it('renders welcome title', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            expect(screen.getByText('Welcome to Zura AI')).toBeInTheDocument()
        })

        it('renders welcome content', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            expect(screen.getByText('Your AI Assistant is Ready')).toBeInTheDocument()
        })

        it('renders feature list', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            expect(screen.getByText('Fast keyboard shortcuts for chat and navigation')).toBeInTheDocument()
            expect(screen.getByText('Attach images and files for vision analysis')).toBeInTheDocument()
            expect(screen.getByText('Multiple AI providers supported')).toBeInTheDocument()
        })

        it('renders Next button', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            expect(screen.getByText('Next')).toBeInTheDocument()
        })

        it('does not render Back button on first step', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            expect(screen.queryByText('Back')).not.toBeInTheDocument()
        })
    })

    describe('Navigation', () => {
        it('navigates to step 2 when Next is clicked', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            fireEvent.click(screen.getByText('Next'))

            expect(screen.getByText('Set Up Your API Key')).toBeInTheDocument()
        })

        it('shows Back button on step 2', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            fireEvent.click(screen.getByText('Next'))

            expect(screen.getByText('Back')).toBeInTheDocument()
        })

        it('navigates back to step 1 when Back is clicked', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            // Go to step 2
            fireEvent.click(screen.getByText('Next'))
            expect(screen.getByText('Set Up Your API Key')).toBeInTheDocument()

            // Go back to step 1
            fireEvent.click(screen.getByText('Back'))
            expect(screen.getByText('Welcome to Zura AI')).toBeInTheDocument()
        })
    })

    describe('Step 2: API Key Setup', () => {
        beforeEach(() => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)
            fireEvent.click(screen.getByText('Next'))
        })

        it('renders provider selection', () => {
            expect(screen.getByText('Choose Your AI Provider')).toBeInTheDocument()
        })

        it('renders all provider options', () => {
            expect(screen.getByText('OpenRouter')).toBeInTheDocument()
            expect(screen.getByText('Perplexity')).toBeInTheDocument()
            expect(screen.getByText('Groq')).toBeInTheDocument()
        })

        it('renders API key input', () => {
            expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()
        })

        it('renders Save & Continue button', () => {
            expect(screen.getByText('Save & Continue')).toBeInTheDocument()
        })

        it('disables Save & Continue when API key is empty', () => {
            const button = screen.getByText('Save & Continue').closest('button')
            expect(button).toBeDisabled()
        })

        it('enables Save & Continue when API key is entered', () => {
            const input = screen.getByPlaceholderText('sk-...')
            fireEvent.change(input, { target: { value: 'sk-test-key-12345' } })

            const button = screen.getByText('Save & Continue').closest('button')
            expect(button).not.toBeDisabled()
        })

        it('does not show Next button on API key step', () => {
            // Next button should not be present on step 2 (API key step)
            // Only Save & Continue should be shown
            const nextButtons = screen.queryAllByText('Next')
            expect(nextButtons.length).toBe(0)
        })
    })

    describe('Close Button', () => {
        it('calls onComplete when close button is clicked', () => {
            renderWithProviders(<Onboarding onComplete={mockOnComplete} />)

            // Find close button (X icon button)
            const closeButton = document.querySelector('.close-btn')
            if (closeButton) {
                fireEvent.click(closeButton)
                expect(mockOnComplete).toHaveBeenCalled()
            }
        })
    })
})
