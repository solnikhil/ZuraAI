import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Sparkles, Copy, Check, ChevronDown, RotateCcw, Download, Share2, Globe, FolderOpen, Mic, Info, Clock, ArrowDown, ArrowUp, Sigma, Cpu, Twitter, MessageCircle, FlaskConical, Video, ShieldCheck } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { generateOllamaCompletion } from '../../services/ollama'
import { generatePerplexityCompletion } from '../../services/perplexity'
import { generateGeminiCompletion } from '../../services/gemini'
import { generateGroqCompletion } from '../../services/groq'
import { generateChatTitle } from '../../services/titleGenerator'
import { buildOptimizedContext } from '../../utils/tokenUtils'
import ModelSelector from './ModelSelector'

import BlurText from '../BlurText'

import GradientText from '../GradientText'

export default function ChatArea() {
    const { sessions, currentSessionId, addMessageToSession, createSession, updateSessionTitle } = useChatHistory()
    const { settings } = useSettings()

    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const [isTitleAnimated, setIsTitleAnimated] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const currentSession = sessions.find(s => s.id === currentSessionId)
    const messages = currentSession?.messages || []

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Auto-scroll to bottom when messages change or loading starts
    useEffect(() => {
        scrollToBottom()
    }, [messages, isLoading])

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
        }
    }, [input])

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading) return
        const userMessageContent = input
        setInput('')
        setIsLoading(true)

        let targetSessionId = currentSessionId
        let isNewSession = false
        if (!targetSessionId) {
            targetSessionId = createSession(userMessageContent)
            isNewSession = true
        } else {
            addMessageToSession(targetSessionId, { role: 'user', content: userMessageContent })
        }

        const startTime = performance.now()
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        let model = settings.aiModel

        try {
            let responseContent = ""
            const conversationHistory = messages.map(m => ({ role: m.role, content: m.content }))
            const optimizedHistory = buildOptimizedContext(conversationHistory, userMessageContent, settings.systemPrompt, settings.aiModel)

            if (settings.modelProvider === 'ollama') {
                const res = await generateOllamaCompletion(settings.ollamaUrl, settings.aiModel, optimizedHistory, { temperature: settings.temperature })
                responseContent = res.message.content
                usage = {
                    inputTokens: res.prompt_eval_count || 0,
                    outputTokens: res.eval_count || 0,
                    totalTokens: (res.prompt_eval_count || 0) + (res.eval_count || 0)
                }
                model = `ollama/${settings.aiModel}`
            } else if (settings.modelProvider === 'perplexity') {
                const res = await generatePerplexityCompletion(settings.perplexityApiKey, settings.aiModel, optimizedHistory)
                responseContent = res.choices[0].message.content
                usage = {
                    inputTokens: res.usage?.prompt_tokens || 0,
                    outputTokens: res.usage?.completion_tokens || 0,
                    totalTokens: res.usage?.total_tokens || 0
                }
                model = `perplexity/${settings.aiModel}`
            } else if (settings.modelProvider === 'gemini') {
                const res = await generateGeminiCompletion(settings.geminiApiKey, settings.aiModel, optimizedHistory, { temperature: settings.temperature })
                responseContent = res.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No response"
                usage = {
                    inputTokens: res.usageMetadata?.promptTokenCount || 0,
                    outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
                    totalTokens: res.usageMetadata?.totalTokenCount || 0
                }
                model = `gemini/${settings.aiModel}`
            } else if (settings.modelProvider === 'groq') {
                const res = await generateGroqCompletion(settings.groqApiKey, settings.aiModel, optimizedHistory, { temperature: settings.temperature })
                responseContent = res.choices?.[0]?.message?.content || "Error: No response"
                usage = {
                    inputTokens: res.usage?.prompt_tokens || 0,
                    outputTokens: res.usage?.completion_tokens || 0,
                    totalTokens: res.usage?.total_tokens || 0
                }
                model = `groq/${settings.aiModel}`
            } else {
                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${settings.openRouterApiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": settings.aiModel, "messages": optimizedHistory })
                })
                const data = await res.json()
                responseContent = data.choices?.[0]?.message?.content || "Error: No response"
                usage = {
                    inputTokens: data.usage?.prompt_tokens || 0,
                    outputTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0
                }
                model = `openrouter/${settings.aiModel}`
            }

            const endTime = performance.now()
            const latency = Math.round(endTime - startTime)

            addMessageToSession(targetSessionId!, {
                role: 'assistant',
                content: responseContent,
                model,
                latency,
                usage
            })
            setIsLoading(false)

            // Generate AI title for new sessions (fire-and-forget)
            if (isNewSession && targetSessionId) {
                generateChatTitle(userMessageContent, settings).then(title => {
                    if (title) {
                        updateSessionTitle(targetSessionId!, title)
                    }
                }).catch(console.error)
            }
        } catch (error: any) {
            const errorMsg = `Error: ${error.message}`
            addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
            setIsLoading(false)
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
                background: '#121212',
                position: 'relative'
            }}>
                {/* Header - Empty for spacing */}
                <div style={{ padding: '20px' }}></div>

                {/* Centered Welcome */}
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px',
                    gap: '16px' // Reduced gap to place just above
                }}>
                    {/* Title */}
                    {/* Title - Gradient Zura */}
                    <GradientText
                        colors={['#ffffff', '#888888', '#ffffff', '#888888', '#ffffff']}
                        animationSpeed={12}
                        showBorder={false}
                        className="blur-text-title"
                    >
                        zura
                    </GradientText>



                    <style>{`
                        .blur-text-title {
                            font-size: 3rem;
                            font-weight: 700;
                            color: #fff;
                            letter-spacing: -0.05em;
                            margin: 0;
                            font-family: inherit;
                        }
                        .blur-text-placeholder {
                            font-size: 1.2rem;
                            color: #666;
                            font-weight: 400;
                            letter-spacing: -0.01em;
                            pointer-events: none;
                        }
                        @keyframes blur-in-up {
                            0% { opacity: 0; transform: translateY(10px); filter: blur(5px); }
                            100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                        }
                        .animate-in-control {
                            animation: blur-in-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
                        }
                    `}</style>

                    {/* Input Area Group */}
                    <div style={{ width: '100%', maxWidth: '600px' }}>
                        <div style={{
                            position: 'relative',
                            background: 'linear-gradient(145deg, #161412, #101010)',
                            borderRadius: '24px',
                            padding: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            border: isInputFocused
                                ? '1px solid rgba(255, 202, 40, 0.4)'
                                : '1px solid rgba(255,255,255,0.08)',
                            boxShadow: isInputFocused
                                ? '0 12px 40px rgba(0,0,0,0.4), 0 0 25px rgba(255, 202, 40, 0.15)'
                                : '0 4px 20px rgba(0,0,0,0.2)',
                            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                            minHeight: '140px'
                        }}>
                            {/* Animated Placeholder */}
                            {!input && (
                                <div style={{ position: 'absolute', top: '24px', left: '24px', pointerEvents: 'none', zIndex: 10 }}>
                                    <BlurText
                                        text="Ask a question..."
                                        delay={200}
                                        animateBy="words"
                                        direction="top"
                                        stepDuration={1}
                                        className="blur-text-placeholder"
                                    />
                                </div>
                            )}
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                placeholder=""
                                rows={1}
                                style={{
                                    width: '100%',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#fff',
                                    resize: 'none',
                                    outline: 'none',
                                    fontSize: '1.2rem',
                                    fontWeight: 400,
                                    fontFamily: 'inherit',
                                    lineHeight: '1.6',
                                    minHeight: '48px',
                                    maxHeight: '200px',
                                    padding: 0,
                                    margin: 0
                                }}
                            />

                            {/* Bottom Controls inside input */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div className="animate-in-control" style={{ display: 'flex', gap: '8px', animationDelay: '0.3s' }}>
                                    <ModelSelector />
                                </div>
                                <div className="animate-in-control" style={{ display: 'flex', gap: '8px', animationDelay: '0.4s' }}>
                                    <button style={{
                                        background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '8px', padding: '10px', color: '#aaa', cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                                            e.currentTarget.style.color = '#fff'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                            e.currentTarget.style.color = '#aaa'
                                        }}
                                    >
                                        <Paperclip size={18} />
                                    </button>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={isLoading || !input.trim()}
                                        style={{
                                            background: input.trim() ? '#FFCA28' : 'rgba(255,255,255,0.05)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '10px',
                                            color: input.trim() ? '#000' : '#444',
                                            cursor: input.trim() ? 'pointer' : 'default',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            transform: input.trim() ? 'scale(1)' : 'scale(0.95)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <Send size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
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
            background: '#121212',
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
                    {messages.map((msg, idx) => (
                        <MessageBubble
                            key={msg.id}
                            message={msg}
                            animate={idx === messages.length - 1 && msg.role === 'assistant' && Date.now() - msg.timestamp < 60000} // Only animate recent messages (< 1 min old)
                        />
                    ))}
                    {isLoading && (
                        <div style={{ marginBottom: '24px' }}>
                            <div className="typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    {/* Spacer to push content up when waiting for AI response */}
                    {isLoading && (
                        <div style={{ minHeight: 'calc(100vh - 350px)' }} />
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
                    isLoading={isLoading}
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


// Component to highlight first word in gold
function MessageBubble({ message, animate = false }: { message: any, animate?: boolean }) {
    const [copied, setCopied] = useState(false)
    const [displayedContent, setDisplayedContent] = useState(animate ? '' : message.content)
    const isUser = message.role === 'user'

    useEffect(() => {
        if (!animate) {
            setDisplayedContent(message.content)
            return
        }

        // If content is already fully displayed (e.g. from props update), don't restart
        if (displayedContent === message.content) return

        let currentIndex = 0
        // Speed up animation: 2 chars every 10ms
        const interval = setInterval(() => {
            if (currentIndex >= message.content.length) {
                setDisplayedContent(message.content)
                clearInterval(interval)
                return
            }
            setDisplayedContent(prev => message.content.slice(0, prev.length + 3))
            currentIndex += 3
        }, 10)

        return () => clearInterval(interval)
    }, [message.content, animate])

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


    // AI message - left aligned, no bubble
    const messageRef = React.useRef<HTMLDivElement>(null)

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Ctrl+A or Cmd+A to select only this message
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            e.preventDefault()
            if (messageRef.current) {
                const selection = window.getSelection()
                const range = document.createRange()
                range.selectNodeContents(messageRef.current)
                selection?.removeAllRanges()
                selection?.addRange(range)
            }
        }
    }

    return (
        <div
            style={{ marginBottom: '24px' }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            ref={messageRef}
        >
            {/* Message content */}
            <div className="markdown-content" style={{ color: '#e0e0e0', lineHeight: '1.7', fontSize: '0.95rem' }}>
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
                                <code {...props} style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em', fontFamily: 'menubar' }}>
                                    {children}
                                </code>
                            )
                        },
                        blockquote: ({ node, ...props }) => (
                            <blockquote style={{
                                borderLeft: '4px solid #f59e0b',
                                background: 'rgba(255,255,255,0.05)',
                                padding: '12px 16px',
                                margin: '16px 0',
                                borderRadius: '0 8px 8px 0',
                                color: '#d0d0d0'
                            }} {...props} />
                        ),
                        table: ({ node, ...props }) => (
                            <div style={{ overflowX: 'auto', margin: '16px 0', borderRadius: '8px', border: '1px solid #333' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em', background: '#1e1e1e' }} {...props} />
                            </div>
                        ),
                        th: ({ node, ...props }) => (
                            <th style={{
                                borderBottom: '1px solid #444',
                                padding: '12px',
                                textAlign: 'left',
                                fontWeight: 600,
                                color: '#fff',
                                background: '#252525'
                            }} {...props} />
                        ),
                        td: ({ node, ...props }) => (
                            <td style={{
                                borderBottom: '1px solid #333',
                                padding: '12px',
                                color: '#ccc'
                            }} {...props} />
                        ),
                        a: ({ node, ...props }) => (
                            <a style={{ color: '#f59e0b', textDecoration: 'none', borderBottom: '1px dotted #f59e0b', transition: 'all 0.2s' }} target="_blank" rel="noopener noreferrer" {...props} />
                        ),
                        ul: ({ node, ...props }) => <ul style={{ paddingLeft: '24px', margin: '12px 0' }} {...props} />,
                        ol: ({ node, ...props }) => <ol style={{ paddingLeft: '24px', margin: '12px 0' }} {...props} />,
                        h1: ({ node, ...props }) => <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: '24px 0 16px', color: '#fff' }} {...props} />,
                        h2: ({ node, ...props }) => <h2 style={{ fontSize: '1.3em', fontWeight: 600, margin: '20px 0 12px', color: '#f0f0f0' }} {...props} />,
                        h3: ({ node, ...props }) => <h3 style={{ fontSize: '1.1em', fontWeight: 600, margin: '16px 0 8px', color: '#e0e0e0' }} {...props} />
                    }}
                >

                    {displayedContent + (animate && displayedContent !== message.content ? ' ▍' : '')}
                </ReactMarkdown>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                {/* Copy Button */}
                <button
                    onClick={handleCopy}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: copied ? '#4ade80' : '#666',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px',
                        borderRadius: '4px',
                        transition: 'all 0.2s',
                        fontSize: '0.8rem',
                        fontFamily: 'inherit'
                    }}
                    onMouseEnter={e => !copied && (e.currentTarget.style.color = '#e0e0e0')}
                    onMouseLeave={e => !copied && (e.currentTarget.style.color = '#666')}
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>

                {/* Info Tooltip */}
                {message.usage && (
                    <div style={{ position: 'relative' }} className="info-trigger">
                        <Info
                            size={14}
                            style={{ cursor: 'pointer', color: '#666' }}
                            className="info-icon"
                        />

                        <div className="info-popover" style={{
                            position: 'absolute',
                            bottom: '100%', // Changed from top: 24px to bottom: 100%
                            left: '0',
                            marginBottom: '10px', // Add spacing
                            backgroundColor: '#1a1a1a',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            padding: '16px',
                            width: '280px',
                            zIndex: 100,
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            display: 'none', // Controlled by CSS hover
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <Info size={16} color="#e0e0e0" />
                                <span style={{ fontWeight: 600, color: '#e0e0e0', fontSize: '0.9rem' }}>Response Info</span>
                            </div>

                            {/* Model */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ color: '#888', fontSize: '0.85rem' }}>Model</span>
                                <div style={{
                                    background: '#ffe4c4', // Peach/Beige color like screenshot
                                    color: '#5c4033',
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    <Cpu size={12} />
                                    <span>{message.model?.split('/').pop() || 'Unknown Model'}</span>
                                </div>
                            </div>

                            {/* Generation Time */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ color: '#888', fontSize: '0.85rem' }}>Generation Time</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e0e0e0', fontSize: '0.85rem' }}>
                                    <Clock size={14} />
                                    <span>{(message.latency ? message.latency / 1000 : 0).toFixed(2)}s</span>
                                </div>
                            </div>

                            {/* Token Usage */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ color: '#888', fontSize: '0.85rem' }}>Token Usage</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{
                                        background: '#252525',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ArrowDown size={12} color="#888" />
                                            <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Input</span>
                                        </div>
                                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {message.usage?.inputTokens.toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{
                                        background: '#252525',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ArrowUp size={12} color="#888" />
                                            <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Output</span>
                                        </div>
                                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {message.usage?.outputTokens.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div style={{
                                    background: '#252525',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Sigma size={14} color="#888" />
                                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.85rem' }}>Total</span>
                                    </div>
                                    <span style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '0.9rem' }}>
                                        {message.usage?.totalTokens.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .info-trigger:hover .info-popover {
                    display: flex !important;
                }
                .info-trigger:hover .info-icon {
                    color: #fff !important;
                }
            `}</style>
        </div>
    )
}

function InputBar({ input, setInput, onSend, isLoading, onKeyDown, textareaRef }: any) {
    const [isFocused, setIsFocused] = React.useState(false)

    return (
        <div style={{
            background: 'linear-gradient(145deg, #161412, #101010)',
            borderRadius: '24px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            border: isFocused
                ? '1px solid rgba(255, 202, 40, 0.3)'
                : '1px solid rgba(255, 202, 40, 0.05)',
            boxShadow: isFocused
                ? '0 12px 40px rgba(0,0,0,0.4), 0 0 20px rgba(255, 202, 40, 0.1)'
                : '0 4px 20px rgba(0,0,0,0.2)',
            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'
        }}>
            <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask a question..."
                disabled={isLoading}
                rows={1}
                style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#fff',
                    resize: 'none',
                    outline: 'none',
                    fontSize: '1.1rem',
                    fontWeight: 400,
                    fontFamily: 'inherit',
                    lineHeight: '1.6',
                    minHeight: '32px',
                    maxHeight: '200px'
                }}
            />

            {/* Bottom row - model selector and send */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ModelSelector />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px',
                            color: '#aaa',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                            e.currentTarget.style.color = '#fff'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                            e.currentTarget.style.color = '#aaa'
                        }}
                    >
                        <Paperclip size={18} />
                    </button>
                    <button
                        onClick={onSend}
                        disabled={isLoading || !input.trim()}
                        style={{
                            background: input.trim() && !isLoading ? '#FFCA28' : 'rgba(255,255,255,0.05)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 14px',
                            color: input.trim() && !isLoading ? '#000' : '#444',
                            cursor: input.trim() && !isLoading ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                            transform: input.trim() && !isLoading ? 'scale(1)' : 'scale(0.95)'
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>
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
