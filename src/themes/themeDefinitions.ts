export interface ThemeBaseColors {
  accent: string
  background: string
  foreground: string
}

export interface ColorPalette {
  background: string
  surface: string
  surfaceHover: string
  surfaceActive: string
  surfacePressed: string
  surfaceSubtle: string

  textPrimary: string
  textSecondary: string
  textTertiary: string
  textMuted: string
  textInverse: string

  border: string
  borderHover: string
  borderActive: string
  borderSubtle: string

  accent: string
  accentSecondary: string
  accentHover: string
  accentMuted: string

  error: string
  errorBg: string
  success: string
  successBg: string
  warning: string
  warningBg: string
  info: string
  infoBg: string
  favorite: string

  userMessageBg: string
  userMessageText: string
  assistantMessageBg: string
  assistantMessageText: string
  overlayBg: string
  dimmerBg: string
  selectionBg: string
  selectionText: string

  shadowSm: string
  shadowMd: string
  shadowLg: string

  scrollbar?: string
  scrollbarHover?: string
}

export interface Theme {
  id: string
  name: string
  shortName?: string
  vibe?: string
  description?: string
  category: 'classic' | 'colorful' | 'minimal' | 'ai' | 'terminal' | 'creative'
  isDark: boolean
  colors: ColorPalette
  baseColors: ThemeBaseColors
}

export type ThemeId = string

export interface ThemeCustomization {
  activeThemePreset: string
  themeAccent: string
  themeBackground: string
  themeForeground: string
  themeContrast: number
}

