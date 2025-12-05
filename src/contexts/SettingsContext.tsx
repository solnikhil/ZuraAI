import React, { createContext, useContext, useState, useEffect } from 'react'

export interface Settings {
    theme: 'light' | 'dark' | 'system'
    openRouterApiKey: string
    aiModel: string
    temperature: number
    maxTokens: number
    autoHideOverlay: boolean
    overlayTransparency: number
    shortcuts: {
        toggleOverlay: string
    }
    systemPrompt: string
    streamResponses: boolean
    configuredModels: Array<{ code: string; displayName: string }>
}

const defaultSettings: Settings = {
    theme: 'dark',
    openRouterApiKey: '',
    aiModel: 'x-ai/grok-4.1-fast',
    temperature: 0.7,
    maxTokens: 1000,
    autoHideOverlay: false,
    overlayTransparency: 0.95,
    shortcuts: {
        toggleOverlay: 'CommandOrControl+Shift+Z'
    },
    systemPrompt: `You are **Zura**, a sleek and intelligent AI assistant for desktop.

## Response Style
- **Clean and polished** - Format responses to be visually appealing
- **Structured** - Use sections, bullet points, and clear hierarchy
- **Concise yet complete** - Get to the point while being thorough

## Formatting Rules
- Use **bold** for key terms and important concepts
- Use bullet points (•) for lists
- Use code blocks with language tags for any code
- Use horizontal rules (---) to separate major sections when needed
- Never use citation markers like [1], [2], etc.
- Never include footnotes or source references in brackets
- Start responses directly with content, not with "I" statements or headers

## Structure Template
For technical explanations, follow this pattern:
- **Summary** - Brief overview of the topic
- **Key Points** - Bulleted breakdown
- **Details** - Expanded explanation if needed
- **Code** (if applicable) - Syntax-highlighted examples

## Behavior
- Analyze screenshots thoroughly when attached
- Be direct - this is a quick-access overlay
- No emojis unless explicitly requested
- Prioritize clarity and readability

Respond like a premium AI assistant who delivers polished, well-formatted information.`,
    streamResponses: false,
    configuredModels: [
        { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast' },
        { code: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet' },
        { code: 'openai/gpt-4o', displayName: 'GPT-4o' },
        { code: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini' },
        { code: 'google/gemini-2.0-flash-exp:free', displayName: 'Gemini 2.0 Flash' },
        { code: 'meta-llama/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B' },
    ]
}

interface SettingsContextType {
    settings: Settings
    updateSettings: (newSettings: Partial<Settings>) => void
    resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('zura-settings')
        const parsed = saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings

        // Force migration: if model is the old default, switch to Grok
        if (parsed.aiModel === 'openrouter/sherlock-dash-alpha') {
            parsed.aiModel = 'x-ai/grok-4.1-fast'
        }

        // Force migration: System Prompt update for better formatting
        if (parsed.systemPrompt.includes('Keep responses concise and actionable')) {
            parsed.systemPrompt = defaultSettings.systemPrompt
        }

        return parsed
    })

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'zura-settings' && e.newValue) {
                setSettings(JSON.parse(e.newValue))
            }
        }
        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [])

    useEffect(() => {
        localStorage.setItem('zura-settings', JSON.stringify(settings))

        // Apply theme
        if (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }

        // Sync with main process
        if (window.ipcRenderer) {
            window.ipcRenderer.send('settings-changed', settings)
        }
    }, [settings])

    const updateSettings = (newSettings: Partial<Settings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }))
    }

    const resetSettings = () => {
        setSettings(defaultSettings)
    }

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings() {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}
