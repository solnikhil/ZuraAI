/**
 * Property-Based Tests for Window Control Buttons Conditional Rendering
 *
 * Feature: frosted-sidebar-window-controls-fix
 * Task: 1.4 Write property tests for conditional rendering (Property 1, Property 5, Property 6)
 *
 * These tests verify the correctness properties defined in the design document:
 * - Property 1: Custom controls render only in frosted Windows mode
 * - Property 5: macOS never renders custom window controls
 * - Property 6: All custom control buttons exclude drag region
 *
 * **Validates: Requirements 1.1, 1.2, 4.1, 4.4, 5.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// ============================================================================
// Mocks — must be declared before any imports that use them
// ============================================================================

// Mutable mock state that property tests will mutate per iteration
const mockSettingsUI = {
  settingsUI: {
    frostedSidebar: false,
    frostedPrompt: false,
    theme: 'dark' as const,
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
    titleBarShowModel: true,
    titleBarShowChatTitle: true,
    titleBarDensity: 'compact',
  },
  updateSettings: vi.fn(),
  resetSettings: vi.fn(),
}

// Mock all context modules
vi.mock('../contexts/SettingsUIContext', () => ({
  useSettingsUI: () => mockSettingsUI,
}))

vi.mock('../contexts/AppShellContext', () => ({
  useAppShell: () => mockAppShell,
}))

vi.mock('../contexts/ChatHistoryContext', () => ({
  useChatHistory: () => mockChatHistory,
}))

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => mockSettings,
}))

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/dashboard' }),
  useNavigate: () => vi.fn(),
}))

// Mock Toast context
vi.mock('./shared/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

// ============================================================================
// Imports under test (after mocks)
// ============================================================================

import TitleBar from './TitleBar'
import WindowControlButtons from './WindowControlButtons'

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Platform type as defined in the design document
 */
type Platform = 'win32' | 'darwin' | 'linux'

/**
 * Maps a platform identifier to a navigator.platform string.
 * TitleBar checks: navigator.platform.toLowerCase().includes('mac')
 */
function platformToNavigatorString(platform: Platform): string {
  switch (platform) {
    case 'win32':
      return 'Win32'
    case 'darwin':
      return 'MacIntel'
    case 'linux':
      return 'Linux x86_64'
  }
}

/**
 * Determines if a platform is macOS based on the same logic TitleBar uses.
 */
function isMacOSPlatform(platform: Platform): boolean {
  return platformToNavigatorString(platform).toLowerCase().includes('mac')
}

/** Save original navigator.platform so we can restore it */
const originalPlatform = navigator.platform

/**
 * Sets navigator.platform to a given value for testing.
 */
function setNavigatorPlatform(value: string): void {
  Object.defineProperty(navigator, 'platform', {
    value,
    writable: true,
    configurable: true,
  })
}

/**
 * Restores navigator.platform to its original value.
 */
function restoreNavigatorPlatform(): void {
  Object.defineProperty(navigator, 'platform', {
    value: originalPlatform,
    writable: true,
    configurable: true,
  })
}

// ============================================================================
// fast-check Arbitraries
// ============================================================================

/**
 * Arbitrary for platform values as specified in the design document
 */
const platformArbitrary: fc.Arbitrary<Platform> = fc.constantFrom('win32', 'darwin', 'linux')

/**
 * Arbitrary for the combined test input for Property 1
 */
const conditionalRenderingArbitrary = fc.record({
  frostedSidebar: fc.boolean(),
  platform: platformArbitrary,
})

// ============================================================================
// Global test setup
// ============================================================================

beforeEach(() => {
  // Set up window.windowControls mock
  ;(window as any).windowControls = {
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    onWindowState: vi.fn().mockReturnValue(() => {}),
  }

  // Reset mock state to defaults
  mockSettingsUI.settingsUI.frostedSidebar = false
  mockAppShell.sidebarCollapsed = false
  mockAppShell.sidebarHidden = false
})

afterEach(() => {
  cleanup()
  restoreNavigatorPlatform()
  vi.clearAllMocks()
})

// ============================================================================
// Property 1: Custom controls render on all non-macOS platforms
// ============================================================================

/**
 * Feature: frosted-sidebar-window-controls-fix, Property 1: Custom controls render on all non-macOS platforms
 *
 * *For any* combination of `frostedSidebar` (true/false) and platform (win32/darwin/linux),
 * the TitleBar should render custom minimize, maximize/restore, and close buttons
 * if and only if the platform is not macOS (native overlay is disabled).
 *
 * **Validates: Requirements 1.1, 1.2, 4.1**
 */
