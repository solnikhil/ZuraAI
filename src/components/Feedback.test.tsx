/**
 * Tests for Feedback component with shadcn Dialog
 * Tests rendering, type selection, form submission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Feedback from './Feedback'
import { ToastProvider } from './shared/Toast'

// Mock window.open for GitHub issue submission
const mockOpen = vi.fn()
window.open = mockOpen

// Mock window.updater
window.updater = {
    getVersion: vi.fn().mockResolvedValue('1.0.0')
}

// Wrapper with ToastProvider
const renderWithToast = (ui: React.ReactElement) => {
    return render(
        <ToastProvider>
            {ui}
        </ToastProvider>
    )
}

describe('Feedback Component', () => {
    const mockOnClose = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('Rendering', () => {
        it('renders the dialog with title', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            expect(screen.getByText('Send Feedback')).toBeInTheDocument()
        })

        it('renders all feedback type buttons', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            expect(screen.getByText('Bug Report')).toBeInTheDocument()
            expect(screen.getByText('Feature')).toBeInTheDocument()
            expect(screen.getByText('General')).toBeInTheDocument()
        })

        it('renders message textarea', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            expect(screen.getByPlaceholderText('Share your thoughts...')).toBeInTheDocument()
        })

        it('renders email input', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument()
        })

        it('renders Cancel and Submit buttons', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            expect(screen.getByText('Cancel')).toBeInTheDocument()
            expect(screen.getByText('Submit Feedback')).toBeInTheDocument()
        })
    })

    describe('Feedback Type Selection', () => {
        it('changes label when Bug Report is selected', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            fireEvent.click(screen.getByText('Bug Report'))

            expect(screen.getByText('Describe the bug')).toBeInTheDocument()
        })

        it('changes label when Feature is selected', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            fireEvent.click(screen.getByText('Feature'))

            expect(screen.getByText('Describe your feature idea')).toBeInTheDocument()
        })

        it('changes placeholder when feedback type changes', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            fireEvent.click(screen.getByText('Bug Report'))

            expect(screen.getByPlaceholderText('What happened? What did you expect to happen?')).toBeInTheDocument()
        })
    })

    describe('Form Validation', () => {
        it('disables submit button when message is empty', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            const submitButton = screen.getByText('Submit Feedback').closest('button')
            expect(submitButton).toBeDisabled()
        })

        it('enables submit button when message has content', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            const textarea = screen.getByPlaceholderText('Share your thoughts...')
            fireEvent.change(textarea, { target: { value: 'Test feedback message' } })

            const submitButton = screen.getByText('Submit Feedback').closest('button')
            expect(submitButton).not.toBeDisabled()
        })
    })

    describe('Actions', () => {
        it('calls onClose when Cancel is clicked', () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            fireEvent.click(screen.getByText('Cancel'))

            expect(mockOnClose).toHaveBeenCalled()
        })

        it('opens GitHub issue when form is submitted', async () => {
            renderWithToast(<Feedback onClose={mockOnClose} />)

            const textarea = screen.getByPlaceholderText('Share your thoughts...')
            fireEvent.change(textarea, { target: { value: 'Test feedback message' } })

            const submitButton = screen.getByText('Submit Feedback').closest('button')
            fireEvent.click(submitButton!)

            await waitFor(() => {
                expect(mockOpen).toHaveBeenCalled()
            })
        })
    })
})
