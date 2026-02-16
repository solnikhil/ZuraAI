/**
 * Unit tests for themeUtils
 * Tests softenThemeColors and applyThemeToDocument behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { softenThemeColors, getThemeCssVariables, applyThemeToDocument } from './themeUtils'
import { getDefaultTheme } from './themeRegistry'

describe('themeUtils', () => {
    describe('softenThemeColors', () => {
        it('returns a new theme object without mutating the original', () => {
            const theme = getDefaultTheme()
            const softened = softenThemeColors(theme)
            expect(softened).not.toBe(theme)
            expect(softened.colors).not.toBe(theme.colors)
        })

        it('softens textPrimary from pure white to a darker shade', () => {
            const theme = getDefaultTheme()
            const softened = softenThemeColors(theme)
            expect(theme.colors.textPrimary).toBe('#FFFFFF')
            expect(softened.colors.textPrimary).not.toBe('#FFFFFF')
            expect(softened.colors.textPrimary).toMatch(/rgb\(\d+, \d+, \d+\)/)
        })

        it('softens textSecondary', () => {
            const theme = getDefaultTheme()
            const softened = softenThemeColors(theme)
            expect(theme.colors.textSecondary).toBe('#E5E5E5')
            expect(softened.colors.textSecondary).not.toBe('#E5E5E5')
        })

        it('softens background for dark themes', () => {
            const theme = getDefaultTheme()
            const softened = softenThemeColors(theme)
            expect(theme.colors.background).toBe('#181818')
            expect(softened.colors.background).not.toBe('#181818')
        })

        it('preserves theme id and metadata', () => {
            const theme = getDefaultTheme()
            const softened = softenThemeColors(theme)
            expect(softened.id).toBe(theme.id)
            expect(softened.name).toBe(theme.name)
            expect(softened.isDark).toBe(theme.isDark)
        })
    })

    describe('getThemeCssVariables', () => {
        it('returns all expected CSS variable mappings for a theme', () => {
            const theme = getDefaultTheme()
            const vars = getThemeCssVariables(theme)
            expect(vars['--theme-background']).toBe('#181818')
            expect(vars['--theme-text-primary']).toBe('#FFFFFF')
            expect(vars['--theme-border']).toBeDefined()
        })

        it('returns softened values when given a softened theme', () => {
            const theme = getDefaultTheme()
            const softened = softenThemeColors(theme)
            const vars = getThemeCssVariables(softened)
            expect(vars['--theme-text-primary']).not.toBe('#FFFFFF')
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
            expect(bg).toBe('#181818')
        })

        it('applies softened theme when softenedContrast option is true', () => {
            const theme = getDefaultTheme()
            applyThemeToDocument(theme, { softenedContrast: true })
            const textPrimary = document.documentElement.style.getPropertyValue('--theme-text-primary')
            expect(textPrimary).not.toBe('#FFFFFF')
            expect(textPrimary).toBeTruthy()
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
        })
    })
})
