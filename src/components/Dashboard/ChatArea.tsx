import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Sparkles, Copy, Check, User } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { generateOllamaCompletion } from '../../services/ollama'
import { generatePerplexityCompletion } from '../../services/perplexity'
import { buildOptimizedContext } from '../../utils/tokenUtils'

export default function ChatArea() {
    const { sessions, currentSessionId, addMessageToSession, createSession } = useChatHistory()
    const { settings } = useSettings()

    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const currentSession = sessions.find(s => s.id === currentSessionId)
    const messages = currentSession?.messages || []

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isLoading, streamingContent])

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
        }
    }, [input])

    // Typewriter effect function - returns when complete, caller handles cleanup
    const typewriterEffect = async (text: string): Promise<void> => {
        setIsStreaming(true)
        setStreamingContent('')

        // Speed settings (ms per character)
        const baseSpeed = 15  // Normal speed
        const fastSpeed = 5   // For code blocks

        let i = 0
        const length = text.length

        while (i < length) {
            // Check if we're in a code block for faster rendering
            const inCodeBlock = text.substring(0, i).split('```').length % 2 === 0
            const speed = inCodeBlock ? fastSpeed : baseSpeed

            // Add characters in chunks for smoother rendering
            const chunkSize = inCodeBlock ? 5 : 2
            const chunk = text.substring(i, Math.min(i + chunkSize, length))

            setStreamingContent(prev => prev + chunk)
            i += chunkSize

            await new Promise(resolve => setTimeout(resolve, speed))
        }

        // Don't clear here - let the caller add message first, then clear
    }

    // Helper to finish streaming and add message
    const finishStreaming = () => {
        setIsStreaming(false)
        setStreamingContent('')
    }


    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return

        const userMessageContent = input
        setInput('')
        setIsLoading(true)

        let targetSessionId = currentSessionId
        let isNewSession = false

        // If no session exists, create one (which also adds the first user message)
        if (!targetSessionId) {
            targetSessionId = createSession(userMessageContent)
            isNewSession = true
        } else {
            // Only add user message if this is an existing session
            addMessageToSession(targetSessionId, {
                role: 'user',
                content: userMessageContent
            })
        }

        try {
            let responseContent = ""

            // Build optimized context with token management
            const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }))
            const optimizedHistory = buildOptimizedContext(
                conversationHistory,
                userMessageContent,
                settings.systemPrompt,
                settings.aiModel
            )

            if (settings.modelProvider === 'ollama') {
                const res = await generateOllamaCompletion(
                    settings.ollamaUrl,
                    settings.aiModel,
                    optimizedHistory,
                    { temperature: settings.temperature }
                )
                responseContent = res.message.content

            } else if (settings.modelProvider === 'perplexity') {
                const res = await generatePerplexityCompletion(
                    settings.perplexityApiKey,
                    settings.aiModel,
                    optimizedHistory
                )
                responseContent = res.choices[0].message.content
            } else {
                const apiKey = settings.openRouterApiKey

                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        "model": settings.aiModel,
                        "messages": optimizedHistory
                    })
                })
                const data = await res.json()
                responseContent = data.choices?.[0]?.message?.content || "Error: No response"
            }

            // Show typewriter effect
            setIsLoading(false)
            await typewriterEffect(responseContent)

            // Save the complete message after animation, then clear streaming
            addMessageToSession(targetSessionId!, {
                role: 'assistant',
                content: responseContent
            })
            finishStreaming()

        } catch (error: any) {
            setIsLoading(false)
            const errorMsg = `Error: ${error.message}`
            await typewriterEffect(errorMsg)
            addMessageToSession(targetSessionId!, {
                role: 'assistant',
                content: errorMsg
            })
            finishStreaming()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }

    // Empty State
    if (!currentSession || messages.length === 0) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                background: 'linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)',
                position: 'relative'
            }}>
                {/* Centered Welcome */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '24px',
                        boxShadow: '0 8px 32px rgba(102, 126, 234, 0.3)'
                    }}>
                        <Sparkles size={32} color="#fff" />
                    </div>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: 600,
                        color: '#fff',
                        marginBottom: '8px',
                        letterSpacing: '-0.02em'
                    }}>What can I help with?</h1>
                    <p style={{
                        fontSize: '1rem',
                        color: '#666',
                        marginBottom: '40px'
                    }}>Ask anything, or start with a suggestion below</p>

                    {/* Quick Suggestions */}
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        maxWidth: '600px'
                    }}>
                        {settings.quickPrompts.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => setInput(suggestion)}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: '#aaa',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                                    e.currentTarget.style.color = '#fff'
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                    e.currentTarget.style.color = '#aaa'
                                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                                }}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Input Area */}
                <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '0 20px 40px' }}>
                    <InputBar
                        input={input}
                        setInput={setInput}
                        onSend={handleSendMessage}
                        isLoading={isLoading || isStreaming}
                        onKeyDown={handleKeyDown}
                        textareaRef={textareaRef}
                    />
                </div>
            </div>
        )
    }

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: 'linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)',
            position: 'relative'
        }}>
            {/* Header */}
            <div style={{
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(255,255,255,0.06)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Sparkles size={16} color="#fff" />
                    </div>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>
                        {settings.aiModel.split('/').pop()}
                    </span>
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    {messages.map(msg => (
                        <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {isLoading && (
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <Sparkles size={18} color="#fff" className="animate-pulse" />
                            </div>
                            <div style={{
                                padding: '16px 20px',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                borderRadius: '16px',
                                borderTopLeftRadius: '4px'
                            }}>
                                <div className="typing-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Streaming content (typewriter effect) */}
                    {isStreaming && streamingContent && (
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <Sparkles size={18} color="#fff" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    padding: '14px 18px',
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    borderRadius: '16px',
                                    borderTopLeftRadius: '4px',
                                    color: '#e0e0e0',
                                    fontSize: '0.95rem',
                                    lineHeight: '1.7'
                                }}>
                                    <div className="markdown-content">
                                        <ReactMarkdown
                                            children={streamingContent}
                                            remarkPlugins={[remarkGfm]}
                                        />
                                    </div>
                                    <span className="cursor-blink">▌</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', padding: '0 20px 24px' }}>
                <InputBar
                    input={input}
                    setInput={setInput}
                    onSend={handleSendMessage}
                    isLoading={isLoading || isStreaming}
                    onKeyDown={handleKeyDown}
                    textareaRef={textareaRef}
                />
                <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#555', marginTop: '12px' }}>
                    Zura can make mistakes. Consider checking important information.
                </div>
            </div>

            <style>{`
                .typing-indicator {
                    display: flex;
                    gap: 4px;
                }
                .typing-indicator span {
                    width: 8px;
                    height: 8px;
                    background: #555;
                    border-radius: 50%;
                    animation: bounce 1.4s infinite ease-in-out both;
                }
                .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
                @keyframes bounce {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
                    40% { transform: scale(1); opacity: 1; }
                }
                .animate-pulse {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .cursor-blink {
                    color: #667eea;
                    animation: blink 1s infinite;
                    margin-left: 2px;
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    )
}

function MessageBubble({ message }: { message: any }) {
    const [copied, setCopied] = useState(false)
    const isUser = message.role === 'user'

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div style={{
            display: 'flex',
            gap: '16px',
            marginBottom: '24px',
            flexDirection: isUser ? 'row-reverse' : 'row',
            justifyContent: isUser ? 'flex-start' : 'flex-start'
        }}>
            {/* Avatar */}
            <div style={{
                width: '36px',
                height: '36px',
                background: isUser ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {isUser ? <User size={18} color="#fff" /> : <Sparkles size={18} color="#fff" />}
            </div>

            {/* Content */}
            <div style={{
                flex: 1,
                maxWidth: isUser ? '75%' : '100%'
            }}>
                <div style={{
                    padding: '14px 18px',
                    backgroundColor: isUser ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.2) 0%, rgba(124, 58, 237, 0.15) 100%)' : 'rgba(255,255,255,0.03)',
                    background: isUser ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.25) 0%, rgba(124, 58, 237, 0.15) 100%)' : 'rgba(255,255,255,0.03)',
                    borderRadius: '16px',
                    borderTopLeftRadius: isUser ? '16px' : '4px',
                    borderTopRightRadius: isUser ? '4px' : '16px',
                    border: isUser ? '1px solid rgba(124, 58, 237, 0.3)' : 'none',
                    color: '#e0e0e0',
                    fontSize: '0.95rem',
                    lineHeight: '1.7',
                    position: 'relative'
                }}>
                    {isUser ? (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                    ) : (
                        <div className="markdown-content">
                            <ReactMarkdown
                                children={message.content}
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code({ node, inline, className, children, ...props }: any) {
                                        const match = /language-(\w+)/.exec(className || '')
                                        return !inline && match ? (
                                            <div style={{ position: 'relative', margin: '12px 0' }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#1e1e1e',
                                                    borderTopLeftRadius: '8px',
                                                    borderTopRightRadius: '8px',
                                                    fontSize: '0.75rem',
                                                    color: '#888'
                                                }}>
                                                    <span>{match[1]}</span>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(String(children))
                                                        }}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            color: '#888',
                                                            cursor: 'pointer',
                                                            fontSize: '0.75rem'
                                                        }}
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                                <SyntaxHighlighter
                                                    {...props}
                                                    children={String(children).replace(/\n$/, '')}
                                                    style={vscDarkPlus}
                                                    language={match[1]}
                                                    PreTag="div"
                                                    customStyle={{
                                                        margin: 0,
                                                        borderTopLeftRadius: 0,
                                                        borderTopRightRadius: 0,
                                                        borderBottomLeftRadius: '8px',
                                                        borderBottomRightRadius: '8px'
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <code {...props} style={{
                                                background: 'rgba(255,255,255,0.1)',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.9em'
                                            }}>
                                                {children}
                                            </code>
                                        )
                                    }
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Actions (for assistant messages) */}
                {!isUser && (
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '8px',
                        paddingLeft: '4px'
                    }}>
                        <button
                            onClick={handleCopy}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: 'none',
                                background: 'transparent',
                                color: '#666',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                            onMouseLeave={e => e.currentTarget.style.color = '#666'}
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function InputBar({ input, setInput, onSend, isLoading, onKeyDown, textareaRef }: any) {
    return (
        <div style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderRadius: '20px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
            transition: 'all 0.2s ease'
        }}>
            {/* Attachment */}
            <button style={{
                background: 'none',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                color: '#666',
                borderRadius: '8px',
                transition: 'all 0.15s'
            }}>
                <Paperclip size={18} />
            </button>

            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Message Zura..."
                disabled={isLoading}
                rows={1}
                style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#fff',
                    resize: 'none',
                    outline: 'none',
                    fontSize: '0.95rem',
                    lineHeight: '1.5',
                    minHeight: '24px',
                    maxHeight: '200px',
                    padding: '8px 0'
                }}
            />

            {/* Send */}
            <button
                onClick={onSend}
                disabled={isLoading || !input.trim()}
                style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    border: 'none',
                    background: input.trim() ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.05)',
                    color: input.trim() ? '#fff' : '#444',
                    cursor: input.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                }}
            >
                <Send size={18} />
            </button>
        </div>
    )
}
