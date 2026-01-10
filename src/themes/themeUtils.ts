import { ColorPalette, Theme } from './themeDefinitions'

const THEME_CSS_VAR_MAP = {
    background: '--theme-background',
    surface: '--theme-surface',
    surfaceHover: '--theme-surface-hover',
    surfaceActive: '--theme-surface-active',
    surfacePressed: '--theme-surface-pressed',
    textPrimary: '--theme-text-primary',
    textSecondary: '--theme-text-secondary',
    textTertiary: '--theme-text-tertiary',
    textMuted: '--theme-text-muted',
    textInverse: '--theme-text-inverse',
    border: '--theme-border',
    borderHover: '--theme-border-hover',
    borderActive: '--theme-border-active',
    borderSubtle: '--theme-border-subtle',
    accent: '--theme-accent',
    accentSecondary: '--theme-accent-secondary',
    accentHover: '--theme-accent-hover',
    accentMuted: '--theme-accent-muted',
    error: '--theme-error',
    errorBg: '--theme-error-bg',
    success: '--theme-success',
    successBg: '--theme-success-bg',
    warning: '--theme-warning',
    warningBg: '--theme-warning-bg',
    info: '--theme-info',
    infoBg: '--theme-info-bg',
    userMessageBg: '--theme-user-message-bg',
    userMessageText: '--theme-user-message-text',
    assistantMessageBg: '--theme-assistant-message-bg',
    assistantMessageText: '--theme-assistant-message-text',
    overlayBg: '--theme-overlay-bg',
    dimmerBg: '--theme-dimmer-bg',
    selectionBg: '--theme-selection-bg',
    selectionText: '--theme-selection-text',
    shadowSm: '--theme-shadow-sm',
    shadowMd: '--theme-shadow-md',
    shadowLg: '--theme-shadow-lg'
} satisfies Record<keyof ColorPalette, string>

type ThemeCssVar = (typeof THEME_CSS_VAR_MAP)[keyof typeof THEME_CSS_VAR_MAP]

export function getThemeCssVariables(theme: Theme): Record<ThemeCssVar, string> {
    const cssVars = {} as Record<ThemeCssVar, string>
    const entries = Object.entries(THEME_CSS_VAR_MAP) as Array<[keyof ColorPalette, ThemeCssVar]>

    for (const [colorKey, cssVar] of entries) {
        cssVars[cssVar] = theme.colors[colorKey]
    }

    return cssVars
}

export function applyThemeToDocument(theme: Theme): void {
    const root = document.documentElement
    const cssVars = getThemeCssVariables(theme)

    for (const [cssVar, value] of Object.entries(cssVars)) {
        root.style.setProperty(cssVar, value)
    }

    root.setAttribute('data-theme', theme.id)
    root.classList.toggle('dark', theme.isDark)
}
