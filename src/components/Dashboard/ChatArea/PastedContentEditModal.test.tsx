/**
 * Tests for PastedContentEditModal component with shadcn Dialog
 * Tests rendering, editing, and action callbacks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PastedContentEditModal } from './PastedContentEditModal'

describe('PastedContentEditModal Component', () => {
    const defaultProps = {
        content: 'Initial content here',
        onSave: vi.fn(),
        onCancel: vi.fn(),
        onDelete: vi.fn()
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('Rendering', () => {
        it('renders the dialog with title', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            expect(screen.getByText('Edit Pasted Content')).toBeInTheDocument()
        })

        it('displays the initial content in textarea', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            expect(textarea).toHaveValue('Initial content here')
        })

        it('displays character count', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            // "Initial content here" has 20 characters
            expect(screen.getByText(/20 chars/)).toBeInTheDocument()
        })

        it('renders Save and Cancel buttons', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            expect(screen.getByText('Save')).toBeInTheDocument()
            expect(screen.getByText('Cancel')).toBeInTheDocument()
        })

        it('renders Delete button when onDelete is provided', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            expect(screen.getByText('Delete')).toBeInTheDocument()
        })

        it('does not render Delete button when onDelete is not provided', () => {
            const { onDelete, ...propsWithoutDelete } = defaultProps
            render(<PastedContentEditModal {...propsWithoutDelete} />)

            expect(screen.queryByText('Delete')).not.toBeInTheDocument()
        })
    })

    describe('Editing', () => {
        it('updates character count when content changes', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.change(textarea, { target: { value: 'New content' } })

            // "New content" has 11 characters
            expect(screen.getByText(/11 chars/)).toBeInTheDocument()
        })

        it('allows editing the content', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.change(textarea, { target: { value: 'Updated content' } })

            expect(textarea).toHaveValue('Updated content')
        })
    })

    describe('Actions', () => {
        it('calls onCancel when Cancel button is clicked', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            fireEvent.click(screen.getByText('Cancel'))

            expect(defaultProps.onCancel).toHaveBeenCalled()
        })

        it('calls onDelete when Delete button is clicked', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            fireEvent.click(screen.getByText('Delete'))

            expect(defaultProps.onDelete).toHaveBeenCalled()
        })

        it('calls onSave with trimmed content when Save is clicked', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.change(textarea, { target: { value: '  Updated content  ' } })
            fireEvent.click(screen.getByText('Save'))

            expect(defaultProps.onSave).toHaveBeenCalledWith('Updated content')
        })

        it('disables Save button when content is empty', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.change(textarea, { target: { value: '' } })

            const saveButton = screen.getByText('Save').closest('button')
            expect(saveButton).toBeDisabled()
        })

        it('disables Save button when content is only whitespace', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.change(textarea, { target: { value: '   ' } })

            const saveButton = screen.getByText('Save').closest('button')
            expect(saveButton).toBeDisabled()
        })

        it('does not call onSave when content is empty', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.change(textarea, { target: { value: '' } })

            // Try to click save even though it's disabled
            const saveButton = screen.getByText('Save').closest('button')
            fireEvent.click(saveButton!)

            expect(defaultProps.onSave).not.toHaveBeenCalled()
        })
    })

    describe('Keyboard Shortcuts', () => {
        it('calls onSave on Ctrl+Enter', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

            expect(defaultProps.onSave).toHaveBeenCalledWith('Initial content here')
        })

        it('does not save on Enter without Ctrl', () => {
            render(<PastedContentEditModal {...defaultProps} />)

            const textarea = screen.getByPlaceholderText('Enter your content...')
            fireEvent.keyDown(textarea, { key: 'Enter' })

            expect(defaultProps.onSave).not.toHaveBeenCalled()
        })
    })
})
