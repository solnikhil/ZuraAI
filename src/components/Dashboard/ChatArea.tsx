import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Sparkles, Copy, Check, ChevronDown, RotateCcw, Download, Share2, Globe, FolderOpen, Mic, Info, Clock, ArrowDown, ArrowUp, Sigma, Cpu, Twitter, MessageCircle, FlaskConical, Video, ShieldCheck, Brain, Trash2, Wrench, X, File, Image, FileText, Bot, Square, Zap, TrendingUp, Database } from 'lucide-react'
import StarBorder from '../StarBorder'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useChatHistory, Message } from '../../contexts/ChatHistoryContext'
import { useSettings } from '../../contexts/SettingsContext'
import { generateOllamaCompletion, streamOllamaCompletion } from '../../services/ollama'
import { generatePerplexityCompletion, streamPerplexityCompletion, cleanSonarResponse } from '../../services/perplexity'
import { generateGeminiCompletion, streamGeminiCompletion } from '../../services/gemini'
import { generateGroqCompletion, streamGroqCompletion } from '../../services/groq'
import { streamOpenRouterCompletion } from '../../services/openrouter'
import { generateChatTitle } from '../../services/titleGenerator'
import { buildOptimizedContext } from '../../utils/tokenUtils'
import ModelSelector from './ModelSelector'
import { getEffectiveSystemPrompt } from '../../utils/promptSelection'
import { exportChatToMarkdown, exportChatToText, downloadFile } from '../../utils/chatExport'
import { useToast } from '../Toast'
import { useToolCalling } from '../../hooks/useToolCalling'
import { ToolCallIndicator, ToolResultDisplay } from '../../tools/ui'
import { hasGeminiFunctionCalls, formatToolResultsForGemini } from '../../tools/adapters/gemini'
import { buildMessagesWithToolResults } from '../../tools/toolManager'
import BlurText from '../BlurText'
import GradientText from '../GradientText'
import ToolApprovalDialog from '../ToolApprovalDialog'
import { ToolCallResult } from '../../tools/executor'

