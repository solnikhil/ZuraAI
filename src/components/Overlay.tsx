import React, { useState, useEffect, useRef } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import './Overlay.css'
import ShinyText from './ShinyText'
import AgentBar from './AgentBar'
import ThinkingBlock from './ThinkingBlock'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { generateOllamaCompletion } from '../services/ollama'
import { generatePerplexityCompletion } from '../services/perplexity'
import { generateGeminiCompletion } from '../services/gemini'
import { useToolCalling } from '../hooks/useToolCalling'
import { ToolCallIndicator, ToolResultDisplay } from '../tools/ui'
import { hasGeminiFunctionCalls } from '../tools/adapters/gemini'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    image?: string
    thinking?: string
    model?: string
    latency?: number
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

export default function Overlay() {
    const { settings } = useSettings()
    const { canUseTools, getToolsForRequest, handleToolCalls, toolState, clearToolState } = useToolCalling()
    const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [screenshot, setScreenshot] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [streamingContent, setStreamingContent] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)

    const [isChatActive, setIsChatActive] = useState(false)
    const [viewingImage, setViewingImage] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isSelectionMode) {
                    setIsSelectionMode(false)
                    setSelection(null)
                } else if (isChatActive) {
                    // Optional: Close chat on escape? Or just minimize?
                    // For now, let's close overlay if chat is active
                    window.ipcRenderer.send('close-overlay')
                } else {
                    window.ipcRenderer.send('close-overlay')
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isSelectionMode, isChatActive])

    // Handle reset-overlay event from main process (triggered on shortcut)
    useEffect(() => {
        const handleResetOverlay = () => {
            // Reset state when overlay is shown via shortcut
            setIsSelectionMode(false)
            setSelection(null)
            setIsDragging(false)
            setStartPos(null)
            setViewingImage(null)
            // If there are messages, ensure the chat is active/visible
            // Otherwise, collapse it (false)
            setIsChatActive(messages.length > 0)
        }

        if (window.ipcRenderer) {
            window.ipcRenderer.on('reset-overlay', handleResetOverlay)
            return () => {
                window.ipcRenderer.off('reset-overlay', handleResetOverlay)
            }
        }
    }, [messages.length])

    // Handle direct screenshot selection mode (Ctrl+Shift+X shortcut)
    useEffect(() => {
        const handleStartScreenshotSelection = () => {
            // Reset any existing state and enter selection mode
            setSelection(null)
            setIsDragging(false)
            setStartPos(null)
            setViewingImage(null)
            setIsSelectionMode(true)
        }

        if (window.ipcRenderer) {
            window.ipcRenderer.on('start-screenshot-selection', handleStartScreenshotSelection)
            return () => {
                window.ipcRenderer.off('start-screenshot-selection', handleStartScreenshotSelection)
            }
        }
    }, [])

    // Scroll to bottom of chat
    useEffect(() => {
        if (isChatActive && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, isChatActive, streamingContent])

    // Enable click-through when not in selection mode
    useEffect(() => {
        if (!isSelectionMode) {
            // Enable click-through with forward option so we can detect hover on interactive elements
            window.ipcRenderer.send('set-ignore-mouse-events', true, { forward: true })
        } else {
            // Disable click-through during selection mode
            window.ipcRenderer.send('set-ignore-mouse-events', false)
        }
    }, [isSelectionMode])

    // Typewriter effect function - returns when complete, caller handles cleanup
    const typewriterEffect = async (text: string): Promise<void> => {
        setIsStreaming(true)
        setStreamingContent('')

        const baseSpeed = 12
        const fastSpeed = 4

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

        // Don't clear here - let the caller add message first, then clear
    }

    // Helper to finish streaming and add message
    const finishStreaming = () => {
        setIsStreaming(false)
        setStreamingContent('')
    }



    const callAI = async (userPrompt: string, image?: string) => {
        setIsLoading(true)
        
        // Clear tool state at start of new message
        clearToolState()

        // Add user message immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userPrompt,
            image: image
        }
        setMessages(prev => [...prev, userMessage])
        setIsChatActive(true)

        try {
            if (settings.modelProvider === 'ollama') {
                await callOllama(userPrompt, image)
            } else if (settings.modelProvider === 'perplexity') {
                await callPerplexity(userPrompt, image)
            } else if (settings.modelProvider === 'gemini') {
                await callGemini(userPrompt, image)
            } else if (settings.modelProvider === 'codex') {
                await callCodex(userPrompt, image)
            } else {
                await callOpenRouter(userPrompt, image)
            }
        } catch (error: any) {
            console.error("AI Error:", error)
            window.ipcRenderer.send('log-to-terminal', `[API ERROR] ${error.message || error}`)

            const errorMsg = error.message || "An unexpected error occurred."
            setIsLoading(false)
            await typewriterEffect(errorMsg)

            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorMsg
            }
            setMessages(prev => [...prev, errorMessage])
            finishStreaming()
            // Clear tool state on error
            clearToolState()
        }
    }

    const callOllama = async (userPrompt: string, image?: string) => {
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

        const startTime = performance.now()
        const response = await generateOllamaCompletion(
            settings.ollamaUrl || 'http://localhost:11434',
            settings.aiModel,
            messagesPayload,
            { temperature: settings.temperature }
        )
        const endTime = performance.now()

        const rawContent = response.message.content

        // Parse thinking content if thinking mode is enabled
        const thinking = undefined
        const answer = rawContent

        // Show typewriter effect
        setIsLoading(false)
        await typewriterEffect(answer)

        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: answer,
            thinking: thinking,
            model: `ollama/${settings.aiModel}`,
            latency: Math.round(endTime - startTime),
            usage: {
                inputTokens: response.prompt_eval_count || 0,
                outputTokens: response.eval_count || 0,
                totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
            }
        }
        setMessages(prev => [...prev, aiMessage])
        finishStreaming()
    }

    const callGemini = async (userPrompt: string, image?: string) => {
        const apiKey = settings.geminiApiKey

        if (!apiKey) {
            throw new Error("Please configure your Gemini API Key in Settings.")
        }

        // Build messages payload
        const messagesPayload: { role: string; content: string }[] = []
        
        // Use thinking system prompt when enabled, otherwise use regular system prompt
        const systemPromptToUse = settings.systemPrompt

        if (systemPromptToUse) {
            messagesPayload.push({ role: 'system', content: systemPromptToUse })
        }

        // Add user message
        if (image) {
            // For Gemini with images, we'd need to use a different format
            // For now, just send text prompt
            messagesPayload.push({ role: 'user', content: userPrompt })
        } else {
            messagesPayload.push({ role: 'user', content: userPrompt })
        }

        // Get tools if enabled
        const tools = canUseTools ? getToolsForRequest() : null
        const geminiTools = tools && typeof tools === 'object' && 'function_declarations' in tools ? tools : undefined

        const startTime = performance.now()
        const res = await generateGeminiCompletion(
            apiKey,
            settings.aiModel,
            messagesPayload,
            {
                temperature: settings.temperature,
                maxOutputTokens: settings.maxTokens,
                tools: geminiTools
            }
        )
        const endTime = performance.now()

        let rawContent = res.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a response."

        // Check for function calls
        if (canUseTools && hasGeminiFunctionCalls(res)) {
            const toolResult = await handleToolCalls(res)
            
            if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                // Build follow-up messages with tool results
                const followUpMessages: any[] = [
                    ...messagesPayload,
                    {
                        role: 'assistant',
                        content: res.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ') || ''
                    },
                    {
                        role: 'function',
                        parts: toolResult.formattedResults
                    }
                ]
                
                const followUpRes = await generateGeminiCompletion(
                    apiKey,
                    settings.aiModel,
                    followUpMessages,
                    {
                        temperature: settings.temperature,
                        maxOutputTokens: settings.maxTokens,
                        tools: geminiTools
                    }
                )
                
                rawContent = followUpRes.candidates?.[0]?.content?.parts?.[0]?.text || rawContent
            }
        }

        // Parse thinking content if thinking mode is enabled
        const thinking = undefined
        const answer = rawContent

        // Show typewriter effect for the answer only
        setIsLoading(false)
        await typewriterEffect(answer)

        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: answer,
            thinking: thinking,
            model: `gemini/${settings.aiModel}`,
            latency: Math.round(endTime - startTime),
            usage: {
                inputTokens: res.usageMetadata?.promptTokenCount || 0,
                outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: res.usageMetadata?.totalTokenCount || 0
            }
        }
        setMessages(prev => [...prev, aiMessage])
        finishStreaming()
    }

    const callPerplexity = async (userPrompt: string, image?: string) => {
        if (!settings.perplexityApiKey) {
            throw new Error("Please configure your Perplexity API Key in Settings.")
        }

        const messagesPayload = []

        // Use thinking system prompt when enabled
        const systemPromptToUse = settings.systemPrompt

        if (systemPromptToUse) {
            messagesPayload.push({ role: 'system', content: systemPromptToUse })
        }

        // Perplexity doesn't support images, so just include the text
        messagesPayload.push({ role: 'user', content: userPrompt })

        const startTime = performance.now()
        const response = await generatePerplexityCompletion(
            settings.perplexityApiKey,
            settings.aiModel,
            messagesPayload,
            { temperature: settings.temperature, max_tokens: settings.maxTokens }
        )
        const endTime = performance.now()

        const rawContent = response.choices[0].message.content

        // Parse thinking content if thinking mode is enabled
        const thinking = undefined
        const answer = rawContent

        // Show typewriter effect
        setIsLoading(false)
        await typewriterEffect(answer)

        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: answer,
            thinking: thinking,
            model: `perplexity/${settings.aiModel}`,
            latency: Math.round(endTime - startTime),
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0
            }
        }
        setMessages(prev => [...prev, aiMessage])
        finishStreaming()
    }

    const callOpenRouter = async (userPrompt: string, image?: string) => {
        const apiKey = settings.openRouterApiKey || (import.meta as any).env?.VITE_OPENROUTER_API_KEY

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

        // Use thinking system prompt when enabled, otherwise use regular system prompt
        const systemPromptToUse = settings.systemPrompt

        if (systemPromptToUse) {
            messagesPayload.unshift({ "role": "system", "content": systemPromptToUse })
        }

        // Get tools if enabled
        const tools = canUseTools ? getToolsForRequest() : null

        const requestBody: any = {
            model: settings.aiModel,
            messages: messagesPayload,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens
        }

        // Add tools if enabled
        if (tools && Array.isArray(tools) && tools.length > 0) {
            requestBody.tools = tools
            requestBody.tool_choice = 'auto'
        }

        const startTime = performance.now()
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`)
        }

        const data = await response.json()
        const endTime = performance.now()
        
        let rawContent = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."
        
        // Check for tool calls
        if (canUseTools && data.choices?.[0]?.message?.tool_calls) {
            const toolResult = await handleToolCalls(data)
            
            if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                // Send tool results back to AI
                const followUpMessages = [
                    ...messagesPayload,
                    data.choices[0].message,
                    ...toolResult.formattedResults
                ]
                
                const followUpBody: any = {
                    model: settings.aiModel,
                    messages: followUpMessages,
                    temperature: settings.temperature,
                    max_tokens: settings.maxTokens
                }
                
                if (tools && Array.isArray(tools) && tools.length > 0) {
                    followUpBody.tools = tools
                }
                
                const followUpRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(followUpBody)
                })
                
                if (followUpRes.ok) {
                    const followUpData = await followUpRes.json()
                    rawContent = followUpData.choices?.[0]?.message?.content || rawContent
                }
            }
        }

        // Parse thinking content if thinking mode is enabled
        const thinking = undefined
        const answer = rawContent

        // Show typewriter effect for the answer only
        setIsLoading(false)
        await typewriterEffect(answer)

        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: answer,
            thinking: thinking,
            model: `openrouter/${settings.aiModel}`,
            latency: Math.round(endTime - startTime),
            usage: {
                inputTokens: data.usage?.prompt_tokens || 0,
                outputTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0
            }
        }
        setMessages(prev => [...prev, aiMessage])
        finishStreaming()
    }

    const callCodex = async (userPrompt: string, image?: string) => {
        // Import Codex service dynamically
        const { generateCodexCompletion, getCodexAuthState } = await import('../services/codex')
        
        // Check authentication
        const authState = await getCodexAuthState()
        if (!authState.isAuthenticated) {
            throw new Error("Please sign in with ChatGPT in Settings to use Codex.")
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

        // Use system prompt
        const systemPromptToUse = settings.systemPrompt
        if (systemPromptToUse) {
            messagesPayload.unshift({ "role": "system", "content": systemPromptToUse })
        }

        const codexModel = settings.codexSelectedModel || 'gpt-4o'
        const startTime = performance.now()
        
        const response = await generateCodexCompletion(
            codexModel,
            messagesPayload,
            {
                temperature: settings.temperature,
                maxTokens: settings.maxTokens
            }
        )
        const endTime = performance.now()

        const rawContent = response.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."

        // Show typewriter effect
        setIsLoading(false)
        await typewriterEffect(rawContent)

        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: rawContent,
            model: `codex/${codexModel}`,
            latency: Math.round(endTime - startTime),
            usage: {
                inputTokens: response.usage?.prompt_tokens || 0,
                outputTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0
            }
        }
        setMessages(prev => [...prev, aiMessage])
        finishStreaming()
    }

    const handlePromptSubmit = (prompt: string) => {
        if (screenshot) {
            callAI(prompt, screenshot)
            setScreenshot(null)
        } else {
            callAI(prompt)
        }
    }

    const handleScreenshotClick = async () => {
        // Capture screen before showing dimmer
        await window.ipcRenderer.invoke('capture-screen')
        setIsSelectionMode(true)
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isSelectionMode) return
        if (e.button === 2) {
            setIsSelectionMode(false)
            setSelection(null)
            return
        }

        setIsDragging(true)
        setStartPos({ x: e.clientX, y: e.clientY })
        setSelection({ x: e.clientX, y: e.clientY, width: 0, height: 0 })
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !startPos) return

        const currentX = e.clientX
        const currentY = e.clientY
        const x = Math.min(startPos.x, currentX)
        const y = Math.min(startPos.y, currentY)
        const width = Math.abs(currentX - startPos.x)
        const height = Math.abs(currentY - startPos.y)

        setSelection({ x, y, width, height })
    }

    const handleMouseUp = async () => {
        if (isDragging && selection && (selection.width > 10 || selection.height > 10)) {
            setIsDragging(false)
            setIsSelectionMode(false)

            // Capture the cropped screenshot
            try {
                const base64Image = await window.ipcRenderer.invoke('crop-screenshot', selection)
                if (base64Image) {
                    setScreenshot(base64Image)
                }
            } catch (error) {
                console.error('Failed to crop screenshot:', error)
            }
        } else {
            setIsDragging(false)
        }
    }

    const [copiedId, setCopiedId] = useState<string | null>(null)

    const handleCopy = (id: string, content: string) => {
        navigator.clipboard.writeText(content)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div
            className={`overlay-container ${isSelectionMode ? 'selection-mode' : ''} ${isChatActive ? 'chat-active' : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Dimmer is only visible in selection mode */}
            <div className={`dimmer ${isSelectionMode ? 'active' : ''}`} />

            {/* Instruction Text */}
            {isSelectionMode && !selection && (
                <div className="instruction-text">
                    <ShinyText text="Click and drag to capture an area" speed={3} />
                </div>
            )}

            {/* Selection Box */}
            {selection && isSelectionMode && (
                <div
                    className="selection-box"
                    style={{
                        left: selection.x,
                        top: selection.y,
                        width: selection.width,
                        height: selection.height
                    }}
                >
                    <div className="selection-grid" />
                    <div className="corner-handle tl" />
                    <div className="corner-handle tr" />
                    <div className="corner-handle bl" />
                    <div className="corner-handle br" />

                    <div className="selection-dimensions">
                        <ShinyText
                            text={`${Math.round(selection.width)} x ${Math.round(selection.height)}`}
                            speed={3}
                        />
                    </div>
                </div>
            )}

            {/* Chat History Panel */}
            {isChatActive && (
                <div
                    className="chat-history-container"
                    onMouseEnter={() => window.ipcRenderer.send('set-ignore-mouse-events', false)}
                    onMouseLeave={() => window.ipcRenderer.send('set-ignore-mouse-events', true, { forward: true })}
                >
                    <div className="chat-messages-list">
                        {messages.map(msg => (
                            <div key={msg.id} className={`chat-message-item ${msg.role}`}>
                                <div className="message-content">
                                    {msg.image && (
                                        <div
                                            className="message-attachment-compact"
                                            onClick={() => setViewingImage(msg.image || null)}
                                            style={{ cursor: 'pointer' }}
                                            data-tooltip="Click to view full size"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"></path>
                                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                <polyline points="21 15 16 10 5 21"></polyline>
                                            </svg>
                                            <span>Image Attached</span>
                                        </div>
                                    )}
                                    {msg.role === 'assistant' && msg.thinking && (
                                        <ThinkingBlock thinking={msg.thinking} />
                                    )}
                                    <div className="text markdown-body">
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
                                    {msg.role === 'assistant' && (
                                        <div className="message-footer">
                                            {msg.model && (
                                                <>
                                                    <div className="footer-item" data-tooltip="AI Model">
                                                        <span>{msg.model}</span>
                                                    </div>
                                                    <div className="footer-separator">•</div>
                                                </>
                                            )}
                                            <div
                                                className="footer-item copy-btn"
                                                onClick={() => handleCopy(msg.id, msg.content)}
                                                data-tooltip={copiedId === msg.id ? "Copied!" : "Copy to clipboard"}
                                            >
                                                {copiedId === msg.id ? (
                                                    <>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                        <span>Copied</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                        <span>Copy</span>
                                                    </>
                                                )}
                                            </div>
                                            {msg.usage && (
                                                <>
                                                    <div className="footer-separator">•</div>
                                                    <div className="footer-item" data-tooltip="Input / Output Tokens">
                                                        <span>{msg.usage.inputTokens} / {msg.usage.outputTokens} T</span>
                                                    </div>
                                                </>
                                            )}
                                            {msg.latency && (
                                                <>
                                                    <div className="footer-separator">•</div>
                                                    <div className="footer-item" data-tooltip="Response Latency">
                                                        <span>{(msg.latency / 1000).toFixed(2)}s</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="chat-message-item assistant">
                                <div className="message-content">
                                    <div className="thinking-indicator">
                                        <span>.</span><span>.</span><span>.</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Streaming content (typewriter effect) */}
                        {isStreaming && streamingContent && (
                            <div className="chat-message-item assistant">
                                <div className="message-content">
                                    <div className="text markdown-body">
                                        <ReactMarkdown
                                            children={streamingContent}
                                            remarkPlugins={[remarkGfm]}
                                        />
                                    </div>
                                    <span className="cursor-blink">▌</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
            )}

            <AgentBar
                onPromptSubmit={handlePromptSubmit}
                isSelectionMode={isSelectionMode}
                screenshot={screenshot}
                onAttachScreenshot={() => setIsSelectionMode(true)}
                onScreenshotClick={handleScreenshotClick}
                isChatActive={isChatActive}
                onViewScreenshot={() => screenshot && setViewingImage(screenshot)}
                onDetachScreenshot={() => setScreenshot(null)}
                onNewChat={() => { setMessages([]); setScreenshot(null); setIsChatActive(false); }}
            />

            {/* Full-screen Image Viewer */}
            {viewingImage && (
                <div
                    className="image-viewer-overlay"
                    onClick={() => setViewingImage(null)}
                    onMouseEnter={() => window.ipcRenderer.send('set-ignore-mouse-events', false)}
                >
                    <div className="image-viewer-content">
                        <img src={viewingImage} alt="Full view" />
                    </div>
                    <div style={{ position: 'absolute', bottom: '30px', color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
                        Click anywhere to close
                    </div>
                </div>
            )}
        </div>
    )
}




