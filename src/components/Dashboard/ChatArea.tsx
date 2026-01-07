import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import {
    Send, Paperclip, Sparkles, Copy, Check, ChevronDown, RotateCcw,
    Download, Share2, Globe, FolderOpen, Mic, Info, Clock, ArrowDown,
    ArrowUp, Sigma, Cpu, Twitter, MessageCircle, FlaskConical, Video,
    ShieldCheck, Brain, Trash2, Wrench, X, File, Image, FileText, Bot,
    Square, Zap, TrendingUp, Database, Edit2, ChevronLeft, ChevronRight
} from '../icons'
import StarBorder from '../StarBorder'
import LazyMarkdown from '../LazyMarkdown'
import { useChatHistory, Message, ThinkingBlock } from '../../contexts/ChatHistoryContext'
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
import ThinkingBlockComponent from '../ThinkingBlock'
import ToolApprovalDialog from '../ToolApprovalDialog'
import { ToolCallResult } from '../../tools/executor'

export default function ChatArea() {
    const { sessions, currentSessionId, addMessageToSession, updateStreamingMessage, createSession, updateSessionTitle, deleteSession, clearAllSessions, deleteMessageFromSession } = useChatHistory()
    const { settings, updateSettings } = useSettings()
    const { showToast } = useToast()
    const { canUseTools, getToolsForRequest, handleToolCalls, toolState, clearToolState, handleApprovalResponse, startResearchMode, getResearchContext } = useToolCalling()

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

            // Use local variables for research mode (avoid async React state issues)
            let researchMaxRounds = 0
            let researchMandatory = false

            // Start research mode with appropriate search count
            if (settings.deepResearchEnabled && canUseTools) {
                researchMaxRounds = 25
                researchMandatory = false  // Let model decide when to search, up to 25
                startResearchMode(25, false) // Up to 25 autonomous searches for deep research
            } else if (settings.webSearchEnabled && canUseTools) {
                researchMaxRounds = 25
                researchMandatory = false
                startResearchMode(25, false) // Allow up to 25 searches for regular web search
            }

            // Get effective system prompt with research context
            const effectiveSystemPrompt = getEffectiveSystemPrompt(settings) + getResearchContext(0, researchMaxRounds, researchMandatory)

            // Get image files from attached files (for models that support vision)
            const imageFiles = filesToSend.filter(f => f.type === 'image')
            const firstImage = imageFiles.length > 0 ? imageFiles[0].data : undefined

            const optimizedHistory = buildOptimizedContext(conversationHistory, userMessageContent, effectiveSystemPrompt, settings.aiModel)

            // Local accumulators to avoid stale React state during streaming
            // These persist across async operations within a single message response
            let localThinkingBlocks: ThinkingBlock[] = []
            let localToolResults: ToolCallResult[] = []

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
                let savedToolResults: any = null  // Save tool results to persist in final message

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

                            // Count web_search calls from this round to get accurate search count
                            const webSearchCount = toolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0

                            // Build follow-up messages with research context (use local variables, not async state)
                            const researchContextMsg = getResearchContext(webSearchCount, researchMaxRounds, researchMandatory)
                            const followUpMessages: any[] = [
                                ...optimizedHistory,
                                finalMessage,
                                ...toolResult.formattedResults
                            ]
                            // Add research context as a user message to explicitly direct the model
                            if (researchContextMsg) {
                                followUpMessages.push({
                                    role: 'user',
                                    content: researchContextMsg
                                })
                            }

                            for await (const chunk of streamOllamaCompletion(
                                settings.ollamaUrl,
                                settings.aiModel,
                                followUpMessages,
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
                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        model: `ollama/${settings.aiModel}`,
                        latency: latencyOllama,
                        usage,
                        toolResults: savedToolResults
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
                const UPDATE_INTERVAL = 50
                let finalUsage: any = {}

                try {
                    let chunkCount = 0
                    for await (const chunk of streamGeminiCompletion(
                        settings.geminiApiKey,
                        settings.aiModel,
                        geminiMessages,
                        { temperature: settings.temperature, maxOutputTokens: settings.maxTokens }
                    )) {
                        chunkCount++
                        if (!chunk) continue

                        const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        if (chunkText) accumulatedContent = chunkText

                        if (chunk.usageMetadata) finalUsage = chunk.usageMetadata

                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                            lastUpdateTime = now
                        }
                    }

                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                    if (!accumulatedContent) {
                        if (!settings.geminiApiKey?.trim()) {
                            accumulatedContent = 'Gemini API key is not set. Please add it in Settings > API Keys.'
                        } else if (chunkCount === 0) {
                            accumulatedContent = 'No response from Gemini. Check API key and model.'
                        }
                        if (accumulatedContent) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })
                        }
                    }

                    usage = { inputTokens: finalUsage.promptTokenCount || 0, outputTokens: finalUsage.candidatesTokenCount || 0, totalTokens: finalUsage.totalTokenCount || 0 }
                } catch (streamError: any) {
                    const errorMsg = accumulatedContent || 'Error: ' + (streamError.message || 'Unknown error')
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: errorMsg })
                    throw streamError
                }

                // Finalize
                const endTimeGemini = performance.now()
                const latencyGemini = Math.round(endTimeGemini - startTime)

                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                    content: accumulatedContent,
                    model: `gemini/${settings.aiModel}`,
                    latency: latencyGemini,
                    usage
                })

                model = `gemini/${settings.aiModel}`
                responseContent = accumulatedContent
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
                let accumulatedReasoning = ''  // For thinking/reasoning content
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}
                let hasToolCalls = false
                let toolCallsAccumulator: any[] = []
                let finishReason: string | null = null
                let savedToolResults: any = null  // Save tool results to persist in final message

                // Determine if we should force tool use on initial request (mandatory mode)
                const initialForceToolUse = researchMandatory && researchMaxRounds > 0

                // Build toolChoice for initial request
                let initialToolChoice: 'auto' | 'required' | { type: 'function'; function: { name: string } } | undefined
                if (initialForceToolUse) {
                    initialToolChoice = { type: 'function', function: { name: 'web_search' } }
                }

                try {
                    for await (const chunk of streamGroqCompletion(
                        settings.groqApiKey,
                        settings.aiModel,
                        optimizedHistory,
                        {
                            temperature: settings.temperature,
                            max_tokens: settings.maxTokens,
                            tools: groqTools,
                            toolChoice: initialToolChoice
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
                            updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                content: accumulatedContent,
                                thinking: accumulatedReasoning || undefined
                            })
                            lastUpdateTime = now
                        }
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        thinking: accumulatedReasoning || undefined
                    })

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

                        // Add tool calls to the block list instead of mixing into thinking text
                        const webSearchCalls = (toolResult.toolResults || [])
                            .filter((tr: any) => tr.toolCall.name === 'web_search')

                        if (webSearchCalls.length > 0) {
                            // Use local accumulator instead of reading from stale React state
                            // This fixes the issue where blocks are lost due to async state updates

                            if (accumulatedReasoning && accumulatedReasoning.trim().length > 0) {
                                localThinkingBlocks.push({
                                    type: 'thinking',
                                    content: accumulatedReasoning,
                                    duration: 0, // Duration tracked separately
                                    timestamp: Date.now()
                                })
                                accumulatedReasoning = ''
                            }

                            webSearchCalls.forEach((tr: any) => {
                                const searchQuery = typeof tr.toolCall.arguments === 'object'
                                    ? tr.toolCall.arguments?.query
                                    : tr.toolCall.arguments
                                const queryString = typeof searchQuery === 'string' ? searchQuery : String(searchQuery || '')
                                localThinkingBlocks.push({
                                    type: 'searching',
                                    query: queryString,
                                    timestamp: Date.now()
                                })
                            })

                            updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                thinking: '',
                                thinkingDuration: undefined,
                                thinkingBlocks: [...localThinkingBlocks]
                            })
                        }

                        // Save tool results to persist in final message (use toolResult directly)
                        savedToolResults = toolResult?.toolResults?.map((tr: any) => ({
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
                        })) || null

                        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                            // === RESEARCH LOOP ===
                            // Continue looping until all mandatory searches are done
                            let researchRound = 1
                            let totalSearchCount = toolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
                            let hasMoreToolCalls = true
                            let lastAssistantMessage = reconstructedMessage

                            while (hasMoreToolCalls) {
                                let followUpContent = ''
                                let followUpLastUpdate = Date.now()
                                let followUpUsage: any = {}
                                let followUpToolCalls: any[] = []
                                let followUpAccumulatedContent = ''

                                // Build follow-up messages with research context (use local variables, not async state)
                                const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)

                                // Determine if we should force tool use (mandatory mode with remaining searches)
                                const remainingSearches = researchMaxRounds - totalSearchCount
                                const forceToolUse = researchMandatory && remainingSearches > 0

                                // Build toolChoice - use specific function format to force web_search
                                let toolChoice: 'auto' | 'required' | { type: 'function'; function: { name: string } } | undefined
                                if (forceToolUse) {
                                    toolChoice = { type: 'function', function: { name: 'web_search' } }
                                }

                                // Build follow-up messages
                                const followUpMessages: any[] = []

                                // Add system prompt with research instructions at the beginning
                                if (researchContextMsg) {
                                    followUpMessages.push({
                                        role: 'system',
                                        content: researchContextMsg
                                    })
                                }

                                // Then add the conversation history
                                followUpMessages.push(...optimizedHistory)
                                followUpMessages.push(lastAssistantMessage)
                                followUpMessages.push(...toolResult.formattedResults)

                                // Stream follow-up response
                                for await (const chunk of streamGroqCompletion(
                                    settings.groqApiKey,
                                    settings.aiModel,
                                    followUpMessages,
                                    {
                                        temperature: settings.temperature,
                                        max_tokens: settings.maxTokens,
                                        tools: groqTools,
                                        toolChoice: toolChoice
                                    }
                                )) {
                                    const delta = chunk.choices?.[0]?.delta?.content || ''
                                    followUpContent += delta

                                    // Check for tool calls in follow-up
                                    if (chunk.choices?.[0]?.delta?.tool_calls) {
                                        const deltaToolCalls = chunk.choices[0].delta.tool_calls
                                        if (deltaToolCalls) {
                                            deltaToolCalls.forEach((tc: any, idx: number) => {
                                                if (!followUpToolCalls[tc.index ?? idx]) {
                                                    followUpToolCalls[tc.index ?? idx] = {
                                                        id: tc.id || '',
                                                        type: tc.type || 'function',
                                                        function: { name: '', arguments: '' }
                                                    }
                                                }
                                                if (tc.function?.name) {
                                                    followUpToolCalls[tc.index ?? idx].function.name += tc.function.name
                                                }
                                                if (tc.function?.arguments) {
                                                    followUpToolCalls[tc.index ?? idx].function.arguments += tc.function.arguments
                                                }
                                            })
                                        }
                                    }

                                    if (chunk.usage) {
                                        followUpUsage = chunk.usage
                                    }

                                    const now = Date.now()
                                    if (now - followUpLastUpdate >= UPDATE_INTERVAL) {
                                        updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent + followUpContent })
                                        followUpLastUpdate = now
                                    }
                                }

                                // Add follow-up content to accumulated
                                accumulatedContent += followUpContent
                                followUpAccumulatedContent = followUpContent
                                updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                                // Combine usage stats
                                usage = {
                                    inputTokens: (finalUsage.prompt_tokens || 0) + (followUpUsage.prompt_tokens || 0),
                                    outputTokens: (finalUsage.completion_tokens || 0) + (followUpUsage.completion_tokens || 0),
                                    totalTokens: (finalUsage.total_tokens || 0) + (followUpUsage.total_tokens || 0)
                                }

                                // Check if there are more tool calls in the follow-up
                                if (followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc.function.name)) {
                                    // Reconstruct message with tool calls
                                    const reconstructedFollowUpMessage = {
                                        role: 'assistant',
                                        content: followUpAccumulatedContent,
                                        tool_calls: followUpToolCalls
                                            .filter((tc: any) => tc.function.name)
                                            .map((tc: any) => ({
                                                id: tc.id,
                                                type: tc.type || 'function',
                                                function: {
                                                    name: tc.function.name,
                                                    arguments: tc.function.arguments
                                                }
                                            }))
                                    }

                                    // Process the new tool calls
                                    let nextToolResult
                                    try {
                                        nextToolResult = await handleToolCalls({ choices: [{ message: reconstructedFollowUpMessage }] })
                                    } catch (toolError: any) {
                                        console.error('Tool calls processing error:', toolError)
                                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                                        nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                                    }

                                    // Update search count
                                    const newWebSearches = nextToolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
                                    totalSearchCount += newWebSearches

                                    // Save tool results
                                    const newSavedResults = nextToolResult.toolResults?.map((tr: any) => ({
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
                                    })) || []

                                    if (savedToolResults) {
                                        savedToolResults = [...savedToolResults, ...newSavedResults]
                                    } else {
                                        savedToolResults = newSavedResults
                                    }

                                    // Prepare for next iteration
                                    lastAssistantMessage = reconstructedFollowUpMessage
                                    toolResult = nextToolResult
                                    researchRound++

                                    // Continue loop if there are more searches needed (use local variables, not async state)
                                    const remainingSearchesAfter = researchMaxRounds - totalSearchCount
                                    // In mandatory mode, always continue if we haven't completed all searches
                                    // Otherwise, only continue if the model indicated it needs follow-up
                                    hasMoreToolCalls = remainingSearchesAfter > 0 && (
                                        researchMandatory || nextToolResult.needsFollowUp
                                    )

                                    if (!hasMoreToolCalls) {
                                        // All searches done or no more follow-up needed
                                        break
                                    }
                                } else {
                                    // Model responded with text instead of tools
                                    // Check if we're in mandatory mode and need more searches
                                    const remainingSearchesAfter = researchMaxRounds - totalSearchCount
                                    if (researchMandatory && remainingSearchesAfter > 0) {
                                        // Force another search by adding a directive message
                                        lastAssistantMessage = {
                                            role: 'assistant',
                                            content: followUpAccumulatedContent,
                                            tool_calls: []
                                        } as any
                                        // Create a mock tool result that says "you must search again"
                                        toolResult = {
                                            hasTools: true,
                                            toolResults: [],
                                            formattedResults: [{
                                                role: 'system',
                                                content: `\n\n*** MANDATORY: YOU MUST SEARCH ${remainingSearchesAfter} MORE TIMES ***\n\nYou attempted to respond without completing all ${researchMaxRounds} required searches.\n\nYou MUST use web_search exactly ${remainingSearchesAfter} more time(s) before providing your answer.\n\nDo: Use web_search now with a different query.\nDon't: Provide your answer yet.`
                                            }],
                                            needsFollowUp: true
                                        } as any
                                        // Continue loop
                                        researchRound++
                                        // Don't set hasMoreToolCalls to false - loop again
                                    } else {
                                        // Not mandatory mode or searches complete, exit loop
                                        hasMoreToolCalls = false
                                    }
                                }
                            }

                            // === FINAL ANSWER REQUEST ===
                            // After all searches complete, make one final request to get the model's comprehensive answer
                            // Do NOT force tool use - let the model provide its final answer
                            if (researchMandatory && totalSearchCount >= researchMaxRounds) {
                                console.log('[RESEARCH LOOP] All searches complete. Requesting final answer...')

                                // Build final answer request messages
                                const finalAnswerMessages: any[] = []

                                // Add completion message directing the model to answer
                                finalAnswerMessages.push({
                                    role: 'system',
                                    content: `\n\n*** ALL RESEARCH COMPLETE ***\nYou have completed all ${totalSearchCount} required web searches.\n\nYou MUST now provide your FINAL COMPREHENSIVE ANSWER based on all the information gathered.\n\nDo NOT make any more tool calls.\nSynthesize all the search results into a coherent, well-structured response that directly answers the user's question.\nInclude relevant details from the searches and cite sources where appropriate.`
                                })

                                // Add conversation history
                                finalAnswerMessages.push(...optimizedHistory)
                                // Add the last assistant message and tool results
                                finalAnswerMessages.push(lastAssistantMessage)
                                finalAnswerMessages.push(...toolResult.formattedResults)

                                // Make final request WITHOUT forcing tool use
                                let finalAnswerContent = ''
                                let finalAnswerUsage: any = {}

                                for await (const chunk of streamGroqCompletion(
                                    settings.groqApiKey,
                                    settings.aiModel,
                                    finalAnswerMessages,
                                    {
                                        temperature: settings.temperature,
                                        max_tokens: settings.maxTokens,
                                        tools: groqTools
                                        // NO toolChoice - let model decide
                                    }
                                )) {
                                    const delta = chunk.choices?.[0]?.delta?.content || ''
                                    finalAnswerContent += delta

                                    if (chunk.usage) {
                                        finalAnswerUsage = chunk.usage
                                    }

                                    const now = Date.now()
                                    if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                                        updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent + finalAnswerContent })
                                        lastUpdateTime = now
                                    }
                                }

                                // Add final answer to accumulated content
                                accumulatedContent += finalAnswerContent

                                // Update the streaming message with the final answer
                                updateStreamingMessage(targetSessionId!, streamingMessageId, { content: accumulatedContent })

                                // Combine usage stats
                                usage = {
                                    inputTokens: (usage.inputTokens || 0) + (finalAnswerUsage.prompt_tokens || 0),
                                    outputTokens: (usage.outputTokens || 0) + (finalAnswerUsage.completion_tokens || 0),
                                    totalTokens: (usage.totalTokens || 0) + (finalAnswerUsage.total_tokens || 0)
                                }

                                console.log('[RESEARCH LOOP] Final answer generated. Length:', finalAnswerContent.length)
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

                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        model: `groq/${settings.aiModel}`,
                        latency: latencyGroq,
                        usage,
                        toolResults: savedToolResults
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
                let displayContent = ''
                let thinkingContent = ''
                let finalUsage: any = {}
                let hasToolCalls = false
                let toolCallsAccumulator: any[] = []
                let finishReason: string | null = null
                let savedToolResults: any = null

                const tools = getToolsForRequest()
                const codexTools = tools && Array.isArray(tools) ? tools : undefined

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
                            tools: codexTools
                        }
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta

                        if (chunk.choices?.[0]?.delta?.tool_calls) {
                            hasToolCalls = true
                            const deltaToolCalls = chunk.choices[0].delta.tool_calls
                            if (deltaToolCalls) {
                                deltaToolCalls.forEach((tc: any, idx: number) => {
                                    const index = tc.index ?? idx
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

                        if (chunk.choices?.[0]?.finish_reason) {
                            finishReason = chunk.choices[0].finish_reason
                            if (finishReason === 'tool_calls') {
                                hasToolCalls = true
                            }
                        }

                        const split = splitCodexThinkingText(accumulatedContent)
                        displayContent = split.content
                        thinkingContent = split.thinking

                        // Extract usage stats
                        if (chunk.usage) {
                            finalUsage = chunk.usage
                        }

                        // Update message
                        updateStreamingMessage(targetSessionId!, streamingMessageId, { content: displayContent, thinking: thinkingContent })
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { content: displayContent, thinking: thinkingContent })

                    if (canUseTools && hasToolCalls && finishReason === 'tool_calls' && toolCallsAccumulator.filter(tc => tc && tc.id).length > 0) {
                        const reconstructedMessage = {
                            role: 'assistant',
                            content: accumulatedContent,
                            tool_calls: toolCallsAccumulator.filter(tc => tc.id).map((tc: any) => ({
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

                        let toolResult
                        try {
                            toolResult = await handleToolCalls(mockData)
                        } catch (toolError: any) {
                            console.error('Tool calls processing error:', toolError)
                            showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                            toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                        }

                        savedToolResults = toolResult?.toolResults?.map((tr: any) => ({
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
                        })) || null

                        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                            let followUpContent = ''
                            let followUpUsage: any = {}

                            for await (const followUpChunk of streamCodexCompletion(
                                codexModel,
                                [
                                    ...codexMessages,
                                    reconstructedMessage,
                                    ...toolResult.formattedResults
                                ],
                                { tools: codexTools }
                            )) {
                                const followUpDelta = followUpChunk.choices?.[0]?.delta?.content || ''
                                followUpContent += followUpDelta
                                if (followUpChunk.usage) {
                                    followUpUsage = followUpChunk.usage
                                }

                                const merged = accumulatedContent + followUpContent
                                const followSplit = splitCodexThinkingText(merged)
                                displayContent = followSplit.content
                                thinkingContent = followSplit.thinking
                                updateStreamingMessage(targetSessionId!, streamingMessageId, { content: displayContent, thinking: thinkingContent })
                            }

                            accumulatedContent += followUpContent
                            const followSplit = splitCodexThinkingText(accumulatedContent)
                            displayContent = followSplit.content
                            thinkingContent = followSplit.thinking
                            updateStreamingMessage(targetSessionId!, streamingMessageId, { content: displayContent, thinking: thinkingContent })

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
                    const endTimeCodex = performance.now()
                    const latencyCodex = Math.round(endTimeCodex - startTime)

                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: displayContent,
                        thinking: thinkingContent,
                        model: `codex/${codexModel}`,
                        latency: latencyCodex,
                        usage,
                        toolResults: savedToolResults
                    })

                    model = `codex/${codexModel}`
                    responseContent = displayContent
                } catch (streamError: any) {
                    // If streaming fails, update message with error
                    updateStreamingMessage(targetSessionId!, streamingMessageId, { 
                        content: displayContent || accumulatedContent || 'Error: ' + (streamError.message || 'Unknown error'),
                        thinking: thinkingContent
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
                let accumulatedReasoning = ''  // For thinking/reasoning content
                let lastUpdateTime = Date.now()
                const UPDATE_INTERVAL = 50 // ms
                let finalUsage: any = {}
                let totalThinkingTokens = 0  // Track reasoning tokens across all rounds
                let hasToolCalls = false
                let toolCallsAccumulator: any[] = []
                let finishReason: string | null = null
                let savedToolResults: any = null  // Save tool results to persist in final message

                try {
                    // Increase maxTokens for research mode to get comprehensive responses
                    const effectiveMaxTokens = researchMaxRounds > 0 ? 8000 : settings.maxTokens

                    for await (const chunk of streamOpenRouterCompletion(
                        settings.openRouterApiKey,
                        settings.aiModel,
                        openRouterMessages,
                        {
                            temperature: settings.temperature,
                            maxTokens: effectiveMaxTokens,
                            tools: tools && Array.isArray(tools) && tools.length > 0 ? tools : undefined
                        }
                    )) {
                        // Extract content delta
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta

                        // Extract reasoning/thinking delta
                        const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
                        if (reasoningDelta) {
                            accumulatedReasoning += reasoningDelta
                            // Update message with reasoning visible
                            updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                content: accumulatedContent,
                                thinking: accumulatedReasoning
                            })
                        }

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
                            // Track reasoning tokens (thinking tokens)
                            const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
                            if (reasoningTokens > 0) {
                                totalThinkingTokens += reasoningTokens
                            }
                        }

                        // Track finish reason
                        if (chunk.choices?.[0]?.finish_reason) {
                            finishReason = chunk.choices[0].finish_reason
                            if (finishReason === 'tool_calls') {
                                hasToolCalls = true
                            }
                        }

                        // Debounced update
                        const now = Date.now()
                        if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                            updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                content: accumulatedContent,
                                thinking: accumulatedReasoning || undefined
                            })
                            lastUpdateTime = now
                        }
                    }

                    // Final update
                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                        content: accumulatedContent,
                        thinking: accumulatedReasoning || undefined
                    })

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

                        // Add tool calls to the block list instead of mixing into thinking text
                        const webSearchCalls = (toolResult.toolResults || [])
                            .filter((tr: any) => tr.toolCall.name === 'web_search')

                        if (webSearchCalls.length > 0) {
                            // Use local accumulator instead of reading from stale React state
                            // This fixes the issue where blocks are lost due to async state updates

                            if (accumulatedReasoning && accumulatedReasoning.trim().length > 0) {
                                localThinkingBlocks.push({
                                    type: 'thinking',
                                    content: accumulatedReasoning,
                                    duration: 0, // Duration tracked separately
                                    timestamp: Date.now()
                                })
                                accumulatedReasoning = ''
                            }

                            webSearchCalls.forEach((tr: any) => {
                                const searchQuery = typeof tr.toolCall.arguments === 'object'
                                    ? tr.toolCall.arguments?.query
                                    : tr.toolCall.arguments
                                const queryString = typeof searchQuery === 'string' ? searchQuery : String(searchQuery || '')
                                localThinkingBlocks.push({
                                    type: 'searching',
                                    query: queryString,
                                    timestamp: Date.now()
                                })
                            })

                            updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                thinking: '',
                                thinkingDuration: undefined,
                                thinkingBlocks: [...localThinkingBlocks]
                            })
                        }

                        // Save tool results to persist in final message (use toolResult directly)
                        savedToolResults = toolResult?.toolResults?.map((tr: any) => ({
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
                        })) || null

                        if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                            // === RESEARCH LOOP ===
                            // Continue looping until all mandatory searches are done
                            let researchRound = 1
                            let totalSearchCount = toolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
                            let hasMoreToolCalls = true
                            let lastAssistantMessage = reconstructedMessage

                            while (hasMoreToolCalls) {
                                const openRouterTools = getToolsForRequest()
                                let followUpContent = ''
                                let followUpReasoning = ''  // Track reasoning for this round
                                let followUpLastUpdate = Date.now()
                                let followUpUsage: any = {}
                                let followUpToolCalls: any[] = []
                                let followUpAccumulatedContent = accumulatedContent
                                const followUpStartTime = Date.now()
                                // Track if this follow-up is after a search (for fresh thinking block)
                                let justCompletedSearch = totalSearchCount > 0

                                // Update research status - thinking
                                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                    researchStatus: {
                                        currentRound: researchRound,
                                        maxRounds: researchMaxRounds,
                                        isSearching: false
                                    }
                                })

                                // Build follow-up messages with research context (use local variables, not async state)
                                const researchContextMsg = getResearchContext(totalSearchCount, researchMaxRounds, researchMandatory)
                                console.log('[RESEARCH LOOP] Round:', researchRound, 'Searches:', totalSearchCount, 'Max:', researchMaxRounds, 'Mandatory:', researchMandatory)
                                console.log('[RESEARCH LOOP] Research context:', researchContextMsg)

                                // Build follow-up messages - add system message with research context at the start
                                const followUpMessages: any[] = []

                                // Add system prompt with research instructions at the beginning
                                if (researchContextMsg) {
                                    followUpMessages.push({
                                        role: 'system',
                                        content: researchContextMsg
                                    })
                                }

                                // Then add the conversation history
                                followUpMessages.push(...optimizedHistory)
                                followUpMessages.push(lastAssistantMessage)
                                followUpMessages.push(...toolResult.formattedResults)

                                // Determine if we should force tool use (mandatory mode with remaining searches)
                                const remainingSearches = researchMaxRounds - totalSearchCount
                                const forceToolUse = researchMandatory && remainingSearches > 0

                                // Build toolChoice - use specific function format to force web_search
                                let toolChoice: 'auto' | 'required' | { type: 'function'; function: { name: string } } | undefined
                                if (forceToolUse) {
                                    // Force the model to call web_search specifically
                                    toolChoice = { type: 'function', function: { name: 'web_search' } }
                                }

                                // Stream follow-up response
                                for await (const chunk of streamOpenRouterCompletion(
                                    settings.openRouterApiKey,
                                    settings.aiModel,
                                    followUpMessages,
                                    {
                                        temperature: settings.temperature,
                                        maxTokens: researchMaxRounds > 0 ? 8000 : settings.maxTokens,
                                        tools: openRouterTools && Array.isArray(openRouterTools) && openRouterTools.length > 0 ? openRouterTools : undefined,
                                        toolChoice: toolChoice
                                    }
                                )) {
                                    const delta = chunk.choices?.[0]?.delta?.content || ''
                                    followUpContent += delta

                                    // Extract reasoning/thinking delta for this follow-up round
                                    const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
                                    if (reasoningDelta) {
                                        followUpReasoning += reasoningDelta
                                        // After a search, start fresh thinking block. Otherwise append.
                                        const updatedThinking = justCompletedSearch
                                            ? followUpReasoning // Fresh block after search
                                            : accumulatedReasoning + '\n\n---\n\n' + followUpReasoning // Append
                                        updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                            content: accumulatedContent + followUpAccumulatedContent + followUpContent,
                                            thinking: updatedThinking
                                        })
                                    }

                                    // Check for tool calls in follow-up
                                    if (chunk.choices?.[0]?.delta?.tool_calls) {
                                        console.log('[RESEARCH LOOP] Tool calls detected in follow-up:', chunk.choices[0].delta.tool_calls)
                                        const deltaToolCalls = chunk.choices[0].delta.tool_calls
                                        if (deltaToolCalls) {
                                            deltaToolCalls.forEach((tc: any, idx: number) => {
                                                if (!followUpToolCalls[tc.index ?? idx]) {
                                                    followUpToolCalls[tc.index ?? idx] = {
                                                        id: tc.id || '',
                                                        type: tc.type || 'function',
                                                        function: { name: '', arguments: '' }
                                                    }
                                                }
                                                if (tc.function?.name) {
                                                    followUpToolCalls[tc.index ?? idx].function.name += tc.function.name
                                                }
                                                if (tc.function?.arguments) {
                                                    followUpToolCalls[tc.index ?? idx].function.arguments += tc.function.arguments
                                                }
                                            })
                                        }
                                    }

                                    if (chunk.usage) {
                                        followUpUsage = chunk.usage
                                        // Track reasoning tokens (thinking tokens)
                                        const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
                                        if (reasoningTokens > 0) {
                                            totalThinkingTokens += reasoningTokens
                                        }
                                    }

                                    const now = Date.now()
                                    if (now - followUpLastUpdate >= UPDATE_INTERVAL) {
                                        // After search, show fresh thinking. Otherwise append.
                                        const fullThinking = justCompletedSearch
                                            ? followUpReasoning
                                            : accumulatedReasoning + (followUpReasoning ? '\n\n---\n\n' + followUpReasoning : '')
                                        updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                            content: accumulatedContent + followUpAccumulatedContent + followUpContent,
                                            thinking: fullThinking || undefined
                                        })
                                        followUpLastUpdate = now
                                    }
                                }

                                // Add follow-up content and reasoning to accumulated
                                accumulatedContent += followUpContent
                                followUpAccumulatedContent += followUpContent
                                if (followUpReasoning) {
                                    // After a search, start fresh thinking block instead of appending
                                    if (justCompletedSearch) {
                                        accumulatedReasoning = followUpReasoning // Start fresh
                                    } else {
                                        accumulatedReasoning += (accumulatedReasoning ? '\n\n---\n\n' : '') + followUpReasoning
                                    }
                                }
                                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                    content: accumulatedContent,
                                    thinking: accumulatedReasoning || undefined
                                })

                                console.log('[RESEARCH LOOP] Follow-up complete. Content length:', followUpContent.length)
                                console.log('[RESEARCH LOOP] Tool calls found:', followUpToolCalls.length)

                                // Combine usage stats
                                usage = {
                                    inputTokens: (finalUsage.prompt_tokens || 0) + (followUpUsage.prompt_tokens || 0),
                                    outputTokens: (finalUsage.completion_tokens || 0) + (followUpUsage.completion_tokens || 0),
                                    totalTokens: (finalUsage.total_tokens || 0) + (followUpUsage.total_tokens || 0),
                                    thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
                                    cachedInputTokens: ((finalUsage.prompt_cache_tokens || 0) + (followUpUsage.prompt_cache_tokens || 0)) || undefined,
                                    cachedOutputTokens: ((finalUsage.completion_cache_tokens || 0) + (followUpUsage.completion_cache_tokens || 0)) || undefined
                                }

                                // Check if there are more tool calls in the follow-up
                                if (followUpToolCalls.length > 0 && followUpToolCalls.some(tc => tc.function.name)) {
                                    // Reconstruct message with tool calls
                                    const reconstructedFollowUpMessage = {
                                        role: 'assistant',
                                        content: followUpAccumulatedContent,
                                        tool_calls: followUpToolCalls
                                            .filter((tc: any) => tc.function.name)
                                            .map((tc: any) => ({
                                                id: tc.id,
                                                type: tc.type || 'function',
                                                function: {
                                                    name: tc.function.name,
                                                    arguments: tc.function.arguments
                                                }
                                            }))
                                    }

                                    // Process the new tool calls
                                    let nextToolResult
                                    try {
                                        nextToolResult = await handleToolCalls({ choices: [{ message: reconstructedFollowUpMessage }] })
                                    } catch (toolError: any) {
                                        console.error('Tool calls processing error:', toolError)
                                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                                        nextToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                                    }

                                    // Update search count
                                    const newWebSearches = nextToolResult.toolResults?.filter((r: any) => r.toolCall.name === 'web_search').length || 0
                                    totalSearchCount += newWebSearches

                                    // Add tool calls to the block list using local accumulator
                                    // This avoids stale React state issues from sessions.find()
                                    for (const tr of nextToolResult.toolResults || []) {
                                        const toolCall = tr.toolCall

                                        if (toolCall.name === 'web_search') {
                                            const searchQuery = typeof toolCall.arguments === 'object' ? toolCall.arguments?.query : toolCall.arguments
                                            const queryString = typeof searchQuery === 'string' ? searchQuery : String(searchQuery || '')

                                            // If there was thinking content, save it as a completed block
                                            if (accumulatedReasoning && accumulatedReasoning.trim().length > 0) {
                                                localThinkingBlocks.push({
                                                    type: 'thinking',
                                                    content: accumulatedReasoning,
                                                    duration: 0, // Duration tracked separately
                                                    timestamp: Date.now()
                                                })
                                            }

                                            // Update research status - searching (clear thinking to show new block after search)
                                            updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                                thinking: '', // Clear thinking with empty string instead of undefined
                                                thinkingDuration: undefined, // Reset duration for fresh block after search
                                                thinkingBlocks: [...localThinkingBlocks],
                                                researchStatus: {
                                                    currentRound: researchRound,
                                                    maxRounds: researchMaxRounds,
                                                    currentSearch: queryString,
                                                    isSearching: true
                                                }
                                            })

                                            // Reset accumulated reasoning so new thinking starts fresh
                                            accumulatedReasoning = ''
                                        }
                                    }

                                    // Clear searching status after tools complete
                                    // Add search blocks to local accumulator for each web_search tool call
                                    for (const tr of nextToolResult.toolResults || []) {
                                        if (tr.toolCall.name === 'web_search') {
                                            const searchQuery = typeof tr.toolCall.arguments === 'object' ? tr.toolCall.arguments?.query : tr.toolCall.arguments
                                            const queryString = typeof searchQuery === 'string' ? searchQuery : String(searchQuery || '')
                                            localThinkingBlocks.push({
                                                type: 'searching',
                                                query: queryString,
                                                timestamp: Date.now()
                                            })
                                        }
                                    }

                                    updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                        thinking: '', // Clear thinking with empty string for fresh block after search
                                        thinkingDuration: undefined, // Also reset duration for fresh block
                                        thinkingBlocks: [...localThinkingBlocks],
                                        researchStatus: {
                                            currentRound: researchRound,
                                            maxRounds: researchMaxRounds,
                                            isSearching: false
                                        }
                                    })

                                    // Save tool results
                                    const newSavedResults = nextToolResult.toolResults?.map((tr: any) => ({
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
                                    })) || []

                                    if (savedToolResults) {
                                        savedToolResults = [...savedToolResults, ...newSavedResults]
                                    } else {
                                        savedToolResults = newSavedResults
                                    }

                                    // Prepare for next iteration
                                    lastAssistantMessage = reconstructedFollowUpMessage
                                    toolResult = nextToolResult
                                    researchRound++

                                    // Continue loop if there are more searches needed (use local variables, not async state)
                                    const remainingSearches = researchMaxRounds - totalSearchCount
                                    // In mandatory mode, always continue if we haven't completed all searches
                                    // Otherwise, only continue if the model indicated it needs follow-up
                                    hasMoreToolCalls = remainingSearches > 0 && (
                                        researchMandatory || nextToolResult.needsFollowUp
                                    )

                                    console.log('[RESEARCH LOOP] After tool processing. Total searches:', totalSearchCount, 'Remaining:', remainingSearches, 'hasMoreToolCalls:', hasMoreToolCalls)

                                    if (!hasMoreToolCalls) {
                                        // All searches done or no more follow-up needed
                                        break
                                    }
                                } else {
                                    // Model responded with text instead of tools
                                    console.log('[RESEARCH LOOP] No tool calls in follow-up, checking mandatory mode...')
                                    // Check if we're in mandatory mode and need more searches (use local variables, not async state)
                                    const remainingSearches = researchMaxRounds - totalSearchCount
                                    console.log('[RESEARCH LOOP] Remaining searches:', remainingSearches, 'Mandatory:', researchMandatory)
                                    if (researchMandatory && remainingSearches > 0) {
                                        // Force another search by adding a directive message
                                        lastAssistantMessage = {
                                            role: 'assistant',
                                            content: followUpAccumulatedContent,
                                            tool_calls: [] // Empty tool_calls for type compatibility
                                        } as any
                                        // Create a mock tool result that says "you must search again"
                                        toolResult = {
                                            hasTools: true,
                                            toolResults: [],
                                            formattedResults: [{
                                                role: 'system',
                                                content: `\n\n*** MANDATORY: YOU MUST SEARCH ${remainingSearches} MORE TIMES ***\n\nYou attempted to respond without completing all ${researchMaxRounds} required searches.\n\nYou MUST use web_search exactly ${remainingSearches} more time(s) before providing your answer.\n\nDo: Use web_search now with a different query.\nDon't: Provide your answer yet.`
                                            }],
                                            needsFollowUp: true
                                        } as any
                                        // Continue loop
                                        researchRound++
                                        // Don't set hasMoreToolCalls to false - loop again
                                    } else {
                                        // Not mandatory mode or searches complete, exit loop
                                        hasMoreToolCalls = false
                                    }
                                }
                            }

                            // === FINAL ANSWER REQUEST ===
                            // After all searches complete, make one final request to get the model's comprehensive answer
                            // Do NOT force tool use - let the model provide its final answer
                            if (researchMandatory && totalSearchCount >= researchMaxRounds) {
                                console.log('[RESEARCH LOOP] All searches complete. Requesting final answer...')

                                // Get tools for final request
                                const finalTools = getToolsForRequest()

                                // Build final answer request messages
                                const finalAnswerMessages: any[] = []

                                // Add completion message directing the model to answer
                                finalAnswerMessages.push({
                                    role: 'system',
                                    content: `\n\n*** ALL RESEARCH COMPLETE ***\nYou have completed all ${totalSearchCount} required web searches.\n\nYou MUST now provide your FINAL COMPREHENSIVE ANSWER based on all the information gathered.\n\nDo NOT make any more tool calls.\nSynthesize all the search results into a coherent, well-structured response that directly answers the user's question.\nInclude relevant details from the searches and cite sources where appropriate.`
                                })

                                // Add conversation history
                                finalAnswerMessages.push(...optimizedHistory)
                                // Add the last assistant message and tool results
                                finalAnswerMessages.push(lastAssistantMessage)
                                finalAnswerMessages.push(...toolResult.formattedResults)

                                // Make final request WITHOUT forcing tool use
                                let finalAnswerContent = ''
                                let finalAnswerReasoning = ''
                                let finalAnswerUsage: any = {}

                                for await (const chunk of streamOpenRouterCompletion(
                                    settings.openRouterApiKey,
                                    settings.aiModel,
                                    finalAnswerMessages,
                                    {
                                        temperature: settings.temperature,
                                        maxTokens: researchMaxRounds > 0 ? 8000 : settings.maxTokens,
                                        tools: finalTools && Array.isArray(finalTools) && finalTools.length > 0 ? finalTools : undefined
                                        // NO toolChoice - let model decide
                                    }
                                )) {
                                    const delta = chunk.choices?.[0]?.delta?.content || ''
                                    finalAnswerContent += delta

                                    // Extract reasoning/thinking delta for final answer
                                    const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''
                                    if (reasoningDelta) {
                                        finalAnswerReasoning += reasoningDelta
                                        // Append final answer reasoning and update display
                                        const updatedThinking = accumulatedReasoning + (accumulatedReasoning ? '\n\n---\n\n' : '') + finalAnswerReasoning
                                        updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                            content: accumulatedContent + finalAnswerContent,
                                            thinking: updatedThinking
                                        })
                                    }

                                    if (chunk.usage) {
                                        finalAnswerUsage = chunk.usage
                                        // Track reasoning tokens (thinking tokens)
                                        const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || chunk.usage.reasoning_tokens || 0
                                        if (reasoningTokens > 0) {
                                            totalThinkingTokens += reasoningTokens
                                        }
                                    }

                                    const now = Date.now()
                                    if (now - lastUpdateTime >= UPDATE_INTERVAL) {
                                        const fullThinking = accumulatedReasoning + (finalAnswerReasoning ? '\n\n---\n\n' + finalAnswerReasoning : '')
                                        updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                            content: accumulatedContent + finalAnswerContent,
                                            thinking: fullThinking || undefined
                                        })
                                        lastUpdateTime = now
                                    }
                                }

                                // Add final answer content and reasoning to accumulated
                                accumulatedContent += finalAnswerContent
                                if (finalAnswerReasoning) {
                                    accumulatedReasoning += (accumulatedReasoning ? '\n\n---\n\n' : '') + finalAnswerReasoning
                                }

                                // Update the streaming message with the final answer
                                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                                    content: accumulatedContent,
                                    thinking: accumulatedReasoning || undefined,
                                    researchStatus: undefined // Clear research status when complete
                                })

                                // Combine usage stats
                                usage = {
                                    inputTokens: (usage.inputTokens || 0) + (finalAnswerUsage.prompt_tokens || 0),
                                    outputTokens: (usage.outputTokens || 0) + (finalAnswerUsage.completion_tokens || 0),
                                    totalTokens: (usage.totalTokens || 0) + (finalAnswerUsage.total_tokens || 0),
                                    thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
                                    cachedInputTokens: ((usage.cachedInputTokens || 0) + (finalAnswerUsage.prompt_cache_tokens || 0)) || undefined,
                                    cachedOutputTokens: ((usage.cachedOutputTokens || 0) + (finalAnswerUsage.completion_cache_tokens || 0)) || undefined
                                }

                                console.log('[RESEARCH LOOP] Final answer generated. Length:', finalAnswerContent.length)
                            }
                        } else {
                            // No follow-up needed, finalize with existing content
                            const cachedInputTokens = finalUsage.prompt_cache_tokens || 0
                            const cachedOutputTokens = finalUsage.completion_cache_tokens || 0
                            usage = {
                                inputTokens: finalUsage.prompt_tokens || 0,
                                outputTokens: finalUsage.completion_tokens || 0,
                                totalTokens: finalUsage.total_tokens || 0,
                                thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
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
                            thinkingTokens: totalThinkingTokens > 0 ? totalThinkingTokens : undefined,
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

                updateStreamingMessage(targetSessionId!, streamingMessageId, {
                    content: responseContent,
                    thinking: accumulatedReasoning || undefined,
                    model,
                    latency: latencyOpenRouter,
                    usage,
                    toolResults: savedToolResults
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

    // Helper function to get available models based on provider
    const getModelOptions = (): Array<{ id: string; displayName: string }> => {
        const allModels: Array<{ id: string; displayName: string }> = []

        // Add configured models (OpenRouter)
        if (settings.configuredModels) {
            settings.configuredModels.forEach(m => {
                allModels.push({ id: m.code, displayName: m.displayName })
            })
        }

        // Add Ollama models
        if (settings.ollamaModels) {
            settings.ollamaModels.forEach(m => {
                allModels.push({ id: m.code, displayName: m.displayName })
            })
        }

        // Add Perplexity models
        if (settings.perplexityModels) {
            settings.perplexityModels.forEach(m => {
                allModels.push({ id: `perplexity/${m.code}`, displayName: m.displayName })
            })
        }

        // Add Gemini models
        if (settings.geminiModels) {
            settings.geminiModels.forEach(m => {
                allModels.push({ id: m.code, displayName: m.displayName })
            })
        }

        // Add Groq models
        if (settings.groqModels) {
            settings.groqModels.forEach(m => {
                allModels.push({ id: m.code, displayName: m.displayName })
            })
        }

        // Add Codex models
        if (settings.codexModels) {
            settings.codexModels.forEach(m => {
                allModels.push({ id: m.code, displayName: m.displayName })
            })
        }

        return allModels
    }

    // Handle regenerate message
    const handleRegenerate = async (message: any, instruction: string) => {
        if (!currentSessionId || isLoading) return

        // Handle switch_model instruction
        if (instruction === 'switch_model') {
            // Get available models and cycle to the next one
            const models = getModelOptions()
            const currentModelIndex = models.findIndex(m => m.id === settings.aiModel)
            const nextModel = models[(currentModelIndex + 1) % models.length]
            updateSettings({ aiModel: nextModel.id })
            // Continue with regeneration using the new model
        }

        // Store current message as a version
        const versions = message.responseVersions || []
        versions.push({
            id: message.id,
            content: message.content,
            timestamp: message.timestamp,
            instruction: message.instruction,
            model: message.model
        })

        // Clear tool state
        clearToolState()

        setIsLoading(true)

        try {
            // Get conversation history
            const session = sessions.find(s => s.id === currentSessionId)
            if (!session) {
                showToast('Session not found', 'error')
                setIsLoading(false)
                return
            }

            // Find the user message that preceded this assistant message
            const messageIndex = session.messages.findIndex(m => m.id === message.id)
            if (messageIndex <= 0) {
                showToast('Cannot regenerate - no user message found', 'error')
                setIsLoading(false)
                return
            }

            const userMessage = session.messages[messageIndex - 1]
            const conversationHistory = session.messages.slice(0, messageIndex)

            // Build instruction for regeneration
            let systemPrompt = getEffectiveSystemPrompt(settings)
            let userContent = userMessage.content

            if (instruction === 'concise') {
                userContent += '\n\nPlease provide a more concise response.'
            } else if (instruction === 'detailed') {
                userContent += '\n\nPlease provide more details and expand on your response.'
            } else if (instruction === 'custom') {
                // For custom instructions, we'll use a prompt
                userContent += '\n\nPlease reconsider your response.'
            }

            // Remove the original message first (it will be replaced by the regenerated version)
            deleteMessageFromSession(currentSessionId, message.id)

            // Create streaming message to replace the original
            const streamingMessageId = addMessageToSession(currentSessionId, {
                role: 'assistant',
                content: '',
                model: `openrouter/${settings.aiModel}`,
                responseVersions: versions,
                currentVersionIndex: versions.length
            })

            let accumulatedContent = ''
            let accumulatedReasoning = ''

            // Stream the response based on provider
            const streamProvider = settings.aiModel.includes('/') ? settings.aiModel.split('/')[0] : 'openrouter'

            // Build the messages for the API call
            const apiMessages = buildOptimizedContext(conversationHistory, userContent, systemPrompt, settings.aiModel)

            let streamError: Error | null = null

            try {
                // Stream based on provider
                if (streamProvider === 'ollama') {
                    for await (const chunk of streamOllamaCompletion(
                        settings.ollamaUrl,
                        settings.aiModel,
                        apiMessages
                    )) {
                        const delta = chunk.message?.content || ''
                        accumulatedContent += delta
                        updateStreamingMessage(currentSessionId, streamingMessageId, {
                            content: accumulatedContent,
                            thinking: accumulatedReasoning || undefined
                        })
                    }
                } else if (streamProvider === 'perplexity') {
                    for await (const chunk of streamPerplexityCompletion(
                        settings.perplexityApiKey,
                        settings.aiModel,
                        apiMessages
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta
                        updateStreamingMessage(currentSessionId, streamingMessageId, {
                            content: accumulatedContent
                        })
                    }
                } else if (streamProvider === 'gemini') {
                    for await (const chunk of streamGeminiCompletion(
                        settings.geminiApiKey,
                        settings.aiModel,
                        apiMessages
                    )) {
                        const delta = chunk.candidates?.[0]?.content?.parts?.[0]?.text || ''
                        accumulatedContent += delta
                        updateStreamingMessage(currentSessionId, streamingMessageId, {
                            content: accumulatedContent
                        })
                    }
                } else if (streamProvider === 'groq') {
                    for await (const chunk of streamGroqCompletion(
                        settings.groqApiKey,
                        settings.aiModel,
                        apiMessages
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        accumulatedContent += delta
                        updateStreamingMessage(currentSessionId, streamingMessageId, {
                            content: accumulatedContent,
                            thinking: accumulatedReasoning || undefined
                        })
                    }
                } else {
                    // Default to OpenRouter
                    for await (const chunk of streamOpenRouterCompletion(
                        settings.openRouterApiKey,
                        settings.aiModel,
                        apiMessages,
                        {
                            temperature: settings.temperature,
                            maxTokens: settings.maxTokens
                        }
                    )) {
                        const delta = chunk.choices?.[0]?.delta?.content || ''
                        const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning || ''

                        if (reasoningDelta) {
                            accumulatedReasoning += reasoningDelta
                        }
                        if (delta) {
                            accumulatedContent += delta
                        }

                        updateStreamingMessage(currentSessionId, streamingMessageId, {
                            content: accumulatedContent,
                            thinking: accumulatedReasoning || undefined
                        })
                    }
                }
            } catch (error: any) {
                streamError = error
            }

            // Handle completion or error
            if (streamError) {
                // Restore the original message if regeneration failed
                deleteMessageFromSession(currentSessionId, streamingMessageId)
                addMessageToSession(currentSessionId, {
                    role: 'assistant',
                    content: message.content,
                    model: message.model,
                    thinking: message.thinking,
                    responseVersions: message.responseVersions,
                    currentVersionIndex: message.currentVersionIndex
                })
                showToast(streamError.message || 'Failed to regenerate', 'error')
                setIsLoading(false)
            } else {
                // Success - final update
                updateStreamingMessage(currentSessionId, streamingMessageId, {
                    content: accumulatedContent,
                    thinking: accumulatedReasoning || undefined
                })
                setIsLoading(false)
            }

        } catch (error: any) {
            showToast(error.message || 'Failed to regenerate', 'error')
            setIsLoading(false)
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
                background: 'var(--theme-background)',
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
                    padding: '40px 20px',
                    gap: '16px' // Reduced gap to place just above
                }}>
                    {/* Title */}
                    {/* Title - Gradient Zura */}
                    <GradientText
                        useThemeAccent={true}
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
                    <div style={{ width: '100%', maxWidth: '810px' }}>
                        <div style={{
                            position: 'relative',
                            background: 'var(--theme-surface)',
                            borderRadius: '24px',
                            padding: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            border: isInputFocused
                                ? '1px solid var(--theme-accent)'
                                : '1px solid var(--theme-border)',
                            boxShadow: isInputFocused
                                ? 'var(--theme-shadow-lg), 0 0 20px var(--theme-accent-muted)'
                                : 'var(--theme-shadow-md)',
                            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                            minHeight: '110px'
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
                                        onClick={() => {
                                            // If deep research is on, just disable it and enable normal web search
                                            if (settings.deepResearchEnabled) {
                                                updateSettings({
                                                    webSearchEnabled: true,
                                                    deepResearchEnabled: false
                                                })
                                            } else {
                                                // Normal toggle behavior
                                                updateSettings({
                                                    webSearchEnabled: !settings.webSearchEnabled,
                                                    deepResearchEnabled: false
                                                })
                                            }
                                        }}
                                        title={settings.webSearchEnabled && !settings.deepResearchEnabled ? 'Web search enabled - click to disable' : 'Web search disabled - click to enable'}
                                        style={{
                                            background: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info-bg)' : 'transparent',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info)' : '#666',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            height: '100%',
                                            opacity: settings.deepResearchEnabled ? 0.4 : 1
                                        }}
                                        onMouseEnter={e => {
                                            if (settings.webSearchEnabled && !settings.deepResearchEnabled) {
                                                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                                                e.currentTarget.style.color = 'var(--theme-info)'
                                            } else {
                                                e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                                e.currentTarget.style.color = '#999'
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (settings.webSearchEnabled && !settings.deepResearchEnabled) {
                                                e.currentTarget.style.background = 'var(--theme-info-bg)'
                                                e.currentTarget.style.color = 'var(--theme-info)'
                                            } else {
                                                e.currentTarget.style.background = 'transparent'
                                                e.currentTarget.style.color = '#666'
                                            }
                                        }}
                                    >
                                        <Globe size={16} />
                                    </button>

                                    {/* Deep Research Toggle */}
                                    <button
                                        onClick={() => {
                                            updateSettings({
                                                deepResearchEnabled: !settings.deepResearchEnabled,
                                                webSearchEnabled: !settings.deepResearchEnabled // Enable web search when deep research is on, disable when off
                                            })
                                        }}
                                        title={settings.deepResearchEnabled ? 'Deep research enabled - 3 mandatory searches' : 'Deep research disabled - click to enable'}
                                        style={{
                                            background: settings.deepResearchEnabled ? 'var(--theme-accent-muted)' : 'transparent',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: settings.deepResearchEnabled ? 'var(--theme-accent)' : '#666',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            height: '100%'
                                        }}
                                        onMouseEnter={e => {
                                            if (settings.deepResearchEnabled) {
                                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)'
                                                e.currentTarget.style.color = 'var(--theme-accent)'
                                            } else {
                                                e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                                e.currentTarget.style.color = '#999'
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (settings.deepResearchEnabled) {
                                                e.currentTarget.style.background = 'var(--theme-accent-muted)'
                                                e.currentTarget.style.color = 'var(--theme-accent)'
                                            } else {
                                                e.currentTarget.style.background = 'transparent'
                                                e.currentTarget.style.color = '#666'
                                            }
                                        }}
                                    >
                                        <Brain size={16} />
                                    </button>
                                </div>
                                <div className="animate-in-control" style={{ display: 'flex', gap: '8px', animationDelay: '0.4s' }}>
                                    <button style={{
                                        background: 'transparent', border: '1px solid var(--theme-border)', borderRadius: '8px', padding: '10px', color: 'var(--theme-text-secondary)', cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                            e.currentTarget.style.color = '#fff'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'transparent'
                                            e.currentTarget.style.color = 'var(--theme-text-secondary)'
                                        }}
                                    >
                                        <Paperclip size={18} />
                                    </button>
                                    <button
                                        onClick={handleSendMessage}
                                        disabled={isLoading || !input.trim()}
                                        style={{
                                            background: input.trim() ? 'var(--theme-accent)' : 'transparent',
                                            border: '1px solid var(--theme-border)',
                                            borderRadius: '8px',
                                            padding: '10px',
                                            color: input.trim() ? '#000' : 'var(--theme-text-muted)',
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
            background: 'var(--theme-background)',
            position: 'relative'
        }}>
            {/* Header - Session Title */}
            <div style={{
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid var(--theme-border)'
            }}>
                <Sparkles size={20} color="#888" />
                <span style={{ color: '#e0e0e0', fontSize: '0.95rem', fontWeight: 500 }}>
                    {currentSession?.title || 'New Conversation'}
                </span>
                {/* Current Model */}
                <span style={{
                    color: '#fff',
                    fontSize: '0.75rem',
                    background: 'rgba(255,255,255,0.08)',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    marginLeft: '8px',
                    fontWeight: 500
                }}>
                    {(() => {
                        const allModels: Array<{ code: string; displayName: string }> = [
                            ...(settings.ollamaModels || []),
                            ...(settings.perplexityModels || []),
                            ...(settings.configuredModels || []),
                            ...(settings.geminiModels || []),
                            ...(settings.groqModels || []),
                            ...(settings.codexModels || [])
                        ]
                        const currentModel = allModels.find(m => m.code === settings.aiModel)
                        return currentModel?.displayName || settings.aiModel?.split('/').pop() || 'Auto'
                    })()}
                </span>
                <ChevronDown size={14} color="#666" />
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
                <div style={{ width: '100%', maxWidth: '810px', margin: '0 auto' }}>
                    {messages.map((msg, idx) => (
                        <div key={msg.id} data-message-id={msg.id}>
                            {/* Show stored tool results before the message */}
                            {msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
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
                            <MessageBubble
                                message={msg}
                                isStreaming={isLoading && msg.role === 'assistant' && idx === messages.length - 1}
                                onRegenerate={(instruction) => handleRegenerate(msg, instruction)}
                            />
                            {/* Show active tool results after last assistant message (during streaming) */}
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
            <div style={{ width: '100%', maxWidth: '850px', margin: '0 auto', padding: '0 20px 24px 20px' }}>
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

function splitCodexThinkingText(rawText: string): { thinking: string; content: string } {
    const text = rawText || ''
    if (!text) return { thinking: '', content: '' }

    const stripped = text.replace(/^[\s*_]+/, '')
    if (!/^Preparing\b/i.test(stripped)) {
        return { thinking: '', content: text }
    }

    const startIndex = text.indexOf(stripped)
    let boundary = text.indexOf('\n', startIndex)

    if (boundary === -1) {
        let i = startIndex + 1
        while (i < text.length - 1) {
            const curr = text[i]
            const next = text[i + 1]
            if (/[A-Z]/.test(curr) && /[a-z]/.test(next)) {
                const wordMatch = text.slice(i).match(/^[A-Za-z]+/)
                const word = wordMatch ? wordMatch[0].toLowerCase() : ''
                if (word === 'preparing') {
                    i += word.length || 1
                    continue
                }
                boundary = i
                break
            }
            i += 1
        }
    }

    if (boundary === -1) {
        return { thinking: text.slice(startIndex).trim(), content: '' }
    }

    return {
        thinking: text.slice(startIndex, boundary).trim(),
        content: text.slice(boundary).trimStart()
    }
}


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
                backgroundColor: 'var(--theme-surface)',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '800px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                border: '1px solid var(--theme-border)',
                boxShadow: 'var(--theme-shadow-lg)'
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
function MessageBubble({ message, isStreaming = false, onRegenerate }: { message: any; isStreaming?: boolean; onRegenerate?: (instruction: string) => void }) {
    const { settings } = useSettings()
    const [copied, setCopied] = useState(false)
    const [showToolModal, setShowToolModal] = useState(false)
    const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number; showAbove: boolean } | null>(null)
    const [isHoveringInfo, setIsHoveringInfo] = useState(false)
    const [showRegenerateMenu, setShowRegenerateMenu] = useState(false)
    const [displayVersionIndex, setDisplayVersionIndex] = useState(0)
    const infoTriggerRef = useRef<HTMLDivElement>(null)
    
    // Get all versions including current message
    const versions = message.responseVersions || []
    const totalVersions = versions.length + (message.content ? 1 : 0)
    const currentVersionIndex = message.currentVersionIndex || 0
    
    // Reset display version when message changes
    useEffect(() => {
        setDisplayVersionIndex(currentVersionIndex)
    }, [message.id, currentVersionIndex])
    
    // Get the content to display based on version
    const getVersionContent = () => {
        if (displayVersionIndex === versions.length && message.content) {
            // Current message
            return message
        } else if (displayVersionIndex < versions.length) {
            // One of the stored versions
            return versions[displayVersionIndex]
        }
        return message
    }
    
    const displayMessage = getVersionContent()
    const processedContent = convertUrlsToMarkdownLinks(displayMessage?.content || '')
    const isUser = message.role === 'user'
    const hasThinking = typeof displayMessage?.thinking === 'string' && displayMessage?.thinking.trim().length > 0
    const showThinkingSpinner = isStreaming && !hasThinking

    // Handle regenerate action
    const handleRegenerate = (instruction: string) => {
        setShowRegenerateMenu(false)
        if (onRegenerate) {
            onRegenerate(instruction)
        }
    }

    // Handle version navigation
    const navigateVersion = (direction: 'prev' | 'next') => {
        const versions = message.responseVersions || []
        const totalVersions = versions.length + (message.content ? 1 : 0)

        setDisplayVersionIndex(prev => {
            if (direction === 'next' && prev < totalVersions - 1) {
                return prev + 1
            } else if (direction === 'prev' && prev > 0) {
                return prev - 1
            }
            return prev
        })
    }

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
                        backgroundColor: 'var(--theme-surface)',
                        borderRadius: '20px',
                        color: 'var(--theme-text-secondary)',
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

                {/* Single ThinkingBlock component that renders all blocks */}
                {(hasThinking || showThinkingSpinner || (displayMessage.thinkingBlocks && displayMessage.thinkingBlocks.length > 0) || displayMessage.researchStatus?.isSearching) && (
                    <div style={{ marginBottom: '8px' }}>
                        <ThinkingBlockComponent
                            thinking={displayMessage.thinking || ''}
                            isThinking={showThinkingSpinner && !displayMessage.researchStatus?.isSearching}
                            thinkingDuration={displayMessage.thinkingDuration}
                            isSearching={displayMessage.researchStatus?.isSearching || false}
                            searchQuery={displayMessage.researchStatus?.currentSearch}
                            completedBlocks={displayMessage.thinkingBlocks || []}
                        />
                    </div>
                )}

                {/* Research Status Indicator (hidden, using ThinkingBlock instead) */}
                {message.researchStatus && false && (
                    <div style={{
                        marginBottom: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        background: message.researchStatus.isSearching
                            ? 'var(--theme-info-bg)'
                            : 'var(--theme-accent-muted)',
                        border: '1px solid ' + (
                            message.researchStatus.isSearching
                                ? 'rgba(59, 130, 246, 0.3)'
                                : 'rgba(139, 92, 246, 0.3)'
                        ),
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        color: message.researchStatus.isSearching ? 'var(--theme-info)' : 'var(--theme-accent)',
                        fontWeight: 500
                    }}>
                        {message.researchStatus.isSearching ? (
                            <>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                    <path d="M12 2a10 10 0 0 1 10 10" />
                                </svg>
                                <span>
                                    {message.researchStatus.currentSearch
                                        ? `Searching: "${message.researchStatus.currentSearch}"`
                                        : 'Searching...'}
                                </span>
                            </>
                        ) : (
                            <>
                                <Brain size={16} />
                                <span>
                                    Thinking (Round {message.researchStatus.currentRound}/{message.researchStatus.maxRounds})...
                                </span>
                            </>
                        )}
                        <style>{`
                            @keyframes spin {
                                from { transform: rotate(0deg); }
                                to { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}

                {/* Message content */}
                <div className="markdown-content" style={{ color: '#e0e0e0', lineHeight: '1.7', fontSize: '0.95rem' }}>
                    <LazyMarkdown content={processedContent} />
                </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', overflow: 'visible' }}>
                {/* Version Indicator - Show if there are multiple versions */}
                {message.responseVersions && message.responseVersions.length > 0 && (
                    <>
                        {/* Previous Version Button */}
                        <button
                            onClick={() => navigateVersion('prev')}
                            disabled={(message.currentVersionIndex || 0) === 0}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: (message.currentVersionIndex || 0) > 0 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
                                cursor: (message.currentVersionIndex || 0) > 0 ? 'pointer' : 'not-allowed',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        
                        <span style={{ 
                            fontSize: '0.8rem', 
                            color: 'var(--theme-text-secondary)',
                            fontFamily: 'monospace'
                        }}>
                            v{(message.currentVersionIndex || 0) + 1}/{message.responseVersions.length + (message.content ? 1 : 0)}
                        </span>
                        
                        {/* Next Version Button */}
                        <button
                            onClick={() => navigateVersion('next')}
                            disabled={(message.currentVersionIndex || 0) >= message.responseVersions.length - 1}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: (message.currentVersionIndex || 0) < message.responseVersions.length - 1 ? 'var(--theme-text-muted)' : 'var(--theme-border)',
                                cursor: (message.currentVersionIndex || 0) < message.responseVersions.length - 1 ? 'pointer' : 'not-allowed',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </>
                )}

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

                {/* Regenerate Button */}
                {!isStreaming && message.role === 'assistant' && (
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowRegenerateMenu(!showRegenerateMenu)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#666',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px',
                                borderRadius: '4px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#e0e0e0')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#666')}
                        >
                            <RotateCcw size={14} />
                        </button>

                        {/* Regenerate Menu */}
                        {showRegenerateMenu && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: '8px',
                                background: 'var(--theme-surface)',
                                border: '1px solid var(--theme-border)',
                                borderRadius: '12px',
                                padding: '12px',
                                minWidth: '220px',
                                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                <div style={{
                                    color: 'var(--theme-text-muted)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    Regenerate
                                </div>
                                
                                {/* Regenerate Options */}
                                <button
                                    onClick={() => handleRegenerate('switch_model')}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--theme-text-secondary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                        e.currentTarget.style.color = 'var(--theme-text-primary)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = 'var(--theme-text-secondary)'
                                    }}
                                >
                                    <Cpu size={14} color="var(--theme-info)" />
                                    <span>Switch Model</span>
                                </button>
                                
                                <button
                                    onClick={() => handleRegenerate('concise')}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--theme-text-secondary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                        e.currentTarget.style.color = 'var(--theme-text-primary)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = 'var(--theme-text-secondary)'
                                    }}
                                >
                                    <Sparkles size={14} color="var(--theme-accent)" />
                                    <span>More Concise</span>
                                </button>
                                
                                <button
                                    onClick={() => handleRegenerate('detailed')}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--theme-text-secondary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                        e.currentTarget.style.color = 'var(--theme-text-primary)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = 'var(--theme-text-secondary)'
                                    }}
                                >
                                    <FileText size={14} color="var(--theme-success)" />
                                    <span>Add Details</span>
                                </button>
                                
                                <button
                                    onClick={() => handleRegenerate('retry')}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--theme-text-secondary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                        e.currentTarget.style.color = 'var(--theme-text-primary)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = 'var(--theme-text-secondary)'
                                    }}
                                >
                                    <RotateCcw size={14} color="#888" />
                                    <span>Try Again</span>
                                </button>
                                
                                <button
                                    onClick={() => handleRegenerate('custom')}
                                    style={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        color: 'var(--theme-text-secondary)',
                                        fontSize: '0.85rem',
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--theme-surface-hover)'
                                        e.currentTarget.style.color = 'var(--theme-text-primary)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = 'var(--theme-text-secondary)'
                                    }}
                                >
                                    <Edit2 size={14} color="#f59e0b" />
                                    <span>Ask to Change Response...</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

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
                            <div style={{ position: 'relative', display: 'flex' }}>
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
                                {/* Sources badge - show count of web_search results */}
                                {message.toolResults && message.toolResults.filter((tr: any) => tr.toolCall.name === 'web_search').length > 0 && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-6px',
                                        right: '-8px',
                                        background: '#60a5fa',
                                        color: 'white',
                                        fontSize: '0.65rem',
                                        fontWeight: 'bold',
                                        minWidth: '16px',
                                        height: '16px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0 4px',
                                        border: '2px solid var(--theme-bg)',
                                        pointerEvents: 'none'
                                    }}>
                                        {message.toolResults.filter((tr: any) => tr.toolCall.name === 'web_search').length}
                                    </span>
                                )}
                            </div>
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
                                    backgroundColor: 'var(--theme-surface)',
                                    border: '1px solid var(--theme-border)',
                                    borderRadius: '12px',
                                    padding: '16px',
                                    width: message.toolResults && message.toolResults.length > 0 ? '400px' : '280px',
                                    zIndex: 10000,
                                    boxShadow: 'var(--theme-shadow-lg)',
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
                                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>Model</span>
                                <div style={{
                                    background: 'var(--theme-surface)',
                                    color: 'var(--theme-text-secondary)',
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    border: '1px solid var(--theme-border)'
                                }}>
                                    <Cpu size={12} />
                                    <span>{displayMessage.model?.split('/').pop() || 'Unknown Model'}</span>
                                </div>
                            </div>

                            {/* Performance Metrics */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>Performance</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{
                                        background: 'var(--theme-background)',
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
                                            <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>TTFT</span>
                                        </div>
                                        <span style={{ color: 'var(--theme-text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {displayMessage.usage?.ttft ? `${displayMessage.usage.ttft.toFixed(0)}ms` : '—'}
                                        </span>
                                    </div>
                                    <div style={{
                                        background: 'var(--theme-background)',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Zap size={12} color="var(--theme-text-muted)" />
                                            <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>TPS</span>
                                        </div>
                                        <span style={{ color: 'var(--theme-text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {displayMessage.usage?.tps ? displayMessage.usage.tps.toFixed(1) : '—'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{
                                    background: 'var(--theme-background)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={14} color="var(--theme-text-muted)" />
                                        <span style={{ color: 'var(--theme-text-secondary)', fontSize: '0.85rem' }}>Generation Time</span>
                                    </div>
                                    <span style={{ color: 'var(--theme-text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                        {(displayMessage.latency ? displayMessage.latency / 1000 : 0).toFixed(2)}s
                                    </span>
                                </div>
                            </div>

                            {/* Token Usage */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>Token Usage</span>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <div style={{
                                        background: 'var(--theme-background)',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ArrowDown size={12} color="var(--theme-text-muted)" />
                                            <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>Input</span>
                                        </div>
                                        <span style={{ color: 'var(--theme-text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {displayMessage.usage?.inputTokens.toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{
                                        background: 'var(--theme-background)',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ArrowUp size={12} color="var(--theme-text-muted)" />
                                            <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>Output</span>
                                        </div>
                                        <span style={{ color: 'var(--theme-text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {displayMessage.usage?.outputTokens.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                {/* Thinking Tokens - Show if available */}
                                {displayMessage.usage?.thinkingTokens !== undefined && displayMessage.usage.thinkingTokens > 0 && (
                                    <div style={{
                                        background: 'rgba(139, 92, 246, 0.1)',
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        justifyContent: 'space-between',
                                        border: '1px solid rgba(139, 92, 246, 0.2)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Brain size={12} color="rgba(139, 92, 246, 0.8)" />
                                            <span style={{ color: 'rgba(139, 92, 246, 0.9)', fontSize: '0.8rem' }}>Thinking</span>
                                        </div>
                                        <span style={{ color: 'rgba(139, 92, 246, 1)', fontWeight: 600, fontSize: '0.85rem' }}>
                                            {displayMessage.usage.thinkingTokens.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                                <div style={{
                                    background: 'var(--theme-background)',
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Sigma size={14} color="var(--theme-text-muted)" />
                                        <span style={{ color: 'var(--theme-text-secondary)', fontWeight: 600, fontSize: '0.85rem' }}>Total</span>
                                    </div>
                                    <span style={{ color: 'var(--theme-text-primary)', fontWeight: 700, fontSize: '0.9rem' }}>
                                        {displayMessage.usage?.totalTokens.toLocaleString()}
                                    </span>
                                </div>
                            </div>

                            {/* Cache Information */}
                            {((displayMessage.usage?.cachedInputTokens && displayMessage.usage.cachedInputTokens > 0) || 
                              (displayMessage.usage?.cachedOutputTokens && displayMessage.usage.cachedOutputTokens > 0)) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.85rem' }}>Cache Tokens</span>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{
                                            background: 'var(--theme-background)',
                                            padding: '6px 10px',
                                            borderRadius: '8px',
                                            flex: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Database size={12} color="var(--theme-success)" />
                                                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>Input</span>
                                            </div>
                                            <span style={{ color: 'var(--theme-success)', fontWeight: 600, fontSize: '0.85rem' }}>
                                                {displayMessage.usage.cachedInputTokens?.toLocaleString() || '0'}
                                            </span>
                                        </div>
                                        <div style={{
                                            background: 'var(--theme-background)',
                                            padding: '6px 10px',
                                            borderRadius: '8px',
                                            flex: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            justifyContent: 'space-between'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Database size={12} color="var(--theme-success)" />
                                                <span style={{ color: 'var(--theme-text-muted)', fontSize: '0.8rem' }}>Output</span>
                                            </div>
                                            <span style={{ color: 'var(--theme-success)', fontWeight: 600, fontSize: '0.85rem' }}>
                                                {displayMessage.usage.cachedOutputTokens?.toLocaleString() || '0'}
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
                                        marginBottom: '8px'
                                    }}>
                                        <Wrench size={14} color="#60a5fa" />
                                        <span style={{
                                            fontWeight: 600,
                                            color: '#e0e0e0',
                                            fontSize: '0.9rem'
                                        }}>
                                            Tools ({message.toolResults.length})
                                        </span>
                                    </div>

                                    <div style={{
                                        background: 'var(--theme-background)',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '6px'
                                    }}>
                                        {message.toolResults.map((result: any, idx: number) => (
                                            <span
                                                key={idx}
                                                style={{
                                                    background: 'rgba(59, 130, 246, 0.15)',
                                                    color: '#60a5fa',
                                                    padding: '4px 10px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 500
                                                }}
                                            >
                                                {result.toolCall.name.replace(/_/g, ' ')}
                                            </span>
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
    const [showSearchMenu, setShowSearchMenu] = React.useState(false)
    const [searchMenuPos, setSearchMenuPos] = React.useState({ top: 0, left: 0 })
    const searchButtonRef = React.useRef<HTMLDivElement>(null)
    const searchMenuRef = React.useRef<HTMLDivElement>(null)
    const closeTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
    const { settings, updateSettings } = useSettings()

    const imageFiles = attachedFiles?.filter((f: any) => f.type === 'image') || []

    // Calculate menu position on hover
    const handleSearchMouseEnter = () => {
        // Clear any pending close
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current)
            closeTimeoutRef.current = null
        }
        if (searchButtonRef.current) {
            const rect = searchButtonRef.current.getBoundingClientRect()
            setSearchMenuPos({
                top: rect.top - 8,
                left: rect.left
            })
        }
        setShowSearchMenu(true)
    }

    const handleSearchMouseLeave = () => {
        // Delay closing to allow moving to menu
        closeTimeoutRef.current = setTimeout(() => {
            setShowSearchMenu(false)
        }, 200)
    }

    const handleMenuMouseEnter = () => {
        // Cancel any pending close when entering the menu
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current)
            closeTimeoutRef.current = null
        }
        setShowSearchMenu(true)
    }

    const handleMenuMouseLeave = () => {
        // Close when leaving the menu
        setShowSearchMenu(false)
    }

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
                    padding: '0',
                    transition: 'all 0.3s ease',
                    border: isDragging ? '2px dashed #60a5fa' : undefined,
                    minHeight: '110px',
                    width: '100%'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div style={{
                    background: isDragging ? 'var(--theme-info-bg)' : 'var(--theme-surface)',
                    borderRadius: '22px', // Slightly less than outer
                    padding: '10px',
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

                            {/* Search Mode Button with Hover Menu */}
                            <div
                                ref={searchButtonRef}
                                onMouseEnter={handleSearchMouseEnter}
                                onMouseLeave={handleSearchMouseLeave}
                                style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                            >
                                <button
                                    style={{
                                        background: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info-bg)'
                                            : settings.deepResearchEnabled ? 'var(--theme-accent-muted)' : 'transparent',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '6px 8px',
                                        color: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info)'
                                            : settings.deepResearchEnabled ? 'var(--theme-accent)' : '#666',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                        height: '100%'
                                    }}
                                >
                                    <Globe size={16} />
                                </button>
                            </div>

                            {/* Hover Menu - Portal Overlay (rendered separately) */}
                            {showSearchMenu && ReactDOM.createPortal(
                                <div
                                    ref={searchMenuRef}
                                    onMouseEnter={handleMenuMouseEnter}
                                    onMouseLeave={handleMenuMouseLeave}
                                    style={{
                                        position: 'fixed',
                                        top: `${searchMenuPos.top}px`,
                                        left: `${searchMenuPos.left}px`,
                                        transform: 'translateY(-100%)',
                                        marginTop: '-8px',
                                        background: 'var(--theme-surface)',
                                        border: '1px solid var(--theme-border)',
                                        borderRadius: '12px',
                                        padding: '8px',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                                        zIndex: 99999,
                                        minWidth: '160px'
                                    }}
                                >
                                        {/* Normal Chat - No Web Search */}
                                        <button
                                            onClick={() => {
                                                updateSettings({
                                                    webSearchEnabled: false,
                                                    deepResearchEnabled: false
                                                })
                                            }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: (!settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'rgba(255,255,255,0.08)' : 'transparent',
                                                color: '#ccc',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            <MessageCircle size={16} color="#888" />
                                            <span>No Web Search</span>
                                            {!settings.webSearchEnabled && !settings.deepResearchEnabled && (
                                                <Check size={14} color="#60a5fa" style={{ marginLeft: 'auto' }} />
                                            )}
                                        </button>

                                        {/* Web Search */}
                                        <button
                                            onClick={() => {
                                                updateSettings({
                                                    webSearchEnabled: true,
                                                    deepResearchEnabled: false
                                                })
                                            }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: (settings.webSearchEnabled && !settings.deepResearchEnabled) ? 'var(--theme-info-bg)' : 'transparent',
                                                color: '#ccc',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            <Globe size={16} color={settings.webSearchEnabled && !settings.deepResearchEnabled ? 'var(--theme-info)' : '#666'} />
                                            <span>Web Search</span>
                                            {settings.webSearchEnabled && !settings.deepResearchEnabled && (
                                                <Check size={14} color="var(--theme-info)" style={{ marginLeft: 'auto' }} />
                                            )}
                                        </button>

                                        {/* Deep Research */}
                                        <button
                                            onClick={() => {
                                                updateSettings({
                                                    webSearchEnabled: true,
                                                    deepResearchEnabled: true
                                                })
                                            }}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: settings.deepResearchEnabled ? 'var(--theme-accent-muted)' : 'transparent',
                                                color: '#ccc',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            <Brain size={16} color={settings.deepResearchEnabled ? 'var(--theme-accent)' : '#666'} />
                                            <span>Deep Research</span>
                                            {settings.deepResearchEnabled && (
                                                <Check size={14} color="var(--theme-accent)" style={{ marginLeft: 'auto' }} />
                                            )}
                                        </button>
                                    </div>,
                                    document.body
                            )}

                            {/* Images button - show if images are attached */}
                            {imageFiles.length > 0 && (
                                <>
                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                                    <button
                                        onClick={() => setShowImageModal(true)}
                                        title={`${imageFiles.length} image${imageFiles.length > 1 ? 's' : ''} attached`}
                                        style={{
                                            background: 'var(--theme-info-bg)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: 'var(--theme-info)',
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
                                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'
                                            e.currentTarget.style.color = 'var(--theme-info)'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'var(--theme-info-bg)'
                                            e.currentTarget.style.color = 'var(--theme-info)'
                                        }}
                                    >
                                        <Image size={16} />
                                        {imageFiles.length > 1 && (
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                background: 'rgba(59, 130, 246, 0.3)',
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
                                    background: attachedFiles && attachedFiles.length > 0 ? 'var(--theme-accent)' : 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--theme-border)',
                                    borderRadius: '8px',
                                    padding: '10px 14px',
                                    color: attachedFiles && attachedFiles.length > 0 ? '#000' : '#cccccc',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = attachedFiles && attachedFiles.length > 0 ? 'var(--theme-accent-hover)' : 'rgba(255,255,255,0.1)'
                                    e.currentTarget.style.color = attachedFiles && attachedFiles.length > 0 ? '#000' : '#fff'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = attachedFiles && attachedFiles.length > 0 ? 'var(--theme-accent)' : 'rgba(255,255,255,0.05)'
                                    e.currentTarget.style.color = attachedFiles && attachedFiles.length > 0 ? '#000' : '#aaa'
                                }}
                                title={attachedFiles && attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'Attach files (images, PDFs, documents) - or drag & drop'}
                            >
                                <Paperclip size={18} />
                            </button>
                            {/* Send button */}
                            {!isLoading && (
                                <button
                                    onClick={onSend}
                                    disabled={isLoading || (!input.trim() && (!attachedFiles || attachedFiles.length === 0))}
                                    style={{
                                        background: (input.trim() || (attachedFiles && attachedFiles.length > 0)) && !isLoading ? 'var(--theme-accent)' : 'transparent',
                                        border: '1px solid var(--theme-border)',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        color: (input.trim() || (attachedFiles && attachedFiles.length > 0)) && !isLoading ? '#000' : 'var(--theme-text-muted)',
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
                            backgroundColor: 'var(--theme-surface)',
                            borderRadius: '12px',
                            padding: '24px',
                            width: '90%',
                            maxWidth: '800px',
                            maxHeight: '90%',
                            overflowY: 'auto',
                            boxShadow: 'var(--theme-shadow-lg)',
                            position: 'relative',
                            color: 'var(--theme-text-secondary)'
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
                                        background: 'var(--theme-surface)',
                                        border: '1px solid var(--theme-border)'
                                    }}
                                >
                                    <img
                                        src={file.data}
                                        alt={file.name}
                                        style={{
                                            width: '100%',
                                            height: '200px',
                                            objectFit: 'contain',
                                            background: 'var(--theme-background)',
                                            display: 'block'
                                        }}
                                    />
                                    <div style={{
                                        padding: '8px',
                                        borderTop: '1px solid var(--theme-border)'
                                    }}>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            color: 'var(--theme-text-secondary)',
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