export default function ChatArea() {
    const { sessions, currentSessionId, addMessageToSession, updateStreamingMessage, createSession, updateSessionTitle, deleteSession, clearAllSessions } = useChatHistory()
    const { settings, updateSettings } = useSettings()
    const { showToast } = useToast()
    const { canUseTools, getToolsForRequest, handleToolCalls, toolState, clearToolState, handleApprovalResponse } = useToolCalling()

    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const [isTitleAnimated, setIsTitleAnimated] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; type: string; size: number; data: string; mimeType: string }>>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const currentSession = sessions.find(s => s.id === currentSessionId)
    const messages = currentSession?.messages || []

    // Track the last message count to detect when a NEW message is added
    const prevMessageCountRef = useRef(messages.length)
    const lastMessageIdRef = useRef<string | null>(null)
    const hasScrolledToNewMessageRef = useRef(false)
    const userScrolledAwayRef = useRef(false)

    const scrollToBottom = (immediate = false) => {
        if (messagesContainerRef.current) {
            // Direct scroll of the container for better control
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        } else if (messagesEndRef.current) {
            // Fallback to scrollIntoView if container ref not available
            messagesEndRef.current.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' })
        }
    }

    // Scroll to bring the start of a new message into view (at the TOP of viewport)
    const scrollToNewMessage = () => {
        if (!messagesContainerRef.current) return
        const container = messagesContainerRef.current
        const messageElements = container.querySelectorAll('[data-message-id]')
        const lastMessageEl = messageElements[messageElements.length - 1] as HTMLElement
        if (lastMessageEl) {
            // Use scrollIntoView with block: 'start' to position message at TOP of container
            lastMessageEl.scrollIntoView({ behavior: 'auto', block: 'start' })
            // Add padding so the message isn't flush against the top (48px breathing room)
            container.scrollTop = Math.max(0, container.scrollTop - 48)
        }
    }

    // Check if user is near the bottom of the chat
    const isNearBottom = () => {
        if (!messagesContainerRef.current) return true
        const container = messagesContainerRef.current
        const threshold = 150 // pixels from bottom
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    }

    // Track user scroll to detect if they scrolled away
    useEffect(() => {
        const container = messagesContainerRef.current
        if (!container) return

        const handleScroll = () => {
            // If user scrolls up during streaming, mark that they scrolled away
            if (isLoading && !isNearBottom()) {
                userScrolledAwayRef.current = true
            } else if (isNearBottom()) {
                userScrolledAwayRef.current = false
            }
        }

        container.addEventListener('scroll', handleScroll)
        return () => container.removeEventListener('scroll', handleScroll)
    }, [isLoading])

    // Handle new message detection and initial scroll
    useEffect(() => {
        const currentMessageCount = messages.length
        const lastMessage = messages[messages.length - 1]
        const lastMessageId = lastMessage?.id || null

        // Detect if a NEW message was added (not just content update)
        if (currentMessageCount > prevMessageCountRef.current || lastMessageId !== lastMessageIdRef.current) {
            // New message added - scroll to bring its START into view
            hasScrolledToNewMessageRef.current = false
            userScrolledAwayRef.current = false
            
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                if (!hasScrolledToNewMessageRef.current) {
                    scrollToNewMessage()
                    hasScrolledToNewMessageRef.current = true
                }
            })
        }

        prevMessageCountRef.current = currentMessageCount
        lastMessageIdRef.current = lastMessageId
    }, [messages.length, messages[messages.length - 1]?.id])

    // REMOVED: Post-streaming scroll to bottom - let content stay where it is
    // The user can scroll manually if they want to see more content

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
        }
    }, [input])


    const processFiles = async (files: FileList | File[]) => {
        const fileArray = Array.from(files)
        const newFiles: Array<{ id: string; name: string; type: string; size: number; data: string; mimeType: string }> = []

        for (let i = 0; i < fileArray.length; i++) {
            const file = fileArray[i]

            // Check file size (limit to 20MB per file)
            if (file.size > 20 * 1024 * 1024) {
                showToast(`File "${file.name}" is too large. Maximum size is 20MB.`, 'error')
                continue
            }

            try {
                const base64Data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => {
                        const result = reader.result as string
                        resolve(result)
                    }
                    reader.onerror = reject
                    reader.readAsDataURL(file)
                })

                newFiles.push({
                    id: `${Date.now()}-${i}`,
                    name: file.name,
                    type: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'file',
                    size: file.size,
                    data: base64Data,
                    mimeType: file.type
                })
            } catch (error) {
                console.error('Error reading file:', error)
                showToast(`Error reading file "${file.name}"`, 'error')
            }
        }

        if (newFiles.length > 0) {
            setAttachedFiles(prev => [...prev, ...newFiles])
        }
    }

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return

        await processFiles(files)

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handlePaste = async (event: React.ClipboardEvent) => {
        const items = event.clipboardData.items
        const files: File[] = []

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item.kind === 'file') {
                const file = item.getAsFile()
                if (file) {
                    files.push(file)
                }
            }
        }

        if (files.length > 0) {
            event.preventDefault()
            await processFiles(files)
        }
    }

    const removeFile = (fileId: string) => {
        setAttachedFiles(prev => prev.filter(f => f.id !== fileId))
    }

    const handleSendMessage = async () => {
        if ((!input.trim() && attachedFiles.length === 0) || isLoading) return

        // Clear tool state at start of new message
        clearToolState()


        const userMessageContent = input
        const filesToSend = [...attachedFiles]
        setInput('')
        setAttachedFiles([])
        setIsLoading(true)

        // Track agent execution start time for duration display

        let targetSessionId = currentSessionId
        let isNewSession = false

        // Convert files to FileAttachment format
        const fileAttachments = filesToSend.map(f => ({
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.size,
            data: f.data,
            mimeType: f.mimeType
        }))

        if (!targetSessionId) {
            targetSessionId = createSession(userMessageContent)
            isNewSession = true
        } else {
            addMessageToSession(targetSessionId, {
                role: 'user',
                content: userMessageContent,
                files: fileAttachments.length > 0 ? fileAttachments : undefined
            })
        }

        const startTime = performance.now()
        let usage: NonNullable<Message['usage']> = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        let model = settings.aiModel

        try {
            let responseContent = ""
            // Build conversation history including files
            const conversationHistory = messages.map(m => {
                const msg: any = { role: m.role, content: m.content }
                // Add files if present (for vision-capable models)
                if (m.files && m.files.length > 0) {
                    msg.files = m.files
                }
                return msg
            })

            const effectiveSystemPrompt = getEffectiveSystemPrompt(settings)

            // Get image files from attached files (for models that support vision)
            const imageFiles = filesToSend.filter(f => f.type === 'image')
            const firstImage = imageFiles.length > 0 ? imageFiles[0].data : undefined

            const optimizedHistory = buildOptimizedContext(conversationHistory, userMessageContent, effectiveSystemPrompt, settings.aiModel)

            if (settings.modelProvider === 'ollama') {
                // Get tools if enabled (Ollama uses OpenAI-compatible format for compatible models)
                const tools = canUseTools ? getToolsForRequest() : null
                const ollamaTools = tools && Array.isArray(tools) ? tools : undefined

                // Create streaming message immediately
                const streamingMessageId = addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: '',
                    model: `ollama/${settings.aiModel}`
                })

                // Stream the response
                let accumulatedContent = ''
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}
                let hasToolCalls = false
                let finalMessage: any = null
                let isDone = false

                try {
                    for await (const chunk of streamOllamaCompletion(
                        settings.ollamaUrl,
                        settings.aiModel,
                        optimizedHistory,
                        {
                            temperature: settings.temperature,
                            tools: ollamaTools
                        }
                    )) {
                        // Ollama chunks contain incremental content deltas
                        if (chunk.message?.content) {
                            accumulatedContent += chunk.message.content // Accumulate deltas
                        }

                        // Track final message for tool calls
                        if (chunk.message) {
                            finalMessage = chunk.message
                            if ((chunk.message as any)?.tool_calls && Array.isArray((chunk.message as any).tool_calls)) {
                                hasToolCalls = true
                            }
                        }

                        // Extract usage stats from final chunk
                        if (chunk.done) {
                            isDone = true
                            finalUsage = {
                                inputTokens: chunk.prompt_eval_count || 0,
                                outputTokens: chunk.eval_count || 0,
                                totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
                            }
                        }

                        // Debounced update
                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL && !isDone) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                            lastUpdateTime = now
                        }
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                    // Check for tool calls
                    if (canUseTools && hasToolCalls && finalMessage && (finalMessage as any)?.tool_calls && Array.isArray((finalMessage as any).tool_calls) && (finalMessage as any).tool_calls.length > 0) {
                        // Process tool calls with error handling
                        let toolResult
                        try {
                            toolResult = await handleToolCalls({ choices: [{ message: finalMessage }] })
                        } catch (toolError: any) {
                            console.error('Tool calls processing error:', toolError)
                            showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                            toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                        }

                        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                            // Stream follow-up response
                            let followUpContent = ''
                            let followUpLastUpdate = Date.now()
                            let followUpUsage: any = {}

                            for await (const chunk of streamOllamaCompletion(
                                settings.ollamaUrl,
                                settings.aiModel,
                                [
                                    ...optimizedHistory,
                                    finalMessage,
                                    ...toolResult.formattedResults
                                ],
                                {
                                    temperature: settings.temperature,
                                    tools: ollamaTools
                                }
                            )) {
                                if (chunk.message?.content) {
                                    followUpContent += chunk.message.content // Accumulate deltas
                                }
                                if (chunk.done) {
                                    followUpUsage = {
                                        inputTokens: chunk.prompt_eval_count || 0,
                                        outputTokens: chunk.eval_count || 0,
                                        totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0)
                                    }
                                }

                                const now = Date.now()
                                if (now - followUpLastUpdate >= UPDATE_INTERVAL && !chunk.done) {
                                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent + followUpContent })
                                    followUpLastUpdate = now
                                }
                            }

                            accumulatedContent += followUpContent
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                            usage = {
                                inputTokens: (finalUsage.inputTokens || 0) + (followUpUsage.inputTokens || 0),
                                outputTokens: (finalUsage.outputTokens || 0) + (followUpUsage.outputTokens || 0),
                                totalTokens: (finalUsage.totalTokens || 0) + (followUpUsage.totalTokens || 0)
                            }
                        } else {
                            usage = finalUsage
                        }
                    } else {
                        usage = finalUsage
                    }

                    // Finalize the streaming message with all metadata
                    const endTimeOllama = performance.now()
                    const latencyOllama = Math.round(endTimeOllama - startTime)
                    const toolResultsForOllama = toolState.toolResults.length > 0
                        ? toolState.toolResults.map(tr => ({
                            toolCall: {
                                id: tr.toolCall.id,
                                name: tr.toolCall.name,
                                arguments: tr.toolCall.arguments
                            },
                            result: {
                                success: tr.result.success,
                                data: tr.result.data,
                                error: tr.result.error,
                                executionTime: tr.result.executionTime
                            }
                        }))
                        : undefined

                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        model: `ollama/${settings.aiModel}`,
                        latency: latencyOllama,
                        usage,
                        toolResults: toolResultsForOllama
                    })

                    model = `ollama/${settings.aiModel}`
                    responseContent = accumulatedContent
                } catch (streamError: any) {
                    // If streaming fails, update message with error
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                        content: accumulatedContent || 'Error: Streaming failed. ' + (streamError.message || 'Unknown error')
                    })
                    throw streamError
                }
            } else if (settings.modelProvider === 'perplexity') {
                // Create streaming message immediately
                const streamingMessageId = addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: '',
                    model: `perplexity/${settings.aiModel}`
                })

                // Stream the response
                let accumulatedContent = ''
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}

                try {
                    for await (const chunk of streamPerplexityCompletion(
                        settings.perplexityApiKey,
                        settings.aiModel,
                        optimizedHistory,
                        {
                            temperature: settings.temperature,
                            max_tokens: settings.maxTokens
                        }
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta

                        // Extract usage stats
                        if (chunk.usage) {
                            finalUsage = chunk.usage
                        }

                        // Debounced update
                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                            lastUpdateTime = now
                        }
                    }

                    // Apply citation cleaning after streaming completes
                    // Note: Perplexity citations would need to be extracted from final chunk if available
                    // For now, clean the content (citations may not be available in streaming)
                    const cleanedContent = cleanSonarResponse(accumulatedContent)

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: cleanedContent })

                    usage = {
                        inputTokens: finalUsage.prompt_tokens || 0,
                        outputTokens: finalUsage.completion_tokens || 0,
                        totalTokens: finalUsage.total_tokens || 0
                    }

                    // Finalize the streaming message with all metadata
                    const endTimePerplexity = performance.now()
                    const latencyPerplexity = Math.round(endTimePerplexity - startTime)

                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: cleanedContent,
                        model: `perplexity/${settings.aiModel}`,
                        latency: latencyPerplexity,
                        usage
                    })

                    model = `perplexity/${settings.aiModel}`
                    responseContent = cleanedContent
                } catch (streamError: any) {
                    // If streaming fails, update message with error
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                        content: accumulatedContent || 'Error: Streaming failed. ' + (streamError.message || 'Unknown error')
                    })
                    throw streamError
                }
            } else if (settings.modelProvider === 'gemini') {
                // Get tools if enabled (returns GeminiTools object for Gemini provider)
                const tools = canUseTools ? getToolsForRequest() : null

                // Tools for Gemini are already in GeminiTools format (not an array)
                const geminiTools = tools && typeof tools === 'object' && 'function_declarations' in tools ? tools : undefined

                // Prepare messages with images if any (Gemini supports vision)
                let geminiMessages = [...optimizedHistory]
                if (firstImage) {
                    // Gemini vision format: parts array with text and inline_data
                    const lastMessage = geminiMessages[geminiMessages.length - 1]
                    if (lastMessage && lastMessage.role === 'user') {
                        const base64Image = firstImage.includes(',') ? firstImage.split(',')[1] : firstImage
                        const mimeType = firstImage.match(/data:([^;]+)/)?.[1] || 'image/png'

                        geminiMessages[geminiMessages.length - 1] = {
                            role: 'user',
                            parts: [
                                { text: lastMessage.content || userMessageContent },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: base64Image
                                    }
                                }
                            ]
                        } as any
                    }
                }

                // Create streaming message immediately
                const streamingMessageId = addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: '',
                    model: `gemini/${settings.aiModel}`
                })

                // Stream the response
                let accumulatedContent = ''
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}
                let hasFunctionCalls = false
                let accumulatedResponse: any = null

                try {
                    for await (const chunk of streamGeminiCompletion(
                        settings.geminiApiKey,
                        settings.aiModel,
                        geminiMessages,
                        {
                            temperature: settings.temperature,
                            maxOutputTokens: settings.maxTokens,
                            tools: geminiTools
                        }
                    )) {
                        // Accumulate response for function call detection
                        if (!accumulatedResponse) {
                            accumulatedResponse = { candidates: [{}] }
                        }

                        // Extract content from chunk (Gemini accumulates text across chunks)
                        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        if (chunkText) {
                            accumulatedContent = chunkText // Gemini gives us the full accumulated text
                        }

                        // Check for function calls
                        if (chunk.candidates?.[0]?.content?.parts) {
                            accumulatedResponse.candidates[0].content = {
                                parts: chunk.candidates[0].content.parts,
                                role: 'model'
                            }
                            // Check if any part is a function call
                            const parts = chunk.candidates[0].content.parts
                            hasFunctionCalls = parts.some((p: any) => p.functionCall)
                        }

                        // Extract usage stats
                        if (chunk.usageMetadata) {
                            finalUsage = chunk.usageMetadata
                        }

                        // Debounced update
                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                            lastUpdateTime = now
                        }
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                    // Check for function calls using accumulated response
                    if (canUseTools && hasGeminiFunctionCalls(accumulatedResponse)) {
                    // Process tool calls with error handling
                    let toolResult
                    try {
                        toolResult = await handleToolCalls(accumulatedResponse)
                    } catch (toolError: any) {
                        console.error('Tool calls processing error:', toolError)
                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                    }

                    if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                        // Stream follow-up response with tool results
                        const assistantContent = accumulatedContent
                        const followUpMessages: any[] = [
                            ...geminiMessages,
                            {
                                role: 'assistant',
                                content: assistantContent || ''
                            },
                            {
                                role: 'function',
                                parts: toolResult.formattedResults
                            }
                        ]
                        
                        let followUpContent = ''
                        let followUpLastUpdate = Date.now()
                        let followUpUsage: any = {}

                        for await (const chunk of streamGeminiCompletion(
                            settings.geminiApiKey,
                            settings.aiModel,
                            followUpMessages as any,
                            {
                                temperature: settings.temperature,
                                maxOutputTokens: settings.maxTokens,
                                tools: geminiTools
                            }
                        )) {
                            const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
                            if (chunkText) {
                                followUpContent = chunkText // Gemini gives full accumulated text
                            }
                            if (chunk.usageMetadata) {
                                followUpUsage = chunk.usageMetadata
                            }

                            const now = Date.now()
                            if (now - followUpLastUpdate >= UPDATE_INTERVAL) {
                                updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent + followUpContent })
                                followUpLastUpdate = now
                            }
                        }

                        // Final update with follow-up content
                        accumulatedContent += followUpContent
                        updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                        usage = {
                            inputTokens: (finalUsage.promptTokenCount || 0) + (followUpUsage.promptTokenCount || 0),
                            outputTokens: (finalUsage.candidatesTokenCount || 0) + (followUpUsage.candidatesTokenCount || 0),
                            totalTokens: (finalUsage.totalTokenCount || 0) + (followUpUsage.totalTokenCount || 0)
                        }
                    } else {
                        usage = {
                            inputTokens: finalUsage.promptTokenCount || 0,
                            outputTokens: finalUsage.candidatesTokenCount || 0,
                            totalTokens: finalUsage.totalTokenCount || 0
                        }
                    }
                } else {
                    usage = {
                        inputTokens: finalUsage.promptTokenCount || 0,
                        outputTokens: finalUsage.candidatesTokenCount || 0,
                        totalTokens: finalUsage.totalTokenCount || 0
                    }
                }

                // Finalize the streaming message with all metadata
                const endTimeGemini = performance.now()
                const latencyGemini = Math.round(endTimeGemini - startTime)
                const toolResultsForGemini = toolState.toolResults.length > 0
                    ? toolState.toolResults.map(tr => ({
                        toolCall: {
                            id: tr.toolCall.id,
                            name: tr.toolCall.name,
                            arguments: tr.toolCall.arguments
                        },
                        result: {
                            success: tr.result.success,
                            data: tr.result.data,
                            error: tr.result.error,
                            executionTime: tr.result.executionTime
                        }
                    }))
                    : undefined

                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                    content: accumulatedContent,
                    model: `gemini/${settings.aiModel}`,
                    latency: latencyGemini,
                    usage,
                    toolResults: toolResultsForGemini
                })

                model = `gemini/${settings.aiModel}`
                responseContent = accumulatedContent
            } catch (streamError: any) {
                // If streaming fails, update message with error
                updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                    content: accumulatedContent || 'Error: Streaming failed. ' + (streamError.message || 'Unknown error')
                })
                throw streamError
            }
            } else if (settings.modelProvider === 'groq') {
                // Get tools if enabled (Groq uses OpenAI-compatible format)
                const tools = canUseTools ? getToolsForRequest() : null
                const groqTools = tools && Array.isArray(tools) ? tools : undefined

                // Create streaming message immediately
                const streamingMessageId = addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: '',
                    model: `groq/${settings.aiModel}`
                })

                // Stream the response
                let accumulatedContent = ''
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}
                let hasToolCalls = false
                let toolCallsAccumulator: any[] = []
                let finishReason: string | null = null

                try {
                    for await (const chunk of streamGroqCompletion(
                        settings.groqApiKey,
                        settings.aiModel,
                        optimizedHistory,
                        {
                            temperature: settings.temperature,
                            max_tokens: settings.maxTokens,
                            tools: groqTools
                        }
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta

                        // Check for tool calls in delta
                        if (chunk.choices?.[0]?.delta?.tool_calls) {
                            hasToolCalls = true
                            const deltaToolCalls = chunk.choices[0].delta.tool_calls
                            if (deltaToolCalls) {
                                deltaToolCalls.forEach((tc: any) => {
                                    const index = tc.index ?? 0
                                    if (!toolCallsAccumulator[index]) {
                                        toolCallsAccumulator[index] = {
                                            id: tc.id || '',
                                            type: tc.type || 'function',
                                            function: { name: '', arguments: '' }
                                        }
                                    }
                                    if (tc.function?.name) {
                                        toolCallsAccumulator[index].function.name += tc.function.name
                                    }
                                    if (tc.function?.arguments) {
                                        toolCallsAccumulator[index].function.arguments += tc.function.arguments
                                    }
                                })
                            }
                        }

                        // Track finish reason
                        if (chunk.choices?.[0]?.finish_reason) {
                            finishReason = chunk.choices[0].finish_reason
                            if (finishReason === 'tool_calls') {
                                hasToolCalls = true
                            }
                        }

                        // Extract usage stats
                        if (chunk.usage) {
                            finalUsage = chunk.usage
                        }

                        // Debounced update
                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                            lastUpdateTime = now
                        }
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                    // Handle tool calls if detected
                    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc && tc.id).length > 0) {
                        // Reconstruct message with tool calls
                        const reconstructedMessage = {
                            role: 'assistant',
                            content: accumulatedContent,
                            tool_calls: toolCallsAccumulator.filter(tc => tc.id).map(tc => ({
                                id: tc.id,
                                type: tc.type || 'function',
                                function: {
                                    name: tc.function.name,
                                    arguments: tc.function.arguments
                                }
                            }))
                        }
                        const mockData = {
                            choices: [{
                                message: reconstructedMessage
                            }]
                        }

                        // Process tool calls with error handling
                        let toolResult
                        try {
                            toolResult = await handleToolCalls(mockData)
                        } catch (toolError: any) {
                            console.error('Tool calls processing error:', toolError)
                            showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                            toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                        }

                        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                            // Stream follow-up response
                            let followUpContent = ''
                            let followUpLastUpdate = Date.now()
                            let followUpUsage: any = {}

                            for await (const chunk of streamGroqCompletion(
                                settings.groqApiKey,
                                settings.aiModel,
                                [
                                    ...optimizedHistory,
                                    reconstructedMessage,
                                    ...toolResult.formattedResults
                                ],
                                {
                                    temperature: settings.temperature,
                                    max_tokens: settings.maxTokens,
                                    tools: groqTools
                                }
                            )) {
                                const delta = chunk.choices?.[0]?.delta?.content || ''
                                followUpContent += delta
                                if (chunk.usage) {
                                    followUpUsage = chunk.usage
                                }

                                const now = Date.now()
                                if (now - followUpLastUpdate >= UPDATE_INTERVAL) {
                                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent + followUpContent })
                                    followUpLastUpdate = now
                                }
                            }

                            accumulatedContent += followUpContent
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                            usage = {
                                inputTokens: (finalUsage.prompt_tokens || 0) + (followUpUsage.prompt_tokens || 0),
                                outputTokens: (finalUsage.completion_tokens || 0) + (followUpUsage.completion_tokens || 0),
                                totalTokens: (finalUsage.total_tokens || 0) + (followUpUsage.total_tokens || 0)
                            }
                        } else {
                            usage = {
                                inputTokens: finalUsage.prompt_tokens || 0,
                                outputTokens: finalUsage.completion_tokens || 0,
                                totalTokens: finalUsage.total_tokens || 0
                            }
                        }
                    } else {
                        usage = {
                            inputTokens: finalUsage.prompt_tokens || 0,
                            outputTokens: finalUsage.completion_tokens || 0,
                            totalTokens: finalUsage.total_tokens || 0
                        }
                    }

                    // Finalize the streaming message with all metadata
                    const endTimeGroq = performance.now()
                    const latencyGroq = Math.round(endTimeGroq - startTime)
                    const toolResultsForGroq = toolState.toolResults.length > 0
                        ? toolState.toolResults.map(tr => ({
                            toolCall: {
                                id: tr.toolCall.id,
                                name: tr.toolCall.name,
                                arguments: tr.toolCall.arguments
                            },
                            result: {
                                success: tr.result.success,
                                data: tr.result.data,
                                error: tr.result.error,
                                executionTime: tr.result.executionTime
                            }
                        }))
                        : undefined

                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        model: `groq/${settings.aiModel}`,
                        latency: latencyGroq,
                        usage,
                        toolResults: toolResultsForGroq
                    })

                    model = `groq/${settings.aiModel}`
                    responseContent = accumulatedContent
                } catch (streamError: any) {
                    // If streaming fails, update message with error
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                        content: accumulatedContent || 'Error: Streaming failed. ' + (streamError.message || 'Unknown error')
                    })
                    throw streamError
                }
            } else if (settings.modelProvider === 'codex') {
                // Codex provider - uses OAuth authentication via ChatGPT
                const { generateCodexCompletion, streamCodexCompletion, extractCodexUsage } = await import('../../services/codex')
                
                // Prepare messages with images if any (Codex supports vision via GPT-4o)
                let codexMessages = [...optimizedHistory]
                if (firstImage) {
                    const lastMessage = codexMessages[codexMessages.length - 1]
                    if (lastMessage && lastMessage.role === 'user') {
                        ;(codexMessages[codexMessages.length - 1] as any) = {
                            role: 'user',
                            content: [
                                { type: 'text', text: lastMessage.content || userMessageContent },
                                { type: 'image_url', image_url: { url: firstImage } }
                            ]
                        }
                    }
                }

                // Create streaming message immediately
                const codexModel = settings.codexSelectedModel || 'gpt-5.2-codex-medium'
                
                // #region agent log - Codex call initiation
                console.log('[ChatArea:Codex] ========== CODEX CALL INITIATED ==========')
                console.log('[ChatArea:Codex] codexModel from settings:', settings.codexSelectedModel)
                console.log('[ChatArea:Codex] codexModel being used:', codexModel)
                console.log('[ChatArea:Codex] codexMessages count:', codexMessages.length)
                console.log('[ChatArea:Codex] settings.temperature:', settings.temperature)
                console.log('[ChatArea:Codex] settings.maxTokens:', settings.maxTokens)
                codexMessages.forEach((msg, idx) => {
                    console.log(`[ChatArea:Codex] Message[${idx}]: role=${msg.role}, content type=${typeof msg.content}`)
                })
                // #endregion
                
                const streamingMessageId = addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: '',
                    model: `codex/${codexModel}`
                })

                // Stream the response (note: Codex via IPC doesn't support true streaming, simulated)
                let accumulatedContent = ''
                let finalUsage: any = {}

                try {
                    // NOTE: temperature and maxTokens are NOT passed to Codex API
                    // The official Codex CLI does not support these parameters
                    // #region agent log
                    console.log('[ChatArea:Codex] Calling streamCodexCompletion...')
                    console.log('[ChatArea:Codex] NOTE: temperature and maxTokens are IGNORED by Codex API')
                    // #endregion
                    for await (const chunk of streamCodexCompletion(
                        codexModel,
                        codexMessages,
                        {
                            // NOTE: These are passed but will be IGNORED by the Codex service
                            // The official Codex CLI does not support temperature/maxTokens
                        }
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta

                        // Extract usage stats
                        if (chunk.usage) {
                            finalUsage = chunk.usage
                        }

                        // Update message
                        updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                    usage = {
                        inputTokens: finalUsage.prompt_tokens || 0,
                        outputTokens: finalUsage.completion_tokens || 0,
                        totalTokens: finalUsage.total_tokens || 0
                    }

                    // Finalize the streaming message with all metadata
                    const endTimeCodex = performance.now()
                    const latencyCodex = Math.round(endTimeCodex - startTime)

                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        model: `codex/${codexModel}`,
                        latency: latencyCodex,
                        usage
                    })

                    model = `codex/${codexModel}`
                    responseContent = accumulatedContent
                } catch (streamError: any) {
                    // If streaming fails, update message with error
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                        content: accumulatedContent || 'Error: ' + (streamError.message || 'Unknown error')
                    })
                    throw streamError
                }
            } else {
                // OpenRouter - supports function calling and vision
                // Prepare messages with images if any
                let openRouterMessages = [...optimizedHistory]
                if (firstImage) {
                    // OpenRouter vision format: content array with text and image_url
                    const lastMessage = openRouterMessages[openRouterMessages.length - 1]
                    if (lastMessage && lastMessage.role === 'user') {
                        ; (openRouterMessages[openRouterMessages.length - 1] as any) = {
                            role: 'user',
                            content: [
                                { type: 'text', text: lastMessage.content || userMessageContent },
                                { type: 'image_url', image_url: { url: firstImage } }
                            ]
                        }
                    }
                }

                // Add tools if enabled and supported
                const tools = getToolsForRequest()
                
                // Create streaming message immediately
                const streamingMessageId = addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: '',
                    model: `openrouter/${settings.aiModel}`
                })

                // Stream the response
                let accumulatedContent = ''
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}
                let hasToolCalls = false
                let toolCallsAccumulator: any[] = []
                let finishReason: string | null = null

                try {
                    for await (const chunk of streamOpenRouterCompletion(
                        settings.openRouterApiKey,
                        settings.aiModel,
                        openRouterMessages,
                        {
                            temperature: settings.temperature,
                            maxTokens: settings.maxTokens,
                            tools: tools && Array.isArray(tools) && tools.length > 0 ? tools : undefined
                        }
                    )) {
                        // Extract content delta
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta

                        // Check for tool calls in delta
                        if (chunk.choices?.[0]?.delta?.tool_calls) {
                            hasToolCalls = true
                            const deltaToolCalls = chunk.choices[0].delta.tool_calls
                            if (deltaToolCalls) {
                                deltaToolCalls.forEach((tc: any, idx: number) => {
                                    if (!toolCallsAccumulator[tc.index ?? idx]) {
                                        toolCallsAccumulator[tc.index ?? idx] = {
                                            id: tc.id || '',
                                            type: tc.type || 'function',
                                            function: { name: '', arguments: '' }
                                        }
                                    }
                                    if (tc.function?.name) {
                                        toolCallsAccumulator[tc.index ?? idx].function.name += tc.function.name
                                    }
                                    if (tc.function?.arguments) {
                                        toolCallsAccumulator[tc.index ?? idx].function.arguments += tc.function.arguments
                                    }
                                })
                            }
                        }

                        // Extract usage stats from final chunk
                        if (chunk.usage) {
                            finalUsage = chunk.usage
                        }

                        // Debounced update
                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                            lastUpdateTime = now
                        }
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                    // Handle tool calls if detected (need to reconstruct message format)
                    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc && tc.id).length > 0) {
                        // Reconstruct message with tool calls for handleToolCalls
                        const reconstructedMessage = {
                            role: 'assistant',
                            content: accumulatedContent,
                            tool_calls: toolCallsAccumulator.filter(tc => tc.id).map(tc => ({
                                id: tc.id,
                                type: tc.type || 'function',
                                function: {
                                    name: tc.function.name,
                                    arguments: tc.function.arguments
                                }
                            }))
                        }
                        const mockData = {
                            choices: [{
                                message: reconstructedMessage
                            }]
                        }

                        // Process tool calls with error handling
                        let toolResult
                        try {
                            toolResult = await handleToolCalls(mockData)
                        } catch (toolError: any) {
                            console.error('Tool calls processing error:', toolError)
                            showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                            toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                        }

                        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                            // Stream follow-up response with tool results
                            const openRouterTools = getToolsForRequest()
                            let followUpContent = ''
                            let followUpLastUpdate = Date.now()
                            let followUpUsage: any = {}

                            for await (const chunk of streamOpenRouterCompletion(
                                settings.openRouterApiKey,
                                settings.aiModel,
                                [
                                    ...optimizedHistory,
                                    reconstructedMessage,
                                    ...toolResult.formattedResults
                                ],
                                {
                                    temperature: settings.temperature,
                                    maxTokens: settings.maxTokens,
                                    tools: openRouterTools && Array.isArray(openRouterTools) && openRouterTools.length > 0 ? openRouterTools : undefined
                                }
                            )) {
                                const delta = chunk.choices?.[0]?.delta?.content || ''
                                followUpContent += delta
                                if (chunk.usage) {
                                    followUpUsage = chunk.usage
                                }

                                const now = Date.now()
                                if (now - followUpLastUpdate >= UPDATE_INTERVAL) {
                                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent + followUpContent })
                                    followUpLastUpdate = now
                                }
                            }

                            // Final update with follow-up content
                            accumulatedContent += followUpContent
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                            // Combine usage stats
                            usage = {
                                inputTokens: (finalUsage.prompt_tokens || 0) + (followUpUsage.prompt_tokens || 0),
                                outputTokens: (finalUsage.completion_tokens || 0) + (followUpUsage.completion_tokens || 0),
                                totalTokens: (finalUsage.total_tokens || 0) + (followUpUsage.total_tokens || 0),
                                cachedInputTokens: ((finalUsage.prompt_cache_tokens || 0) + (followUpUsage.prompt_cache_tokens || 0)) || undefined,
                                cachedOutputTokens: ((finalUsage.completion_cache_tokens || 0) + (followUpUsage.completion_cache_tokens || 0)) || undefined
                            }
                        } else {
                            // No follow-up needed, finalize with existing content
                            const cachedInputTokens = finalUsage.prompt_cache_tokens || 0
                            const cachedOutputTokens = finalUsage.completion_cache_tokens || 0
                            usage = {
                                inputTokens: finalUsage.prompt_tokens || 0,
                                outputTokens: finalUsage.completion_tokens || 0,
                                totalTokens: finalUsage.total_tokens || 0,
                                cachedInputTokens: cachedInputTokens > 0 ? cachedInputTokens : undefined,
                                cachedOutputTokens: cachedOutputTokens > 0 ? cachedOutputTokens : undefined
                            }
                        }
                    } else {
                        // No tool calls, finalize message
                        const cachedInputTokens = finalUsage.prompt_cache_tokens || 0
                        const cachedOutputTokens = finalUsage.completion_cache_tokens || 0
                        usage = {
                            inputTokens: finalUsage.prompt_tokens || 0,
                            outputTokens: finalUsage.completion_tokens || 0,
                            totalTokens: finalUsage.total_tokens || 0,
                            cachedInputTokens: cachedInputTokens > 0 ? cachedInputTokens : undefined,
                            cachedOutputTokens: cachedOutputTokens > 0 ? cachedOutputTokens : undefined
                        }
                    }
                } catch (streamError: any) {
                    // If streaming fails, update message with error
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                        content: accumulatedContent || 'Error: Streaming failed. ' + (streamError.message || 'Unknown error')
                    })
                    throw streamError
                }

                model = `openrouter/${settings.aiModel}`
                responseContent = accumulatedContent
                
                // Finalize the streaming message with all metadata
                const endTimeOpenRouter = performance.now()
                const latencyOpenRouter = Math.round(endTimeOpenRouter - startTime)
                const toolResultsForOpenRouter = toolState.toolResults.length > 0
                    ? toolState.toolResults.map(tr => ({
                        toolCall: {
                            id: tr.toolCall.id,
                            name: tr.toolCall.name,
                            arguments: tr.toolCall.arguments
                        },
                        result: {
                            success: tr.result.success,
                            data: tr.result.data,
                            error: tr.result.error,
                            executionTime: tr.result.executionTime
                        }
                    }))
                    : undefined
                
                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                    content: responseContent,
                    model,
                    latency: latencyOpenRouter,
                    usage,
                    toolResults: toolResultsForOpenRouter
                })
            }

            const endTime = performance.now()
            const latency = Math.round(endTime - startTime)

            // Store tool results in the message if any were used
            const toolResultsForMessage = toolState.toolResults.length > 0
                ? toolState.toolResults.map(tr => ({
                    toolCall: {
                        id: tr.toolCall.id,
                        name: tr.toolCall.name,
                        arguments: tr.toolCall.arguments
                    },
                    result: {
                        success: tr.result.success,
                        data: tr.result.data,
                        error: tr.result.error,
                        executionTime: tr.result.executionTime
                    }
                }))
                : undefined

            // All providers now handle their own message creation and finalization via streaming
            // This code should only run if responseContent was set but no message was created
            // (which shouldn't happen with current implementation, but kept as fallback)
            if (!responseContent && settings.modelProvider) {
                // Fallback: create message if somehow we have content but no message was created
                addMessageToSession(targetSessionId!, {
                    role: 'assistant',
                    content: responseContent || 'No response received',
                    model,
                    latency,
                    usage,
                    toolResults: toolResultsForMessage
                })
            }
            setIsLoading(false)
            // Clear tool state after message is added
            clearToolState()

            // Generate AI title for new sessions (fire-and-forget)
            if (isNewSession && targetSessionId) {
                generateChatTitle(userMessageContent, settings).then(title => {
                    if (title) {
                        updateSessionTitle(targetSessionId!, title)
                    }
                }).catch(console.error)
            }
        } catch (error: any) {
            setIsLoading(false)
            let errorMsg = 'An unexpected error occurred.'

            // Handle rate limiting
            if (error.message?.includes('429') || error.message?.includes('rate limit')) {
                errorMsg = 'Rate limit exceeded. Please slow down and try again in a moment.'
                showToast(errorMsg, 'warning')
            } else if (error.message?.includes('401') || error.message?.includes('403')) {
                errorMsg = 'Invalid API key. Please check your API key in Settings.'
                showToast(errorMsg, 'error')
            } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
                errorMsg = 'Network error. Please check your internet connection.'
                showToast(errorMsg, 'error')
            } else {
                errorMsg = `Error: ${error.message || 'Unknown error'}`
                showToast(errorMsg, 'error')
            }

            addMessageToSession(targetSessionId!, { role: 'assistant', content: errorMsg })
            // Clear tool state on error
            clearToolState()
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
                background: '#14120B',
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
                        colors={['#FFE4C4', '#d4b89a', '#FFE4C4', '#d4b89a', '#FFE4C4']}
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
                            line-height: 1.6;
                            pointer-events: none;
                        }
                        @keyframes blur-in-up {
                            0% { opacity: 0; transform: translateY(10px); filter: blur(5px); }
                            100% { opacity: 1; transform: translateY(0); filter: blur(0); }
                        }
                        .animate-in-control {
                            animation: blur-in-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
                        }
                        .animate-in-placeholder {
                            animation: blur-in-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
                        }
                    `}</style>

                    {/* Input Area Group */}
                    <div style={{ width: '100%', maxWidth: '600px' }}>
                        <div style={{
                            position: 'relative',
                            background: 'linear-gradient(145deg, #1B1913, #14120B)',
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
                                    <div className="blur-text-placeholder animate-in-placeholder">
                                        Ask a question...
                                    </div>
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
                                    fontSize: '0.95rem',
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
                                <div className="animate-in-control" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '12px',
                                    padding: '2px',
                                    gap: '2px',
                                    animationDelay: '0.3s'
                                }}>
                                    <ModelSelector minimal={true} />

                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                                    {/* Web Search Toggle */}
                                    <button
                                        onClick={() => updateSettings({ webSearchEnabled: !settings.webSearchEnabled })}
                                        title={settings.webSearchEnabled ? 'Web search enabled - click to disable' : 'Web search disabled - click to enable'}
                                        style={{
                                            background: settings.webSearchEnabled ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: settings.webSearchEnabled ? '#60a5fa' : '#666',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            height: '100%'
                                        }}
                                        onMouseEnter={e => {
                                            if (settings.webSearchEnabled) {
                                                e.currentTarget.style.background = 'rgba(96, 165, 250, 0.25)'
                                                e.currentTarget.style.color = '#93c5fd'
                                            } else {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                                e.currentTarget.style.color = '#999'
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (settings.webSearchEnabled) {
                                                e.currentTarget.style.background = 'rgba(96, 165, 250, 0.15)'
                                                e.currentTarget.style.color = '#60a5fa'
                                            } else {
                                                e.currentTarget.style.background = 'transparent'
                                                e.currentTarget.style.color = '#666'
                                            }
                                        }}
                                    >
                                        <Globe size={16} />
                                    </button>
                                </div>
                                <div className="animate-in-control" style={{ display: 'flex', gap: '8px', animationDelay: '0.4s' }}>
                                    <button style={{
                                        background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '8px', padding: '10px', color: '#cccccc', cursor: 'pointer',
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
            background: '#14120B',
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
                <span style={{ color: '#e0e0e0', fontSize: '0.95rem', fontWeight: 500 }}>
                    {currentSession?.title || 'New Conversation'}
                </span>
                <ChevronDown size={14} color="#666" />
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    {messages.map((msg, idx) => (
                        <div key={msg.id} data-message-id={msg.id}>
                            <MessageBubble
                                message={msg}
                            />
                            {/* Show tool results after last assistant message */}
                            {msg.role === 'assistant' && idx === messages.length - 1 && toolState.toolResults.length > 0 && (
                                <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                                    {toolState.toolResults.map((result, i) => (
                                        <ToolResultDisplay
                                            key={i}
                                            toolName={result.toolCall.name}
                                            result={result.result.success ? result.result.data : undefined}
                                            error={result.result.success ? undefined : result.result.error}
                                        />
                                    ))}
                                </div>
                            )}
                            {/* Show stored tool results from message history */}
                            {msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0 && (
                                <div style={{ marginTop: '8px', marginBottom: '12px' }}>
                                    {msg.toolResults.map((result, i) => (
                                        <ToolResultDisplay
                                            key={`stored-${i}`}
                                            toolName={result.toolCall.name}
                                            result={result.result.success ? result.result.data : undefined}
                                            error={result.result.success ? undefined : result.result.error}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {/* Show active tool calls */}
                    {toolState.activeToolCalls.map((toolCall, i) => (
                        <div key={`tool-active-${i}`} style={{ marginBottom: '12px' }}>
                            <ToolCallIndicator
                                toolName={toolCall.name}
                                status="executing"
                                arguments={toolCall.arguments}
                            />
                        </div>
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
                    attachedFiles={attachedFiles}
                    onFileSelect={handleFileSelect}
                    onRemoveFile={removeFile}
                    fileInputRef={fileInputRef}
                    onPaste={handlePaste}
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
                @keyframes agent-pulse {
                    0%, 100% { 
                        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
                        transform: scale(1);
                    }
                    50% { 
                        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
                        transform: scale(1.05);
                    }
                }
            `}</style>


            {/* Tool Approval Dialog - shown when a sensitive tool needs user confirmation */}
            {/* Sensitive tools require approval based on settings */}
            {/* **Validates: Requirements 4.3** */}
            {toolState.pendingApproval && (
                <ToolApprovalDialog
                    toolCall={toolState.pendingApproval}
                    isVisible={true}
                    onApprove={() => handleApprovalResponse(true)}
                    onReject={() => handleApprovalResponse(false)}
                />
            )}
        </div>
    )
}

