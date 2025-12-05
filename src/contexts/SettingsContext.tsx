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
    systemPrompt: `You are Zura, a helpful AI assistant for desktop. Keep responses concise and actionable.

**Guidelines:**
- Be brief and direct - this is a quick-access overlay, not a full app
- Use markdown for formatting when helpful
- For code, use syntax-highlighted blocks
- Skip pleasantries, get to the point
- If a screenshot is attached, analyze it and respond accordingly
- Never start with headers or "I" statements
- No emojis

Respond like a smart, efficient assistant who values the user's time.`,
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
