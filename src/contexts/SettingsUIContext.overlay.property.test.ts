/**
 * Property-Based Tests for Overlay Color Handling
 *
 * Feature: frosted-sidebar-window-controls-fix, Property 4: Overlay colors match theme when not frosted
 *
 * This test verifies that the titlebar overlay IPC call receives the correct
 * color and symbolColor values based on the frostedSidebar setting and the
 * active theme's colors.
 *
 * When frostedSidebar is false:
 *   - color should equal the theme's background color
 *   - symbolColor should equal the theme's textPrimary color
 *
 * When frostedSidebar is true:
 *   - both color and symbolColor should be '#00000000' (fully transparent)
 *
 * **Validates: Requirements 3.2, 3.3**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { render, cleanup, act } from '@testing-library/react'

// ============================================================================
// Types for the mock theme
// ============================================================================

interface MockThemeColors {
  background: string
  textPrimary: string
}

// ============================================================================
// Mocks — must be declared before any imports that use them
// ============================================================================

/**
 * Mutable mock theme that property tests will mutate per iteration.
 * We only need background and textPrimary for this property test.
 */
let mockThemeColors: MockThemeColors = {
  background: '#14120B',
  textPrimary: '#ffffff',
}

// Mock the theme registry to return our controlled theme
vi.mock('../themes/themeRegistry', () => ({
  getThemeById: () => ({
    id: 'test-theme',
    name: 'Test Theme',
    category: 'classic' as const,
    isDark: true,
    colors: {
      background: mockThemeColors.background,
      surface: '#1B1913',
      surfaceHover: 'rgba(255, 255, 255, 0.05)',
      surfaceActive: 'rgba(255, 255, 255, 0.08)',
      surfacePressed: 'rgba(255, 255, 255, 0.1)',
      surfaceSubtle: 'rgba(255, 255, 255, 0.02)',
      textPrimary: mockThemeColors.textPrimary,
      textSecondary: '#f0f0f0',
      textTertiary: '#b0b0b0',
      textMuted: '#999999',
      textInverse: '#000000',
      border: 'rgba(255, 255, 255, 0.06)',
      borderHover: 'rgba(255, 255, 255, 0.1)',
      borderActive: 'rgba(255, 255, 255, 0.12)',
      borderSubtle: 'rgba(255, 255, 255, 0.03)',
      accent: '#8b5cf6',
      accentSecondary: '#06b6d4',
      accentHover: '#7c3aed',
      accentMuted: 'rgba(139, 92, 246, 0.2)',
      error: '#ef4444',
      errorBg: 'rgba(239, 68, 68, 0.1)',
      success: '#4ade80',
      successBg: 'rgba(74, 222, 128, 0.1)',
      warning: '#fbbf24',
      warningBg: 'rgba(251, 191, 36, 0.1)',
      info: '#3b82f6',
      infoBg: 'rgba(59, 130, 246, 0.1)',
      favorite: '#FFD700',
      userMessageBg: 'linear-gradient(135deg, #ff7a50 0%, #ff5a30 100%)',
      userMessageText: '#ffffff',
      assistantMessageBg: 'rgba(27, 25, 19, 0.85)',
      assistantMessageText: '#e0e0e0',
      overlayBg: 'rgba(0, 0, 0, 0.7)',
      dimmerBg: 'rgba(0, 0, 0, 0.4)',
      selectionBg: 'rgba(139, 92, 246, 0.3)',
      selectionText: '#ffffff',
      shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
      scrollbar: 'rgba(255, 255, 255, 0.1)',
      scrollbarHover: 'rgba(255, 255, 255, 0.16)',
    },
  }),
  getDefaultTheme: () => ({
    id: 'dark-default',
    name: 'Dark Default',
    category: 'classic' as const,
    isDark: true,
    colors: {
      background: mockThemeColors.background,
      textPrimary: mockThemeColors.textPrimary,
    },
  }),
}))

// Mock applyThemeToDocument to avoid DOM side effects
vi.mock('../themes/themeUtils', () => ({
  applyThemeToDocument: vi.fn(),
}))

// ============================================================================
// Import under test (after mocks)
// ============================================================================

import { SettingsUIProvider, type SettingsUI } from './SettingsUIContext'

// ============================================================================
// fast-check Arbitraries
// ============================================================================

/**
 * Generates a valid 6-digit hex color string (e.g., '#A3F1B2').
 * This covers the full range of possible theme colors.
 */
