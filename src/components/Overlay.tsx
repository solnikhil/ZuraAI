import React, { useState, useEffect, useRef } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import './Overlay.css'
import ShinyText from './ShinyText'
import AgentBar from './AgentBar'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    image?: string
    isThinking?: boolean
}

export default function Overlay() {
    const { settings } = useSettings()
    const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null)
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [screenshot, setScreenshot] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(false)

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

    // Scroll to bottom of chat
    useEffect(() => {
        if (isChatActive && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, isChatActive])

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

    const callOpenRouter = async (userPrompt: string, image?: string) => {
        const apiKey = settings.openRouterApiKey || (import.meta as any).env?.VITE_OPENROUTER_API_KEY

        if (!apiKey) {
            const errorMessage: Message = {
                id: Date.now().toString(),
                role: 'assistant',
                content: "Please configure your OpenRouter API Key in Settings."
            }
            setMessages(prev => [...prev, errorMessage])
            setIsChatActive(true)
            return
        }

        setIsLoading(true)

        // Add user message immediately
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userPrompt,
            image: image
        }
        setMessages(prev => [...prev, userMessage])
        setIsChatActive(true) // Expand chat

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
            })

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`)
            }

            const data = await response.json()
            const aiContent = data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response."

            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: aiContent
            }
            setMessages(prev => [...prev, aiMessage])
        } catch (error: any) {
            console.error("API Error:", error)
            window.ipcRenderer.send('log-to-terminal', `[API ERROR] ${error.message || error}`)
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: "Sorry, there was an error connecting to the AI. Please check your API key and internet connection."
            }
            setMessages(prev => [...prev, errorMessage])
        } finally {
            setIsLoading(false)
        }
    }

    const handlePromptSubmit = (prompt: string) => {
        console.log("Prompt submitted:", prompt)
        if (screenshot) {
            callOpenRouter(prompt, screenshot)
        } else {
            callOpenRouter(prompt)
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
                                            className="message-image"
                                            onClick={() => setViewingImage(msg.image || null)}
                                            style={{ cursor: 'pointer' }}
                                            title="Click to view full size"
                                        >
                                            <img src={msg.image} alt="Attachment" />
                                        </div>
                                    )}
                                    <div className="text">{msg.content}</div>
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
                    <div style={{ position: 'absolute', bottom: '30px', color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
                        Click anywhere to close
                    </div>
                </div>
            )}
        </div>
    )
}
