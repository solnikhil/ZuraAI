import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Sparkles, Copy, Check, ChevronDown, RotateCcw, Download, Share2, Globe, FolderOpen, Mic } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { generateOllamaCompletion } from '../../services/ollama'
import { generatePerplexityCompletion } from '../../services/perplexity'
import { buildOptimizedContext } from '../../utils/tokenUtils'
import ModelSelector from './ModelSelector'

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

    // Typewriter effect function
    const typewriterEffect = async (text: string): Promise<void> => {
        setIsStreaming(true)
        setStreamingContent('')
        const baseSpeed = 15
        const fastSpeed = 5
        let i = 0
        const length = text.length
        while (i < length) {
            const inCodeBlock = text.substring(0, i).split('```').length % 2 === 0
            const speed = inCodeBlock ? fastSpeed : baseSpeed
            const chunkSize = inCodeBlock ? 5 : 2
            const chunk = text.substring(i, Math.min(i + chunkSize, length))
            setStreamingContent(prev => prev + chunk)
            i += chunkSize
            await new Promise(resolve => setTimeout(resolve, speed))
        }
    }

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
        if (!targetSessionId) {
            targetSessionId = createSession(userMessageContent)
        } else {
            addMessageToSession(targetSessionId, { role: 'user', content: userMessageContent })
        }

        try {
            let responseContent = ""
            const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }))
            const optimizedHistory = buildOptimizedContext(conversationHistory, userMessageContent, settings.systemPrompt, settings.aiModel)

            if (settings.modelProvider === 'ollama') {
                const res = await generateOllamaCompletion(settings.ollamaUrl, settings.aiModel, optimizedHistory, { temperature: settings.temperature })
                responseContent = res.message.content
            } else if (settings.modelProvider === 'perplexity') {
                const res = await generatePerplexityCompletion(settings.perplexityApiKey, settings.aiModel, optimizedHistory)
                responseContent = res.choices[0].message.content
            } else {
                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${settings.openRouterApiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": settings.aiModel, "messages": optimizedHistory })
                })
                const data = await res.json()
                responseContent = data.choices?.[0]?.message?.content || "Error: No response"
            }

            setIsLoading(false)
            await typewriterEffect(responseContent)
            addMessageToSession(targetSessionId!, { role: 'assistant', content: responseContent })
            finishStreaming()
        } catch (error: any) {
            setIsLoading(false)
            const errorMsg = `Error: ${error.message}`
            await typewriterEffect(errorMsg)
            addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
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
                background: '#0a0a0a',
                position: 'relative'
            }}>
                {/* Header */}
                <div style={{
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Sparkles size={20} color="#888" />
                    <span style={{ color: '#ccc', fontSize: '0.95rem', fontWeight: 500 }}>New Conversation</span>
                    <ChevronDown size={14} color="#666" />
                </div>

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
                    <h1 style={{ fontSize: '2rem', fontWeight: 600, color: '#fff', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                        What can I help with?
                    </h1>
                    <p style={{ fontSize: '1rem', color: '#666', marginBottom: '40px' }}>
                        Ask anything, or start with a suggestion below
                    </p>

                    {/* Quick Suggestions */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '600px' }}>
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
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                    e.currentTarget.style.color = '#aaa'
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
            background: '#0a0a0a',
            position: 'relative'
        }}>
            {/* Header - Session Title */}
            <div style={{
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <Sparkles size={20} color="#888" />
                <span style={{ color: '#ccc', fontSize: '0.95rem', fontWeight: 500 }}>
                    {currentSession?.title || 'New Conversation'}
                </span>
                <ChevronDown size={14} color="#666" />
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    {messages.map(msg => (
                        <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {isLoading && (
                        <div style={{ marginBottom: '24px' }}>
                            <div className="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    {isStreaming && streamingContent && (
                        <div style={{ marginBottom: '24px' }}>
                            <div className="markdown-content" style={{ color: '#e0e0e0', lineHeight: '1.7' }}>
                                <HighlightFirstWord content={streamingContent} />
                            </div>
                            <span className="cursor-blink">▌</span>
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
                .cursor-blink {
                    color: #f59e0b;
                    animation: blink 1s infinite;
                }
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    )
}

// Component to highlight first word in gold
function HighlightFirstWord({ content }: { content: string }) {
    const firstSpaceIndex = content.indexOf(' ')
    if (firstSpaceIndex === -1) {
        return <span style={{ color: '#f59e0b' }}>{content}</span>
    }
    const firstWord = content.substring(0, firstSpaceIndex)
    const rest = content.substring(firstSpaceIndex)
    return (
        <>
            <span style={{ color: '#f59e0b' }}>{firstWord}</span>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>
        </>
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

    if (isUser) {
        // User message - right aligned dark pill
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '24px'
            }}>
                <div style={{
                    padding: '12px 18px',
                    backgroundColor: '#2a2a2a',
                    borderRadius: '20px',
                    color: '#e0e0e0',
                    fontSize: '0.95rem',
                    maxWidth: '70%',
                    whiteSpace: 'pre-wrap'
                }}>
                    {message.content}
                </div>
            </div>
        )
    }

    // AI message - left aligned, no bubble, colored first word
    const firstSpaceIndex = message.content.indexOf(' ')
    const firstWord = firstSpaceIndex > -1 ? message.content.substring(0, firstSpaceIndex) : message.content
    const restContent = firstSpaceIndex > -1 ? message.content.substring(firstSpaceIndex) : ''

    return (
        <div style={{ marginBottom: '24px' }}>
            {/* Message content */}
            <div className="markdown-content" style={{ color: '#e0e0e0', lineHeight: '1.7', fontSize: '0.95rem' }}>
                <span style={{ color: '#f59e0b' }}>{firstWord}</span>
                <ReactMarkdown
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
                                            onClick={() => navigator.clipboard.writeText(String(children))}
                                            style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.75rem' }}
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
                                        customStyle={{ margin: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}
                                    />
                                </div>
                            ) : (
                                <code {...props} style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em' }}>
                                    {children}
                                </code>
                            )
                        }
                    }}
                >
                    {restContent}
                </ReactMarkdown>
            </div>

            {/* Action buttons - only Copy works */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <ActionButton icon={<Copy size={14} />} onClick={handleCopy} />
            </div>
        </div>
    )
}

function ActionButton({ icon, onClick }: { icon: React.ReactNode, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'transparent',
                border: 'none',
                color: '#555',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#aaa'}
            onMouseLeave={e => e.currentTarget.style.color = '#555'}
        >
            {icon}
        </button>
    )
}

function InputBar({ input, setInput, onSend, isLoading, onKeyDown, textareaRef }: any) {
    return (
        <div style={{
            backgroundColor: '#1a1a1a',
            borderRadius: '16px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            border: '1px solid rgba(255,255,255,0.08)'
        }}>
            {/* Textarea */}
            <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask a new question..."
                disabled={isLoading}
                rows={1}
                style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#fff',
                    resize: 'none',
                    outline: 'none',
                    fontSize: '0.95rem',
                    lineHeight: '1.5',
                    minHeight: '24px',
                    maxHeight: '200px'
                }}
            />

            {/* Bottom row - model selector and send */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ModelSelector />
                </div>
                <button
                    onClick={onSend}
                    disabled={isLoading || !input.trim()}
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        border: 'none',
                        background: input.trim() ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                        color: input.trim() ? '#000' : '#444',
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
        </div>
    )
}

function IconButton({ icon }: { icon: React.ReactNode }) {
    return (
        <button style={{
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s'
        }}
            onMouseEnter={e => e.currentTarget.style.color = '#aaa'}
            onMouseLeave={e => e.currentTarget.style.color = '#666'}
        >
            {icon}
        </button>
    )
}