// Component to highlight first word in gold


/**
 * Convert reference-style URLs ([1] https://...) and plain URLs to markdown links
 */
function convertUrlsToMarkdownLinks(content: string): string {
    if (!content) return content

    // Pattern 1: Reference-style URLs like [1] https://example.com or [1] https://example.com/path
    // Convert to [[1]](https://example.com)
    // Match: [number] followed by whitespace and then URL (can be at start of line or after text)
    content = content.replace(/(^|\s)\[(\d+)\]\s+(https?:\/\/[^\s\)\]\[]+)/gm, (match, prefix, num, url) => {
        // Remove trailing punctuation that might be part of sentence
        const cleanUrl = url.replace(/[.,;:!?]+$/, '')
        return `${prefix}[[${num}]](${cleanUrl})`
    })

    // Pattern 2: References section format: [1] https://example.com (on separate lines)
    // Handle lines that start with [number] followed by URL
    const lines = content.split('\n')
    const processedLines = lines.map(line => {
        // Skip lines that are already markdown links
        if (line.includes('](') && line.includes(')')) return line

        // Check if line matches reference format: [1] https://...
        const refMatch = line.match(/^(\s*)\[(\d+)\]\s+(https?:\/\/.+)$/)
        if (refMatch) {
            const [, indent, num, url] = refMatch
            const cleanUrl = url.trim().replace(/[.,;:!?]+$/, '')
            return `${indent}[[${num}]](${cleanUrl})`
        }

        // Pattern 3: Plain URLs not already in markdown format
        // Find URLs in the line that aren't already links
        const urlRegex = /(https?:\/\/[^\s\)\]\[]+)/g
        let lastIndex = 0
        let result = ''

        let match
        while ((match = urlRegex.exec(line)) !== null) {
            // Add text before URL
            result += line.substring(lastIndex, match.index)

            // Check if URL is already part of a markdown link
            const beforeUrl = line.substring(0, match.index)
            const afterUrl = line.substring(match.index + match[0].length)

            // Skip if already in markdown link format
            if (beforeUrl.endsWith('](') || afterUrl.startsWith(')')) {
                result += match[0]
            } else {
                // Convert to markdown autolink
                const cleanUrl = match[0].replace(/[.,;:!?]+$/, '')
                result += `<${cleanUrl}>`
            }

            lastIndex = match.index + match[0].length
        }

        // Add remaining text
        result += line.substring(lastIndex)
        return result
    })

    return processedLines.join('\n')
}

