import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Sidebar from './Sidebar'

const mockSettingsUI = {
  settingsUI: {
    frostedPrompt: false,
    theme: 'dark',
    activeTheme: 'dark-default',
    titleBarDensity: 'compact' as const,
    titleBarShowAppName: true,
    titleBarShowChatTitle: true,
    titleBarShowModel: true,
    chatSelectedOverlayStyle: 'linear' as const,
    commandBar: {
      enabled: true,
      size: 'medium' as const,
      maxSuggestions: 5,
      showRecents: true,
      maxRecents: 3,
      enableTabAutocomplete: true,
      overlayOpacity: 45,
      paletteWidth: 'default' as const,
      palettePosition: 'center' as const,
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
  isResizingSidebar: false,
  setIsResizingSidebar: vi.fn(),
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
  pinSession: vi.fn(),
  unpinSession: vi.fn(),
  duplicateSession: vi.fn(),
  assignFolder: vi.fn(),
}

vi.mock('../../contexts/SettingsUIContext', () => ({
  useSettingsUI: () => mockSettingsUI,
}))

vi.mock('../../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

vi.mock('../../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => mockChatHistory,
}))

describe('Sidebar', () => {
  const defaultProps = {
    view: 'chat' as const,
    activeSettingsSection: 'usage',
    onNavigateSettings: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAppShell.sidebarCollapsed = false
    mockAppShell.sidebarHidden = false
    mockAppShell.sidebarWidth = 300
  })

  it('uses the solid sidebar surface when visible', () => {
    const { container } = render(<Sidebar {...defaultProps} />)
    const sidebar = container.querySelector('.sidebar-container')

    expect(sidebar).toBeInTheDocument()
    expect(sidebar).toHaveStyle({ background: 'var(--theme-sidebar-solid)' })
    expect(sidebar).toHaveStyle({ width: '300px' })
  })

  it('collapses to the compact width when collapsed', () => {
    mockAppShell.sidebarCollapsed = true

    const { container } = render(<Sidebar {...defaultProps} />)
    const sidebar = container.querySelector('.sidebar-container')

    expect(sidebar).toHaveStyle({ width: '60px' })
    expect(sidebar).toHaveStyle({ background: 'var(--theme-sidebar-solid)' })
  })

  it('hides completely when sidebarHidden is true', () => {
    mockAppShell.sidebarHidden = true

    const { container } = render(<Sidebar {...defaultProps} />)
    const sidebar = container.querySelector('.sidebar-container')
    const resizeHandle = container.querySelector('.sidebar-resize-handle')

    expect(sidebar).toHaveStyle({ width: '0px' })
    expect(sidebar).toHaveStyle({ pointerEvents: 'none' })
    expect(resizeHandle).not.toBeInTheDocument()
  })

  it('marks the active settings section in settings view', () => {
    render(<Sidebar {...defaultProps} view="settings" activeSettingsSection="themes" />)

    expect(screen.getByRole('button', { name: 'Appearance' })).toHaveClass('active')
  })
})
