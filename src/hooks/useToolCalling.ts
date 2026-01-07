// Hook for handling tool calling in chat flows
// Sensitive tools require approval based on settings
// **Validates: Requirements 4.3**

import { useState, useCallback, useRef } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import {
    getToolsForProvider,
    processToolCalls,
    responseHasToolCalls,
    buildMessagesWithToolResults,
    ToolCallResult
} from '../tools/toolManager'
import { ToolCallIndicator, ToolResultDisplay } from '../tools/ui'
import { ToolCall } from '../tools/executor'
import { getAllToolDefinitions, getToolByName } from '../tools/definitions'
import { isMcpToolName } from '../tools/mcpUtils'
import { shouldEnableTools } from '../utils/promptSelection'

export interface ToolCallState {
    activeToolCalls: ToolCall[]
    toolResults: ToolCallResult[]
    isProcessingTools: boolean
    pendingApproval: ToolCall | null
    researchMode: {
        isActive: boolean
        currentRound: number
        maxRounds: number
        searchCount: number
        mandatory: boolean  // If true, must complete exactly maxRounds searches
    }
}

export interface ApprovalCallbacks {
    onApprove: () => void
    onReject: () => void
}

export function useToolCalling() {
    const { settings } = useSettings()
    const [toolState, setToolState] = useState<ToolCallState>({
        activeToolCalls: [] as ToolCall[],
        toolResults: [] as ToolCallResult[],
        isProcessingTools: false,
        pendingApproval: null,
        researchMode: {
            isActive: false,
            currentRound: 0,
            maxRounds: 5,
            searchCount: 0,
            mandatory: false
        }
    })
    const searchToolNames = getAllToolDefinitions()
        .filter(tool => tool.category === 'search')
        .map(tool => tool.name)

    // Refs to store approval resolution callbacks
    const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null)

    const getEnabledToolsForProvider = () => {
        const allToolNames = getAllToolDefinitions().map(tool => tool.name)
        let enabledTools: string[] | undefined = settings.enabledTools.length > 0
            ? [...settings.enabledTools]
            : allToolNames

        if (settings.enabledTools.length > 0) {
            const mcpToolNames = allToolNames.filter(isMcpToolName)
            for (const mcpTool of mcpToolNames) {
                if (!enabledTools.includes(mcpTool)) {
                    enabledTools.push(mcpTool)
                }
            }
        }

        if (settings.modelProvider === 'codex') {
            enabledTools = [...searchToolNames]
        }

        if (!settings.webSearchEnabled) {
            if (enabledTools) {
                enabledTools = enabledTools.filter(tool => tool !== 'web_search')
            } else {
                enabledTools = allToolNames.filter((name) => name !== 'web_search')
            }
        }

        return enabledTools
    }

    /**
     * Check if tools are enabled and supported for current provider/model
     */
    const canUseTools = (): boolean => {
        // Use shouldEnableTools to check if tools should be enabled
        if (!shouldEnableTools(settings)) {
            return false
        }

        const tools = getToolsForProvider({
            provider: settings.modelProvider,
            model: settings.aiModel,
            enabledTools: getEnabledToolsForProvider()
        })

        return tools !== null
    }

    /**
     * Get tools formatted for current provider
     */
    const getToolsForRequest = () => {
        if (!canUseTools()) return null

        const enabledTools = getEnabledToolsForProvider()

        return getToolsForProvider({
            provider: settings.modelProvider,
            model: settings.aiModel,
            enabledTools: enabledTools
        })
    }

    /**
     * Check if a tool requires approval based on toolApprovalMode setting
     * Sensitive tools require approval based on settings
     * **Validates: Requirements 4.3**
     */
    const shouldRequireApproval = useCallback((toolCall: ToolCall): boolean => {
        const toolDef = getToolByName(toolCall.name)
        const toolRequiresApproval = toolDef?.requiresApproval === true

        switch (settings.toolApprovalMode) {
            case 'always':
                // All tools require approval
                return true
            case 'sensitive':
                // Only tools marked with requiresApproval need approval
                return toolRequiresApproval
            case 'never':
                // No tools require approval
                return false
            default:
                // Default to sensitive mode
                return toolRequiresApproval
        }
    }, [settings.toolApprovalMode])

    /**
     * Handle user approval response
     */
    const handleApprovalResponse = useCallback((approved: boolean) => {
        if (approvalResolveRef.current) {
            approvalResolveRef.current(approved)
            approvalResolveRef.current = null
        }
        setToolState(prev => ({ ...prev, pendingApproval: null }))
    }, [])

    /**
     * Process tool calls from AI response
     */
    const handleToolCalls = async (
        response: any,
        onToolStart?: (toolCall: ToolCall) => void,
        onToolComplete?: (result: ToolCallResult) => void
    ): Promise<{
        hasTools: boolean
        toolResults: ToolCallResult[]
        formattedResults: any[]
        needsFollowUp: boolean
    }> => {
        if (!canUseTools() || !responseHasToolCalls(response, settings.modelProvider)) {
            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false
            }
        }

        setToolState(prev => ({ ...prev, isProcessingTools: true }))

        try {
            // Build enabled tools list respecting webSearchEnabled
            const enabledToolsForProcessing = getEnabledToolsForProvider()

            const { toolCalls, results, formattedResults } = await processToolCalls(response, {
                provider: settings.modelProvider,
                model: settings.aiModel,
                enabledTools: enabledToolsForProcessing,
                requireApprovalFor: settings.toolApprovalMode === 'always'
                    ? undefined  // Will check tool.requiresApproval
                    : settings.toolApprovalMode === 'sensitive'
                        ? undefined  // Will check tool.requiresApproval
                        : [],
                onToolStart: (toolCall) => {
                    setToolState(prev => ({
                        ...prev,
                        activeToolCalls: [...prev.activeToolCalls, toolCall]
                    }))
                    onToolStart?.(toolCall)
                },
                onToolComplete: (result) => {
                    setToolState(prev => {
                        // Track web_search calls for research mode
                        const isWebSearch = result.toolCall.name === 'web_search'
                        const newSearchCount = isWebSearch && prev.researchMode.isActive
                            ? prev.researchMode.searchCount + 1
                            : prev.researchMode.searchCount

                        return {
                            ...prev,
                            activeToolCalls: prev.activeToolCalls.filter(tc => tc.id !== result.toolCall.id),
                            toolResults: [...prev.toolResults, result],
                            researchMode: {
                                ...prev.researchMode,
                                searchCount: newSearchCount
                            }
                        }
                    })
                    onToolComplete?.(result)
                },
                onApprovalNeeded: async (toolCall) => {
                    // Check if this tool needs approval based on settings
                    if (!shouldRequireApproval(toolCall)) {
                        return true // Auto-approve if not required
                    }

                    // Show approval dialog and wait for user response
                    return new Promise<boolean>((resolve) => {
                        approvalResolveRef.current = resolve
                        setToolState(prev => ({ ...prev, pendingApproval: toolCall }))
                    })
                }
            })

            setToolState(prev => ({ ...prev, isProcessingTools: false }))

            return {
                hasTools: true,
                toolResults: results,
                formattedResults,
                needsFollowUp: formattedResults.length > 0
            }
        } catch (error: any) {
            setToolState(prev => ({ ...prev, isProcessingTools: false, pendingApproval: null }))
            console.error('Tool processing error:', error)

            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false
            }
        }
    }

    /**
     * Clear tool state
     */
    const clearToolState = () => {
        // Clear any pending approval
        if (approvalResolveRef.current) {
            approvalResolveRef.current(false)
            approvalResolveRef.current = null
        }
        setToolState({
            activeToolCalls: [] as ToolCall[],
            toolResults: [] as ToolCallResult[],
            isProcessingTools: false,
            pendingApproval: null,
            researchMode: {
                isActive: false,
                currentRound: 0,
                maxRounds: 5,
                searchCount: 0,
                mandatory: false
            }
        })
    }

    /**
     * Start research mode for deep search capability
     * @param maxRounds - Maximum number of searches allowed
     * @param mandatory - If true, model MUST complete exactly maxRounds searches
     */
    const startResearchMode = (maxRounds: number = 5, mandatory: boolean = false) => {
        setToolState(prev => ({
            ...prev,
            researchMode: {
                isActive: true,
                currentRound: 0,
                maxRounds,
                searchCount: 0,
                mandatory
            }
        }))
    }

    /**
     * Get research context for system prompt (remaining searches, etc.)
     * @param actualSearchCount - Override searchCount (for immediate use after tool calls)
     * @param maxRoundsOverride - Override maxRounds from state (for immediate use)
     * @param mandatoryOverride - Override mandatory from state (for immediate use)
     */
    const getResearchContext = (actualSearchCount?: number, maxRoundsOverride?: number, mandatoryOverride?: boolean): string => {
        // Use provided overrides or fall back to state
        const maxRounds = maxRoundsOverride ?? toolState.researchMode.maxRounds
        const mandatory = mandatoryOverride ?? toolState.researchMode.mandatory
        const isActive = maxRoundsOverride !== undefined ? maxRounds > 0 : toolState.researchMode.isActive

        if (!isActive || maxRounds === 0) {
            return ''
        }

        // Use provided count or fall back to state (state may be stale)
        const searchCount = actualSearchCount ?? toolState.researchMode.searchCount
        const remaining = maxRounds - searchCount

        if (remaining <= 0) {
            return `\n\nYou have completed all ${maxRounds} required searches. You MUST now provide your final comprehensive answer based on all the information gathered.`
        }

        // MANDATORY mode - user explicitly requested deep research
        if (mandatory) {
            if (searchCount === 0) {
                return `\n\n*** MANDATORY DEEP RESEARCH - EXACTLY ${maxRounds} SEARCHES REQUIRED ***
The user has explicitly requested deep research. You MUST perform exactly ${maxRounds} web searches before providing your answer.

CRITICAL INSTRUCTION: You MUST call the web_search FUNCTION ${maxRounds} times. Do NOT just describe what you would search for - you MUST actually CALL the web_search function.

Your response format must be:
1. Immediately call web_search with your first query
2. After seeing results, call web_search again with a different query
3. Repeat until you have completed ${maxRounds} searches
4. Only then provide your final answer

Search 1: Broad overview of the topic
Search 2: Recent developments and updates
Search 3: Specific details, perspectives, or verification

DO NOT provide your answer before completing all ${maxRounds} searches.`
            }

            // After 1st search in mandatory mode
            if (searchCount === 1 && remaining > 0) {
                return `\n*** MANDATORY: CONTINUE RESEARCH - ${remaining} MORE SEARCHES REQUIRED ***
You have completed 1 of ${maxRounds} MANDATORY searches. You MUST complete ${remaining} more searches before answering.

CRITICAL: Your next response MUST be a web_search FUNCTION CALL with a different query. Do NOT provide text commentary - call the function directly.

Use web_search now with a new query about: recent developments, specific details, or different perspectives.`
            }

            // After 2nd search in 3-search mandatory mode
            if (searchCount === 2 && remaining > 0) {
                return `\n*** MANDATORY: FINAL SEARCH REQUIRED ***
You have completed 2 of ${maxRounds} MANDATORY searches. You MUST complete 1 more search before answering.

CRITICAL: Your next response MUST be a web_search FUNCTION CALL. Do NOT provide text commentary - call the function directly.

After this final search, provide your comprehensive answer. Use web_search now.`
            }

            // General continuation for mandatory mode
            return `\n*** MANDATORY: CONTINUE RESEARCH ***
${remaining} more searches required. Your response MUST be a web_search FUNCTION CALL, not text. Call web_search now.`
        }

        // Regular research mode (non-mandatory) - model decides when to search
        const isDeepResearch = maxRounds >= 10

        if (searchCount === 0) {
            if (isDeepResearch) {
                return `\n\n*** DEEP RESEARCH MODE - MANDATORY MULTI-SEARCH ***
You MUST complete MULTIPLE SEARCHES before answering. You have up to 25 searches available.

CRITICAL RULE #1: Your FIRST response must be ONLY a web_search function call. NO text, NO explanation. Just the function call.

CRITICAL RULE #2: After the first search, you MUST continue searching different niches. DO NOT provide your final answer after just 1-2 searches.

CRITICAL RULE #3: Only provide your final answer after completing ALL niche searches.

MANDATORY MINIMUM SEARCHES: 6-10 searches on different aspects

Your first search should be broad. Then identify niches and search each one.

NOW: Call web_search with a broad query - NO TEXT, just the function.`
            }

            return `\n\n*** WEB SEARCH AVAILABLE ***
You have access to web search (up to ${maxRounds} searches) to provide accurate, up-to-date information.

When you need information that may be:
- Recent or time-sensitive (news, current events, latest data)
- Beyond your training cutoff
- Specific facts, figures, or statistics
- Verification of uncertain information

Use the web_search tool to find accurate information. You may search multiple times from different angles to build comprehensive understanding.

If you already know the answer confidently, you can respond directly.`
        }

        // After 1st search - FORCE continuation
        if (searchCount === 1) {
            if (isDeepResearch) {
                return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ONLY 1 search. You need 5-9 MORE searches.

DO NOT provide your answer yet. Your answer will be INCOMPLETE without more research.

Your next search must explore a different angle/niche. Call web_search NOW with a NEW query.

After this, continue searching until all niches are covered.`
            }

            return `\n\n*** RESEARCH PROGRESS ***
You have completed 1 of up to ${maxRounds} searches. You may continue searching if:
- You need more recent information
- You want different perspectives
- There are gaps in your knowledge
- You need to verify claims

Use web_search with different queries as needed, or provide your answer if you have sufficient information.`
        }

        // Searches 2-5 - Still force continuation
        if (isDeepResearch && searchCount >= 2 && searchCount <= 5) {
            return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ${searchCount} search(es). You need MORE searches. Minimum 6 total required.

DO NOT provide your answer yet. Continue with a NEW niche query.

Call web_search NOW.`
        }

        // Searches 6+ - Allow completion but encourage more
        if (isDeepResearch && searchCount >= 6 && searchCount < 25) {
            const remaining = maxRounds - searchCount
            return `\n\n*** RESEARCH PROGRESS ***
Search ${searchCount} of ${maxRounds} completed. ${remaining} searches remaining.

You MAY provide your answer now if you have thoroughly covered the topic, OR continue searching for more comprehensive coverage.

To continue: Call web_search with another niche query.
To provide answer: Follow the response format with Executive Summary, Analysis, Facts, Perspectives, Timeline, Conclusions, Sources.`
        }

        return `\n\n*** RESEARCH PROGRESS ***
Search ${searchCount} of up to ${maxRounds} completed. ${remaining} searches remaining.

Continue using web_search if you need more information, or provide your comprehensive answer if you have gathered sufficient information.`
    }

    return {
        canUseTools: canUseTools(),
        getToolsForRequest,
        handleToolCalls,
        toolState,
        clearToolState,
        handleApprovalResponse,
        shouldRequireApproval,
        startResearchMode,
        getResearchContext
    }
}