const hexColorArbitrary: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  )
  .map(([r, g, b]) => {
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${hex(r)}${hex(g)}${hex(b)}`
  })

/**
 * Generates a pair of theme colors: { background, textPrimary }
 */
const themeColorPairArbitrary = fc.record({
  background: hexColorArbitrary,
  textPrimary: hexColorArbitrary,
})

/**
 * Generates titlebar density values
 */
const densityArbitrary: fc.Arbitrary<'comfortable' | 'compact'> = fc.constantFrom(
  'comfortable' as const,
  'compact' as const
)

// ============================================================================
// Test Helpers
// ============================================================================

/** Tracks calls to window.ipcRenderer.send */
let ipcSendSpy: ReturnType<typeof vi.fn>

// ============================================================================
// Global test setup
// ============================================================================

beforeEach(() => {
  // Set up window.ipcRenderer mock with a spy on send
  ipcSendSpy = vi.fn()
  window.ipcRenderer = {
    send: ipcSendSpy,
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
  } as any

  // Reset mock theme colors to defaults
  mockThemeColors.background = '#14120B'
  mockThemeColors.textPrimary = '#ffffff'
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ============================================================================
// Property 4: Overlay colors match theme when not frosted
// ============================================================================

/**
 * Feature: frosted-sidebar-window-controls-fix, Property 4: Overlay colors match theme when not frosted
 *
 * *For any* theme configuration, when `frostedSidebar` is false, the titlebar
 * overlay `color` should equal the theme's background color and `symbolColor`
 * should equal the theme's text primary color.
 *
 * **Validates: Requirements 3.2, 3.3**
 */
describe('Property 4: Overlay colors match theme when not frosted', () => {
  it('should set overlay color to theme background and symbolColor to theme textPrimary when frosted is false', () => {
    fc.assert(
      fc.property(
        themeColorPairArbitrary,
        densityArbitrary,
        (colors, density) => {
          // Arrange: set the mock theme colors for this iteration
          mockThemeColors.background = colors.background
          mockThemeColors.textPrimary = colors.textPrimary
          ipcSendSpy.mockClear()

          // Act: render SettingsUIProvider with frostedSidebar=false
          const initialSettings: Partial<SettingsUI> = {
            frostedSidebar: false,
            activeTheme: 'test-theme',
            titleBarDensity: density,
          }

          render(
            React.createElement(
              SettingsUIProvider,
              { initialSettings },
              React.createElement('div', null, 'test child')
            )
          )

          // Assert: verify the IPC call was made with correct overlay colors
          const overlayCall = ipcSendSpy.mock.calls.find(
            (call: any[]) => call[0] === 'set-titlebar-overlay'
          )

          expect(overlayCall).toBeDefined()

          const overlayArgs = overlayCall![1]

          // Property: color should equal theme background
          expect(overlayArgs.color).toBe(colors.background)

          // Property: symbolColor should equal theme textPrimary
          expect(overlayArgs.symbolColor).toBe(colors.textPrimary)

          // Cleanup for next iteration
          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should set both overlay color and symbolColor to transparent (#00000000) when frosted is true', () => {
    fc.assert(
      fc.property(
        themeColorPairArbitrary,
        densityArbitrary,
        (colors, density) => {
          // Arrange: set the mock theme colors for this iteration
          mockThemeColors.background = colors.background
          mockThemeColors.textPrimary = colors.textPrimary
          ipcSendSpy.mockClear()

          // Act: render SettingsUIProvider with frostedSidebar=true
          const initialSettings: Partial<SettingsUI> = {
            frostedSidebar: true,
            activeTheme: 'test-theme',
            titleBarDensity: density,
          }

          render(
            React.createElement(
              SettingsUIProvider,
              { initialSettings },
              React.createElement('div', null, 'test child')
            )
          )

          // Assert: verify the IPC call was made with transparent colors
          const overlayCall = ipcSendSpy.mock.calls.find(
            (call: any[]) => call[0] === 'set-titlebar-overlay'
          )

          expect(overlayCall).toBeDefined()

          const overlayArgs = overlayCall![1]

          // Property: both color and symbolColor should be fully transparent
          expect(overlayArgs.color).toBe('#00000000')
          expect(overlayArgs.symbolColor).toBe('#00000000')

          // Cleanup for next iteration
          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should set correct overlay height based on titleBarDensity', () => {
    fc.assert(
      fc.property(
        themeColorPairArbitrary,
        densityArbitrary,
        fc.boolean(),
        (colors, density, frostedSidebar) => {
          // Arrange
          mockThemeColors.background = colors.background
          mockThemeColors.textPrimary = colors.textPrimary
          ipcSendSpy.mockClear()

          const initialSettings: Partial<SettingsUI> = {
            frostedSidebar,
            activeTheme: 'test-theme',
            titleBarDensity: density,
          }

          // Act
          render(
            React.createElement(
              SettingsUIProvider,
              { initialSettings },
              React.createElement('div', null, 'test child')
            )
          )

          // Assert
          const overlayCall = ipcSendSpy.mock.calls.find(
            (call: any[]) => call[0] === 'set-titlebar-overlay'
          )

          expect(overlayCall).toBeDefined()

          const overlayArgs = overlayCall![1]
          const expectedHeight = density === 'compact' ? 36 : 44

          // Property: height should match density setting
          expect(overlayArgs.height).toBe(expectedHeight)

          // Cleanup for next iteration
          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('should always send overlay colors that match theme when frosted is false, regardless of theme colors', () => {
    fc.assert(
      fc.property(
        themeColorPairArbitrary,
        (colors) => {
          // Arrange: use arbitrary theme colors
          mockThemeColors.background = colors.background
          mockThemeColors.textPrimary = colors.textPrimary
          ipcSendSpy.mockClear()

          const initialSettings: Partial<SettingsUI> = {
            frostedSidebar: false,
            activeTheme: 'test-theme',
            titleBarDensity: 'compact',
          }

          // Act
          render(
            React.createElement(
              SettingsUIProvider,
              { initialSettings },
              React.createElement('div', null, 'test child')
            )
          )

          // Assert: the overlay colors should NEVER be transparent when not frosted
          const overlayCall = ipcSendSpy.mock.calls.find(
            (call: any[]) => call[0] === 'set-titlebar-overlay'
          )

          expect(overlayCall).toBeDefined()

          const overlayArgs = overlayCall![1]

          // Property: overlay color should never be transparent when not frosted
          expect(overlayArgs.color).not.toBe('#00000000')
          // (unless the theme background itself happens to be #00000000, which our
          // hex color generator doesn't produce since it generates 6-digit hex)
          expect(overlayArgs.color).toBe(colors.background)
          expect(overlayArgs.symbolColor).toBe(colors.textPrimary)

          // Cleanup for next iteration
          cleanup()
        }
      ),
      { numRuns: 100 }
    )
  })
})
