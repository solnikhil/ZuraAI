import { Theme, ThemeBaseColors } from './themeDefinitions'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) {
    return { r: 0, g: 0, b: 0 }
  }

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  }
}

function toHex(r: number, g: number, b: number): string {
  const toChannel = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`
}

export function mixHex(baseHex: string, targetHex: string, amount: number): string {
  const base = parseHex(baseHex)
  const target = parseHex(targetHex)
  const ratio = clamp(amount, 0, 1)

  return toHex(
    base.r + (target.r - base.r) * ratio,
    base.g + (target.g - base.g) * ratio,
    base.b + (target.b - base.b) * ratio
  )
}

function alpha(hex: string, opacity: number): string {
  const { r, g, b } = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1)})`
}

export const LIGHT_CHROME_ACCENT_TINT = 0.14
export const LIGHT_CONTENT_WHITE_LIFT = 0.62

export function getLightChromeBackground(background: string, accent: string): string {
  return mixHex(background, accent, LIGHT_CHROME_ACCENT_TINT)
}

export function getLightContentBackground(chromeBackground: string): string {
  return mixHex(chromeBackground, '#ffffff', LIGHT_CONTENT_WHITE_LIFT)
}

export function derivePaletteFromBase(
  accent: string,
  background: string,
  foreground: string,
  contrast = 100,
  isDark = true
): Theme['colors'] {
  const contrastScale = clamp(contrast, 0, 100) / 100
  const textInverse = isDark ? '#0b0b0b' : '#ffffff'
  const surfaceMixTarget = isDark ? '#ffffff' : '#000000'
  const paletteBackground = isDark
    ? background
    : getLightContentBackground(getLightChromeBackground(background, accent))

  const surface = isDark
    ? mixHex(background, surfaceMixTarget, 0.08 + 0.04 * contrastScale)
    : mixHex(paletteBackground, '#ffffff', 0.1 + 0.05 * contrastScale)
  const surfaceHover = isDark
    ? mixHex(background, surfaceMixTarget, 0.12 + 0.05 * contrastScale)
    : mixHex(paletteBackground, surfaceMixTarget, 0.04 + 0.03 * contrastScale)
  const surfaceActive = isDark
    ? mixHex(background, surfaceMixTarget, 0.16 + 0.06 * contrastScale)
    : mixHex(paletteBackground, surfaceMixTarget, 0.07 + 0.04 * contrastScale)
  const surfacePressed = isDark
    ? mixHex(background, surfaceMixTarget, 0.20 + 0.07 * contrastScale)
    : mixHex(paletteBackground, surfaceMixTarget, 0.1 + 0.05 * contrastScale)
  const surfaceSubtle = alpha(
    isDark ? '#ffffff' : accent,
    isDark ? 0.015 + 0.015 * contrastScale : 0.07 + 0.04 * contrastScale
  )

  const textPrimary = foreground
  const textSecondary = alpha(foreground, isDark ? 0.5 + 0.12 * contrastScale : 0.62 + 0.12 * contrastScale)
  const textTertiary = alpha(foreground, isDark ? 0.4 + 0.08 * contrastScale : 0.5 + 0.1 * contrastScale)
  const textMuted = alpha(foreground, isDark ? 0.26 + 0.09 * contrastScale : 0.38 + 0.1 * contrastScale)

  const borderBase = isDark ? '#ffffff' : '#000000'
  const border = alpha(borderBase, isDark ? 0.06 + 0.02 * contrastScale : 0.14 + 0.05 * contrastScale)
  const borderHover = alpha(borderBase, isDark ? 0.09 + 0.03 * contrastScale : 0.18 + 0.06 * contrastScale)
  const borderActive = alpha(borderBase, isDark ? 0.12 + 0.04 * contrastScale : 0.22 + 0.07 * contrastScale)
  const borderSubtle = alpha(borderBase, isDark ? 0.035 + 0.02 * contrastScale : 0.08 + 0.03 * contrastScale)

  const accentSecondary = mixHex(accent, isDark ? '#ffffff' : '#000000', isDark ? 0.12 : 0.08)
  const accentHover = mixHex(accent, isDark ? '#ffffff' : '#000000', isDark ? 0.18 : 0.12)
  const accentMuted = alpha(accent, isDark ? 0.14 + 0.06 * contrastScale : 0.14 + 0.08 * contrastScale)

  const assistantMessageBg = alpha(
    isDark ? '#ffffff' : '#000000',
    isDark ? 0.03 + 0.02 * contrastScale : 0.04 + 0.03 * contrastScale
  )
  const userMessageBg = mixHex(accent, surface, 0.12)

  return {
    background: paletteBackground,
    surface,
    surfaceHover,
    surfaceActive,
    surfacePressed,
    surfaceSubtle,

    textPrimary,
    textSecondary,
    textTertiary,
    textMuted,
    textInverse,

    border,
    borderHover,
    borderActive,
    borderSubtle,

    accent,
    accentSecondary,
    accentHover,
    accentMuted,

    error: isDark ? '#ff453a' : '#c4382f',
    errorBg: alpha(isDark ? '#ff453a' : '#c4382f', isDark ? 0.18 : 0.12),
    success: isDark ? '#32d74b' : '#2f7d45',
    successBg: alpha(isDark ? '#32d74b' : '#2f7d45', isDark ? 0.18 : 0.12),
    warning: isDark ? '#ffd60a' : '#986f00',
    warningBg: alpha(isDark ? '#ffd60a' : '#986f00', isDark ? 0.18 : 0.12),
    info: isDark ? '#0a84ff' : '#256bb8',
    infoBg: alpha(isDark ? '#0a84ff' : '#256bb8', isDark ? 0.18 : 0.12),
    favorite: isDark ? '#ffd60a' : '#9b7220',

    userMessageBg,
    userMessageText: '#ffffff',
    assistantMessageBg,
    assistantMessageText: textPrimary,
    overlayBg: alpha('#000000', isDark ? 0.62 + 0.12 * contrastScale : 0.28 + 0.16 * contrastScale),
    dimmerBg: alpha('#000000', isDark ? 0.38 + 0.12 * contrastScale : 0.18 + 0.14 * contrastScale),
    selectionBg: alpha(accent, 0.18 + 0.1 * contrastScale),
    selectionText: '#ffffff',

    shadowSm: isDark ? '0 1px 2px rgba(0, 0, 0, 0.18)' : '0 1px 2px rgba(45, 35, 22, 0.08)',
    shadowMd: isDark ? '0 4px 14px rgba(0, 0, 0, 0.2)' : '0 6px 18px rgba(45, 35, 22, 0.1)',
    shadowLg: isDark ? '0 10px 28px rgba(0, 0, 0, 0.22)' : '0 14px 34px rgba(45, 35, 22, 0.12)',

    scrollbar: alpha(foreground, 0.12 + 0.06 * contrastScale),
    scrollbarHover: alpha(foreground, 0.18 + 0.08 * contrastScale),
  }
}

