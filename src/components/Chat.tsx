import React, { useState, useRef, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { checkOllamaStatus, generateOllamaCompletion } from '../services/ollama'
import { generatePerplexityCompletion } from '../services/perplexity'
import LazyMarkdown from './LazyMarkdown'
import './Chat.css'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    image?: string
}

export default function Chat() {
    const { settings } = useSettings()
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'assistant', content: 'Hello! I am Zura. How can I help you today?' }
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isOllamaRunning, setIsOllamaRunning] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Check Ollama status
    useEffect(() => {
        const checkStatus = async () => {
            if (settings.modelProvider === 'ollama') {
                const status = await checkOllamaStatus(settings.ollamaUrl || 'http://localhost:11434')
                setIsOllamaRunning(status)
            }
        }

        checkStatus()
        // Check every 10 seconds ONLY if Ollama is selected
        // This prevents unnecessary polling and saves RAM/CPU when using other providers
        let interval: NodeJS.Timeout | null = null
        if (settings.modelProvider === 'ollama') {
            interval = setInterval(checkStatus, 10000)
        }

        return () => {
            if (interval) {
                clearInterval(interval)
            }
        }
    }, [settings.modelProvider, settings.ollamaUrl])

    useEffect(() => {
        scrollToBottom()
    }, [messages, isLoading])

    const callAI = async (userPrompt: string, image?: string) => {
        setIsLoading(true)

        try {
            if (settings.modelProvider === 'ollama') {
                await callOllama(userPrompt, image)
            } else if (settings.modelProvider === 'perplexity') {
                await callPerplexity(userPrompt, image)
            } else {
                await callOpenRouter(userPrompt, image)
            }
        } catch (error: any) {
            console.error("AI Error:", error)
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: error.message || "An unexpected error occurred."
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
    }

    const callPerplexity = async (userPrompt: string, _image?: string) => {
        if (!settings.perplexityApiKey) {
            throw new Error("Please configure your Perplexity API Key in Settings.")
        }

        try {
            const messagesPayload = []

            // Use thinking system prompt when enabled
            const systemPromptToUse = settings.systemPrompt

            if (systemPromptToUse) {
                messagesPayload.push({ role: 'system', content: systemPromptToUse })
            }

            messagesPayload.push({ role: 'user', content: userPrompt })

            const response = await generatePerplexityCompletion(
                settings.perplexityApiKey,
                settings.aiModel,
                messagesPayload,
                { temperature: settings.temperature, max_tokens: settings.maxTokens }
            )

            const aiMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: response.choices[0].message.content
            }
            setMessages(prev => [...prev, aiMessage])

        } catch (error: any) {
            throw new Error(`Perplexity Error: ${error.message || "Could not connect"}`)
        }
    }

    const callOllama = async (userPrompt: string, image?: string) => {
        try {
            const messagesPayload = []

            // Use thinking system prompt when enabled
            const systemPromptToUse = settings.systemPrompt

            if (systemPromptToUse) {
                messagesPayload.push({ role: 'system', content: systemPromptToUse })
            }

            const userMessage: any = { role: 'user', content: userPrompt }
            if (image) {
                const base64Image = image.includes(',') ? image.split(',')[1] : image
                if (base64Image) {
                    userMessage.images = [base64Image]
                }
            }
            messagesPayload.push(userMessage)

            const response = await generateOllamaCompletion(
                settings.ollamaUrl || 'http://localhost:11434',
                settings.aiModel,
                messagesPayload,
                { temperature: settings.temperature }
            )

            const aiMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: response.message.content
            }
            setMessages(prev => [...prev, aiMessage])

        } catch (error: any) {
            throw new Error(`Ollama Error: ${error.message || "Could not connect"}`)
        }
    }

    const callOpenRouter = async (userPrompt: string, image?: string) => {
        const apiKey = settings.openRouterApiKey

        if (!apiKey) {
            throw new Error("Please configure your OpenRouter API Key in Settings.")
        }

        let messagesPayload: any[] = []

        if (image) {
            messagesPayload = [
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": userPrompt },
                        { "type": "image_url", "image_url": { "url": image } }
                    ]
                }
            ]
        } else {
            messagesPayload = [
                { "role": "user", "content": userPrompt }
            ]
        }

        // Use thinking system prompt when enabled
        const systemPromptToUse = settings.systemPrompt

        if (systemPromptToUse) {
            messagesPayload.unshift({ "role": "system", "content": systemPromptToUse })
        }

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://zura.ai",
                "X-Title": "Zura AI"
            },
            body: JSON.stringify({
                "model": settings.aiModel,
                "messages": messagesPayload,
                "temperature": settings.temperature,
                "max_tokens": settings.maxTokens
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}))
            const errorMsg = data.error?.message || `API Error: ${response.status}`
            throw new Error(errorMsg)
        }

        const data = await response.json()

        const aiMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."
        }
        setMessages(prev => [...prev, aiMessage])
    }



    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isLoading) return

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input
        }

        setMessages(prev => [...prev, userMessage])
        setInput('')
        callAI(input)
    }

    const openSettings = () => {
        if (window.ipcRenderer) {
            window.ipcRenderer.send('open-settings')
        } else {
            // Fallback for web dev
            window.location.hash = 'settings'
        }
    }

    return (
        <div className="chat-container">
            <div className="chat-header-bar" style={{
                padding: '10px 20px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#1a1a1a'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img
                            src="/icon.png"
                            alt="New Chat"
                            title="Start New Chat"
                            onClick={() => setMessages([{ id: '1', role: 'assistant', content: 'Hello! I am Zura. How can I help you today?' }])}
                            style={{
                                width: '28px',
                                height: '28px',
                                objectFit: 'contain',
                                opacity: 0.7,
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                        />
                    <span style={{ fontWeight: 600, color: '#fff' }}>Zura Chat</span>
                    {settings.modelProvider === 'ollama' && (
                        <div
                            title={isOllamaRunning ? "Ollama is running" : "Ollama is stopped"}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.8rem',
                                padding: '4px 8px',
                                background: isOllamaRunning ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${isOllamaRunning ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                borderRadius: '12px',
                                color: isOllamaRunning ? '#4ade80' : '#ef4444'
                            }}
                        >
                            <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: isOllamaRunning ? '#4ade80' : '#ef4444',
                                boxShadow: isOllamaRunning ? '0 0 5px #4ade80' : 'none'
                            }} />
                            {isOllamaRunning ? 'Ollama Online' : 'Ollama Offline'}
                        </div>
                    )}
                </div>
                <button
                    onClick={openSettings}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        padding: '5px',
                        borderRadius: '5px',
                        transition: 'all 0.2s'
                    }}
                    title="Settings"
                >
                    ??
                </button>
            </div>
            <div className="messages-list">
                {messages.map(msg => (
                    <div key={msg.id} className={`message ${msg.role}`}>
                        <div className="message-content">
                            {msg.image && (
                                <img
                                    src={msg.image}
                                    alt="Screenshot"
                                    style={{ maxWidth: '100%', borderRadius: '8px', marginBottom: '8px', display: 'block' }}
                                />
                            )}
                            {msg.content && (
                                <div className="markdown-body">
                                    <LazyMarkdown content={msg.content} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="message assistant">
                        <div className="message-content">
                            Thinking...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <form className="input-area" onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Message Zura..."
                    disabled={isLoading}
                />
            </form>
        </div>
    )
}
