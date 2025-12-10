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
    // Provider settings
    modelProvider: 'openrouter' | 'ollama' | 'perplexity'
    ollamaUrl: string
    ollamaModels: Array<{ code: string; displayName: string }>
    perplexityApiKey: string
    perplexityModels: Array<{ code: string; displayName: string }>
    // Quick prompts for welcome screen
    quickPrompts: string[]
}

const defaultSettings: Settings = {
    theme: 'dark',
    openRouterApiKey: '',
    perplexityApiKey: '',
    aiModel: 'x-ai/grok-4.1-fast',
    temperature: 0.7,
    maxTokens: 1000,
    autoHideOverlay: false,
    overlayTransparency: 0.95,
    shortcuts: {
        toggleOverlay: 'CommandOrControl+Shift+Z'
    },
    systemPrompt: `You are **Zura**, a friendly and intelligent AI assistant for desktop.

## Conversational Behavior
- For greetings like "hello", "hi", "hey" - respond naturally and warmly as a friendly assistant
- For casual conversation - be personable and engaging, not robotic
- For questions and tasks - provide helpful, well-formatted responses
- DO NOT treat simple greetings or casual messages as search queries
- DO NOT provide Wikipedia-style definitions for common words

## Response Style
- **Clean and polished** - Format responses to be visually appealing
- **Structured** - Use sections, bullet points, and clear hierarchy for complex topics
- **Concise yet complete** - Get to the point while being thorough
- **Natural** - For simple messages, keep responses brief and conversational

## Formatting Rules (for informational responses)
- Use **bold** for key terms and important concepts
- Use bullet points (•) for lists
- Use code blocks with language tags for any code
- Never use citation markers like [1], [2], etc.
- Never include footnotes or source references in brackets
- Start responses directly with content

## Structure Template
For technical explanations only:
- **Summary** - Brief overview
- **Key Points** - Bulleted breakdown
- **Details** - Expanded explanation if needed
- **Code** (if applicable) - Examples

## Behavior
- Analyze screenshots thoroughly when attached
- Be direct but friendly
- No emojis unless explicitly requested
- Prioritize clarity and readability

You are a premium AI assistant who is both helpful AND personable.`,
    streamResponses: false,
    configuredModels: [
        { code: 'x-ai/grok-4.1-fast', displayName: 'Grok 4.1 Fast' },
        { code: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet' },
        { code: 'openai/gpt-4o', displayName: 'GPT-4o' },
        { code: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini' },
        { code: 'google/gemini-2.0-flash-exp:free', displayName: 'Gemini 2.0 Flash' },
        { code: 'meta-llama/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B' },
    ],
    modelProvider: 'openrouter',
    ollamaUrl: 'http://localhost:11434',
    ollamaModels: [],
    perplexityModels: [
        { code: 'sonar', displayName: 'Sonar' },
        { code: 'sonar-pro', displayName: 'Sonar Pro' },
        { code: 'sonar-reasoning', displayName: 'Sonar Reasoning' },
        { code: 'sonar-reasoning-pro', displayName: 'Sonar Reasoning Pro' },
        { code: 'sonar-deep-research', displayName: 'Sonar Deep Research' },
    ],
    quickPrompts: [
        'Explain this code to me',
        'Help me debug an error',
        'Write a summary of...',
        'Brainstorm ideas for...'
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

        // Initialize new fields if missing
        if (!parsed.modelProvider) parsed.modelProvider = defaultSettings.modelProvider
        if (!parsed.ollamaUrl) parsed.ollamaUrl = defaultSettings.ollamaUrl
        if (!parsed.ollamaModels) parsed.ollamaModels = defaultSettings.ollamaModels
        if (!parsed.perplexityApiKey) parsed.perplexityApiKey = defaultSettings.perplexityApiKey
        if (!parsed.perplexityModels) parsed.perplexityModels = defaultSettings.perplexityModels

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
