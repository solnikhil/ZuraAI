import { ColorPalette, Theme } from './themeDefinitions'
import { derivePaletteFromBase, getLightChromeBackground, mixHex } from './themeRegistry'

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

export const DEFAULT_FONT_SCALE = 100
export const MIN_FONT_SCALE = 85
export const MAX_FONT_SCALE = 125
export const FONT_SCALE_STEP = 5
const BASE_ROOT_FONT_SIZE_PX = 15

export function normalizeFontScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FONT_SCALE
  }

  const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, value))
  return Math.round(clamped / FONT_SCALE_STEP) * FONT_SCALE_STEP
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
    colors: derivePaletteFromBase(accent, background, foreground, contrast, theme.isDark),
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

  const sidebarSolid = effectiveTheme.isDark
    ? effectiveTheme.colors.background
    : getLightChromeBackground(
        effectiveTheme.baseColors.background,
        effectiveTheme.baseColors.accent
      )
  const contentSolid = effectiveTheme.isDark
    ? mixHex(effectiveTheme.colors.background, '#ffffff', 0.04)
    : effectiveTheme.colors.background

  root.style.setProperty('--theme-sidebar-solid', sidebarSolid)
  root.style.setProperty('--theme-raise-mix-target', effectiveTheme.isDark ? '#ffffff' : '#000000')
  root.style.setProperty('--theme-well-mix-target', effectiveTheme.isDark ? '#000000' : '#ffffff')
  root.style.setProperty('--theme-content-solid', contentSolid)
  root.style.setProperty(
    '--theme-chrome-elevated',
    effectiveTheme.isDark ? effectiveTheme.colors.surfaceActive : effectiveTheme.colors.surface
  )
  root.style.setProperty(
    '--theme-panel-inset',
    effectiveTheme.isDark ? effectiveTheme.colors.surfaceHover : effectiveTheme.colors.surfaceSubtle
  )

  root.setAttribute('data-theme', effectiveTheme.id)
  root.classList.toggle('dark', effectiveTheme.isDark)
  root.style.colorScheme = effectiveTheme.isDark ? 'dark' : 'light'
}

export function applyFontScaleToDocument(fontScale: unknown): number {
  const normalizedScale = normalizeFontScale(fontScale)
  const scaleRatio = normalizedScale / DEFAULT_FONT_SCALE
  const rootFontSize = BASE_ROOT_FONT_SIZE_PX * scaleRatio
  const root = document.documentElement

  root.style.setProperty('--app-font-scale', String(scaleRatio))
  root.style.setProperty('--app-root-font-size', `${rootFontSize}px`)

  return normalizedScale
}
