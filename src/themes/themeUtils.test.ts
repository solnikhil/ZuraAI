/**
 * Unit tests for themeUtils
 * Tests palette generation and applyThemeToDocument behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getThemeCssVariables,
  applyThemeToDocument,
  applyFontScaleToDocument,
  normalizeFontScale,
} from './themeUtils'
import {
  getDefaultTheme,
  getThemeById,
  getResolvedTheme,
  getLightChromeBackground,
  getLightContentBackground,
  mixHex,
  normalizeActiveThemeId,
  resolveEffectiveIsDark,
} from './themeRegistry'
import { normalizeStoredSettings } from '../contexts/settingsStore'

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

    it('uses separate sidebar chrome and content surfaces in light mode', () => {
      const theme = getThemeById('quiet-sage', false)!
      applyThemeToDocument(theme)

      const sidebar = document.documentElement.style.getPropertyValue('--theme-sidebar-solid')
      const content = document.documentElement.style.getPropertyValue('--theme-content-solid')

      expect(sidebar).toBe(
        getLightChromeBackground(theme.baseColors.background, theme.baseColors.accent)
      )
      expect(content).toBe(theme.colors.background)
      expect(sidebar).not.toBe(content)
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

  describe('font scale', () => {
    beforeEach(() => {
      document.documentElement.style.cssText = ''
    })

    afterEach(() => {
      document.documentElement.style.cssText = ''
    })

    it('normalizes invalid font scale values to the default', () => {
      expect(normalizeFontScale(undefined)).toBe(100)
      expect(normalizeFontScale(Number.NaN)).toBe(100)
      expect(normalizeFontScale('115')).toBe(100)
    })

    it('clamps and snaps font scale values to the supported range and step', () => {
      expect(normalizeFontScale(80)).toBe(85)
      expect(normalizeFontScale(127)).toBe(125)
      expect(normalizeFontScale(112)).toBe(110)
      expect(normalizeFontScale(113)).toBe(115)
    })

    it('applies font scale CSS variables to the document root', () => {
      expect(applyFontScaleToDocument(125)).toBe(125)

      expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe('1.25')
      expect(document.documentElement.style.getPropertyValue('--app-root-font-size')).toBe(
        '18.75px'
      )
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

    it('migrates removed theme presets to their shared replacements', () => {
      expect(normalizeActiveThemeId('charcoal')).toBe('graphite')
      expect(normalizeActiveThemeId('void')).toBe('graphite')
      expect(normalizeActiveThemeId('noir')).toBe('zuraai')
      expect(normalizeActiveThemeId('paper-trail')).toBe('zuraai')
      expect(normalizeActiveThemeId('zuraai-light')).toBe('zuraai')
    })

    it('resolves removed theme ids through getThemeById', () => {
      expect(getThemeById('charcoal')?.id).toBe('graphite')
      expect(getThemeById('void')?.id).toBe('graphite')
      expect(getThemeById('noir')?.id).toBe('zuraai')
      expect(getThemeById('paper-trail')?.id).toBe('zuraai')
      expect(getThemeById('zuraai-light')?.id).toBe('zuraai')
    })

    it('returns different base colors for the same preset id under light and dark', () => {
      const darkTheme = getThemeById('zuraai', true)
      const lightTheme = getThemeById('zuraai', false)

      expect(darkTheme?.id).toBe('zuraai')
      expect(lightTheme?.id).toBe('zuraai')
      expect(darkTheme?.name).toBe(lightTheme?.name)
      expect(darkTheme?.baseColors.background).not.toBe(lightTheme?.baseColors.background)
      expect(darkTheme?.isDark).toBe(true)
      expect(lightTheme?.isDark).toBe(false)
    })

    it('splits light mode into tinted chrome and a cleaner content workspace', () => {
      const lightTheme = getThemeById('quiet-sage', false)
      const chrome = getLightChromeBackground(
        lightTheme!.baseColors.background,
        lightTheme!.baseColors.accent
      )
      const content = getLightContentBackground(chrome)

      expect(lightTheme?.colors.background).toBe(content)
      expect(content).not.toBe(chrome)
      expect(lightTheme?.colors.surface).not.toBe(lightTheme?.colors.background)
    })

    it('resolves theme variation from active preset and appearance mode', () => {
      const darkResolved = getResolvedTheme('warm-ledger', 'dark', false)
      const lightResolved = getResolvedTheme('warm-ledger', 'light', true)

      expect(darkResolved.id).toBe('warm-ledger')
      expect(lightResolved.id).toBe('warm-ledger')
      expect(darkResolved.baseColors.background).toBe('#1e1c19')
      expect(lightResolved.baseColors.background).toBe('#d6c9b8')
      expect(lightResolved.colors.background).toBe(
        getLightContentBackground(
          getLightChromeBackground(
            lightResolved.baseColors.background,
            lightResolved.baseColors.accent
          )
        )
      )
    })

    it('uses system preference when appearance mode is system', () => {
      expect(resolveEffectiveIsDark('system', true)).toBe(true)
      expect(resolveEffectiveIsDark('system', false)).toBe(false)
      expect(resolveEffectiveIsDark('light', true)).toBe(false)
      expect(resolveEffectiveIsDark('dark', false)).toBe(true)
    })

    it('normalizes legacy polarized activeTheme ids in stored settings', () => {
      const normalized = normalizeStoredSettings(
        JSON.stringify({
          activeTheme: 'zuraai-light',
          theme: 'light',
          themeContrast: 85,
        })
      )

      expect(normalized.activeTheme).toBe('zuraai')
      expect(normalized.theme).toBe('light')
      expect(normalized.themeContrast).toBe(85)
    })
  })
})
