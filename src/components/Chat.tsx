import React, { useState, useRef, useEffect } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
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
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isLoading])

    const callOpenRouter = async (userPrompt: string, image?: string) => {
        const apiKey = settings.openRouterApiKey || import.meta.env.VITE_OPENROUTER_API_KEY

        if (!apiKey) {
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: "Please configure your OpenRouter API Key in Settings."
            }
            setMessages(prev => [...prev, errorMessage])
            return
        }

        setIsLoading(true)
        try {
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

            if (settings.systemPrompt) {
                messagesPayload.unshift({ "role": "system", "content": settings.systemPrompt })
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
                throw new Error(`API Error: ${response.status}`)
            }

            const data = await response.json()

            if (!response.ok) {
                const errorMsg = data.error?.message || `API Error: ${response.status}`
                throw new Error(errorMsg)
            }

            const aiContent = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."

            const aiMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: aiContent
            }
            setMessages(prev => [...prev, aiMessage])
        } catch (error: any) {
            console.error("API Error:", error)
            window.ipcRenderer.send('log-to-terminal', `[API ERROR] ${error.message || error}`)
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: "Sorry, there was an error connecting to the AI. Please check your API key and internet connection."
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
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
            callOpenRouter(prompt, image)
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
        callOpenRouter(input)
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
                <span style={{ fontWeight: 600, color: '#fff' }}>Zura Chat</span>
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
                    ⚙️
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