interface ThemeDefinition {
  id: string
  name: string
  vibe: string
  description: string
  category: Theme['category']
  variations: {
    dark: ThemeBaseColors
    light: ThemeBaseColors
  }
}

const themeDefinitions: Record<string, ThemeDefinition> = {
  zuraai: {
    id: 'zuraai',
    name: 'Obsidian Core',
    vibe: 'Stealth minimal',
    description: 'Neutral graphite workspace with restrained gold accents',
    category: 'classic',
    variations: {
      dark: { accent: '#c9a66e', background: '#1a1a1a', foreground: '#ffffff' },
      light: { accent: '#8f6628', background: '#d9d0bf', foreground: '#1f1a14' },
    },
  },
  mist: {
    id: 'mist',
    name: 'Mist',
    vibe: 'Cool daylight',
    description: 'Cool low-glare palette with blue-grey neutrals',
    category: 'minimal',
    variations: {
      dark: { accent: '#8aa3b4', background: '#1a2024', foreground: '#e8ecef' },
      light: { accent: '#4d6575', background: '#c5d0d8', foreground: '#141a1f' },
    },
  },
  'warm-ledger': {
    id: 'warm-ledger',
    name: 'Warm Ledger',
    vibe: 'Paper under warm light',
    description: 'Soft warm neutrals for long comfortable work sessions',
    category: 'classic',
    variations: {
      dark: { accent: '#a88c6f', background: '#1e1c19', foreground: '#e6dccc' },
      light: { accent: '#7a5a3c', background: '#d6c9b8', foreground: '#1f1a14' },
    },
  },
  'quiet-sage': {
    id: 'quiet-sage',
    name: 'Quiet Sage',
    vibe: 'Calm focus grove',
    description: 'Muted sage over deep charcoal — reduced eye strain for daily use',
    category: 'minimal',
    variations: {
      dark: { accent: '#6d8b78', background: '#181b18', foreground: '#d6dcd4' },
      light: { accent: '#3f5e4a', background: '#c0cec4', foreground: '#141a16' },
    },
  },
  'stone-linen': {
    id: 'stone-linen',
    name: 'Stone Linen',
    vibe: 'Quiet studio',
    description: 'Cool desaturated neutrals with soft, readable text',
    category: 'minimal',
    variations: {
      dark: { accent: '#7a8c9a', background: '#1a1d22', foreground: '#d8dce3' },
      light: { accent: '#4e6270', background: '#c5cad2', foreground: '#12161b' },
    },
  },
  graphite: {
    id: 'graphite',
    name: 'Graphite Luxe',
    vibe: 'Executive stealth',
    description: 'Smoked graphite neutrals with a cool steel highlight',
    category: 'minimal',
    variations: {
      dark: { accent: '#8fa3b8', background: '#17181a', foreground: '#eef2f6' },
      light: { accent: '#4a6278', background: '#bcc4ce', foreground: '#12161b' },
    },
  },
  codex: {
    id: 'codex',
    name: 'Blue Static',
    vibe: 'Clean midnight focus',
    description: 'Controlled cobalt signal on a tight near-black canvas',
    category: 'minimal',
    variations: {
      dark: { accent: '#0a84ff', background: '#111315', foreground: '#fcfcfc' },
      light: { accent: '#0858ad', background: '#bcc8d8', foreground: '#0d1116' },
    },
  },
}

