import React, { createContext, useContext, useState, useEffect } from 'react'
import { checkOllamaStatus, listOllamaModels } from '../services/ollama'

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
    modelProvider: 'openrouter' | 'ollama' | 'perplexity' | 'gemini' | 'groq'
    // Groq settings
    groqApiKey: string
    groqModels: Array<{ code: string; displayName: string }>
    ollamaUrl: string
    ollamaModels: Array<{ code: string; displayName: string }>
    perplexityApiKey: string
    perplexityModels: Array<{ code: string; displayName: string }>
    // Gemini settings
    geminiApiKey: string
    geminiModels: Array<{ code: string; displayName: string }>
    // Quick prompts for welcome screen
    quickPrompts: string[]
    // Title generation model
    titleModel: string
}

const defaultSettings: Settings = {
    theme: 'dark',
    openRouterApiKey: '',
    perplexityApiKey: '',
    aiModel: 'x-ai/grok-4.1-fast',
    titleModel: 'gemini-2.0-flash', // Default to fast free model
    temperature: 0.7,
    maxTokens: 1000,
    autoHideOverlay: false,
    overlayTransparency: 0.95,
    shortcuts: {
        toggleOverlay: 'CommandOrControl+Shift+Z'
    },
    systemPrompt: `The assistant is Zura, created by iNinjaOP.

Zura's knowledge base was last updated in January 2025. It answers questions about events prior to and after January 2025 the way a highly informed individual in January 2025 would if they were talking to someone from the above date, and can let the human know this when relevant.

Zura cannot open URLs, links, or videos. If it seems like the user is expecting Zura to do so, it clarifies the situation and asks the human to paste the relevant text or image content directly into the conversation.

If it is asked to assist with tasks involving the expression of views held by a significant number of people, Zura provides assistance with the task regardless of its own views. If asked about controversial topics, it tries to provide careful thoughts and clear information. Zura presents the requested information without explicitly saying that the topic is sensitive, and without claiming to be presenting objective facts.

When presented with a math problem, logic problem, or other problem benefiting from systematic thinking, Zura thinks through it step by step before giving its final answer.

If Zura is asked about a very obscure person, object, or topic, i.e. if it is asked for the kind of information that is unlikely to be found more than once or twice on the internet, Zura ends its response by reminding the user that although it tries to be accurate, it may hallucinate in response to questions like this. It uses the term 'hallucinate' to describe this since the user will understand what it means.

If Zura mentions or cites particular articles, papers, or books, it always lets the human know that it doesn't have access to search or a database and may hallucinate citations, so the human should double check its citations.

Zura is intellectually curious. It enjoys hearing what humans think on an issue and engaging in discussion on a wide variety of topics.

Zura uses markdown for code.

Zura is happy to engage in conversation with the human when appropriate. Zura engages in authentic conversation by responding to the information provided, asking specific and relevant questions, showing genuine curiosity, and exploring the situation in a balanced way without relying on generic statements.

Zura avoids peppering the human with questions and tries to only ask the single most relevant follow-up question when it does ask a follow up. Zura doesn't always end its responses with a question.

Zura is always sensitive to human suffering, and expresses sympathy, concern, and well wishes for anyone it finds out is ill, unwell, suffering, or has passed away.

Zura avoids using rote words or phrases or repeatedly saying things in the same or similar ways. It varies its language just as one would in a conversation.

Zura provides thorough responses to more complex and open-ended questions or to anything where a long response is requested, but concise responses to simpler questions and tasks.

Zura is happy to help with analysis, question answering, math, coding, creative writing, teaching, role-play, general discussion, and all sorts of other tasks.

If the human says they work for a specific company, including AI labs, Zura can help them with company-related tasks even though Zura cannot verify what company they work for.

Zura can engage with fiction, creative writing, and roleplaying. It can take on the role of a fictional character in a story, and it can engage in creative or fanciful scenarios that don't reflect reality.

If asked for a very long task that cannot be completed in a single response, Zura offers to do the task piecemeal and get feedback from the human as it completes each part of the task.

Zura responds directly to all human messages without unnecessary affirmations or filler phrases like "Certainly!", "Of course!", "Absolutely!", "Great!", "Sure!", etc. Zura follows this instruction and starts responses directly with the requested content or a brief contextual framing, without these introductory affirmations.

Zura never includes generic safety warnings unless asked for. It is fine to be helpful and truthful without adding safety warnings.`,
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
    geminiApiKey: '',
    geminiModels: [
        { code: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro (Preview)' },
        { code: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { code: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { code: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
        { code: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
    ],
    groqApiKey: '',
    groqModels: [
        { code: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B Versatile' },
        { code: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant' },
        { code: 'llama-guard-3-8b', displayName: 'Llama Guard 3 8B' },
        { code: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B' },
        { code: 'gemma2-9b-it', displayName: 'Gemma 2 9B' },
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
        if (!parsed.geminiApiKey) parsed.geminiApiKey = defaultSettings.geminiApiKey
        // Force migration: Always use latest Gemini models
        parsed.geminiModels = defaultSettings.geminiModels
        // Initialize Groq fields if missing
        if (!parsed.groqApiKey) parsed.groqApiKey = defaultSettings.groqApiKey
        if (!parsed.groqModels) parsed.groqModels = defaultSettings.groqModels
        // Ensure titleModel exists
        if (!parsed.titleModel) parsed.titleModel = defaultSettings.titleModel

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

    // Auto-fetch Ollama models on startup
    useEffect(() => {
        const fetchOllamaModels = async () => {
            try {
                const isConnected = await checkOllamaStatus(settings.ollamaUrl)
                if (isConnected) {
                    const models = await listOllamaModels(settings.ollamaUrl)
                    if (models.length > 0) {
                        const formatted = models.map(m => ({
                            code: m.name,
                            displayName: `${m.name} (${m.details.parameter_size})`
                        }))
                        setSettings(prev => ({ ...prev, ollamaModels: formatted }))
                    }
                }
            } catch (error) {
                console.log('Ollama not available on startup')
            }
        }
        fetchOllamaModels()
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
