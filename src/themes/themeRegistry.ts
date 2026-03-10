import { Theme } from './themeDefinitions'

export const themes: Record<string, Theme> = {
  // DARK - Primary dark theme
  zuraai: {
    id: 'zuraai',
    name: 'Dark',
    shortName: 'Dark',
    description: 'Dark theme',
    category: 'classic',
    isDark: true,
    colors: {
      background: '#181818',
      surface: '#181818',
      surfaceHover: 'rgba(255, 255, 255, 0.06)',
      surfaceActive: 'rgba(255, 255, 255, 0.1)',
      surfacePressed: 'rgba(255, 255, 255, 0.14)',
      surfaceSubtle: 'rgba(255, 255, 255, 0.02)',
      textPrimary: '#FFFFFF',
      textSecondary: '#E5E5E5',
      textTertiary: '#A3A3A3',
      textMuted: '#737373',
      textInverse: '#000000',
      border: 'rgba(255, 255, 255, 0.08)',
      borderHover: 'rgba(255, 255, 255, 0.12)',
      borderActive: 'rgba(255, 255, 255, 0.16)',
      borderSubtle: 'rgba(255, 255, 255, 0.04)',
      accent: '#FFFFFF',
      accentSecondary: '#E5E5E5',
      accentHover: '#F0F0F0',
      accentMuted: 'rgba(255, 255, 255, 0.2)',
      error: '#EF4444',
      errorBg: 'rgba(239, 68, 68, 0.12)',
      success: '#4ADE80',
      successBg: 'rgba(74, 222, 128, 0.12)',
      warning: '#F59E0B',
      warningBg: 'rgba(245, 158, 11, 0.12)',
      info: '#3B82F6',
      infoBg: 'rgba(59, 130, 246, 0.12)',
      favorite: '#FBBF24',
      userMessageBg: 'rgba(255, 255, 255, 0.08)',
      userMessageText: '#FFFFFF',
      assistantMessageBg: 'rgba(0, 0, 0, 0.2)',
      assistantMessageText: '#E5E5E5',
      overlayBg: 'rgba(0, 0, 0, 0.7)',
      dimmerBg: 'rgba(0, 0, 0, 0.5)',
      selectionBg: 'rgba(255, 255, 255, 0.2)',
      selectionText: '#000000',
      shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
      shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
      shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
      scrollbar: '#303030',
      scrollbarHover: '#3A3A3A',
    },
  },
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
  return Object.values(themes).filter((t) => t.category === category)
}

export function getDefaultTheme(): Theme {
  return themes['zuraai']
}