const REMOVED_THEME_MIGRATIONS: Record<string, string> = {
  charcoal: 'graphite',
  void: 'graphite',
  noir: 'zuraai',
  'paper-trail': 'zuraai',
  'zuraai-light': 'zuraai',
}

function buildTheme(definition: ThemeDefinition, isDark: boolean): Theme {
  const baseColors = isDark ? definition.variations.dark : definition.variations.light

  return {
    id: definition.id,
    name: definition.name,
    shortName: definition.name,
    vibe: definition.vibe,
    description: definition.description,
    category: definition.category,
    isDark,
    baseColors,
    colors: derivePaletteFromBase(
      baseColors.accent,
      baseColors.background,
      baseColors.foreground,
      100,
      isDark
    ),
  }
}

export type ThemeMode = 'light' | 'dark' | 'system'

export function resolveEffectiveIsDark(
  themeMode: ThemeMode,
  systemPrefersDark = false
): boolean {
  if (themeMode === 'light') return false
  if (themeMode === 'dark') return true
  return systemPrefersDark
}

export function normalizeActiveThemeId(themeId: string): string {
  const trimmed = themeId.trim()
  if (!trimmed) return getDefaultTheme().id
  const migrated = REMOVED_THEME_MIGRATIONS[trimmed] ?? trimmed
  if (themeDefinitions[migrated]) return migrated
  return getDefaultTheme().id
}

export function getThemeById(id: string, isDark = true): Theme | undefined {
  const normalizedId = normalizeActiveThemeId(id)
  const definition = themeDefinitions[normalizedId]
  if (!definition) return undefined
  return buildTheme(definition, isDark)
}

export function getResolvedTheme(
  activeThemeId: string,
  themeMode: ThemeMode,
  systemPrefersDark = false
): Theme {
  const isDark = resolveEffectiveIsDark(themeMode, systemPrefersDark)
  return getThemeById(activeThemeId, isDark) || getDefaultTheme(isDark)
}

export function getThemesByCategory(category: string): Theme[] {
  const definitions = Object.values(themeDefinitions)
  const filtered =
    category === 'all' ? definitions : definitions.filter((theme) => theme.category === category)
  return filtered.map((definition) => buildTheme(definition, true))
}

export function getDefaultTheme(isDark = true): Theme {
  return buildTheme(themeDefinitions.zuraai, isDark)
}