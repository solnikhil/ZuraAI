import { Theme } from './themeDefinitions'

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

function createTheme(
  id: string,
  name: string,
  vibe: string,
  description: string,
  category: Theme['category'],
  accent: string,
  background: string,
  foreground: string,
  isDark = true
): Theme {
  return {
    id,
    name,
    shortName: name,
    vibe,
    description,
    category,
    isDark,
    baseColors: {
      accent,
      background,
      foreground,
    },
    colors: derivePaletteFromBase(accent, background, foreground, 100, isDark),
  }
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
  const surface = isDark
    ? mixHex(background, surfaceMixTarget, 0.08 + 0.04 * contrastScale)
    : mixHex(background, surfaceMixTarget, 0.025 + 0.025 * contrastScale)
  const surfaceHover = isDark
    ? mixHex(background, surfaceMixTarget, 0.12 + 0.05 * contrastScale)
    : mixHex(background, surfaceMixTarget, 0.045 + 0.035 * contrastScale)
  const surfaceActive = isDark
    ? mixHex(background, surfaceMixTarget, 0.16 + 0.06 * contrastScale)
    : mixHex(background, surfaceMixTarget, 0.07 + 0.045 * contrastScale)
  const surfacePressed = isDark
    ? mixHex(background, surfaceMixTarget, 0.20 + 0.07 * contrastScale)
    : mixHex(background, surfaceMixTarget, 0.09 + 0.06 * contrastScale)
  const surfaceSubtle = alpha(isDark ? '#ffffff' : '#000000', 0.015 + 0.015 * contrastScale)

  const textPrimary = foreground
  const textSecondary = alpha(foreground, isDark ? 0.5 + 0.12 * contrastScale : 0.56 + 0.14 * contrastScale)
  const textTertiary = alpha(foreground, isDark ? 0.4 + 0.08 * contrastScale : 0.44 + 0.1 * contrastScale)
  const textMuted = alpha(foreground, isDark ? 0.26 + 0.09 * contrastScale : 0.32 + 0.1 * contrastScale)

  const borderBase = isDark ? '#ffffff' : '#000000'
  const border = alpha(borderBase, isDark ? 0.06 + 0.02 * contrastScale : 0.08 + 0.04 * contrastScale)
  const borderHover = alpha(borderBase, isDark ? 0.09 + 0.03 * contrastScale : 0.12 + 0.05 * contrastScale)
  const borderActive = alpha(borderBase, isDark ? 0.12 + 0.04 * contrastScale : 0.16 + 0.06 * contrastScale)
  const borderSubtle = alpha(borderBase, isDark ? 0.035 + 0.02 * contrastScale : 0.045 + 0.025 * contrastScale)

  const accentSecondary = mixHex(accent, isDark ? '#ffffff' : '#000000', isDark ? 0.12 : 0.08)
  const accentHover = mixHex(accent, isDark ? '#ffffff' : '#000000', isDark ? 0.18 : 0.12)
  const accentMuted = alpha(accent, isDark ? 0.14 + 0.06 * contrastScale : 0.1 + 0.06 * contrastScale)

  const assistantMessageBg = alpha(isDark ? '#ffffff' : '#000000', isDark ? 0.03 + 0.02 * contrastScale : 0.025 + 0.02 * contrastScale)
  const userMessageBg = mixHex(accent, surface, 0.12)

  return {
    background,
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

const themes: Record<string, Theme> = {
  zuraai: createTheme(
    'zuraai',
    'Obsidian Core',
    'Stealth minimal',
    'Neutral graphite workspace with restrained gold accents',
    'classic',
    '#c9a66e',
    '#1a1a1a',
    '#ffffff'
  ),
  'zuraai-light': createTheme(
    'zuraai-light',
    'Zura Light',
    'Warm studio',
    'Warm off-white workspace with graphite text and restrained gold accents',
    'classic',
    '#a57d3d',
    '#f7f3ea',
    '#27231d',
    false
  ),
  mist: createTheme(
    'mist',
    'Mist',
    'Cool daylight',
    'Cool low-glare light mode with blue-grey neutrals',
    'minimal',
    '#6f8798',
    '#f3f6f7',
    '#20282f',
    false
  ),
  'warm-ledger': createTheme(
    'warm-ledger',
    'Warm Ledger',
    'Paper under warm light',
    'Soft warm neutrals for long comfortable work sessions',
    'classic',
    '#a88c6f',
    '#1e1c19',
    '#e6dccc'
  ),
  'quiet-sage': createTheme(
    'quiet-sage',
    'Quiet Sage',
    'Calm focus grove',
    'Muted sage over deep charcoal — reduced eye strain for daily use',
    'minimal',
    '#6d8b78',
    '#181b18',
    '#d6dcd4'
  ),
  'stone-linen': createTheme(
    'stone-linen',
    'Stone Linen',
    'Quiet studio',
    'Cool desaturated neutrals with soft, readable text',
    'minimal',
    '#7a8c9a',
    '#1a1d22',
    '#d8dce3'
  ),
  graphite: createTheme(
    'graphite',
    'Graphite Luxe',
    'Executive stealth',
    'Smoked graphite neutrals with a cool steel highlight',
    'minimal',
    '#8fa3b8',
    '#17181a',
    '#eef2f6'
  ),
  codex: createTheme(
    'codex',
    'Blue Static',
    'Clean midnight focus',
    'Controlled cobalt signal on a tight near-black canvas',
    'minimal',
    '#0a84ff',
    '#111315',
    '#fcfcfc'
  ),
}

const REMOVED_THEME_MIGRATIONS: Record<string, string> = {
  charcoal: 'graphite',
  void: 'graphite',
  noir: 'zuraai',
  'paper-trail': 'zuraai-light',
}

export function normalizeActiveThemeId(themeId: string): string {
  const trimmed = themeId.trim()
  if (!trimmed) return getDefaultTheme().id
  if (themes[trimmed]) return trimmed
  return REMOVED_THEME_MIGRATIONS[trimmed] ?? getDefaultTheme().id
}

export function getThemeById(id: string): Theme | undefined {
  return themes[normalizeActiveThemeId(id)]
}

export function getThemesByCategory(category: string): Theme[] {
  if (category === 'all') return Object.values(themes)
  return Object.values(themes).filter((theme) => theme.category === category)
}

export function getDefaultTheme(): Theme {
  return themes.zuraai
}
