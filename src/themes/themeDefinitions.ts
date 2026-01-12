export interface ColorPalette {
    // Core surfaces
    background: string
    surface: string
    surfaceHover: string
    surfaceActive: string
    surfacePressed: string
    surfaceSubtle: string  // Very subtle surface tint

    // Text hierarchy
    textPrimary: string
    textSecondary: string
    textTertiary: string
    textMuted: string
    textInverse: string

    // Borders
    border: string
    borderHover: string
    borderActive: string
    borderSubtle: string

    // Accents
    accent: string
    accentSecondary: string
    accentHover: string
    accentMuted: string

    // Semantic
    error: string
    errorBg: string
    success: string
    successBg: string
    warning: string
    warningBg: string
    info: string
    infoBg: string
    favorite: string  // Gold color for favorites/stars

    // Special elements
    userMessageBg: string
    userMessageText: string
    assistantMessageBg: string
    assistantMessageText: string
    overlayBg: string
    dimmerBg: string
    selectionBg: string
    selectionText: string

    // Shadows
    shadowSm: string
    shadowMd: string
    shadowLg: string

    // Scrollbar
    scrollbar?: string
    scrollbarHover?: string
}

export interface Theme {
    id: string
    name: string
    shortName?: string
    description?: string
    category: 'classic' | 'colorful' | 'minimal' | 'ai' | 'terminal' | 'creative'
    isDark: boolean
    colors: ColorPalette
}

export type ThemeId = string
