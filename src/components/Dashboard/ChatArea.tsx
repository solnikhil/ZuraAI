import React, { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Sparkles, Copy, Check, ChevronDown, RotateCcw, Download, Share2, Globe, FolderOpen, Mic, Info, Clock, ArrowDown, ArrowUp, Sigma, Cpu, Twitter, MessageCircle, FlaskConical, Video, ShieldCheck, Brain, Trash2, Wrench, X, File, Image, FileText, Bot, Square } from 'lucide-react'
import StarBorder from '../StarBorder'
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
import ThinkingBlock from '../ThinkingBlock'
import { THINKING_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT } from '../../contexts/SettingsContext'
import { getEffectiveSystemPrompt } from '../../utils/promptSelection'
import { exportChatToMarkdown, exportChatToText, downloadFile } from '../../utils/chatExport'
import { useToast } from '../Toast'
import { useToolCalling } from '../../hooks/useToolCalling'
import { ToolCallIndicator, ToolResultDisplay } from '../../tools/ui'
import { hasGeminiFunctionCalls, formatToolResultsForGemini } from '../../tools/adapters/gemini'
import { buildMessagesWithToolResults } from '../../tools/toolManager'
import BlurText from '../BlurText'
import GradientText from '../GradientText'
import AgentCursor, { AgentCursorState } from '../AgentCursor'
import AgentToolExecution, { AgentToolExecutionProps } from '../AgentToolExecution'
import ToolApprovalDialog from '../ToolApprovalDialog'
import {
    shouldContinueAgentLoop,
    extractResponseContent,
    buildToolResultMessage,
    accumulateToolResults,
    hasToolErrors,
    getToolErrors,
    DEFAULT_AGENT_LOOP_CONFIG
} from '../../utils/agentLoop'
import { ToolCallResult } from '../../tools/executor'

