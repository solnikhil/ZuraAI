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
  vibe: string,
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
    vibe,
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
  const textInverse = isDark ? '#0b0b0b' : '#ffffff'
  const surface = mixHex(background, '#ffffff', 0.05 + 0.02 * contrastScale)
  const surfaceHover = mixHex(background, '#ffffff', 0.08 + 0.03 * contrastScale)
  const surfaceActive = mixHex(background, '#ffffff', 0.12 + 0.04 * contrastScale)
  const surfacePressed = mixHex(background, '#ffffff', 0.16 + 0.05 * contrastScale)
  const surfaceSubtle = alpha('#ffffff', 0.015 + 0.015 * contrastScale)

  const textPrimary = foreground
  const textSecondary = alpha(foreground, 0.5 + 0.12 * contrastScale)
  const textTertiary = alpha(foreground, 0.4 + 0.08 * contrastScale)
  const textMuted = alpha(foreground, 0.26 + 0.09 * contrastScale)

  const border = alpha('#ffffff', 0.06 + 0.02 * contrastScale)
  const borderHover = alpha('#ffffff', 0.09 + 0.03 * contrastScale)
  const borderActive = alpha('#ffffff', 0.12 + 0.04 * contrastScale)
  const borderSubtle = alpha('#ffffff', 0.035 + 0.02 * contrastScale)

  const accentSecondary = mixHex(accent, '#ffffff', 0.12)
  const accentHover = mixHex(accent, '#ffffff', 0.18)
  const accentMuted = alpha(accent, 0.14 + 0.06 * contrastScale)

  const assistantMessageBg = alpha('#ffffff', 0.03 + 0.02 * contrastScale)
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

    error: '#ff453a',
    errorBg: alpha('#ff453a', 0.18),
    success: '#32d74b',
    successBg: alpha('#32d74b', 0.18),
    warning: '#ffd60a',
    warningBg: alpha('#ffd60a', 0.18),
    info: '#0a84ff',
    infoBg: alpha('#0a84ff', 0.18),
    favorite: '#ffd60a',

    userMessageBg,
    userMessageText: '#ffffff',
    assistantMessageBg,
    assistantMessageText: textPrimary,
    overlayBg: alpha('#000000', 0.62 + 0.12 * contrastScale),
    dimmerBg: alpha('#000000', 0.38 + 0.12 * contrastScale),
    selectionBg: alpha(accent, 0.18 + 0.1 * contrastScale),
    selectionText: '#ffffff',

    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.18)',
    shadowMd: '0 4px 14px rgba(0, 0, 0, 0.2)',
    shadowLg: '0 10px 28px rgba(0, 0, 0, 0.22)',

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
  sentry: createTheme(
    'sentry',
    'Ultraviolet Pulse',
    'Electric nightlife',
    'Dusty violet glow over a muted charcoal base',
    'ai',
    '#8e8cff',
    '#232229',
    '#e6dff9'
  ),
  ayu: createTheme(
    'ayu',
    'Amber Circuit',
    'Warm operator desk',
    'Burnished amber accents on a deep ink backdrop',
    'colorful',
    '#e6b450',
    '#0b0e14',
    '#bfbdb6'
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
  gruvbox: createTheme(
    'gruvbox',
    'Furnace Terminal',
    'Retro industrial',
    'Weathered teal against a warm terminal-grade dark',
    'terminal',
    '#458588',
    '#282828',
    '#ebdbb2'
  ),
  'vscode-plus': createTheme(
    'vscode-plus',
    'Night Shift',
    'Studio neutral',
    'Balanced editor blues with a familiar tungsten-dark shell',
    'classic',
    '#007acc',
    '#1e1e1e',
    '#d4d4d4'
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
  emberfall: createTheme(
    'emberfall',
    'Emberfall',
    'After-hours cockpit',
    'Molten copper energy layered over volcanic dark surfaces',
    'creative',
    '#ff7a45',
    '#160f0d',
    '#f8ede8'
  ),
  deepsea: createTheme(
    'deepsea',
    'Deep Sea Signal',
    'Submerged tech',
    'Cold cyan-green markers cutting through a deep ocean black',
    'creative',
    '#22c7a9',
    '#081317',
    '#d7f5ef'
  ),
  noir: createTheme(
    'noir',
    'Noir Alloy',
    'Luxury machine',
    'Gunmetal darkness with restrained champagne-metal warmth',
    'classic',
    '#c7a86d',
    '#111213',
    '#f0e7d7'
  ),
  phantom: createTheme(
    'phantom',
    'Phantom Bloom',
    'Dark editorial',
    'Magenta-plum atmosphere with polished ink-heavy shadows',
    'ai',
    '#d946ef',
    '#120d16',
    '#f3defa'
  ),
  slatewave: createTheme(
    'slatewave',
    'Slatewave',
    'Calm pro UI',
    'Slate neutrals anchored by a crisp glacier-blue accent',
    'minimal',
    '#58a6ff',
    '#0f1722',
    '#e6edf5'
  ),
}

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
