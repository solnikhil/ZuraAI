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
            surfaceSubtle: 'rgba(255, 255, 255, 0.02)',
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
            favorite: '#FFD700',
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
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
            scrollbar: 'rgba(255, 255, 255, 0.1)',
            scrollbarHover: 'rgba(255, 255, 255, 0.16)'
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
            surfaceSubtle: 'rgba(217, 164, 72, 0.04)',
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
            warning: '#E88A3D',
            warningBg: 'rgba(232, 138, 61, 0.12)',
            info: '#6B9FD4',
            infoBg: 'rgba(107, 159, 212, 0.12)',
            favorite: '#E8C068',
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
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
            scrollbar: 'rgba(217, 164, 72, 0.2)',
            scrollbarHover: 'rgba(217, 164, 72, 0.3)'
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
            surfaceSubtle: 'rgba(255, 255, 255, 0.03)',
            textPrimary: '#F5F5F5',
            textSecondary: '#D4D4D4',
            textTertiary: '#A3A3A3',
            textMuted: '#737373',
            textInverse: '#000000',
            border: 'rgba(255, 255, 255, 0.08)',
            borderHover: 'rgba(255, 255, 255, 0.12)',
            borderActive: 'rgba(255, 255, 255, 0.16)',
            borderSubtle: 'rgba(255, 255, 255, 0.04)',
            accent: '#D4D4D4',
            accentSecondary: '#E5E5E5',
            accentHover: '#E8E8E8',
            accentMuted: 'rgba(212, 212, 212, 0.2)',
            error: '#DC2626',
            errorBg: 'rgba(220, 38, 38, 0.15)',
            success: '#16A34A',
            successBg: 'rgba(22, 163, 74, 0.15)',
            warning: '#CA8A04',
            warningBg: 'rgba(202, 138, 4, 0.15)',
            info: '#2563EB',
            infoBg: 'rgba(37, 99, 235, 0.15)',
            favorite: '#E5E5E5',
            userMessageBg: 'linear-gradient(135deg, #D4D4D4 0%, #B8B8B8 100%)',
            userMessageText: '#1A1A1A',
            assistantMessageBg: '#262626',
            assistantMessageText: '#D4D4D4',
            overlayBg: 'rgba(0, 0, 0, 0.8)',
            dimmerBg: 'rgba(0, 0, 0, 0.6)',
            selectionBg: 'rgba(255, 255, 255, 0.2)',
            selectionText: '#1A1A1A',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.4)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
            scrollbar: 'rgba(255, 255, 255, 0.15)',
            scrollbarHover: 'rgba(255, 255, 255, 0.22)'
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
            scrollbarHover: '#3A3A3A'
        }
    },

    // =====================================
    // LIGHT DEFAULT - Clean light theme
    // =====================================
    'light-default': {
        id: 'light-default',
        name: 'Light Default',
        shortName: 'Light',
        description: 'A clean light theme with soft purple accents',
        category: 'classic',
        isDark: false,
        colors: {
            background: '#FFFFFF',
            surface: '#F5F5F7',
            surfaceHover: 'rgba(0, 0, 0, 0.03)',
            surfaceActive: 'rgba(0, 0, 0, 0.05)',
            surfacePressed: 'rgba(0, 0, 0, 0.08)',
            surfaceSubtle: 'rgba(0, 0, 0, 0.01)',
            textPrimary: '#1D1D1F',
            textSecondary: '#6E6E73',
            textTertiary: '#86868B',
            textMuted: '#AEAEB2',
            textInverse: '#FFFFFF',
            border: 'rgba(0, 0, 0, 0.08)',
            borderHover: 'rgba(0, 0, 0, 0.12)',
            borderActive: 'rgba(0, 0, 0, 0.16)',
            borderSubtle: 'rgba(0, 0, 0, 0.04)',
            accent: '#8B5CF6',
            accentSecondary: '#06B6D4',
            accentHover: '#7C3AED',
            accentMuted: 'rgba(139, 92, 246, 0.15)',
            error: '#EF4444',
            errorBg: 'rgba(239, 68, 68, 0.1)',
            success: '#22C55E',
            successBg: 'rgba(34, 197, 94, 0.1)',
            warning: '#F59E0B',
            warningBg: 'rgba(245, 158, 11, 0.1)',
            info: '#3B82F6',
            infoBg: 'rgba(59, 130, 246, 0.1)',
            favorite: '#F59E0B',
            userMessageBg: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
            userMessageText: '#FFFFFF',
            assistantMessageBg: '#F5F5F7',
            assistantMessageText: '#1D1D1F',
            overlayBg: 'rgba(0, 0, 0, 0.5)',
            dimmerBg: 'rgba(0, 0, 0, 0.3)',
            selectionBg: 'rgba(139, 92, 246, 0.25)',
            selectionText: '#1D1D1F',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.08)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.12)',
            scrollbar: '#D1D1D6',
            scrollbarHover: '#C7C7CC'
        }
    },

    // =====================================
    // MATRIX - Classic green terminal aesthetic
    // =====================================
    'matrix': {
        id: 'matrix',
        name: 'Matrix',
        shortName: 'Matrix',
        description: 'Classic green terminal aesthetic inspired by The Matrix',
        category: 'terminal',
        isDark: true,
        colors: {
            background: '#0C0C0C',
            surface: '#111111',
            surfaceHover: 'rgba(100, 255, 100, 0.05)',
            surfaceActive: 'rgba(100, 255, 100, 0.08)',
            surfacePressed: 'rgba(100, 255, 100, 0.11)',
            surfaceSubtle: 'rgba(100, 255, 100, 0.02)',
            textPrimary: '#4AF626',
            textSecondary: '#3DD021',
            textTertiary: '#32AA1B',
            textMuted: '#268514',
            textInverse: '#0C0C0C',
            border: 'rgba(74, 246, 38, 0.15)',
            borderHover: 'rgba(74, 246, 38, 0.25)',
            borderActive: 'rgba(74, 246, 38, 0.35)',
            borderSubtle: 'rgba(74, 246, 38, 0.08)',
            accent: '#4AF626',
            accentSecondary: '#5CFF33',
            accentHover: '#6CFF43',
            accentMuted: 'rgba(74, 246, 38, 0.12)',
            error: '#C43636',
            errorBg: 'rgba(196, 54, 54, 0.12)',
            success: '#4AF626',
            successBg: 'rgba(74, 246, 38, 0.12)',
            warning: '#C4941E',
            warningBg: 'rgba(196, 148, 30, 0.12)',
            info: '#4A9FF6',
            infoBg: 'rgba(74, 159, 246, 0.12)',
            favorite: '#5CFF33',
            userMessageBg: 'rgba(74, 246, 38, 0.12)',
            userMessageText: '#4AF626',
            assistantMessageBg: 'rgba(0, 0, 0, 0.3)',
            assistantMessageText: '#3DD021',
            overlayBg: 'rgba(0, 0, 0, 0.85)',
            dimmerBg: 'rgba(0, 0, 0, 0.5)',
            selectionBg: 'rgba(74, 246, 38, 0.2)',
            selectionText: '#0C0C0C',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.5)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.4)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.5)',
            scrollbar: 'rgba(74, 246, 38, 0.15)',
            scrollbarHover: 'rgba(74, 246, 38, 0.25)'
        }
    },

    // =====================================
    // AURORA - Northern lights aesthetic
    // =====================================
    'aurora': {
        id: 'aurora',
        name: 'Aurora',
        shortName: 'Aurora',
        description: 'Northern lights inspired with ethereal green and purple gradients',
        category: 'creative',
        isDark: true,
        colors: {
            background: '#050A14',
            surface: '#0B1221',
            surfaceHover: 'rgba(168, 237, 138, 0.06)',
            surfaceActive: 'rgba(168, 237, 138, 0.1)',
            surfacePressed: 'rgba(168, 237, 138, 0.14)',
            surfaceSubtle: 'rgba(168, 237, 138, 0.03)',
            textPrimary: '#E8F5E9',
            textSecondary: '#C8E6C9',
            textTertiary: '#A5D6A7',
            textMuted: '#81C784',
            textInverse: '#050A14',
            border: 'rgba(168, 237, 138, 0.12)',
            borderHover: 'rgba(168, 237, 138, 0.2)',
            borderActive: 'rgba(168, 237, 138, 0.28)',
            borderSubtle: 'rgba(168, 237, 138, 0.06)',
            accent: '#A8ED8A',
            accentSecondary: '#D49BFF',
            accentHover: '#C2F0B8',
            accentMuted: 'rgba(168, 237, 138, 0.15)',
            error: '#FF6B6B',
            errorBg: 'rgba(255, 107, 107, 0.12)',
            success: '#A8ED8A',
            successBg: 'rgba(168, 237, 138, 0.12)',
            warning: '#FFD93D',
            warningBg: 'rgba(255, 217, 61, 0.12)',
            info: '#7DD3FC',
            infoBg: 'rgba(125, 211, 252, 0.12)',
            favorite: '#FFD93D',
            userMessageBg: 'linear-gradient(135deg, #A8ED8A 0%, #D49BFF 100%)',
            userMessageText: '#050A14',
            assistantMessageBg: 'rgba(11, 18, 33, 0.8)',
            assistantMessageText: '#C8E6C9',
            overlayBg: 'rgba(5, 10, 20, 0.85)',
            dimmerBg: 'rgba(5, 10, 20, 0.6)',
            selectionBg: 'rgba(168, 237, 138, 0.2)',
            selectionText: '#050A14',
            shadowSm: '0 1px 2px rgba(0, 0, 0, 0.4)',
            shadowMd: '0 4px 12px rgba(0, 0, 0, 0.5)',
            shadowLg: '0 8px 24px rgba(0, 0, 0, 0.6)',
            scrollbar: 'rgba(168, 237, 138, 0.15)',
            scrollbarHover: 'rgba(168, 237, 138, 0.25)'
        }
    }
}

const THEME_CATEGORY_LABELS = {
    classic: 'Classic',
    colorful: 'Colorful',
    minimal: 'Minimal',
    ai: 'AI Inspired',
    terminal: 'Terminal',
    creative: 'Creative'
} satisfies Record<Theme['category'], string>

const THEME_CATEGORY_ORDER: Theme['category'][] = [
    'classic',
    'colorful',
    'minimal',
    'ai',
    'terminal',
    'creative'
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
