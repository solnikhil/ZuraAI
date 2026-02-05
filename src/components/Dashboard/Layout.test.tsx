/**
 * Unit tests for Layout frost overlay
 * Tests CSS fallback overlay rendering based on platform and fullWindowFrost setting
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

// Store original navigator.platform
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')

// Mock CSS.supports for jsdom environment
if (typeof CSS !== 'undefined' && !CSS.supports) {
    (CSS as any).supports = vi.fn(() => true)
} else if (typeof CSS === 'undefined') {
    (globalThis as any).CSS = { supports: vi.fn(() => true) }
}

// Mock the context hooks
const mockSettingsUI = {
    settingsUI: {
        fullWindowFrost: false,
        theme: 'dark',
        activeTheme: 'dark-default',
        titleBarDensity: 'compact' as const,
        titleBarShowAppName: true,
        titleBarShowChatTitle: true,
        titleBarShowModel: true,
        autoHideOverlay: false,
        overlayTransparency: 0.95,
        loadOverlayOnStartup: false,
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
    sidebarHidden: false,
    toggleSidebarHidden: vi.fn(),
}

const mockChatHistory = {
    sessions: [],
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

// Mock child components to isolate Layout testing
vi.mock('./Sidebar', () => ({
    default: () => <div data-testid="mock-sidebar">Sidebar</div>,
}))

vi.mock('./ChatArea', () => ({
    default: () => <div data-testid="mock-chat-area">ChatArea</div>,
}))

// Helper to set navigator.platform
function setPlatform(platform: string) {
    Object.defineProperty(navigator, 'platform', {
        value: platform,
        writable: true,
        configurable: true,
    })
}

// Helper to restore navigator.platform
function restorePlatform() {
    if (originalPlatform) {
        Object.defineProperty(navigator, 'platform', originalPlatform)
    }
}

describe('Layout Frost Overlay', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSettingsUI.settingsUI.fullWindowFrost = false
        mockAppShell.dashboardView = 'chat'
    })

    afterEach(() => {
        restorePlatform()
        vi.resetModules()
    })

    describe('Overlay Rendering on Non-macOS', () => {
        /**
         * Test: Overlay renders on Windows when fullWindowFrost is enabled
         * Requirements: 3.1 - WHEN full window frost is enabled on non-macOS platforms,
         * THE system SHALL render a CSS-based frosted overlay
         */
        it('renders frost overlay on Windows when fullWindowFrost is true', async () => {
            setPlatform('Win32')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            // Re-import to pick up new platform
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]')
            
            expect(overlay).toBeInTheDocument()
        })

        /**
         * Test: Overlay renders on Linux when fullWindowFrost is enabled
         * Requirements: 3.1
         */
        it('renders frost overlay on Linux when fullWindowFrost is true', async () => {
            setPlatform('Linux x86_64')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]')
            
            expect(overlay).toBeInTheDocument()
        })
    })

    describe('Overlay Not Rendered on macOS', () => {
        /**
         * Test: Overlay not rendered on macOS (native vibrancy handles it)
         * Requirements: 3.1 - macOS uses native vibrancy, not CSS overlay
         */
        it('does not render frost overlay on macOS even when fullWindowFrost is true', async () => {
            setPlatform('MacIntel')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]')
            
            expect(overlay).not.toBeInTheDocument()
        })

        it('does not render frost overlay on macOS ARM when fullWindowFrost is true', async () => {
            setPlatform('MacARM')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]')
            
            expect(overlay).not.toBeInTheDocument()
        })
    })

    describe('Overlay Not Rendered When Disabled', () => {
        /**
         * Test: Overlay not rendered when fullWindowFrost is false
         * Requirements: 4.6 - WHEN full window frost is disabled, ALL components SHALL
         * use their existing solid backgrounds
         */
        it('does not render frost overlay when fullWindowFrost is false on Windows', async () => {
            setPlatform('Win32')
            mockSettingsUI.settingsUI.fullWindowFrost = false
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]')
            
            expect(overlay).not.toBeInTheDocument()
        })

        it('does not render frost overlay when fullWindowFrost is false on Linux', async () => {
            setPlatform('Linux x86_64')
            mockSettingsUI.settingsUI.fullWindowFrost = false
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]')
            
            expect(overlay).not.toBeInTheDocument()
        })
    })

    describe('Overlay Styling', () => {
        /**
         * Test: Overlay has correct z-index positioning
         * Requirements: 3.4 - THE overlay SHALL be positioned at z-index 0 behind content
         */
        it('positions overlay at z-index 0', async () => {
            setPlatform('Win32')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]') as HTMLElement
            
            expect(overlay).toBeInTheDocument()
            expect(overlay.style.zIndex).toBe('0')
        })

        /**
         * Test: Overlay covers full area with inset: 0
         * Requirements: 3.2 - THE overlay SHALL cover the entire window area
         */
        it('positions overlay with inset 0 to cover full area', async () => {
            setPlatform('Win32')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const overlay = container.querySelector('[data-testid="frost-overlay"]') as HTMLElement
            
            expect(overlay).toBeInTheDocument()
            expect(overlay.style.inset).toBe('0')
            expect(overlay.style.position).toBe('absolute')
        })
    })

    describe('Root Container Transparency', () => {
        /**
         * Test: Root container is transparent when fullWindowFrost is enabled
         * Requirements: 2.4 - THE window SHALL have transparent background
         */
        it('sets transparent background on root when fullWindowFrost is true', async () => {
            setPlatform('Win32')
            mockSettingsUI.settingsUI.fullWindowFrost = true
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const root = container.firstChild as HTMLElement
            
            expect(root.style.backgroundColor).toBe('transparent')
        })

        /**
         * Test: Root container has solid background when fullWindowFrost is disabled
         * Requirements: 4.6
         */
        it('sets solid background on root when fullWindowFrost is false', async () => {
            setPlatform('Win32')
            mockSettingsUI.settingsUI.fullWindowFrost = false
            
            vi.resetModules()
            const { default: DashboardLayout } = await import('./Layout')
            
            const { container } = render(<DashboardLayout />)
            const root = container.firstChild as HTMLElement
            
            expect(root.style.backgroundColor).toBe('var(--theme-background)')
        })
    })
})
