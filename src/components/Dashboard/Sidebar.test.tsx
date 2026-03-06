/**
 * Unit tests for Sidebar glassmorphism styles
 * Tests conditional styling behavior based on frostedSidebar setting and sidebar state
 * 
 * Requirements: 2.1, 2.2, 2.5, 4.1, 4.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Sidebar from './Sidebar'

// Mock the context hooks
const mockSettingsUI = {
    settingsUI: {
        frostedSidebar: false,
        frostedPrompt: false,
        theme: 'dark',
        activeTheme: 'dark-default',
        titleBarDensity: 'compact' as const,
        titleBarShowAppName: true,
        titleBarShowChatTitle: true,
        titleBarShowModel: true,
        commandBar: {
            enabled: true,
            size: 'medium' as const,
            fieldSurface: 35,
            fieldSurfaceFocused: 50,
            dropdownSurface: 35,
            enableBlur: true,
            blurPx: 14,
            maxSuggestions: 5,
            showRecents: true,
            maxRecents: 3,
            enableTabAutocomplete: true,
        },
    },
    updateSettingsUI: vi.fn(),
}

const mockAppShell = {
    dashboardView: 'chat' as const,
    setDashboardView: vi.fn(),
    activeSettingsSection: 'usage',
    setActiveSettingsSection: vi.fn(),
    hasUnsavedSettings: false,
    setHasUnsavedSettings: vi.fn(),
    sidebarCollapsed: false,
    toggleSidebarCollapsed: vi.fn(),
    sidebarWidth: 300,
    setSidebarWidth: vi.fn(),
    sidebarHidden: false,
    toggleSidebarHidden: vi.fn(),
}

const mockChatHistory = {
    sessions: [],
    folders: [],
    currentSessionId: null,
    isLoading: false,
    createSession: vi.fn(),
    switchSession: vi.fn(),
    addMessageToSession: vi.fn(),
    updateStreamingMessage: vi.fn(),
    deleteMessageFromSession: vi.fn(),
    deleteSession: vi.fn(),
    clearAllSessions: vi.fn(),
    updateSessionTitle: vi.fn(),
    refreshSessions: vi.fn(),
    clearCurrentSession: vi.fn(),
    loadFullSession: vi.fn(),
    getSessionMetadata: vi.fn(),
    isSessionLoaded: vi.fn(),
}

const mockSettings = {
    settings: {
        aiModel: 'test-model',
        modelProvider: 'openrouter',
    },
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
}

// Mock the context modules
vi.mock('../../contexts/SettingsUIContext', () => ({
    useSettingsUI: () => mockSettingsUI,
}))

vi.mock('../../contexts/AppShellContext', () => ({
    useAppShell: () => mockAppShell,
}))

vi.mock('../../contexts/ChatHistoryContext', () => ({
    useChatHistory: () => mockChatHistory,
}))

vi.mock('../../contexts/SettingsContext', () => ({
    useSettings: () => mockSettings,
}))

describe('Sidebar Glassmorphism Styles', () => {
    const defaultProps = {
        view: 'chat' as const,
        onOpenSettings: vi.fn(),
        onCloseSettings: vi.fn(),
        onNavigateToChat: vi.fn(),
        activeSettingsSection: 'usage',
        onNavigateSettings: vi.fn(),
        hasUnsavedSettings: false,
    }
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset mock values to defaults
        mockSettingsUI.settingsUI.frostedSidebar = false
        mockAppShell.sidebarCollapsed = false
        mockAppShell.sidebarWidth = 300
        mockAppShell.sidebarHidden = false
    })

    describe('Solid Background (frostedSidebar: false)', () => {
        /**
         * Test: Solid background when frostedSidebar is false
         * Requirements: 2.5 - WHEN frosted sidebar is disabled, THE Sidebar SHALL use 
         * the existing solid `var(--theme-sidebar-solid)` background
         */
        it('applies solid background when frostedSidebar is false', () => {
            mockSettingsUI.settingsUI.frostedSidebar = false
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toBeInTheDocument()
            expect(sidebar).toHaveStyle({ background: 'var(--theme-sidebar-solid)' })
        })

        it('does not apply right border when frostedSidebar is false', () => {
            mockSettingsUI.settingsUI.frostedSidebar = false
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container') as HTMLElement
            
            expect(sidebar.style.borderRight).toBe('0px solid transparent')
        })
    })

    describe('Glassmorphism Styles (frostedSidebar: true)', () => {
        /**
         * Test: Transparent background when frostedSidebar is true
         * Requirements: 2.1 - WHEN frosted sidebar is enabled, THE Sidebar SHALL use
         * transparent background so the glass panel (in AppShellLayout) shows through
         */
        it('applies transparent background when frostedSidebar is true', () => {
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toBeInTheDocument()
            expect(sidebar).toHaveStyle({ background: 'transparent' })
        })

        /**
         * Test: No theme border when frostedSidebar is true
         * Requirements: 2.4 - WHEN frosted sidebar is enabled, THE Sidebar SHALL not
         * apply the solid theme border (glass edge is on the glass panel in AppShellLayout)
         */
        it('does not apply theme border when frostedSidebar is true', () => {
            mockSettingsUI.settingsUI.frostedSidebar = true

            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container') as HTMLElement

            const styleAttr = sidebar.getAttribute('style') || ''
            expect(styleAttr).not.toContain('var(--theme-border)')
        })
    })

    describe('Sidebar Hidden State', () => {
        /**
         * Test: No effects when sidebar is hidden
         * Requirements: 4.2 - WHEN the sidebar is hidden (0px width), THE Sidebar SHALL 
         * not render any glassmorphism effects to avoid visual artifacts
         */
        it('has 0px width when sidebar is hidden', () => {
            mockAppShell.sidebarHidden = true
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ width: '0px' })
        })

        it('does not apply glassmorphism background when sidebar is hidden', () => {
            mockAppShell.sidebarHidden = true
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            // When hidden, should use solid background (shouldApplyGlass is false)
            expect(sidebar).toHaveStyle({ background: 'var(--theme-sidebar-solid)' })
        })

        it('does not apply glassmorphism border when sidebar is hidden', () => {
            mockAppShell.sidebarHidden = true
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container') as HTMLElement
            
            // When hidden, the border should NOT be the glassmorphism border
            // jsdom normalizes 'none' to 'medium', so we verify it's not the glass border
            const styleAttr = sidebar.getAttribute('style') || ''
            expect(styleAttr).not.toContain('rgba(255, 255, 255, 0.08)')
        })

        it('has pointer-events none when sidebar is hidden', () => {
            mockAppShell.sidebarHidden = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ pointerEvents: 'none' })
        })
    })

    describe('Sidebar Collapsed State', () => {
        /**
         * Test: Effects persist when sidebar is collapsed
         * Requirements: 4.1 - WHEN the sidebar is collapsed (60px width) and frosted sidebar 
         * is enabled, THE Sidebar SHALL maintain the glassmorphism effect
         */
        it('has 60px width when sidebar is collapsed', () => {
            mockAppShell.sidebarCollapsed = true
            mockSettingsUI.settingsUI.frostedSidebar = false
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ width: '60px' })
        })

        it('maintains transparent background when sidebar is collapsed and frostedSidebar is true', () => {
            mockAppShell.sidebarCollapsed = true
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            // Transparent so glass panel shows through when collapsed
            expect(sidebar).toHaveStyle({ background: 'transparent' })
        })

        it('uses solid background when sidebar is collapsed and frostedSidebar is false', () => {
            mockAppShell.sidebarCollapsed = true
            mockSettingsUI.settingsUI.frostedSidebar = false
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ background: 'var(--theme-sidebar-solid)' })
        })
    })

    describe('Expanded Sidebar State', () => {
        it('has 300px width when sidebar is expanded', () => {
            mockAppShell.sidebarCollapsed = false
            mockAppShell.sidebarHidden = false
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ width: '300px' })
        })

        it('uses stored custom width when sidebar is expanded', () => {
            mockAppShell.sidebarCollapsed = false
            mockAppShell.sidebarHidden = false
            mockAppShell.sidebarWidth = 384

            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')

            expect(sidebar).toHaveStyle({ width: '384px' })
        })

        it('applies transparent background when expanded and frostedSidebar is true', () => {
            mockAppShell.sidebarCollapsed = false
            mockAppShell.sidebarHidden = false
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ background: 'transparent' })
        })

        it('renders resize handle when expanded and visible', () => {
            const { container } = render(<Sidebar {...defaultProps} />)
            const resizeHandle = container.querySelector('.sidebar-resize-handle')

            expect(resizeHandle).toBeInTheDocument()
        })
    })

    describe('Native Blur (no CSS backdrop-filter)', () => {
        it('applies transparent background when frosted regardless of CSS.supports', () => {
            mockSettingsUI.settingsUI.frostedSidebar = true

            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')

            expect(sidebar).toHaveStyle({ background: 'transparent' })
        })
    })

    describe('State Combinations', () => {
        it('prioritizes hidden state over collapsed state', () => {
            mockAppShell.sidebarHidden = true
            mockAppShell.sidebarCollapsed = true
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container } = render(<Sidebar {...defaultProps} />)
            const sidebar = container.querySelector('.sidebar-container')
            
            // Hidden takes precedence - width should be 0px
            expect(sidebar).toHaveStyle({ width: '0px' })
            // No glassmorphism when hidden
            expect(sidebar).toHaveStyle({ background: 'var(--theme-sidebar-solid)' })
        })

        it('does not render resize handle when hidden', () => {
            mockAppShell.sidebarHidden = true

            const { container } = render(<Sidebar {...defaultProps} />)
            const resizeHandle = container.querySelector('.sidebar-resize-handle')

            expect(resizeHandle).not.toBeInTheDocument()
        })

        it('does not render resize handle when collapsed', () => {
            mockAppShell.sidebarCollapsed = true

            const { container } = render(<Sidebar {...defaultProps} />)
            const resizeHandle = container.querySelector('.sidebar-resize-handle')

            expect(resizeHandle).not.toBeInTheDocument()
        })

        it('applies correct styles when transitioning from hidden to visible', () => {
            // Start hidden
            mockAppShell.sidebarHidden = true
            mockSettingsUI.settingsUI.frostedSidebar = true
            
            const { container, rerender } = render(<Sidebar {...defaultProps} />)
            let sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ width: '0px' })
            
            // Transition to visible
            mockAppShell.sidebarHidden = false
            rerender(<Sidebar {...defaultProps} />)
            sidebar = container.querySelector('.sidebar-container')
            
            expect(sidebar).toHaveStyle({ width: '300px' })
            expect(sidebar).toHaveStyle({ background: 'transparent' })
        })
    })
})
