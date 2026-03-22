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

function mixHex(baseHex: string, targetHex: string, amount: number): string {
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
  description: string,
  category: Theme['category'],
  accent: string,
  background: string,
  foreground: string
): Theme {
  return {
    id,
    name,
    shortName: name,
    description,
    category,
    isDark: true,
    baseColors: {
      accent,
      background,
      foreground,
    },
    colors: derivePaletteFromBase(accent, background, foreground),
  }
}

export function derivePaletteFromBase(
  accent: string,
  background: string,
  foreground: string,
  contrast = 100
): Theme['colors'] {
  const contrastScale = clamp(contrast, 0, 100) / 100
  const isDark = true
  const surfaceTarget = isDark ? '#ffffff' : '#000000'
  const textInverse = isDark ? '#0b0b0b' : '#ffffff'

  const surface = mixHex(background, surfaceTarget, 0.02 + 0.03 * contrastScale)
  const surfaceHover = mixHex(background, surfaceTarget, 0.03 + 0.055 * contrastScale)
  const surfaceActive = mixHex(background, surfaceTarget, 0.045 + 0.085 * contrastScale)
  const surfacePressed = mixHex(background, surfaceTarget, 0.06 + 0.115 * contrastScale)
  const surfaceSubtle = alpha(foreground, 0.008 + 0.016 * contrastScale)

  const textSecondary = mixHex(foreground, background, 0.06 + (1 - contrastScale) * 0.12)
  const textTertiary = mixHex(foreground, background, 0.24 + (1 - contrastScale) * 0.12)
  const textMuted = mixHex(foreground, background, 0.45 + (1 - contrastScale) * 0.16)

  const borderStrength = 0.45 + 0.55 * contrastScale
  const border = alpha(foreground, 0.05 + 0.04 * borderStrength)
  const borderHover = alpha(foreground, 0.08 + 0.05 * borderStrength)
  const borderActive = alpha(foreground, 0.11 + 0.06 * borderStrength)
  const borderSubtle = alpha(foreground, 0.025 + 0.02 * borderStrength)

  const accentSecondary = mixHex(accent, foreground, 0.08 + 0.12 * contrastScale)
  const accentHover = mixHex(accent, '#ffffff', 0.05 + 0.08 * contrastScale)
  const accentMuted = alpha(accent, 0.1 + 0.1 * contrastScale)

  const assistantMessageBg = alpha(foreground, 0.02 + 0.03 * contrastScale)
  const userMessageBg = `linear-gradient(135deg, ${alpha(accent, 0.72 + 0.16 * contrastScale)} 0%, ${alpha(accentSecondary, 0.62 + 0.14 * contrastScale)} 100%)`

  return {
    background,
    surface,
    surfaceHover,
    surfaceActive,
    surfacePressed,
    surfaceSubtle,

    textPrimary: foreground,
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

    error: '#ef4444',
    errorBg: alpha('#ef4444', 0.14),
    success: '#4ade80',
    successBg: alpha('#4ade80', 0.14),
    warning: '#f59e0b',
    warningBg: alpha('#f59e0b', 0.14),
    info: '#3b82f6',
    infoBg: alpha('#3b82f6', 0.14),
    favorite: '#fbbf24',

    userMessageBg,
    userMessageText: '#ffffff',
    assistantMessageBg,
    assistantMessageText: foreground,
    overlayBg: alpha('#000000', 0.62 + 0.12 * contrastScale),
    dimmerBg: alpha('#000000', 0.38 + 0.12 * contrastScale),
    selectionBg: alpha(accent, 0.18 + 0.16 * contrastScale),
    selectionText: '#ffffff',

    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    shadowMd: '0 6px 18px rgba(0, 0, 0, 0.4)',
    shadowLg: '0 12px 32px rgba(0, 0, 0, 0.5)',

    scrollbar: alpha(foreground, 0.12 + 0.06 * contrastScale),
    scrollbarHover: alpha(foreground, 0.18 + 0.08 * contrastScale),
  }
}

export const themes: Record<string, Theme> = {
  zuraai: createTheme(
    'zuraai',
    'Dark',
    'Default dark theme',
    'classic',
    '#ffffff',
    '#181818',
    '#ffffff'
  ),
  sentry: createTheme(
    'sentry',
    'Sentry',
    'Purple accent on soft dark',
    'ai',
    '#7055f6',
    '#2d2935',
    '#e6dff9'
  ),
  ayu: createTheme(
    'ayu',
    'Ayu',
    'Warm golden accent on deep dark',
    'colorful',
    '#e6b450',
    '#0b0e14',
    '#bfbdb6'
  ),
  codex: createTheme(
    'codex',
    'Codex',
    'Blue accent on near-black',
    'minimal',
    '#0169cc',
    '#111111',
    '#fcfcfc'
  ),
  gruvbox: createTheme(
    'gruvbox',
    'Gruvbox',
    'Teal accent on retro warm dark',
    'terminal',
    '#458588',
    '#282828',
    '#ebdbb2'
  ),
  'vscode-plus': createTheme(
    'vscode-plus',
    'VS Code',
    'Classic VS Code blue on neutral dark',
    'classic',
    '#007acc',
    '#1e1e1e',
    '#d4d4d4'
  ),
}

const THEME_CATEGORY_LABELS = {
  classic: 'Classic',
  colorful: 'Colorful',
  minimal: 'Minimal',
  ai: 'AI Inspired',
  terminal: 'Terminal',
  creative: 'Creative',
} satisfies Record<Theme['category'], string>

const THEME_CATEGORY_ORDER: Theme['category'][] = [
  'classic',
  'colorful',
  'minimal',
  'ai',
  'terminal',
  'creative',
]

const availableCategoryIds = new Set(Object.values(themes).map((theme) => theme.category))

export const themeCategories = [
  { id: 'all', name: 'All Themes' },
  ...THEME_CATEGORY_ORDER.filter((category) => availableCategoryIds.has(category)).map(
    (category) => ({
      id: category,
      name: THEME_CATEGORY_LABELS[category],
    })
  ),
]

export function getThemeById(id: string): Theme | undefined {
  return themes[id]
}

export function getThemesByCategory(category: string): Theme[] {
  if (category === 'all') return Object.values(themes)
  return Object.values(themes).filter((theme) => theme.category === category)
}

export function getDefaultTheme(): Theme {
  return themes.zuraai
}
