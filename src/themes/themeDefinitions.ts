export interface ColorPalette {
    // Core surfaces
    background: string
    surface: string
    surfaceHover: string
    surfaceActive: string
    surfacePressed: string
    
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
}

export interface Theme {
    id: string
    name: string
    shortName?: string
    description?: string
    category: 'classic' | 'colorful' | 'minimal' | 'professional' | 'ai'
    isDark: boolean
    colors: ColorPalette
}

export type ThemeId = string




