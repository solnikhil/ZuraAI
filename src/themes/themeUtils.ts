import { ColorPalette, Theme } from './themeDefinitions'

type SoftenType = 'text' | 'bg' | 'border' | 'accent'

/** Parse hex or rgba color to r,g,b,a (0-255). Returns null if unsupported. */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
    const trimmed = color.trim()
    const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/
    const hex6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/
    const rgba = /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/

    let m = trimmed.match(hex3)
    if (m) {
        return {
            r: parseInt(m[1] + m[1], 16),
            g: parseInt(m[2] + m[2], 16),
            b: parseInt(m[3] + m[3], 16),
            a: 1,
        }
    }
    m = trimmed.match(hex6)
    if (m) {
        return {
            r: parseInt(m[1], 16),
            g: parseInt(m[2], 16),
            b: parseInt(m[3], 16),
            a: 1,
        }
    }
    m = trimmed.match(rgba)
    if (m) {
        return {
            r: Math.min(255, parseInt(m[1], 10)),
            g: Math.min(255, parseInt(m[2], 10)),
            b: Math.min(255, parseInt(m[3], 10)),
            a: m[4] !== undefined ? parseFloat(m[4]) : 1,
        }
    }
    return null
}

/** Apply softening to a color. Falls back to original if unparseable. */
function softenColor(color: string, type: SoftenType): string {
    const parsed = parseColor(color)
    if (!parsed) return color

    const { r, g, b, a } = parsed
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255

    switch (type) {
        case 'text':
            // Reduce luminance: pull bright text toward mid-gray
            if (lum > 0.5) {
                const blend = 0.82
                return `rgb(${Math.round(r * blend + 128 * (1 - blend))}, ${Math.round(g * blend + 128 * (1 - blend))}, ${Math.round(b * blend + 128 * (1 - blend))})`
            }
            return color
        case 'bg':
            // Slightly lighten dark backgrounds
            if (lum < 0.2) {
                const lift = 1.12
                return `rgb(${Math.min(255, Math.round(r * lift))}, ${Math.min(255, Math.round(g * lift))}, ${Math.min(255, Math.round(b * lift))})`
            }
            return color
        case 'border':
            // Reduce opacity for rgba borders
            if (a < 1) {
                return `rgba(${r}, ${g}, ${b}, ${Math.max(0.02, a * 0.75)})`
            }
            return color
        case 'accent':
            // Slight desaturation
            const gray = (r + g + b) / 3
            const sat = 0.85
            return `rgb(${Math.round(r * sat + gray * (1 - sat))}, ${Math.round(g * sat + gray * (1 - sat))}, ${Math.round(b * sat + gray * (1 - sat))})`
        default:
            return color
    }
}

/** Return a theme with softened colors for reduced contrast. */
export function softenThemeColors(theme: Theme): Theme {
    const c = theme.colors
    return {
        ...theme,
        colors: {
            ...c,
            background: softenColor(c.background, 'bg'),
            surface: softenColor(c.surface, 'bg'),
            surfaceHover: softenColor(c.surfaceHover, 'border'),
            surfaceActive: softenColor(c.surfaceActive, 'border'),
            surfacePressed: softenColor(c.surfacePressed, 'border'),
            surfaceSubtle: softenColor(c.surfaceSubtle, 'border'),
            textPrimary: softenColor(c.textPrimary, 'text'),
            textSecondary: softenColor(c.textSecondary, 'text'),
            textTertiary: softenColor(c.textTertiary, 'text'),
            textMuted: softenColor(c.textMuted, 'text'),
            textInverse: softenColor(c.textInverse, 'bg'),
            border: softenColor(c.border, 'border'),
            borderHover: softenColor(c.borderHover, 'border'),
            borderActive: softenColor(c.borderActive, 'border'),
            borderSubtle: softenColor(c.borderSubtle, 'border'),
            accent: softenColor(c.accent, 'accent'),
            accentSecondary: softenColor(c.accentSecondary, 'accent'),
            accentHover: softenColor(c.accentHover, 'accent'),
            accentMuted: softenColor(c.accentMuted, 'border'),
            userMessageText: softenColor(c.userMessageText, 'text'),
            assistantMessageText: softenColor(c.assistantMessageText, 'text'),
            assistantMessageBg: softenColor(c.assistantMessageBg, 'border'),
            scrollbar: c.scrollbar ? softenColor(c.scrollbar, 'border') : undefined,
            scrollbarHover: c.scrollbarHover ? softenColor(c.scrollbarHover, 'border') : undefined,
        },
    }
}

const THEME_CSS_VAR_MAP = {
    background: '--theme-background',
    surface: '--theme-surface',
    surfaceHover: '--theme-surface-hover',
    surfaceActive: '--theme-surface-active',
    surfacePressed: '--theme-surface-pressed',
    surfaceSubtle: '--theme-surface-subtle',
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
    favorite: '--theme-favorite',
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
    shadowLg: '--theme-shadow-lg',
    scrollbar: '--theme-scrollbar',
    scrollbarHover: '--theme-scrollbar-hover'
} as const

type ThemeCssVar = (typeof THEME_CSS_VAR_MAP)[keyof typeof THEME_CSS_VAR_MAP]

// All ColorPalette keys including optional ones
type AllColorPaletteKeys = (keyof ColorPalette) | 'scrollbar' | 'scrollbarHover'

export function getThemeCssVariables(theme: Theme): Record<ThemeCssVar, string> {
    const cssVars = {} as Record<ThemeCssVar, string>
    const entries = Object.entries(THEME_CSS_VAR_MAP) as Array<[AllColorPaletteKeys, ThemeCssVar]>

    for (const [colorKey, cssVar] of entries) {
        const themeColor = theme.colors[colorKey as keyof ColorPalette]
        const fallback =
            colorKey === 'scrollbar' ? theme.colors.border :
                colorKey === 'scrollbarHover' ? theme.colors.borderHover :
                    theme.colors.border

        cssVars[cssVar] = themeColor ?? fallback
    }

    return cssVars
}

export function applyThemeToDocument(theme: Theme, options?: { softenedContrast?: boolean }): void {
    const root = document.documentElement
    const effectiveTheme = options?.softenedContrast ? softenThemeColors(theme) : theme
    const cssVars = getThemeCssVariables(effectiveTheme)

    for (const [cssVar, value] of Object.entries(cssVars)) {
        root.style.setProperty(cssVar, value)
    }

    root.setAttribute('data-theme', theme.id)
    root.classList.toggle('dark', theme.isDark)
}