export default function ChatArea() {
    const { sessions, currentSessionId, addMessageToSession, createSession, updateSessionTitle, markMessageAsAnimated, deleteSession, clearAllSessions } = useChatHistory()
    const { settings, updateSettings } = useSettings()
    const { showToast } = useToast()
    const { canUseTools, getToolsForRequest, handleToolCalls, toolState, clearToolState, handleApprovalResponse } = useToolCalling()

    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isInputFocused, setIsInputFocused] = useState(false)
    const [isTitleAnimated, setIsTitleAnimated] = useState(false)
    const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; type: string; size: number; data: string; mimeType: string }>>([])
    const [agentStartTime, setAgentStartTime] = useState<number | undefined>(undefined)
    const [agentLoopIteration, setAgentLoopIteration] = useState(0)
    const agentShouldStopRef = useRef(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const currentSession = sessions.find(s => s.id === currentSessionId)
    const messages = currentSession?.messages || []

    // Derive agent cursor state from existing state
    const getAgentCursorState = (): AgentCursorState => {
        if (!settings.agentModeEnabled || !isLoading) return 'idle'
        if (toolState.isProcessingTools || toolState.activeToolCalls.length > 0) return 'executing'
        return 'thinking'
    }

    const agentCursorState = getAgentCursorState()
    const currentToolName = toolState.activeToolCalls.length > 0
        ? toolState.activeToolCalls[0].name
        : undefined

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

    const parseThinkingContent = (rawContent: string): { thinking: string | undefined; answer: string } => {
        if (!rawContent || !rawContent.trim()) {
            return { thinking: undefined, answer: rawContent }
        }

        // #region agent log
        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:parseThinkingContent', message: 'Parsing thinking content', data: { contentLength: rawContent.length, contentPreview: rawContent.substring(0, 200), hasThinkingTag: rawContent.includes('<think>') || rawContent.includes('<think>'), hasThinkingMarker: rawContent.toLowerCase().includes('thinking'), hasFinalAnswer: rawContent.toLowerCase().includes('final answer') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'thinking-fix', hypothesisId: 'B' }) }).catch(() => { }); } catch { } return null })() }
        // #endregion

        // Pattern 1: XML-style tags <think>...</think> or <think>...</think>
        const xmlTagMatch = rawContent.match(/<(?:think|redacted_reasoning)>([\s\S]*?)<\/(?:think|redacted_reasoning)>/i)
        if (xmlTagMatch) {
            const thinkingContent = xmlTagMatch[1].trim()
            const answerContent = rawContent.replace(/<(?:think|redacted_reasoning)>[\s\S]*?<\/(?:think|redacted_reasoning)>/i, '').trim()

            // #region agent log
            { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:parseThinkingContent:xml', message: 'Found XML thinking tags', data: { thinkingLength: thinkingContent.length, answerLength: answerContent.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'thinking-fix', hypothesisId: 'B' }) }).catch(() => { }); } catch { } return null })() }
            // #endregion

            return {
                thinking: thinkingContent || undefined,
                answer: answerContent || rawContent
            }
        }

        // Pattern 2: "**Thinking...**" followed by content, then "**Final Answer:**"
        // More flexible regex that handles various markdown formats
        const thinkingMarkerRegex = /(\*\*)?Thinking\.\.\.?(\*\*)?/i
        const finalAnswerRegex = /(\*\*)?Final\s+Answer:?(\*\*)?/i

        const thinkingIndex = rawContent.search(thinkingMarkerRegex)
        const finalAnswerIndex = rawContent.search(finalAnswerRegex)

        if (thinkingIndex !== -1) {
            // Extract thinking content (from after "Thinking..." marker to "Final Answer:" or end)
            const thinkingStart = rawContent.indexOf(rawContent.match(thinkingMarkerRegex)?.[0] || 'Thinking', thinkingIndex) + (rawContent.match(thinkingMarkerRegex)?.[0]?.length || 0)
            const thinkingEnd = finalAnswerIndex !== -1 ? finalAnswerIndex : rawContent.length

            let thinkingContent = rawContent.substring(thinkingStart, thinkingEnd).trim()

            // Clean up thinking content
            thinkingContent = thinkingContent
                .replace(/^[-=]{3,}\s*/gm, '') // Remove separator lines
                .replace(/[-=]{3,}\s*$/gm, '')
                .replace(/^\*\*Thinking\.\.\.?\*\*\s*/i, '')
                .replace(/^Thinking\.\.\.?\s*/i, '')
                .trim()

            // Extract answer content
            let answerContent: string
            if (finalAnswerIndex !== -1) {
                const finalAnswerMatch = rawContent.match(finalAnswerRegex)
                const answerStart = finalAnswerIndex + (finalAnswerMatch?.[0]?.length || 0)
                answerContent = rawContent.substring(answerStart).trim()
            } else {
                // No Final Answer marker - try to find where thinking ends naturally
                // Look for double newline or significant content change
                const afterThinking = rawContent.substring(thinkingEnd)
                const naturalBreak = afterThinking.search(/\n\n+[A-Z]|\n\n+\d+\.|\n\n+\*\*/)
                answerContent = naturalBreak !== -1
                    ? afterThinking.substring(naturalBreak).replace(/^\n+/, '').trim()
                    : afterThinking.trim()

                // If still empty or same as raw, use raw content but remove thinking section
                if (!answerContent || answerContent === rawContent) {
                    answerContent = rawContent.replace(
                        new RegExp(`.*?${thinkingMarkerRegex.source}[\\s\\S]*?(?=\\n\\n|$)`, 'i'),
                        ''
                    ).trim()
                }
            }

            // Ensure we have valid content
            if (!answerContent || answerContent === rawContent) {
                answerContent = rawContent.replace(
                    new RegExp(`.*?${thinkingMarkerRegex.source}[\\s\\S]*?(?=\\n\\n|$)`, 'i'),
                    ''
                ).trim() || rawContent
            }

            // #region agent log
            { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:parseThinkingContent:markdown', message: 'Found markdown thinking format', data: { thinkingLength: thinkingContent.length, answerLength: answerContent.length, hasFinalAnswer: finalAnswerIndex !== -1 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'thinking-fix', hypothesisId: 'B' }) }).catch(() => { }); } catch { } return null })() }
            // #endregion

            return {
                thinking: thinkingContent || undefined,
                answer: answerContent || rawContent
            }
        }

        // Pattern 3: Just "Final Answer:" without explicit thinking marker
        // Treat everything before as thinking
        if (finalAnswerIndex !== -1) {
            const finalAnswerMatch = rawContent.match(finalAnswerRegex)
            const answerStart = finalAnswerIndex + (finalAnswerMatch?.[0]?.length || 0)
            const thinkingPart = rawContent.substring(0, finalAnswerIndex).trim()
            const answerPart = rawContent.substring(answerStart).trim()

            const cleanThinking = thinkingPart
                .replace(/^[-=]{3,}\s*/gm, '')
                .replace(/[-=]{3,}\s*$/gm, '')
                .replace(/\*\*Thinking\.\.\.?\*\*/gi, '')
                .replace(/^Thinking\.\.\.?\s*/gim, '')
                .trim()

            // #region agent log
            { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:parseThinkingContent:finalAnswerOnly', message: 'Found Final Answer without thinking marker', data: { thinkingLength: cleanThinking.length, answerLength: answerPart.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'thinking-fix', hypothesisId: 'B' }) }).catch(() => { }); } catch { } return null })() }
            // #endregion

            return {
                thinking: cleanThinking || undefined,
                answer: answerPart || rawContent
            }
        }

        // No thinking format detected
        // #region agent log
        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:parseThinkingContent:none', message: 'No thinking format detected', data: { contentLength: rawContent.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'thinking-fix', hypothesisId: 'B' }) }).catch(() => { }); } catch { } return null })() }
        // #endregion

        return { thinking: undefined, answer: rawContent }
    }

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
        // #region agent log
        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:handlePaste', message: 'Paste event triggered', data: { itemsCount: event.clipboardData.items.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'paste-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
        // #endregion

        const items = event.clipboardData.items
        const files: File[] = []

        for (let i = 0; i < items.length; i++) {
            const item = items[i]
            if (item.kind === 'file') {
                const file = item.getAsFile()
                if (file) {
                    // #region agent log
                    { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:handlePaste:fileFound', message: 'Found file in clipboard', data: { fileName: file.name, fileType: file.type, fileSize: file.size }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'paste-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                    // #endregion
                    files.push(file)
                }
            }
        }

        if (files.length > 0) {
            event.preventDefault()
            // #region agent log
            { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:handlePaste:processing', message: 'Processing pasted files', data: { filesCount: files.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'paste-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
            // #endregion
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

        // Reset agent loop state
        agentShouldStopRef.current = false
        setAgentLoopIteration(0)

        const userMessageContent = input
        const filesToSend = [...attachedFiles]
        setInput('')
        setAttachedFiles([])
        setIsLoading(true)

        // Track agent execution start time for duration display
        if (settings.agentModeEnabled) {
            setAgentStartTime(Date.now())
        }

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
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
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

                // #region agent log
                { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:ollama:initialRequest', message: 'Making initial Ollama request', data: { hasTools: !!ollamaTools, toolsCount: ollamaTools?.length || 0, canUseTools, messageCount: optimizedHistory.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'follow-up-tools-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                // #endregion

                const res = await generateOllamaCompletion(
                    settings.ollamaUrl,
                    settings.aiModel,
                    optimizedHistory,
                    {
                        temperature: settings.temperature,
                        tools: ollamaTools
                    }
                )

                // Check for tool calls (Ollama returns tool_calls in message if present)
                if (canUseTools && (res.message as any)?.tool_calls && Array.isArray((res.message as any).tool_calls) && (res.message as any).tool_calls.length > 0) {
                    // #region agent log
                    { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:ollama:beforeToolCalls', message: 'About to process tool calls', data: { toolCallsCount: (res.message as any)?.tool_calls?.length || 0 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                    // #endregion

                    // Process tool calls with error handling
                    let toolResult
                    try {
                        toolResult = await handleToolCalls({ choices: [{ message: res.message }] })
                    } catch (toolError: any) {
                        // #region agent log
                        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:ollama:toolCallsError', message: 'Tool calls processing failed', data: { errorMessage: toolError?.message, errorType: toolError?.constructor?.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                        // #endregion

                        console.error('Tool calls processing error:', toolError)
                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                    }

                    if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                        // Agent loop: continue while AI returns tool calls
                        let currentMessages = [
                            ...optimizedHistory,
                            res.message,
                            ...toolResult.formattedResults
                        ]
                        let allToolResults: ToolCallResult[] = [...toolResult.toolResults]
                        let iteration = 1
                        let currentRes = res

                        // Agent loop - continue while there are tool calls and we haven't hit max iterations
                        while (settings.agentModeEnabled && iteration < DEFAULT_AGENT_LOOP_CONFIG.maxIterations && !agentShouldStopRef.current) {
                            setAgentLoopIteration(iteration)

                            const loopRes = await generateOllamaCompletion(
                                settings.ollamaUrl,
                                settings.aiModel,
                                currentMessages,
                                {
                                    temperature: settings.temperature,
                                    tools: ollamaTools
                                }
                            )

                            // Accumulate usage
                            usage = {
                                inputTokens: usage.inputTokens + (loopRes.prompt_eval_count || 0),
                                outputTokens: usage.outputTokens + (loopRes.eval_count || 0),
                                totalTokens: usage.totalTokens + ((loopRes.prompt_eval_count || 0) + (loopRes.eval_count || 0))
                            }

                            // Check if there are more tool calls
                            if ((loopRes.message as any)?.tool_calls && Array.isArray((loopRes.message as any).tool_calls) && (loopRes.message as any).tool_calls.length > 0) {
                                // Process tool calls
                                let loopToolResult
                                try {
                                    loopToolResult = await handleToolCalls({ choices: [{ message: loopRes.message }] })
                                } catch (toolError: any) {
                                    console.error('Tool calls processing error in loop:', toolError)
                                    showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                                    loopToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                                }

                                if (loopToolResult.needsFollowUp && loopToolResult.formattedResults.length > 0) {
                                    // Accumulate tool results
                                    allToolResults = accumulateToolResults(allToolResults, loopToolResult.toolResults)

                                    // Build next iteration messages
                                    currentMessages = [
                                        ...currentMessages,
                                        loopRes.message,
                                        ...loopToolResult.formattedResults
                                    ]
                                    currentRes = loopRes
                                    iteration++
                                } else {
                                    // No more follow-up needed
                                    responseContent = loopRes.message?.content || "Error: No response"
                                    break
                                }
                            } else {
                                // No more tool calls - we have the final response
                                responseContent = loopRes.message?.content || "Error: No response"
                                break
                            }
                        }

                        // If we exited the loop without setting responseContent (non-agent mode or first iteration)
                        if (!responseContent) {
                            const followUpRes = await generateOllamaCompletion(
                                settings.ollamaUrl,
                                settings.aiModel,
                                currentMessages,
                                {
                                    temperature: settings.temperature,
                                    tools: ollamaTools
                                }
                            )

                            responseContent = followUpRes.message?.content || "Error: No response"
                            usage = {
                                inputTokens: usage.inputTokens + (followUpRes.prompt_eval_count || 0),
                                outputTokens: usage.outputTokens + (followUpRes.eval_count || 0),
                                totalTokens: usage.totalTokens + ((followUpRes.prompt_eval_count || 0) + (followUpRes.eval_count || 0))
                            }
                        }

                        // Add initial usage
                        usage = {
                            inputTokens: usage.inputTokens + (res.prompt_eval_count || 0),
                            outputTokens: usage.outputTokens + (res.eval_count || 0),
                            totalTokens: usage.totalTokens + ((res.prompt_eval_count || 0) + (res.eval_count || 0))
                        }
                    } else {
                        responseContent = res.message?.content || "Error: No response"
                        usage = {
                            inputTokens: res.prompt_eval_count || 0,
                            outputTokens: res.eval_count || 0,
                            totalTokens: (res.prompt_eval_count || 0) + (res.eval_count || 0)
                        }
                    }
                } else {
                    responseContent = res.message?.content || "Error: No response"
                    usage = {
                        inputTokens: res.prompt_eval_count || 0,
                        outputTokens: res.eval_count || 0,
                        totalTokens: (res.prompt_eval_count || 0) + (res.eval_count || 0)
                    }
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

                // #region agent log
                { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:gemini:initialRequest', message: 'Making initial Gemini request', data: { hasTools: !!geminiTools, functionsCount: geminiTools?.function_declarations?.length || 0, canUseTools, messageCount: optimizedHistory.length, hasImage: !!firstImage }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'follow-up-tools-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                // #endregion

                const res = await generateGeminiCompletion(
                    settings.geminiApiKey,
                    settings.aiModel,
                    geminiMessages,
                    {
                        temperature: settings.temperature,
                        maxOutputTokens: settings.maxTokens,
                        tools: geminiTools
                    }
                )

                // Check for function calls
                if (canUseTools && hasGeminiFunctionCalls(res)) {
                    // #region agent log
                    { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:gemini:beforeToolCalls', message: 'About to process tool calls', data: { hasFunctionCalls: hasGeminiFunctionCalls(res) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                    // #endregion

                    // Process tool calls with error handling
                    let toolResult
                    try {
                        toolResult = await handleToolCalls(res)
                    } catch (toolError: any) {
                        // #region agent log
                        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:gemini:toolCallsError', message: 'Tool calls processing failed', data: { errorMessage: toolError?.message, errorType: toolError?.constructor?.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                        // #endregion

                        console.error('Tool calls processing error:', toolError)
                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                    }

                    if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                        // Agent loop: continue while AI returns tool calls
                        let currentMessages: any[] = [
                            ...optimizedHistory,
                            {
                                role: 'assistant',
                                content: res.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ') || ''
                            },
                            {
                                role: 'function',
                                parts: toolResult.formattedResults
                            }
                        ]
                        let allToolResults: ToolCallResult[] = [...toolResult.toolResults]
                        let iteration = 1
                        usage = {
                            inputTokens: res.usageMetadata?.promptTokenCount || 0,
                            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
                            totalTokens: res.usageMetadata?.totalTokenCount || 0
                        }

                        // Agent loop - continue while there are tool calls and we haven't hit max iterations
                        while (settings.agentModeEnabled && iteration < DEFAULT_AGENT_LOOP_CONFIG.maxIterations && !agentShouldStopRef.current) {
                            setAgentLoopIteration(iteration)

                            const loopRes = await generateGeminiCompletion(
                                settings.geminiApiKey,
                                settings.aiModel,
                                currentMessages,
                                {
                                    temperature: settings.temperature,
                                    maxOutputTokens: settings.maxTokens,
                                    tools: geminiTools
                                }
                            )

                            // Accumulate usage
                            usage = {
                                inputTokens: usage.inputTokens + (loopRes.usageMetadata?.promptTokenCount || 0),
                                outputTokens: usage.outputTokens + (loopRes.usageMetadata?.candidatesTokenCount || 0),
                                totalTokens: usage.totalTokens + (loopRes.usageMetadata?.totalTokenCount || 0)
                            }

                            // Check if there are more function calls
                            if (hasGeminiFunctionCalls(loopRes)) {
                                // Process tool calls
                                let loopToolResult
                                try {
                                    loopToolResult = await handleToolCalls(loopRes)
                                } catch (toolError: any) {
                                    console.error('Tool calls processing error in loop:', toolError)
                                    showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                                    loopToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                                }

                                if (loopToolResult.needsFollowUp && loopToolResult.formattedResults.length > 0) {
                                    // Accumulate tool results
                                    allToolResults = accumulateToolResults(allToolResults, loopToolResult.toolResults)

                                    // Build next iteration messages
                                    currentMessages = [
                                        ...currentMessages,
                                        {
                                            role: 'assistant',
                                            content: loopRes.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join(' ') || ''
                                        },
                                        {
                                            role: 'function',
                                            parts: loopToolResult.formattedResults
                                        }
                                    ]
                                    iteration++
                                } else {
                                    // No more follow-up needed
                                    responseContent = loopRes.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No response"
                                    break
                                }
                            } else {
                                // No more function calls - we have the final response
                                responseContent = loopRes.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No response"
                                break
                            }
                        }

                        // If we exited the loop without setting responseContent (non-agent mode or first iteration)
                        if (!responseContent) {
                            const followUpRes = await generateGeminiCompletion(
                                settings.geminiApiKey,
                                settings.aiModel,
                                currentMessages,
                                {
                                    temperature: settings.temperature,
                                    maxOutputTokens: settings.maxTokens,
                                    tools: geminiTools
                                }
                            )

                            responseContent = followUpRes.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No response"
                            usage = {
                                inputTokens: usage.inputTokens + (followUpRes.usageMetadata?.promptTokenCount || 0),
                                outputTokens: usage.outputTokens + (followUpRes.usageMetadata?.candidatesTokenCount || 0),
                                totalTokens: usage.totalTokens + (followUpRes.usageMetadata?.totalTokenCount || 0)
                            }
                        }
                    } else {
                        responseContent = res.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No response"
                        usage = {
                            inputTokens: res.usageMetadata?.promptTokenCount || 0,
                            outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
                            totalTokens: res.usageMetadata?.totalTokenCount || 0
                        }
                    }
                } else {
                    responseContent = res.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No response"
                    usage = {
                        inputTokens: res.usageMetadata?.promptTokenCount || 0,
                        outputTokens: res.usageMetadata?.candidatesTokenCount || 0,
                        totalTokens: res.usageMetadata?.totalTokenCount || 0
                    }
                }

                model = `gemini/${settings.aiModel}`
            } else if (settings.modelProvider === 'groq') {
                // Get tools if enabled (Groq uses OpenAI-compatible format)
                const tools = canUseTools ? getToolsForRequest() : null
                const groqTools = tools && Array.isArray(tools) ? tools : undefined

                // #region agent log
                { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:groq:initialRequest', message: 'Making initial Groq request', data: { hasTools: !!groqTools, toolsCount: groqTools?.length || 0, canUseTools, messageCount: optimizedHistory.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'follow-up-tools-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                // #endregion

                const res = await generateGroqCompletion(
                    settings.groqApiKey,
                    settings.aiModel,
                    optimizedHistory,
                    {
                        temperature: settings.temperature,
                        max_tokens: settings.maxTokens,
                        tools: groqTools
                    }
                )

                // Check for tool calls
                if (canUseTools && res.choices?.[0]?.message?.tool_calls) {
                    // #region agent log
                    { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:groq:beforeToolCalls', message: 'About to process tool calls', data: { toolCallsCount: res.choices?.[0]?.message?.tool_calls?.length || 0 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                    // #endregion

                    // Process tool calls with error handling
                    let toolResult
                    try {
                        toolResult = await handleToolCalls(res)
                    } catch (toolError: any) {
                        // #region agent log
                        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:groq:toolCallsError', message: 'Tool calls processing failed', data: { errorMessage: toolError?.message, errorType: toolError?.constructor?.name, stack: toolError?.stack?.substring(0, 500) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                        // #endregion

                        console.error('Tool calls processing error:', toolError)
                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                        // Continue with response content even if tools failed
                        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                    }

                    if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                        // Agent loop: continue while AI returns tool calls
                        let currentMessages = [
                            ...optimizedHistory,
                            res.choices[0].message,
                            ...toolResult.formattedResults
                        ]
                        let allToolResults: ToolCallResult[] = [...toolResult.toolResults]
                        let iteration = 1
                        usage = {
                            inputTokens: res.usage?.prompt_tokens || 0,
                            outputTokens: res.usage?.completion_tokens || 0,
                            totalTokens: res.usage?.total_tokens || 0
                        }

                        // Agent loop - continue while there are tool calls and we haven't hit max iterations
                        while (settings.agentModeEnabled && iteration < DEFAULT_AGENT_LOOP_CONFIG.maxIterations && !agentShouldStopRef.current) {
                            setAgentLoopIteration(iteration)

                            const loopRes = await generateGroqCompletion(
                                settings.groqApiKey,
                                settings.aiModel,
                                currentMessages,
                                {
                                    temperature: settings.temperature,
                                    max_tokens: settings.maxTokens,
                                    tools: groqTools
                                }
                            )

                            // Accumulate usage
                            usage = {
                                inputTokens: usage.inputTokens + (loopRes.usage?.prompt_tokens || 0),
                                outputTokens: usage.outputTokens + (loopRes.usage?.completion_tokens || 0),
                                totalTokens: usage.totalTokens + (loopRes.usage?.total_tokens || 0)
                            }

                            // Check if there are more tool calls
                            if (loopRes.choices?.[0]?.message?.tool_calls && loopRes.choices[0].message.tool_calls.length > 0) {
                                // Process tool calls
                                let loopToolResult
                                try {
                                    loopToolResult = await handleToolCalls(loopRes)
                                } catch (toolError: any) {
                                    console.error('Tool calls processing error in loop:', toolError)
                                    showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                                    loopToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                                }

                                if (loopToolResult.needsFollowUp && loopToolResult.formattedResults.length > 0) {
                                    // Accumulate tool results
                                    allToolResults = accumulateToolResults(allToolResults, loopToolResult.toolResults)

                                    // Build next iteration messages
                                    currentMessages = [
                                        ...currentMessages,
                                        loopRes.choices[0].message,
                                        ...loopToolResult.formattedResults
                                    ]
                                    iteration++
                                } else {
                                    // No more follow-up needed
                                    responseContent = loopRes.choices?.[0]?.message?.content || "Error: No response"
                                    break
                                }
                            } else {
                                // No more tool calls - we have the final response
                                responseContent = loopRes.choices?.[0]?.message?.content || "Error: No response"
                                break
                            }
                        }

                        // If we exited the loop without setting responseContent (non-agent mode or first iteration)
                        if (!responseContent) {
                            const followUpRes = await generateGroqCompletion(
                                settings.groqApiKey,
                                settings.aiModel,
                                currentMessages,
                                {
                                    temperature: settings.temperature,
                                    max_tokens: settings.maxTokens,
                                    tools: groqTools
                                }
                            )

                            responseContent = followUpRes.choices?.[0]?.message?.content || "Error: No response"
                            usage = {
                                inputTokens: usage.inputTokens + (followUpRes.usage?.prompt_tokens || 0),
                                outputTokens: usage.outputTokens + (followUpRes.usage?.completion_tokens || 0),
                                totalTokens: usage.totalTokens + (followUpRes.usage?.total_tokens || 0)
                            }
                        }
                    } else {
                        responseContent = res.choices?.[0]?.message?.content || "Error: No response"
                        usage = {
                            inputTokens: res.usage?.prompt_tokens || 0,
                            outputTokens: res.usage?.completion_tokens || 0,
                            totalTokens: res.usage?.total_tokens || 0
                        }
                    }
                } else {
                    responseContent = res.choices?.[0]?.message?.content || "Error: No response"
                    usage = {
                        inputTokens: res.usage?.prompt_tokens || 0,
                        outputTokens: res.usage?.completion_tokens || 0,
                        totalTokens: res.usage?.total_tokens || 0
                    }
                }

                model = `groq/${settings.aiModel}`
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

                const requestBody: any = {
                    model: settings.aiModel,
                    messages: openRouterMessages
                }

                // Add tools if enabled and supported
                const tools = getToolsForRequest()

                // #region agent log
                { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:openrouter:initialRequest', message: 'Making initial OpenRouter request', data: { hasTools: !!tools, toolsCount: Array.isArray(tools) ? tools.length : 0, canUseTools, messageCount: optimizedHistory.length, hasImage: !!firstImage }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'follow-up-tools-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                // #endregion

                if (tools && Array.isArray(tools) && tools.length > 0) {
                    requestBody.tools = tools
                    requestBody.tool_choice = 'auto'  // Let AI decide when to use tools
                }

                const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${settings.openRouterApiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody)
                })

                if (!res.ok) {
                    if (res.status === 429) {
                        throw new Error('Rate limit exceeded. Please slow down and try again.')
                    } else if (res.status === 401 || res.status === 403) {
                        throw new Error('Invalid API key. Please check your API key in Settings.')
                    } else {
                        const errorData = await res.json().catch(() => ({}))
                        throw new Error(errorData.error?.message || `API Error: ${res.status}`)
                    }
                }

                const data = await res.json()

                // Check for tool calls
                if (canUseTools && data.choices?.[0]?.message?.tool_calls) {
                    // #region agent log
                    { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:openrouter:beforeToolCalls', message: 'About to process tool calls', data: { toolCallsCount: data.choices?.[0]?.message?.tool_calls?.length || 0 }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                    // #endregion

                    // Process tool calls with error handling
                    let toolResult
                    try {
                        toolResult = await handleToolCalls(data)
                    } catch (toolError: any) {
                        // #region agent log
                        { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:openrouter:toolCallsError', message: 'Tool calls processing failed', data: { errorMessage: toolError?.message, errorType: toolError?.constructor?.name }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'black-screen-fix', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                        // #endregion

                        console.error('Tool calls processing error:', toolError)
                        showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                        toolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                    }

                    if (toolResult.needsFollowUp && toolResult.formattedResults.length > 0) {
                        // Agent loop: continue while AI returns tool calls
                        let currentMessages = [
                            ...optimizedHistory,
                            data.choices[0].message,
                            ...toolResult.formattedResults
                        ]
                        let allToolResults: ToolCallResult[] = [...toolResult.toolResults]
                        let iteration = 1
                        usage = {
                            inputTokens: data.usage?.prompt_tokens || 0,
                            outputTokens: data.usage?.completion_tokens || 0,
                            totalTokens: data.usage?.total_tokens || 0
                        }

                        const openRouterTools = getToolsForRequest()

                        // Agent loop - continue while there are tool calls and we haven't hit max iterations
                        while (settings.agentModeEnabled && iteration < DEFAULT_AGENT_LOOP_CONFIG.maxIterations && !agentShouldStopRef.current) {
                            setAgentLoopIteration(iteration)

                            const loopBody: any = {
                                model: settings.aiModel,
                                messages: currentMessages
                            }

                            if (openRouterTools && Array.isArray(openRouterTools) && openRouterTools.length > 0) {
                                loopBody.tools = openRouterTools
                                loopBody.tool_choice = 'auto'
                            }

                            const loopRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${settings.openRouterApiKey}`, "Content-Type": "application/json" },
                                body: JSON.stringify(loopBody)
                            })

                            if (!loopRes.ok) {
                                throw new Error(`Agent loop API Error: ${loopRes.status}`)
                            }

                            const loopData = await loopRes.json()

                            // Accumulate usage
                            usage = {
                                inputTokens: usage.inputTokens + (loopData.usage?.prompt_tokens || 0),
                                outputTokens: usage.outputTokens + (loopData.usage?.completion_tokens || 0),
                                totalTokens: usage.totalTokens + (loopData.usage?.total_tokens || 0)
                            }

                            // Check if there are more tool calls
                            if (loopData.choices?.[0]?.message?.tool_calls && loopData.choices[0].message.tool_calls.length > 0) {
                                // Process tool calls
                                let loopToolResult
                                try {
                                    loopToolResult = await handleToolCalls(loopData)
                                } catch (toolError: any) {
                                    console.error('Tool calls processing error in loop:', toolError)
                                    showToast(`Tool execution error: ${toolError.message || 'Unknown error'}`, 'error')
                                    loopToolResult = { hasTools: false, toolResults: [], formattedResults: [], needsFollowUp: false }
                                }

                                if (loopToolResult.needsFollowUp && loopToolResult.formattedResults.length > 0) {
                                    // Accumulate tool results
                                    allToolResults = accumulateToolResults(allToolResults, loopToolResult.toolResults)

                                    // Build next iteration messages
                                    currentMessages = [
                                        ...currentMessages,
                                        loopData.choices[0].message,
                                        ...loopToolResult.formattedResults
                                    ]
                                    iteration++
                                } else {
                                    // No more follow-up needed
                                    responseContent = loopData.choices?.[0]?.message?.content || "Error: No response"
                                    break
                                }
                            } else {
                                // No more tool calls - we have the final response
                                responseContent = loopData.choices?.[0]?.message?.content || "Error: No response"
                                break
                            }
                        }

                        // If we exited the loop without setting responseContent (non-agent mode or first iteration)
                        if (!responseContent) {
                            const followUpBody: any = {
                                model: settings.aiModel,
                                messages: currentMessages
                            }

                            if (openRouterTools && Array.isArray(openRouterTools) && openRouterTools.length > 0) {
                                followUpBody.tools = openRouterTools
                            }

                            const followUpRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                                method: "POST",
                                headers: { "Authorization": `Bearer ${settings.openRouterApiKey}`, "Content-Type": "application/json" },
                                body: JSON.stringify(followUpBody)
                            })

                            if (!followUpRes.ok) {
                                throw new Error(`Follow-up API Error: ${followUpRes.status}`)
                            }

                            const followUpData = await followUpRes.json()
                            responseContent = followUpData.choices?.[0]?.message?.content || "Error: No response"
                            usage = {
                                inputTokens: usage.inputTokens + (followUpData.usage?.prompt_tokens || 0),
                                outputTokens: usage.outputTokens + (followUpData.usage?.completion_tokens || 0),
                                totalTokens: usage.totalTokens + (followUpData.usage?.total_tokens || 0)
                            }
                        }
                    } else {
                        responseContent = data.choices?.[0]?.message?.content || "Error: No response"
                        usage = {
                            inputTokens: data.usage?.prompt_tokens || 0,
                            outputTokens: data.usage?.completion_tokens || 0,
                            totalTokens: data.usage?.total_tokens || 0
                        }
                    }
                } else {
                    responseContent = data.choices?.[0]?.message?.content || "Error: No response"
                    usage = {
                        inputTokens: data.usage?.prompt_tokens || 0,
                        outputTokens: data.usage?.completion_tokens || 0,
                        totalTokens: data.usage?.total_tokens || 0
                    }
                }

                model = `openrouter/${settings.aiModel}`
            }

            const endTime = performance.now()
            const latency = Math.round(endTime - startTime)

            let thinking: string | undefined = undefined

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
            let answer = responseContent

            if (settings.thinkingModeEnabled) {
                const parsed = parseThinkingContent(responseContent)

                // #region agent log
                { (() => { try { fetch('http://127.0.0.1:7242/ingest/a06d2b6c-5514-4a1c-82da-b1c2599514d9', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'src/components/Dashboard/ChatArea.tsx:thinkingMode:parsed', message: 'Parsed thinking content', data: { hasThinking: !!parsed.thinking, thinkingLength: parsed.thinking?.length || 0, answerLength: parsed.answer.length, rawLength: responseContent.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'thinking-mode-always', hypothesisId: 'A' }) }).catch(() => { }); } catch { } return null })() }
                // #endregion

                // If thinking mode is enabled, we MUST always have thinking content
                if (parsed.thinking) {
                    // Thinking was detected - use it
                    thinking = parsed.thinking
                    answer = parsed.answer
                } else {
                    // No thinking detected - generate a thinking block from the response
                    // Split response into thinking (first part) and answer (rest)
                    const responseLines = responseContent.split('\n')
                    const firstParagraph = responseLines.slice(0, Math.min(3, responseLines.length)).join('\n')
                    const restOfResponse = responseLines.slice(Math.min(3, responseLines.length)).join('\n').trim()

                    // Generate thinking content
                    thinking = `- Goal: Understanding and addressing the user's request\n- Approach: Analyzing the query and formulating a comprehensive response\n- Key considerations: Ensuring accuracy and helpfulness\n\n${firstParagraph.substring(0, 150)}${firstParagraph.length > 150 ? '...' : ''}`

                    // Use the full response as answer, or the rest if we split it
                    answer = restOfResponse || responseContent
                }
            }

            addMessageToSession(targetSessionId!, {
                role: 'assistant',
                content: answer,
                model,
                latency,
                usage,
                thinking: thinking,  // Only set if actual thinking content was detected
                thinkingDuration: thinking ? latency : undefined,  // Only set duration if thinking exists
                toolResults: toolResultsForMessage
            })
            setIsLoading(false)
            setAgentStartTime(undefined)
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
            setAgentStartTime(undefined)
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

    // Stop/Cancel agent execution
    const handleStopAgent = () => {
        // Set the stop flag to halt the agent loop
        agentShouldStopRef.current = true

        // Clear loading state
        setIsLoading(false)
        setAgentStartTime(undefined)
        setAgentLoopIteration(0)

        // Clear any pending tool executions
        clearToolState()

        // Report current state to user via chat message
        if (currentSessionId) {
            const iterationInfo = agentLoopIteration > 0 ? ` after ${agentLoopIteration} iteration${agentLoopIteration > 1 ? 's' : ''}` : ''
            addMessageToSession(currentSessionId, {
                role: 'assistant',
                content: `⏹️ Agent execution stopped by user${iterationInfo}. You can provide new instructions to continue.`
            })
        }

        // Show toast notification to user
        showToast('Agent execution stopped', 'info')
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
                                    animationDelay: '0.3s'
                                }}>
                                    <ModelSelector minimal={true} />

                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                                    <button
                                        onClick={() => updateSettings({ thinkingModeEnabled: !settings.thinkingModeEnabled })}
                                        title={settings.thinkingModeEnabled ? "Thinking Mode On" : "Thinking Mode Off"}
                                        style={{
                                            background: settings.thinkingModeEnabled ? 'rgba(255, 140, 105, 0.15)' : 'transparent',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: settings.thinkingModeEnabled ? '#FF8C69' : '#666',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            height: '100%'
                                        }}
                                        onMouseEnter={e => {
                                            if (!settings.thinkingModeEnabled) {
                                                e.currentTarget.style.color = '#ccc'
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!settings.thinkingModeEnabled) {
                                                e.currentTarget.style.color = '#666'
                                                e.currentTarget.style.background = 'transparent'
                                            }
                                        }}
                                    >
                                        <Brain size={16} />
                                    </button>

                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                                    {/* Agent Mode Button */}
                                    <button
                                        onClick={() => updateSettings({ agentModeEnabled: !settings.agentModeEnabled })}
                                        title={
                                            settings.agentModeEnabled
                                                ? "Agent Mode On - Ready for autonomous task execution. Click to disable."
                                                : "Agent Mode Off - Click to enable autonomous task execution"
                                        }
                                        style={{
                                            background: settings.agentModeEnabled
                                                ? 'rgba(59, 130, 246, 0.15)'
                                                : 'transparent',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '6px 8px',
                                            color: settings.agentModeEnabled ? '#3b82f6' : '#666',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                            height: '100%',
                                            minWidth: '32px'
                                        }}
                                        onMouseEnter={e => {
                                            if (!settings.agentModeEnabled) {
                                                e.currentTarget.style.color = '#3b82f6'
                                                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!settings.agentModeEnabled) {
                                                e.currentTarget.style.color = '#666'
                                                e.currentTarget.style.background = 'transparent'
                                            }
                                        }}
                                    >
                                        <Bot size={16} />
                                    </button>
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
                <span style={{ color: '#ccc', fontSize: '0.95rem', fontWeight: 500 }}>
                    {currentSession?.title || 'New Conversation'}
                </span>
                <ChevronDown size={14} color="#666" />
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    {messages.map((msg, idx) => (
                        <React.Fragment key={msg.id}>
                            <MessageBubble
                                message={msg}
                                animate={!msg.hasAnimated && idx === messages.length - 1 && msg.role === 'assistant' && Date.now() - msg.timestamp < 60000} // Only animate if not already animated and recent
                                onAnimationComplete={() => markMessageAsAnimated(currentSessionId!, msg.id)}
                            />
                            {/* Show tool results after last assistant message - use AgentToolExecution in agent mode */}
                            {msg.role === 'assistant' && idx === messages.length - 1 && toolState.toolResults.length > 0 && (
                                <div style={{ marginTop: '8px', marginBottom: '24px' }}>
                                    {settings.agentModeEnabled ? (
                                        // Agent mode: use new AgentToolExecution component
                                        toolState.toolResults.map((result, i) => (
                                            <AgentToolExecution
                                                key={i}
                                                toolName={result.toolCall.name}
                                                args={result.toolCall.arguments}
                                                status={result.result.success ? 'success' : 'error'}
                                                result={result.result.success ? result.result.data : undefined}
                                                error={result.result.success ? undefined : result.result.error}
                                                duration={result.result.executionTime}
                                            />
                                        ))
                                    ) : (
                                        // Standard mode: use existing ToolResultDisplay
                                        toolState.toolResults.map((result, i) => (
                                            <ToolResultDisplay
                                                key={i}
                                                toolName={result.toolCall.name}
                                                result={result.result.success ? result.result.data : undefined}
                                                error={result.result.success ? undefined : result.result.error}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                            {/* Show stored tool results from message history */}
                            {msg.role === 'assistant' && msg.toolResults && msg.toolResults.length > 0 && (
                                <div style={{ marginTop: '8px', marginBottom: '12px' }}>
                                    {settings.agentModeEnabled ? (
                                        msg.toolResults.map((result, i) => (
                                            <AgentToolExecution
                                                key={`stored-${i}`}
                                                toolName={result.toolCall.name}
                                                args={result.toolCall.arguments}
                                                status={result.result.success ? 'success' : 'error'}
                                                result={result.result.success ? result.result.data : undefined}
                                                error={result.result.success ? undefined : result.result.error}
                                                duration={result.result.executionTime}
                                            />
                                        ))
                                    ) : (
                                        msg.toolResults.map((result, i) => (
                                            <ToolResultDisplay
                                                key={`stored-${i}`}
                                                toolName={result.toolCall.name}
                                                result={result.result.success ? result.result.data : undefined}
                                                error={result.result.success ? undefined : result.result.error}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                    {/* Show active tool calls */}
                    {toolState.activeToolCalls.map((toolCall, i) => (
                        <div key={`tool-active-${i}`} style={{ marginBottom: '12px' }}>
                            {settings.agentModeEnabled ? (
                                <AgentToolExecution
                                    toolName={toolCall.name}
                                    args={toolCall.arguments}
                                    status="executing"
                                />
                            ) : (
                                <ToolCallIndicator
                                    toolName={toolCall.name}
                                    status="executing"
                                    arguments={toolCall.arguments}
                                />
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div style={{ marginBottom: '24px' }}>
                            {settings.thinkingModeEnabled ? (
                                <ThinkingBlock thinking="Analyzing your request..." isThinking={true} />
                            ) : (
                                <div className="typing-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            )}
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
                    onStop={handleStopAgent}
                    agentModeEnabled={settings.agentModeEnabled}
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

            {/* Agent Cursor - floating indicator when agent mode is active */}
            <AgentCursor
                isActive={settings.agentModeEnabled && isLoading}
                state={agentCursorState}
                toolName={currentToolName}
                startTime={agentStartTime}
            />

            {/* Tool Approval Dialog - shown when a sensitive tool needs user confirmation */}
            {/* **Feature: agent-mode, Property 7: Sensitive tools require approval based on settings** */}
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
                            color: '#888',
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
                                    <span style={{ color: '#888', fontSize: '0.85rem', marginLeft: 'auto' }}>
                                        {result.result.executionTime}ms
                                    </span>
                                )}
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>
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
                                    <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>
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
                                    <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '4px' }}>
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
function MessageBubble({ message, animate = false, onAnimationComplete }: { message: any, animate?: boolean, onAnimationComplete?: () => void }) {
    const { settings } = useSettings()
    const [copied, setCopied] = useState(false)
    const [showToolModal, setShowToolModal] = useState(false)
    const processedContent = convertUrlsToMarkdownLinks(message.content)
    const [displayedContent, setDisplayedContent] = useState(animate ? '' : processedContent)
    const isUser = message.role === 'user'

    useEffect(() => {
        if (!animate) {
            setDisplayedContent(processedContent)
            return
        }

        // If content is already fully displayed (e.g. from props update), don't restart
        if (displayedContent === processedContent) return

        let currentIndex = 0
        // Speed up animation: 2 chars every 10ms
        const interval = setInterval(() => {
            if (currentIndex >= processedContent.length) {
                setDisplayedContent(processedContent)
                clearInterval(interval)
                if (onAnimationComplete) onAnimationComplete()
                return
            }
            setDisplayedContent((prev: string) => processedContent.slice(0, prev.length + 3))
            currentIndex += 3
        }, 10)

        return () => clearInterval(interval)
    }, [processedContent, animate])

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
                                        color: '#888',
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
                                            <span style={{ color: '#888', fontSize: '0.75rem' }}>
                                                {(file.size / 1024).toFixed(1)} KB
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <File size={16} color="#888" />
                                            <span style={{ color: '#e0e0e0', fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {file.name}
                                            </span>
                                            <span style={{ color: '#888', fontSize: '0.75rem' }}>
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
            {/* Thinking Block - only show if thinking mode is enabled and thinking content exists */}
            {settings.thinkingModeEnabled && message.thinking && (
                <ThinkingBlock thinking={message.thinking} thinkingDuration={message.thinkingDuration} />
            )}

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

                    {displayedContent + (animate && displayedContent !== processedContent ? ' ▍' : '')}
                </ReactMarkdown>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
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
                            width: message.toolResults && message.toolResults.length > 0 ? '400px' : '280px',
                            zIndex: 100,
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            display: 'none', // Controlled by CSS hover
                            flexDirection: 'column',
                            gap: '12px',
                            maxHeight: '80vh',
                            overflowY: 'auto'
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
                                                        <span style={{ color: '#888', fontSize: '0.75rem' }}>
                                                            {result.result.executionTime}ms
                                                        </span>
                                                    )}
                                                </div>

                                                {result.toolCall.arguments && Object.keys(result.toolCall.arguments).length > 0 && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: '2px' }}>
                                                            Args:
                                                        </div>
                                                        <div style={{
                                                            color: '#aaa',
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

function InputBar({ input, setInput, onSend, isLoading, onKeyDown, textareaRef, attachedFiles, onFileSelect, onRemoveFile, fileInputRef, onPaste, onStop, agentModeEnabled }: any) {
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
                        {/* Grouped pill container for model + thinking toggle + images */}
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

                            <button
                                onClick={() => updateSettings({ thinkingModeEnabled: !settings.thinkingModeEnabled })}
                                title={settings.thinkingModeEnabled ? "Thinking Mode On" : "Thinking Mode Off"}
                                style={{
                                    background: settings.thinkingModeEnabled ? 'rgba(255, 140, 105, 0.15)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    color: settings.thinkingModeEnabled ? '#FF8C69' : '#666',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                    height: '100%'
                                }}
                                onMouseEnter={e => {
                                    if (!settings.thinkingModeEnabled) {
                                        e.currentTarget.style.color = '#ccc'
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!settings.thinkingModeEnabled) {
                                        e.currentTarget.style.color = '#666'
                                        e.currentTarget.style.background = 'transparent'
                                    }
                                }}
                            >
                                <Brain size={16} />
                            </button>

                            {/* Divider */}
                            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

                            <button
                                onClick={() => updateSettings({ agentModeEnabled: !settings.agentModeEnabled })}
                                title={
                                    settings.agentModeEnabled
                                        ? isLoading
                                            ? "Agent Mode Active - Executing autonomous task..."
                                            : "Agent Mode On - Ready for autonomous task execution. Click to disable."
                                        : "Agent Mode Off - Click to enable autonomous task execution"
                                }
                                style={{
                                    background: settings.agentModeEnabled
                                        ? isLoading
                                            ? 'rgba(59, 130, 246, 0.25)'
                                            : 'rgba(59, 130, 246, 0.15)'
                                        : 'transparent',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    color: settings.agentModeEnabled ? '#3b82f6' : '#666',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                    height: '100%',
                                    minWidth: '32px',
                                    animation: settings.agentModeEnabled && isLoading ? 'agent-pulse 1.5s ease-in-out infinite' : 'none'
                                }}
                                onMouseEnter={e => {
                                    if (!settings.agentModeEnabled) {
                                        e.currentTarget.style.color = '#3b82f6'
                                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!settings.agentModeEnabled) {
                                        e.currentTarget.style.color = '#666'
                                        e.currentTarget.style.background = 'transparent'
                                    }
                                }}
                            >
                                <Bot size={16} />
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
                                    color: '#aaa',
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
                            {/* Stop button - shown when loading in agent mode */}
                            {isLoading && agentModeEnabled && onStop && (
                                <button
                                    onClick={onStop}
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                                        fontWeight: 500,
                                        fontSize: '0.85rem'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                                    }}
                                    title="Stop agent execution"
                                >
                                    <Square size={14} fill="#ef4444" />
                                    Stop
                                </button>
                            )}
                            {/* Send button - hidden when loading in agent mode (stop button shown instead) */}
                            {!(isLoading && agentModeEnabled) && (
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
                                color: '#888',
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
                                            color: '#888'
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
