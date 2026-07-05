import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Sidebar from './Sidebar'

const mockSettingsUI = {
  settingsUI: {
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

const mockSettings = {
  settings: {
    skills: {
      reminders: { enabled: false },
      artifacts: { enabled: false },
    },
  },
}

vi.mock('../../contexts/SettingsUIContext', () => ({
  useSettingsUI: () => mockSettingsUI,
}))

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

vi.mock('../../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

vi.mock('../../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => mockChatHistory,
}))

vi.mock('../TitleBarInfoMenu', () => ({
  default: () => <div data-testid="mock-app-menu">App</div>,
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
    mockChatHistory.sessions = []
    mockChatHistory.folders = []
    mockSettings.settings.skills.reminders.enabled = false
    mockSettings.settings.skills.artifacts.enabled = false
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

  it('renders the app menu trigger in the sidebar footer', () => {
    render(<Sidebar {...defaultProps} />)

    expect(screen.getByTestId('mock-app-menu')).toBeInTheDocument()
  })

  it('shows the Reminders entry only when the skill is enabled', () => {
    const hidden = render(<Sidebar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: 'Reminders' })).not.toBeInTheDocument()
    hidden.unmount()

    mockSettings.settings.skills.reminders.enabled = true
    render(<Sidebar {...defaultProps} />)

    const remindersButton = screen.getByRole('button', { name: 'Reminders' })
    expect(remindersButton.closest('.sidebar-chatlist__scroller')).toBeInTheDocument()

    remindersButton.click()
    expect(mockAppShell.setDashboardView).toHaveBeenCalledWith('reminders')
  })

  it('shows the Artifacts entry in the scrollable list when the skill is enabled', () => {
    mockSettings.settings.skills.artifacts.enabled = true

    render(<Sidebar {...defaultProps} />)

    const artifactsButton = screen.getByRole('button', { name: 'Artifacts' })
    expect(artifactsButton.closest('.sidebar-chatlist__scroller')).toBeInTheDocument()

    artifactsButton.click()
    expect(mockAppShell.setDashboardView).toHaveBeenCalledWith('artifacts')
  })

  it('groups folder chats under a collapsible Projects section', () => {
    mockChatHistory.folders = [{ id: 'folder-1', name: 'ZuraAI', order: 0, createdAt: Date.now() }]
    mockChatHistory.sessions = [
      {
        id: 'chat-1',
        title: 'Diagram AI automation',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        folderId: 'folder-1',
        tags: [],
      },
    ]

    render(<Sidebar {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('ZuraAI')).toBeInTheDocument()
    expect(screen.getByText('Diagram AI automation')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))

    expect(screen.getByRole('button', { name: 'Projects' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByText('ZuraAI')).not.toBeInTheDocument()
    expect(screen.queryByText('Diagram AI automation')).not.toBeInTheDocument()
  })
})
