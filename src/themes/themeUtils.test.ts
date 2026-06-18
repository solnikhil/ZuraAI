/**
 * Unit tests for themeUtils
 * Tests palette generation and applyThemeToDocument behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getThemeCssVariables, applyThemeToDocument } from './themeUtils'
import { getDefaultTheme, getThemeById, mixHex } from './themeRegistry'

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
        mixHex(theme.colors.background, '#ffffff', 0.04)
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

    it('includes codex theme preset', () => {
      const codexTheme = getThemeById('codex')
      expect(codexTheme).toBeDefined()
      expect(codexTheme?.baseColors.accent).toBe('#0a84ff')
    })

    it('includes warm-ledger soothing preset', () => {
      const theme = getThemeById('warm-ledger')
      expect(theme).toBeDefined()
      expect(theme?.baseColors.accent).toBe('#a88c6f')
      expect(theme?.baseColors.background).toBe('#1e1c19')
    })

    it('includes quiet-sage soothing preset', () => {
      const theme = getThemeById('quiet-sage')
      expect(theme).toBeDefined()
      expect(theme?.baseColors.accent).toBe('#6d8b78')
      expect(theme?.baseColors.background).toBe('#181b18')
    })

    it('includes stone-linen soothing preset', () => {
      const theme = getThemeById('stone-linen')
      expect(theme).toBeDefined()
      expect(theme?.baseColors.accent).toBe('#7a8c9a')
      expect(theme?.baseColors.background).toBe('#1a1d22')
    })

    it('includes void black preset', () => {
      const theme = getThemeById('void')
      expect(theme).toBeDefined()
      expect(theme?.baseColors.accent).toBe('#5b5f68')
      expect(theme?.baseColors.background).toBe('#0a0a0a')
    })

    it('includes charcoal grey preset', () => {
      const theme = getThemeById('charcoal')
      expect(theme).toBeDefined()
      expect(theme?.baseColors.accent).toBe('#6b6f78')
      expect(theme?.baseColors.background).toBe('#16171a')
    })
  })
})
