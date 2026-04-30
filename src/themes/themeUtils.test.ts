/**
 * Unit tests for themeUtils
 * Tests palette generation and applyThemeToDocument behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getThemeCssVariables, applyThemeToDocument } from './themeUtils'
import { getDefaultTheme, getThemeById } from './themeRegistry'

describe('themeUtils', () => {
  describe('getThemeCssVariables', () => {
    it('returns all expected CSS variable mappings for a theme', () => {
      const theme = getDefaultTheme()
      const vars = getThemeCssVariables(theme)
      expect(vars['--theme-background']).toBeDefined()
      expect(vars['--theme-text-primary']).toBeDefined()
      expect(vars['--theme-border']).toBeDefined()
    })

    it('returns theme colors for all required CSS vars', () => {
      const theme = getDefaultTheme()
      const vars = getThemeCssVariables(theme)
      expect(vars['--theme-accent']).toBe(theme.colors.accent)
      expect(vars['--theme-background']).toBe(theme.colors.background)
    })
  })

  describe('applyThemeToDocument', () => {
    beforeEach(() => {
      document.documentElement.style.cssText = ''
      document.documentElement.removeAttribute('data-theme')
      document.documentElement.classList.remove('dark')
    })

    afterEach(() => {
      document.documentElement.style.cssText = ''
      document.documentElement.removeAttribute('data-theme')
    })

    it('applies theme CSS variables to document root', () => {
      const theme = getDefaultTheme()
      applyThemeToDocument(theme)
      const bg = document.documentElement.style.getPropertyValue('--theme-background')
      expect(bg).toBe(theme.colors.background)
      expect(document.documentElement.style.getPropertyValue('--theme-sidebar-solid')).toBe(
        theme.colors.background
      )
      expect(document.documentElement.style.getPropertyValue('--theme-content-solid')).toBe(
        theme.colors.surface
      )
    })

    it('sets data-theme attribute', () => {
      const theme = getDefaultTheme()
      applyThemeToDocument(theme)
      expect(document.documentElement.getAttribute('data-theme')).toBe(theme.id)
    })

    it('toggles dark class based on theme.isDark', () => {
      const theme = getDefaultTheme()
      applyThemeToDocument(theme)
      expect(document.documentElement.classList.contains('dark')).toBe(theme.isDark)
      expect(document.documentElement.style.colorScheme).toBe('dark')
    })

    it('applies custom accent color when provided', () => {
      const theme = getDefaultTheme()
      applyThemeToDocument(theme, { customAccent: '#FF0000' })
      const accent = document.documentElement.style.getPropertyValue('--theme-accent')
      expect(accent).toBe('#FF0000')
    })

    it('applies custom background color when provided', () => {
      const theme = getDefaultTheme()
      applyThemeToDocument(theme, { customBackground: '#222222' })
      const bg = document.documentElement.style.getPropertyValue('--theme-background')
      expect(bg).toBe('#222222')
    })

    it('applies custom foreground color when provided', () => {
      const theme = getDefaultTheme()
      applyThemeToDocument(theme, { customForeground: '#EEEEEE' })
      const fg = document.documentElement.style.getPropertyValue('--theme-text-primary')
      expect(fg).toBe('#EEEEEE')
    })
  })

  describe('preset themes', () => {
    it('has zuraai as default theme', () => {
      const defaultTheme = getDefaultTheme()
      expect(defaultTheme.id).toBe('zuraai')
    })

    it('includes sentry theme preset', () => {
      const sentryTheme = getThemeById('sentry')
      expect(sentryTheme).toBeDefined()
      expect(sentryTheme?.baseColors.accent).toBe('#8e8cff')
    })

    it('includes ayu theme preset', () => {
      const ayuTheme = getThemeById('ayu')
      expect(ayuTheme).toBeDefined()
      expect(ayuTheme?.baseColors.accent).toBe('#e6b450')
    })

    it('includes codex theme preset', () => {
      const codexTheme = getThemeById('codex')
      expect(codexTheme).toBeDefined()
      expect(codexTheme?.baseColors.accent).toBe('#0a84ff')
    })

    it('includes gruvbox theme preset', () => {
      const gruvboxTheme = getThemeById('gruvbox')
      expect(gruvboxTheme).toBeDefined()
      expect(gruvboxTheme?.baseColors.accent).toBe('#458588')
    })

    it('includes vscode-plus theme preset', () => {
      const vscodeTheme = getThemeById('vscode-plus')
      expect(vscodeTheme).toBeDefined()
      expect(vscodeTheme?.baseColors.accent).toBe('#007acc')
    })
  })
})
