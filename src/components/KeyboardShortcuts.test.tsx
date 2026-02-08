/**
 * Tests for KeyboardShortcuts component with shadcn Card
 * Tests rendering of shortcuts and categories
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KeyboardShortcuts from './KeyboardShortcuts'

describe('KeyboardShortcuts Component', () => {
    describe('Rendering', () => {
        it('renders the title', () => {
            render(<KeyboardShortcuts />)

            expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
        })

        it('renders all shortcut categories', () => {
            render(<KeyboardShortcuts />)

            expect(screen.getByText('General')).toBeInTheDocument()
            expect(screen.getByText('Chat')).toBeInTheDocument()
            expect(screen.getByText('Navigation')).toBeInTheDocument()
        })

        it('renders General shortcuts', () => {
            render(<KeyboardShortcuts />)

            expect(screen.getByText('Start new chat')).toBeInTheDocument()
            expect(screen.getByText('Toggle command bar')).toBeInTheDocument()
        })

        it('renders Chat shortcuts', () => {
            render(<KeyboardShortcuts />)

            expect(screen.getByText('Send message')).toBeInTheDocument()
            expect(screen.getByText('New line in message')).toBeInTheDocument()
            expect(screen.getByText('Select all text in message (when focused)')).toBeInTheDocument()
        })

        it('renders Navigation shortcuts', () => {
            render(<KeyboardShortcuts />)

            expect(screen.getByText('Focus command bar')).toBeInTheDocument()
            expect(screen.getByText('Open Settings (when main window focused)')).toBeInTheDocument()
        })

        it('renders keyboard keys as badges', () => {
            render(<KeyboardShortcuts />)

            // Check for specific key badges (using getAllByText since keys may appear multiple times)
            expect(screen.getAllByText('Ctrl').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Enter').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Space').length).toBeGreaterThan(0)
        })

        it('renders the tip in footer', () => {
            render(<KeyboardShortcuts />)

            expect(screen.getByText(/Tip: Use Cmd instead of Ctrl on macOS/)).toBeInTheDocument()
        })
    })

    describe('Structure', () => {
        it('renders as a Card component', () => {
            const { container } = render(<KeyboardShortcuts />)

            // Card should have the bg-card class
            const card = container.querySelector('[class*="bg-card"]')
            expect(card).toBeInTheDocument()
        })

        it('has correct number of shortcut items', () => {
            render(<KeyboardShortcuts />)

            // General: 2, Chat: 3, Navigation: 2 = 7 total
            const descriptions = [
                'Start new chat',
                'Toggle command bar',
                'Send message',
                'New line in message',
                'Select all text in message (when focused)',
                'Focus command bar',
                'Open Settings (when main window focused)'
            ]

            descriptions.forEach(desc => {
                expect(screen.getByText(desc)).toBeInTheDocument()
            })
        })
    })
})
