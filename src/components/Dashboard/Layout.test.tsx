/**
 * Unit tests for DashboardLayout
 * Tests layout structure and rendering of Sidebar and main content area.
 * Frost/blur is now handled by native Electron APIs (acrylic/vibrancy),
 * so Layout no longer contains frost overlay logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the context hooks
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
            maxSuggestions: 5,
            showRecents: true,
            maxRecents: 3,
            enableTabAutocomplete: true,
        },
    },
    updateSettingsUI: vi.fn(),
}

const mockSettings = {
    settings: {
        aiModel: 'test-model',
        modelProvider: 'openrouter',
    },
    updateSettings: vi.fn(),
    resetSettings: vi.fn(),
}

vi.mock('../../contexts/AppShellContext', () => ({
    useAppShell: () => mockAppShell,
}))

vi.mock('../../contexts/ChatHistoryContext', () => ({
    useChatHistory: () => mockChatHistory,
}))

vi.mock('../../contexts/SettingsUIContext', () => ({
    useSettingsUI: () => mockSettingsUI,
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

describe('DashboardLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockAppShell.dashboardView = 'chat'
    })

    it('renders sidebar and chat area', async () => {
        const { default: DashboardLayout } = await import('./Layout')
        const { getByTestId } = render(<DashboardLayout />)

        expect(getByTestId('mock-sidebar')).toBeInTheDocument()
        expect(getByTestId('mock-chat-area')).toBeInTheDocument()
    })

    it('renders root container with flex layout', async () => {
        const { default: DashboardLayout } = await import('./Layout')
        const { container } = render(<DashboardLayout />)
        const root = container.firstChild as HTMLElement

        expect(root.style.display).toBe('flex')
        expect(root.style.width).toBe('100%')
        expect(root.style.height).toBe('100%')
        expect(root.style.overflow).toBe('hidden')
    })

    it('does not render any frost overlay element', async () => {
        const { default: DashboardLayout } = await import('./Layout')
        const { container } = render(<DashboardLayout />)
        const overlay = container.querySelector('[data-testid="frost-overlay"]')

        expect(overlay).not.toBeInTheDocument()
    })

    it('main content area has z-index 1 for proper stacking', async () => {
        const { default: DashboardLayout } = await import('./Layout')
        const { container } = render(<DashboardLayout />)

        // Main content area is the second child of the root flex container
        const root = container.firstChild as HTMLElement
        const contentArea = root.children[1] as HTMLElement

        expect(contentArea.style.zIndex).toBe('1')
    })
})