describe('Property 1: Custom controls render on all non-macOS platforms', () => {
  it('should render custom window control buttons iff platform is not macOS', () => {
    fc.assert(
      fc.property(
        conditionalRenderingArbitrary,
        ({ frostedSidebar, platform }) => {
          // Arrange: set the platform and frostedSidebar state
          setNavigatorPlatform(platformToNavigatorString(platform))
          mockSettingsUI.settingsUI.frostedSidebar = frostedSidebar

          // Act: render TitleBar
          const { queryByLabelText } = render(React.createElement(TitleBar))

          // Determine expected behavior — native overlay is disabled,
          // so custom controls render on all non-macOS platforms
          const isMacOS = isMacOSPlatform(platform)
          const shouldRenderCustomControls = !isMacOS

          // Assert: check for custom control buttons by their aria-labels
          const minimizeBtn = queryByLabelText('Minimize window')
          const closeBtn = queryByLabelText('Close window')

          if (shouldRenderCustomControls) {
            expect(minimizeBtn).toBeInTheDocument()
            expect(closeBtn).toBeInTheDocument()
          } else {
            expect(minimizeBtn).not.toBeInTheDocument()
            expect(closeBtn).not.toBeInTheDocument()
          }

          // Cleanup for next iteration
          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should always use WindowControlButtons wrapper on non-macOS platforms', () => {
    fc.assert(
      fc.property(
        conditionalRenderingArbitrary,
        ({ frostedSidebar, platform }) => {
          // Arrange
          setNavigatorPlatform(platformToNavigatorString(platform))
          mockSettingsUI.settingsUI.frostedSidebar = frostedSidebar

          // Act
          const { container } = render(React.createElement(TitleBar))

          const isMacOS = isMacOSPlatform(platform)

          // The WindowControlButtons wrapper should be present on all non-macOS platforms
          const windowControlsWrapper = container.querySelector('.app-titlebar__window-controls')

          if (!isMacOS) {
            expect(windowControlsWrapper).toBeInTheDocument()
          } else {
            expect(windowControlsWrapper).not.toBeInTheDocument()
          }

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 2: Maximize/restore icon reflects window state
// ============================================================================

/**
 * Feature: frosted-sidebar-window-controls-fix, Property 2: Maximize/restore icon reflects window state
 *
 * *For any* sequence of maximize state changes (true → false, false → true),
 * the rendered maximize/restore button icon should always match the current
 * `isMaximized` state — showing the restore icon when maximized and the
 * maximize icon when not maximized.
 *
 * **Validates: Requirements 1.7**
 */
describe('Property 2: Maximize/restore icon reflects window state', () => {
  it('should show "Restore window" aria-label when isMaximized is true and "Maximize window" when false', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isMaximized) => {
          // Arrange & Act: render WindowControlButtons with the given isMaximized state
          const { queryByLabelText } = render(
            React.createElement(WindowControlButtons, {
              isMaximized,
              onMinimize: vi.fn(),
              onToggleMaximize: vi.fn(),
              onClose: vi.fn(),
            })
          )

          // Assert: the correct aria-label is present based on isMaximized
          if (isMaximized) {
            expect(queryByLabelText('Restore window')).toBeInTheDocument()
            expect(queryByLabelText('Maximize window')).not.toBeInTheDocument()
          } else {
            expect(queryByLabelText('Maximize window')).toBeInTheDocument()
            expect(queryByLabelText('Restore window')).not.toBeInTheDocument()
          }

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should show correct title attribute matching the isMaximized state', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isMaximized) => {
          // Arrange & Act
          const { container } = render(
            React.createElement(WindowControlButtons, {
              isMaximized,
              onMinimize: vi.fn(),
              onToggleMaximize: vi.fn(),
              onClose: vi.fn(),
            })
          )

          // Find the maximize/restore button (the second button)
          const buttons = container.querySelectorAll('button')
          const maxRestoreBtn = buttons[1] // minimize=0, max/restore=1, close=2

          // Assert: title attribute matches state
          if (isMaximized) {
            expect(maxRestoreBtn.getAttribute('title')).toBe('Restore')
          } else {
            expect(maxRestoreBtn.getAttribute('title')).toBe('Maximize')
          }

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should maintain correct icon state across a sequence of maximize state changes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (stateSequence) => {
          // For each state in the sequence, render and verify the icon matches
          for (const isMaximized of stateSequence) {
            const { queryByLabelText } = render(
              React.createElement(WindowControlButtons, {
                isMaximized,
                onMinimize: vi.fn(),
                onToggleMaximize: vi.fn(),
                onClose: vi.fn(),
              })
            )

            // The final state in each render should always be consistent
            if (isMaximized) {
              expect(queryByLabelText('Restore window')).toBeInTheDocument()
              expect(queryByLabelText('Maximize window')).not.toBeInTheDocument()
            } else {
              expect(queryByLabelText('Maximize window')).toBeInTheDocument()
              expect(queryByLabelText('Restore window')).not.toBeInTheDocument()
            }

            cleanup()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should render exactly one maximize/restore button regardless of isMaximized state', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isMaximized) => {
          const { container } = render(
            React.createElement(WindowControlButtons, {
              isMaximized,
              onMinimize: vi.fn(),
              onToggleMaximize: vi.fn(),
              onClose: vi.fn(),
            })
          )

          // There should always be exactly 3 buttons total (minimize, max/restore, close)
          const buttons = container.querySelectorAll('button')
          expect(buttons.length).toBe(3)

          // Exactly one of the max/restore labels should be present
          const maxBtn = container.querySelector('[aria-label="Maximize window"]')
          const restoreBtn = container.querySelector('[aria-label="Restore window"]')

          // XOR: exactly one should exist
          const hasMax = maxBtn !== null
          const hasRestore = restoreBtn !== null
          expect(hasMax !== hasRestore).toBe(true)

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 5: macOS never renders custom window controls
// ============================================================================

/**
 * Feature: frosted-sidebar-window-controls-fix, Property 5: macOS never renders custom window controls
 *
 * *For any* value of `frostedSidebar` (true or false), when the platform is macOS,
 * the TitleBar should never render custom minimize, maximize/restore, or close
 * window control buttons.
 *
 * **Validates: Requirements 4.4**
 */
describe('Property 5: macOS never renders custom window controls', () => {
  it('should never render custom minimize, maximize/restore, or close buttons on macOS', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (frostedSidebar) => {
          // Arrange: fix platform to macOS
          setNavigatorPlatform('MacIntel')
          mockSettingsUI.settingsUI.frostedSidebar = frostedSidebar

          // Act
          const { queryByLabelText, container } = render(React.createElement(TitleBar))

          // Assert: no custom window control buttons should exist
          expect(queryByLabelText('Minimize window')).not.toBeInTheDocument()
          expect(queryByLabelText('Close window')).not.toBeInTheDocument()

          // Also verify no WindowControlButtons wrapper is rendered
          const windowControlsWrapper = container.querySelector('.app-titlebar__window-controls')
          expect(windowControlsWrapper).not.toBeInTheDocument()

          // Also verify no standalone maximize button (macOS uses native traffic lights)
          const standaloneMaxBtn = container.querySelector('.app-titlebar__right .app-titlebar__window-btn')
          expect(standaloneMaxBtn).not.toBeInTheDocument()

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ============================================================================
// Property 6: All custom control buttons exclude drag region
// ============================================================================

/**
 * Feature: frosted-sidebar-window-controls-fix, Property 6: All custom control buttons exclude drag region
 *
 * *For any* rendered custom window control button (minimize, maximize/restore, close),
 * the button element should have the `no-drag` CSS class to prevent interference
 * with title bar dragging.
 *
 * **Validates: Requirements 5.3**
 */
describe('Property 6: All custom control buttons exclude drag region', () => {
  it('should have no-drag class on all custom control buttons when rendered via TitleBar', () => {
    // Arrange: frosted=true, platform=win32 to ensure controls render
    setNavigatorPlatform('Win32')
    mockSettingsUI.settingsUI.frostedSidebar = true

    const { container } = render(React.createElement(TitleBar))

    // Query all custom window control buttons
    const windowBtns = container.querySelectorAll('.app-titlebar__window-btn')

    // There should be exactly 3 buttons (minimize, maximize/restore, close)
    expect(windowBtns.length).toBe(3)

    // Assert: every button has the no-drag class
    windowBtns.forEach((btn) => {
      expect(btn.classList.contains('no-drag')).toBe(true)
    })
  })

  it('should have no-drag class on all buttons for any isMaximized state', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isMaximized) => {
          // Render WindowControlButtons directly with the given isMaximized state
          const { container } = render(
            React.createElement(WindowControlButtons, {
              isMaximized,
              onMinimize: vi.fn(),
              onToggleMaximize: vi.fn(),
              onClose: vi.fn(),
            })
          )

          // Query all buttons inside the component
          const buttons = container.querySelectorAll('button')

          // There should be exactly 3 buttons
          expect(buttons.length).toBe(3)

          // Property: every button must have the no-drag class
          buttons.forEach((btn) => {
            expect(btn.classList.contains('no-drag')).toBe(true)
          })

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should have no-drag class on the wrapper div as well', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isMaximized) => {
          const { container } = render(
            React.createElement(WindowControlButtons, {
              isMaximized,
              onMinimize: vi.fn(),
              onToggleMaximize: vi.fn(),
              onClose: vi.fn(),
            })
          )

          // The wrapper div should also have no-drag
          const wrapper = container.querySelector('.app-titlebar__window-controls')
          expect(wrapper).toBeInTheDocument()
          expect(wrapper!.classList.contains('no-drag')).toBe(true)

          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })
})
