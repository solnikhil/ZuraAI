import React, { useState, useRef, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { checkOllamaStatus, generateOllamaCompletion } from '../services/ollama'
import { generatePerplexityCompletion } from '../services/perplexity'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ThinkingBlock from './ThinkingBlock'
import './Chat.css'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    image?: string
    thinking?: string
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
        // Check every 10 seconds if Ollama is selected
        let interval: NodeJS.Timeout
        if (settings.modelProvider === 'ollama') {
            interval = setInterval(checkStatus, 10000)
        }

        return () => clearInterval(interval)
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

    // Parse thinking content from response using "**Final Answer:**" delimiter
    const parseThinkingContent = (content: string): { thinking: string | undefined; answer: string } => {
        const finalAnswerMatch = content.match(/\*\*Final Answer:\*\*/i)
        if (finalAnswerMatch && finalAnswerMatch.index !== undefined) {
            const thinkingPart = content.substring(0, finalAnswerMatch.index).trim()
            const answerPart = content.substring(finalAnswerMatch.index + finalAnswerMatch[0].length).trim()
            const cleanThinking = thinkingPart
                .replace(/^---\s*/m, '')
                .replace(/---\s*$/m, '')
                .replace(/\*\*Thinking\.\.\.\*\*/gi, '')
                .trim()
            return {
                thinking: cleanThinking || undefined,
                answer: answerPart || content
            }
        }
        return { thinking: undefined, answer: content }
    }

    const callPerplexity = async (userPrompt: string, image?: string) => {
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

            const rawContent = response.choices[0].message.content

            // Parse thinking content if thinking mode is enabled
            const thinking = undefined
            const content = response.choices[0].message.content

            const aiMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: content,
                thinking: thinking
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

            const rawContent = response.message.content

            // Parse thinking content if thinking mode is enabled
            const thinking = undefined
            const answer = response.message.content

            const aiMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: answer,
                thinking: thinking
            }
            setMessages(prev => [...prev, aiMessage])

        } catch (error: any) {
            throw new Error(`Ollama Error: ${error.message || "Could not connect"}`)
        }
    }

    const callOpenRouter = async (userPrompt: string, image?: string) => {
        const apiKey = settings.openRouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY

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
                "Content-Type": "application/json"
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
        const rawContent = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."

        // Parse thinking content if thinking mode is enabled
        const thinking = undefined
        const content = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."

        const aiMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: content,
            thinking: thinking
        }
        setMessages(prev => [...prev, aiMessage])
    }

    useEffect(() => {
        const handleNewPrompt = (_event: any, { prompt, image }: { prompt: string, image?: string }) => {
            const userMessage: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: prompt,
                image: image
            }
            setMessages(prev => [...prev, userMessage])
            callAI(prompt, image)
        }

        if (window.ipcRenderer) {
            window.ipcRenderer.on('new-prompt', handleNewPrompt)
            return () => {
                window.ipcRenderer.off('new-prompt', handleNewPrompt)
            }
        }
    }, [settings]) // Re-bind if settings change (though mostly for the closure)

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
                            transition: 'opacity 0.2s, transform 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'scale(1)'; }}
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
                            {msg.role === 'assistant' && msg.thinking && (
                                <ThinkingBlock thinking={msg.thinking} />
                            )}
                            {msg.content && (
                                <div className="markdown-body">
                                    <ReactMarkdown
                                        children={msg.content}
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                            code({ node, inline, className, children, ...props }: any) {
                                                const match = /language-(\w+)/.exec(className || '')
                                                return !inline && match ? (
                                                    <SyntaxHighlighter
                                                        {...props}
                                                        children={String(children).replace(/\n$/, '')}
                                                        style={vscDarkPlus}
                                                        language={match[1]}
                                                        PreTag="div"
                                                    />
                                                ) : (
                                                    <code {...props} className={className}>
                                                        {children}
                                                    </code>
                                                )
                                            }
                                        }}
                                    />
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