// Tool Details Modal Component
function ToolDetailsModal({ toolResults, onClose }: { toolResults: any[], onClose: () => void }) {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: '#1a1a1a',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '800px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px'
                }}>
                    <h2 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
                        Tools Used ({toolResults.length})
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#b0b0b0',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {toolResults.map((result, idx) => (
                        <div
                            key={idx}
                            style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                padding: '16px'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '12px'
                            }}>
                                <Wrench size={16} color={result.result.success ? '#4ade80' : '#f87171'} />
                                <span style={{
                                    color: '#fff',
                                    fontWeight: 600,
                                    fontSize: '1rem'
                                }}>
                                    {result.toolCall.name.replace(/_/g, ' ')}
                                </span>
                                {result.result.executionTime && (
                                    <span style={{ color: '#b0b0b0', fontSize: '0.85rem', marginLeft: 'auto' }}>
                                        {result.result.executionTime}ms
                                    </span>
                                )}
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ color: '#b0b0b0', fontSize: '0.85rem', marginBottom: '4px' }}>
                                    Arguments:
                                </div>
                                <pre style={{
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    fontSize: '0.85rem',
                                    color: '#e0e0e0',
                                    overflowX: 'auto',
                                    margin: 0
                                }}>
                                    {JSON.stringify(result.toolCall.arguments, null, 2)}
                                </pre>
                            </div>

                            {result.result.success ? (
                                <div>
                                    <div style={{ color: '#b0b0b0', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        Result:
                                    </div>
                                    <pre style={{
                                        background: 'rgba(34, 197, 94, 0.1)',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        fontSize: '0.85rem',
                                        color: '#4ade80',
                                        overflowX: 'auto',
                                        margin: 0,
                                        maxHeight: '300px',
                                        overflowY: 'auto'
                                    }}>
                                        {JSON.stringify(result.result.data, null, 2)}
                                    </pre>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ color: '#b0b0b0', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        Error:
                                    </div>
                                    <div style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        fontSize: '0.85rem',
                                        color: '#f87171',
                                        margin: 0
                                    }}>
                                        {result.result.error}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// Component to highlight first word in gold
function MessageBubble({ message }: { message: any }) {
    const { settings } = useSettings()
    const [copied, setCopied] = useState(false)
    const [showToolModal, setShowToolModal] = useState(false)
    const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number; showAbove: boolean } | null>(null)
    const [isHoveringInfo, setIsHoveringInfo] = useState(false)
    const infoTriggerRef = useRef<HTMLDivElement>(null)
    const processedContent = convertUrlsToMarkdownLinks(message.content)
    const isUser = message.role === 'user'

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const updatePopoverPosition = () => {
        if (infoTriggerRef.current) {
            const rect = infoTriggerRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const popoverHeight = 400 // Approximate max height
            const popoverWidth = message.toolResults && message.toolResults.length > 0 ? 400 : 280
            const padding = 20 // Minimum padding from viewport edges
            
            // Calculate available space above and below
            const spaceAbove = rect.top
            const spaceBelow = viewportHeight - rect.bottom
            
            // Determine if we should show above or below
            // Show above if there's enough space, otherwise show below
            const showAbove = spaceAbove >= popoverHeight + padding || spaceBelow < popoverHeight + padding
            
            // Calculate left position to prevent overflow
            let left = rect.left
            if (left + popoverWidth > viewportWidth - padding) {
                left = viewportWidth - popoverWidth - padding
            }
            if (left < padding) {
                left = padding
            }
            
            setPopoverPosition({
                top: rect.top,
                left,
                showAbove
            })
        }
    }

    const handleInfoMouseEnter = () => {
        setIsHoveringInfo(true)
        updatePopoverPosition()
    }

    const handleInfoMouseLeave = () => {
        setIsHoveringInfo(false)
        setPopoverPosition(null)
    }

    // Update position on scroll/resize when hovering
    useEffect(() => {
        if (isHoveringInfo) {
            const handleUpdate = () => updatePopoverPosition()
            window.addEventListener('scroll', handleUpdate, true)
            window.addEventListener('resize', handleUpdate)
            return () => {
                window.removeEventListener('scroll', handleUpdate, true)
                window.removeEventListener('resize', handleUpdate)
            }
        }
    }, [isHoveringInfo])

    if (isUser) {
        // User message - right aligned dark pill
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                marginBottom: '24px',
                gap: '8px'
            }}>
                {/* File attachments */}
                {message.files && message.files.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxWidth: '70%',
                        width: '100%'
                    }}>
                        {message.files.map((file: any) => (
                            file.type === 'image' ? (
                                <div
                                    key={file.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '8px',
                                        maxWidth: '100%',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <img
                                        src={file.data}
                                        alt={file.name}
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: '300px',
                                            borderRadius: '8px',
                                            objectFit: 'contain',
                                            display: 'block',
                                            width: 'auto',
                                            height: 'auto'
                                        }}
                                    />
                                    <div style={{
                                        padding: '6px 8px 0',
                                        fontSize: '0.75rem',
                                        color: '#b0b0b0',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {file.name}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    key={file.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        padding: '8px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        maxWidth: '100%'
                                    }}
                                >
                                    {file.type === 'pdf' ? (
                                        <>
                                            <FileText size={16} color="#f87171" />
                                            <span style={{ color: '#e0e0e0', fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {file.name}
                                            </span>
                                            <span style={{ color: '#b0b0b0', fontSize: '0.75rem' }}>
                                                {(file.size / 1024).toFixed(1)} KB
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <File size={16} color="#888" />
                                            <span style={{ color: '#e0e0e0', fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {file.name}
                                            </span>
                                            <span style={{ color: '#b0b0b0', fontSize: '0.75rem' }}>
                                                {(file.size / 1024).toFixed(1)} KB
                                            </span>
                                        </>
                                    )}
                                </div>
                            )
                        ))}
                    </div>
                )}

                {/* Message content */}
                {message.content && (
                    <div style={{
                        padding: '12px 18px',
                        backgroundColor: '#1B1913',
                        borderRadius: '20px',
                        color: '#e0e0e0',
                        fontSize: '0.95rem',
                        maxWidth: '70%',
                        whiteSpace: 'pre-wrap'
                    }}>
                        {message.content}
                    </div>
                )}
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
                                        color: '#b0b0b0'
                                    }}>
                                        <span>{match[1]}</span>
                                        <button
                                            onClick={() => navigator.clipboard.writeText(String(children))}
                                            style={{ background: 'none', border: 'none', color: '#b0b0b0', cursor: 'pointer', fontSize: '0.75rem' }}
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

                    {processedContent}
                </ReactMarkdown>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', overflow: 'visible' }}>
                {/* Tools Button - Show if tools were used */}
                {message.toolResults && message.toolResults.length > 0 && (
                    <button
                        onClick={() => setShowToolModal(true)}
                        style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#60a5fa',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            transition: 'all 0.2s',
                            fontSize: '0.8rem',
                            fontFamily: 'inherit',
                            fontWeight: 500
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
                            e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.3)'
                        }}
                    >
                        <Wrench size={14} />
                        <span>{message.toolResults.length} {message.toolResults.length === 1 ? 'tool' : 'tools'}</span>
                    </button>
                )}

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
                {(message.usage || message.toolResults) && (
                    <>
                        <div 
                            ref={infoTriggerRef}
                            style={{ 
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '4px',
                                flexShrink: 0,
                                overflow: 'visible',
                                minWidth: '22px',
                                minHeight: '22px'
                            }} 
                            className="info-trigger"
                            onMouseEnter={handleInfoMouseEnter}
                            onMouseLeave={handleInfoMouseLeave}
                        >
                            <Info
                                size={14}
                                style={{ 
                                    cursor: 'pointer', 
                                    color: '#666', 
                                    flexShrink: 0,
                                    display: 'block',
                                    width: '14px',
                                    height: '14px'
                                }}
                                className="info-icon"
                            />
                        </div>

                        {isHoveringInfo && popoverPosition && (
                            <div 
                                className="info-popover" 
                                style={{
                                    position: 'fixed',
                                    top: popoverPosition.showAbove 
                                        ? `${popoverPosition.top}px` 
                                        : `${popoverPosition.top + 22}px`, // Position below (22px = icon height + padding)
                                    left: `${popoverPosition.left}px`,
                                    transform: popoverPosition.showAbove 
                                        ? 'translateY(calc(-100% - 10px))' 
                                        : 'none',
                                    marginTop: popoverPosition.showAbove ? '0' : '10px',
                                    backgroundColor: '#1a1a1a',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    width: message.toolResults && message.toolResults.length > 0 ? '400px' : '280px',
                                    zIndex: 10000,
                                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px',
                                    maxHeight: '80vh',
                                    overflowY: 'auto',
                                    pointerEvents: 'auto'
                                }}
                                onMouseEnter={() => setIsHoveringInfo(true)}
                                onMouseLeave={() => setIsHoveringInfo(false)}
                            >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <Info size={16} color="#e0e0e0" />
                                <span style={{ fontWeight: 600, color: '#e0e0e0', fontSize: '0.9rem' }}>Response Info</span>
                            </div>

                            {/* Model */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ color: '#b0b0b0', fontSize: '0.85rem' }}>Model</span>
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

                            {/* Performance Metrics */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ color: '#b0b0b0', fontSize: '0.85rem' }}>Performance</span>
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
                                            <Clock size={12} color="#888" />
                                            <span style={{ color: '#cccccc', fontSize: '0.8rem' }}>TTFT</span>
                                        </div>
                                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {message.usage?.ttft ? `${message.usage.ttft.toFixed(0)}ms` : '—'}
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
                                            <Zap size={12} color="#888" />
                                            <span style={{ color: '#cccccc', fontSize: '0.8rem' }}>TPS</span>
                                        </div>
                                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {message.usage?.tps ? message.usage.tps.toFixed(1) : '—'}
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
                                        <Clock size={14} color="#888" />
                                        <span style={{ color: '#e0e0e0', fontSize: '0.85rem' }}>Generation Time</span>
                                    </div>
                                    <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.85rem' }}>
                                        {(message.latency ? message.latency / 1000 : 0).toFixed(2)}s
                                    </span>
                                </div>
                            </div>

                            {/* Token Usage */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ color: '#b0b0b0', fontSize: '0.85rem' }}>Token Usage</span>
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
                                            <span style={{ color: '#cccccc', fontSize: '0.8rem' }}>Input</span>
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
                                            <span style={{ color: '#cccccc', fontSize: '0.8rem' }}>Output</span>
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

                            {/* Cache Information */}
                            {((message.usage?.cachedInputTokens && message.usage.cachedInputTokens > 0) || 
                              (message.usage?.cachedOutputTokens && message.usage.cachedOutputTokens > 0)) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ color: '#b0b0b0', fontSize: '0.85rem' }}>Cache Tokens</span>
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
                                                <Database size={12} color="#4ade80" />
                                                <span style={{ color: '#cccccc', fontSize: '0.8rem' }}>Input</span>
                                            </div>
                                            <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.85rem' }}>
                                                {message.usage.cachedInputTokens?.toLocaleString() || '0'}
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
                                                <Database size={12} color="#4ade80" />
                                                <span style={{ color: '#cccccc', fontSize: '0.8rem' }}>Output</span>
                                            </div>
                                            <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.85rem' }}>
                                                {message.usage.cachedOutputTokens?.toLocaleString() || '0'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tools Used Section */}
                            {message.toolResults && message.toolResults.length > 0 && (
                                <div style={{
                                    borderTop: '1px solid rgba(255,255,255,0.1)',
                                    paddingTop: '12px',
                                    marginTop: '4px'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '12px'
                                    }}>
                                        <Wrench size={14} color="#60a5fa" />
                                        <span style={{
                                            fontWeight: 600,
                                            color: '#e0e0e0',
                                            fontSize: '0.9rem'
                                        }}>
                                            Tools Used ({message.toolResults.length})
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {message.toolResults.map((result: any, idx: number) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    background: 'rgba(59, 130, 246, 0.05)',
                                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                                    borderRadius: '6px',
                                                    padding: '10px',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: '6px'
                                                }}>
                                                    <span style={{
                                                        color: result.result.success ? '#60a5fa' : '#f87171',
                                                        fontWeight: 600
                                                    }}>
                                                        {result.toolCall.name.replace(/_/g, ' ')}
                                                    </span>
                                                    {result.result.executionTime && (
                                                        <span style={{ color: '#b0b0b0', fontSize: '0.75rem' }}>
                                                            {result.result.executionTime}ms
                                                        </span>
                                                    )}
                                                </div>

                                                {result.toolCall.arguments && Object.keys(result.toolCall.arguments).length > 0 && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <div style={{ color: '#b0b0b0', fontSize: '0.75rem', marginBottom: '2px' }}>
                                                            Args:
                                                        </div>
                                                        <div style={{
                                                            color: '#cccccc',
                                                            fontSize: '0.75rem',
                                                            fontFamily: 'monospace',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }} title={JSON.stringify(result.toolCall.arguments, null, 2)}>
                                                            {JSON.stringify(result.toolCall.arguments).substring(0, 60)}
                                                            {JSON.stringify(result.toolCall.arguments).length > 60 ? '...' : ''}
                                                        </div>
                                                    </div>
                                                )}

                                                {result.result.success ? (
                                                    <div style={{ color: '#4ade80', fontSize: '0.75rem' }}>
                                                        ✓ Success
                                                    </div>
                                                ) : (
                                                    <div style={{ color: '#f87171', fontSize: '0.75rem' }}>
                                                        ✗ {result.result.error || 'Failed'}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                .info-trigger {
                    overflow: visible !important;
                }
                .info-trigger:hover .info-icon {
                    color: #fff !important;
                }
                .info-icon {
                    overflow: visible !important;
                    display: block !important;
                    flex-shrink: 0 !important;
                }
                .info-popover {
                    z-index: 10000 !important;
                    pointer-events: auto !important;
                }
            `}</style>

            {/* Tool Details Modal */}
            {showToolModal && message.toolResults && (
                <ToolDetailsModal
                    toolResults={message.toolResults}
                    onClose={() => setShowToolModal(false)}
                />
            )}
        </div>
    )
}

function InputBar({ input, setInput, onSend, isLoading, onKeyDown, textareaRef, attachedFiles, onFileSelect, onRemoveFile, fileInputRef, onPaste }: any) {
    const [isFocused, setIsFocused] = React.useState(false)
    const [isDragging, setIsDragging] = React.useState(false)
    const [showImageModal, setShowImageModal] = React.useState(false)
    const { settings, updateSettings } = useSettings()

    const imageFiles = attachedFiles?.filter((f: any) => f.type === 'image') || []

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            // Create a synthetic event for onFileSelect
            const syntheticEvent = {
                target: { files }
            } as React.ChangeEvent<HTMLInputElement>
            await onFileSelect(syntheticEvent)
        }
    }

    return (
        <>
            <StarBorder
                as="div"
                className="input-bar-container"
                color={isFocused || isDragging ? "cyan" : "#444"}
                speed="10s"
                style={{
                    borderRadius: '24px',
                    padding: '1px', // Thinner border width
                    transition: 'all 0.3s ease',
                    border: isDragging ? '2px dashed #60a5fa' : undefined
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div style={{
                    background: isDragging ? 'rgba(96, 165, 250, 0.1)' : 'linear-gradient(145deg, #1B1913, #14120B)',
                    borderRadius: '22px', // Slightly less than outer
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    height: '100%',
                    width: '100%',
                    transition: 'background 0.2s ease'
                }}>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onPaste={onPaste}
                        placeholder={isDragging ? "Drop files here..." : "Ask a question..."}
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
                            fontWeight: 400,
                            fontFamily: 'inherit',
                            lineHeight: '1.6',
                            minHeight: '32px',
                            maxHeight: '200px'
                        }}
                    />

                    {/* Bottom row - model selector and send */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {/* Grouped pill container for model + web search + images */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px',
                            padding: '2px',
                            gap: '2px'
                        }}>
                            <ModelSelector minimal={true} />

                            {/* Divider */}
                            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                            {/* Web Search Toggle */}
                            <button
                                onClick={() => updateSettings({ webSearchEnabled: !settings.webSearchEnabled })}
                                title={settings.webSearchEnabled ? 'Web search enabled - click to disable' : 'Web search disabled - click to enable'}
                                style={{
                                    background: settings.webSearchEnabled ? 'rgba(96, 165, 250, 0.15)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    color: settings.webSearchEnabled ? '#60a5fa' : '#666',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                    height: '100%'
                                }}
                                onMouseEnter={e => {
                                    if (settings.webSearchEnabled) {
                                        e.currentTarget.style.background = 'rgba(96, 165, 250, 0.25)'
                                        e.currentTarget.style.color = '#93c5fd'
                                    } else {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                        e.currentTarget.style.color = '#999'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (settings.webSearchEnabled) {
                                        e.currentTarget.style.background = 'rgba(96, 165, 250, 0.15)'
                                        e.currentTarget.style.color = '#60a5fa'
                                    } else {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = '#666'
                                    }
                                }}
                            >
                                <Globe size={16} />
                            </button>


                            {/* Images button - show if images are attached */}
                            {imageFiles.length > 0 && (
                                <>
                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                                    <button
                                        onClick={() => setShowImageModal(true)}
                                        title={`${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} attached`}
                                        style={{
                                            background: 'rgba(96, 165, 250, 0.15)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: '#60a5fa',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            height: '100%',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'rgba(96, 165, 250, 0.25)'
                                            e.currentTarget.style.color = '#93c5fd'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'rgba(96, 165, 250, 0.15)'
                                            e.currentTarget.style.color = '#60a5fa'
                                        }}
                                    >
                                        <Image size={16} />
                                        {imageFiles.length > 1 && (
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                background: 'rgba(96, 165, 250, 0.3)',
                                                borderRadius: '10px',
                                                padding: '1px 4px',
                                                minWidth: '16px',
                                                textAlign: 'center'
                                            }}>
                                                {imageFiles.length}
                                            </span>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={onFileSelect}
                                multiple
                                accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.xml"
                                style={{ display: 'none' }}
                            />
                            <button
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (fileInputRef?.current) {
                                        fileInputRef.current.click()
                                    }
                                }}
                                type="button"
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    color: '#cccccc',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    position: 'relative'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                                    e.currentTarget.style.color = '#fff'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                    e.currentTarget.style.color = '#aaa'
                                }}
                                title="Attach files (images, PDFs, documents) - or drag & drop"
                            >
                                <Paperclip size={18} />
                            </button>
                            {/* Send button */}
                            {!isLoading && (
                                <button
                                    onClick={onSend}
                                    disabled={isLoading || (!input.trim() && (!attachedFiles || attachedFiles.length === 0))}
                                    style={{
                                        background: (input.trim() || (attachedFiles && attachedFiles.length > 0)) && !isLoading ? '#FFCA28' : 'rgba(255,255,255,0.05)',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        color: (input.trim() || (attachedFiles && attachedFiles.length > 0)) && !isLoading ? '#000' : '#444',
                                        cursor: (input.trim() || (attachedFiles && attachedFiles.length > 0)) && !isLoading ? 'pointer' : 'default',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                        transform: (input.trim() || (attachedFiles && attachedFiles.length > 0)) && !isLoading ? 'scale(1)' : 'scale(0.95)'
                                    }}
                                    title={attachedFiles && attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Send message'}
                                >
                                    <Send size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </StarBorder>

            {/* Image Modal */}
            {showImageModal && imageFiles.length > 0 && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                        padding: '20px'
                    }}
                    onClick={() => setShowImageModal(false)}
                >
                    <div
                        style={{
                            backgroundColor: '#1a1a1a',
                            borderRadius: '12px',
                            padding: '24px',
                            width: '90%',
                            maxWidth: '800px',
                            maxHeight: '90%',
                            overflowY: 'auto',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                            position: 'relative',
                            color: '#e0e0e0'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowImageModal(false)}
                            style={{
                                position: 'absolute',
                                top: '12px',
                                right: '12px',
                                background: 'none',
                                border: 'none',
                                color: '#b0b0b0',
                                cursor: 'pointer',
                                padding: '8px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                                e.currentTarget.style.color = '#fff'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'none'
                                e.currentTarget.style.color = '#888'
                            }}
                        >
                            <X size={20} />
                        </button>

                        <h3 style={{ marginTop: '0', marginBottom: '20px', color: '#fff', fontSize: '1.2rem' }}>
                            Attached Images ({imageFiles.length})
                        </h3>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap: '16px',
                            marginTop: '16px'
                        }}>
                            {imageFiles.map((file: any) => (
                                <div
                                    key={file.id}
                                    style={{
                                        position: 'relative',
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        background: '#252525',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                >
                                    <img
                                        src={file.data}
                                        alt={file.name}
                                        style={{
                                            width: '100%',
                                            height: '200px',
                                            objectFit: 'contain',
                                            background: '#1a1a1a',
                                            display: 'block'
                                        }}
                                    />
                                    <div style={{
                                        padding: '8px',
                                        borderTop: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            color: '#e0e0e0',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            marginBottom: '4px'
                                        }}>
                                            {file.name}
                                        </div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: '#b0b0b0'
                                        }}>
                                            {(file.size / 1024).toFixed(1)} KB
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            onRemoveFile(file.id)
                                            if (imageFiles.length === 1) {
                                                setShowImageModal(false)
                                            }
                                        }}
                                        style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            background: 'rgba(0,0,0,0.7)',
                                            border: 'none',
                                            color: '#f87171',
                                            cursor: 'pointer',
                                            padding: '6px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'rgba(248, 113, 113, 0.2)'
                                            e.currentTarget.style.color = '#fff'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'rgba(0,0,0,0.7)'
                                            e.currentTarget.style.color = '#f87171'
                                        }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
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
