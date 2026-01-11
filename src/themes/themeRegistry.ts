import { Theme } from './themeDefinitions'

export const themes: Record<string, Theme> = {
    // =====================================
    // DARK DEFAULT - Current dark theme
    // =====================================
    'dark-default': {
        id: 'dark-default',
        name: 'Dark Default',
        shortName: 'Dark',
        description: 'The classic dark theme with purple accents',
        category: 'classic',
        isDark: true,
        colors: {
            background: '#14120B',
            surface: '#1B1913',
            surfaceHover: 'rgba(255, 255, 255, 0.05)',
            surfaceActive: 'rgba(255, 255, 255, 0.08)',
            surfacePressed: 'rgba(255, 255, 255, 0.1)',
            textPrimary: '#ffffff',
            textSecondary: '#f0f0f0',
            textTertiary: '#b0b0b0',
            textMuted: '#999999',
            textInverse: '#000000',
            border: 'rgba(255, 255, 255, 0.06)',
            borderHover: 'rgba(255, 255, 255, 0.1)',
            borderActive: 'rgba(255, 255, 255, 0.12)',
            borderSubtle: 'rgba(255, 255, 255, 0.03)',
            accent: '#8b5cf6',
            accentSecondary: '#06b6d4',
            accentHover: '#7c3aed',
            accentMuted: 'rgba(139, 92, 246, 0.2)',
            error: '#ef4444',
            errorBg: 'rgba(239, 68, 68, 0.1)',
            success: '#4ade80',
            successBg: 'rgba(74, 222, 128, 0.1)',
            warning: '#fbbf24',
            warningBg: 'rgba(251, 191, 36, 0.1)',
            info: '#3b82f6',
            infoBg: 'rgba(59, 130, 246, 0.1)',
            userMessageBg: 'linear-gradient(135deg, #ff7a50 0%, #ff5a30 100%)',
            userMessageText: '#ffffff',
            assistantMessageBg: 'rgba(27, 25, 19, 0.85)',
            assistantMessageText: '#e0e0e0',
            overlayBg: 'rgba(0, 0, 0, 0.7)',
            dimmerBg: 'rgba(0, 0, 0, 0.4)',
            selectionBg: 'rgba(139, 92, 246, 0.3)',
            selectionText: '#ffffff',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)'
        }
    },
    
    // =====================================
    // CLAUDE - Terminal-style with warm amber
    // =====================================
    'claude': {
        id: 'claude',
        name: 'Claude',
        shortName: 'Claude',
        description: 'Organized terminal aesthetic with warm amber accents',
        category: 'ai',
        isDark: true,
        colors: {
            background: '#0D0D0D',
            surface: '#1A1A1A',
            surfaceHover: 'rgba(217, 164, 72, 0.08)',
            surfaceActive: 'rgba(217, 164, 72, 0.12)',
            surfacePressed: 'rgba(217, 164, 72, 0.16)',
            textPrimary: '#E8E8E8',
            textSecondary: '#C9C9C9',
            textTertiary: '#8A8A8A',
            textMuted: '#5C5C5C',
            textInverse: '#000000',
            border: 'rgba(217, 164, 72, 0.12)',
            borderHover: 'rgba(217, 164, 72, 0.2)',
            borderActive: 'rgba(217, 164, 72, 0.28)',
            borderSubtle: 'rgba(217, 164, 72, 0.06)',
            accent: '#D9A448',
            accentSecondary: '#E8C068',
            accentHover: '#C49438',
            accentMuted: 'rgba(217, 164, 72, 0.15)',
            error: '#E55B5B',
            errorBg: 'rgba(229, 91, 91, 0.12)',
            success: '#5DD879',
            successBg: 'rgba(93, 216, 121, 0.12)',
            warning: '#D9A448',
            warningBg: 'rgba(217, 164, 72, 0.12)',
            info: '#6B9FD4',
            infoBg: 'rgba(107, 159, 212, 0.12)',
            userMessageBg: 'linear-gradient(135deg, #D9A448 0%, #C49438 100%)',
            userMessageText: '#0D0D0D',
            assistantMessageBg: '#1A1A1A',
            assistantMessageText: '#C9C9C9',
            overlayBg: 'rgba(0, 0, 0, 0.8)',
            dimmerBg: 'rgba(0, 0, 0, 0.5)',
            selectionBg: 'rgba(217, 164, 72, 0.25)',
            selectionText: '#0D0D0D',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.5)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)'
        }
    },
    
    // =====================================
    // GREISH - Pure grey, black and white
    // =====================================
    'greish': {
        id: 'greish',
        name: 'Greish',
        shortName: 'Greish',
        description: 'Pure black, white and grey monochromatic theme',
        category: 'minimal',
        isDark: true,
        colors: {
            background: '#1A1A1A',
            surface: '#262626',
            surfaceHover: 'rgba(255, 255, 255, 0.06)',
            surfaceActive: 'rgba(255, 255, 255, 0.09)',
            surfacePressed: 'rgba(255, 255, 255, 0.12)',
            textPrimary: '#F5F5F5',
            textSecondary: '#D4D4D4',
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
            accentMuted: 'rgba(255, 255, 255, 0.15)',
            error: '#DC2626',
            errorBg: 'rgba(220, 38, 38, 0.15)',
            success: '#16A34A',
            successBg: 'rgba(22, 163, 74, 0.15)',
            warning: '#CA8A04',
            warningBg: 'rgba(202, 138, 4, 0.15)',
            info: '#2563EB',
            infoBg: 'rgba(37, 99, 235, 0.15)',
            userMessageBg: 'linear-gradient(135deg, #FFFFFF 0%, #E5E5E5 100%)',
            userMessageText: '#1A1A1A',
            assistantMessageBg: '#262626',
            assistantMessageText: '#D4D4D4',
            overlayBg: 'rgba(0, 0, 0, 0.8)',
            dimmerBg: 'rgba(0, 0, 0, 0.6)',
            selectionBg: 'rgba(255, 255, 255, 0.2)',
            selectionText: '#1A1A1A',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.4)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)'
        }
    },
    
    // =====================================
    // WATER - Refreshing oceanic blues
    // =====================================
    'water': {
        id: 'water',
        name: 'Water',
        shortName: 'Water',
        description: 'Refreshing oceanic blues inspired by crystal clear waters',
        category: 'colorful',
        isDark: true,
        colors: {
            background: '#0A1628',
            surface: '#0F2744',
            surfaceHover: 'rgba(56, 189, 248, 0.08)',
            surfaceActive: 'rgba(56, 189, 248, 0.12)',
            surfacePressed: 'rgba(56, 189, 248, 0.16)',
            textPrimary: '#E0F7FA',
            textSecondary: '#B2EBF2',
            textTertiary: '#80DEEA',
            textMuted: '#4DD0E1',
            textInverse: '#0A1628',
            border: 'rgba(56, 189, 248, 0.12)',
            borderHover: 'rgba(56, 189, 248, 0.2)',
            borderActive: 'rgba(56, 189, 248, 0.28)',
            borderSubtle: 'rgba(56, 189, 248, 0.06)',
            accent: '#38BDF8',
            accentSecondary: '#22D3EE',
            accentHover: '#0EA5E9',
            accentMuted: 'rgba(56, 189, 248, 0.2)',
            error: '#F87171',
            errorBg: 'rgba(248, 113, 113, 0.12)',
            success: '#34D399',
            successBg: 'rgba(52, 211, 153, 0.12)',
            warning: '#FBBF24',
            warningBg: 'rgba(251, 191, 36, 0.12)',
            info: '#38BDF8',
            infoBg: 'rgba(56, 189, 248, 0.12)',
            userMessageBg: 'linear-gradient(135deg, #38BDF8 0%, #0EA5E9 100%)',
            userMessageText: '#0A1628',
            assistantMessageBg: '#0F2744',
            assistantMessageText: '#B2EBF2',
            overlayBg: 'rgba(10, 22, 40, 0.85)',
            dimmerBg: 'rgba(10, 22, 40, 0.6)',
            selectionBg: 'rgba(56, 189, 248, 0.3)',
            selectionText: '#0A1628',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.4)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)'
        }
    },
    
    // =====================================
    // CHATGPT - Clean dark theme inspired by ChatGPT
    // =====================================
    'chatgpt': {
        id: 'chatgpt',
        name: 'ChatGPT',
        shortName: 'ChatGPT',
        description: 'Clean dark theme inspired by ChatGPT',
        category: 'ai',
        isDark: true,
        colors: {
            background: '#212121',
            surface: '#181818',
            surfaceHover: 'rgba(255, 255, 255, 0.06)',
            surfaceActive: 'rgba(255, 255, 255, 0.1)',
            surfacePressed: 'rgba(255, 255, 255, 0.14)',
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
            userMessageBg: 'rgba(255, 255, 255, 0.08)',
            userMessageText: '#FFFFFF',
            assistantMessageBg: 'transparent',
            assistantMessageText: '#E5E5E5',
            overlayBg: 'rgba(0, 0, 0, 0.7)',
            dimmerBg: 'rgba(0, 0, 0, 0.5)',
            selectionBg: 'rgba(255, 255, 255, 0.2)',
            selectionText: '#000000',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
            scrollbar: '#303030',
            scrollbarHover: '#3A3A3A'
        }
    }
}

const THEME_CATEGORY_LABELS = {
    classic: 'Classic',
    colorful: 'Colorful',
    minimal: 'Minimal',
    professional: 'Professional',
    ai: 'AI Inspired'
} satisfies Record<Theme['category'], string>

const THEME_CATEGORY_ORDER: Theme['category'][] = [
    'classic',
    'colorful',
    'minimal',
    'professional',
    'ai'
]

const availableCategoryIds = new Set(Object.values(themes).map(theme => theme.category))

export const themeCategories = [
    { id: 'all', name: 'All Themes' },
    ...THEME_CATEGORY_ORDER
        .filter(category => availableCategoryIds.has(category))
        .map(category => ({
            id: category,
            name: THEME_CATEGORY_LABELS[category]
        }))
]

export function getThemeById(id: string): Theme | undefined {
    return themes[id]
}

export function getThemesByCategory(category: string): Theme[] {
    if (category === 'all') return Object.values(themes)
    return Object.values(themes).filter(t => t.category === category)
}

export function getDefaultTheme(): Theme {
    return themes['dark-default']
}
