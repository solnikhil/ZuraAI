import { ColorPalette, Theme } from './themeDefinitions'
import { derivePaletteFromBase } from './themeRegistry'

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
  scrollbarHover: '--theme-scrollbar-hover',
} as const

type ThemeCssVar = (typeof THEME_CSS_VAR_MAP)[keyof typeof THEME_CSS_VAR_MAP]
type AllColorPaletteKeys = keyof ColorPalette | 'scrollbar' | 'scrollbarHover'

export interface ApplyThemeOptions {
  contrast?: number
  customAccent?: string
  customBackground?: string
  customForeground?: string
}

function resolveTheme(theme: Theme, options?: ApplyThemeOptions): Theme {
  const accent = options?.customAccent ?? theme.baseColors.accent
  const background = options?.customBackground ?? theme.baseColors.background
  const foreground = options?.customForeground ?? theme.baseColors.foreground
  const contrast = options?.contrast ?? 100

  return {
    ...theme,
    baseColors: {
      accent,
      background,
      foreground,
    },
    colors: derivePaletteFromBase(accent, background, foreground, contrast),
  }
}



export function getThemeCssVariables(theme: Theme): Record<ThemeCssVar, string> {
  const cssVars = {} as Record<ThemeCssVar, string>
  const entries = Object.entries(THEME_CSS_VAR_MAP) as Array<[AllColorPaletteKeys, ThemeCssVar]>

  for (const [colorKey, cssVar] of entries) {
    const themeColor = theme.colors[colorKey as keyof ColorPalette]
    const fallback =
      colorKey === 'scrollbar'
        ? theme.colors.border
        : colorKey === 'scrollbarHover'
          ? theme.colors.borderHover
          : theme.colors.border

    cssVars[cssVar] = themeColor ?? fallback
  }

  return cssVars
}

export function applyThemeToDocument(theme: Theme, options?: ApplyThemeOptions): void {
  const root = document.documentElement
  const effectiveTheme = resolveTheme(theme, options)
  const cssVars = getThemeCssVariables(effectiveTheme)

  for (const [cssVar, value] of Object.entries(cssVars)) {
    root.style.setProperty(cssVar, value)
  }

  root.style.setProperty('--theme-sidebar-solid', effectiveTheme.colors.background)
  root.style.setProperty('--theme-content-solid', effectiveTheme.colors.surface)
  root.style.setProperty(
    '--theme-chrome-elevated',
    effectiveTheme.colors.surfaceActive
  )
  root.style.setProperty(
    '--theme-panel-inset',
    effectiveTheme.colors.surfaceHover
  )

  root.setAttribute('data-theme', theme.id)
  root.classList.toggle('dark', effectiveTheme.isDark)
  root.style.colorScheme = effectiveTheme.isDark ? 'dark' : 'light'
}
