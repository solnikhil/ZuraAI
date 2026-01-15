// Hook for handling tool calling in chat flows
// Tools auto-execute without requiring user approval
// **Validates: Requirements 2.1**

import { useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import {
    getToolsForProvider,
    processToolCalls,
    responseHasToolCalls,
    ToolCallResult
} from '../tools/toolManager'
import { ToolCall } from '../tools/executor'
import { getAllToolDefinitions } from '../tools/definitions'
import { shouldEnableTools } from '../utils/promptSelection'

export interface ToolCallState {
    activeToolCalls: ToolCall[]
    toolResults: ToolCallResult[]
    isProcessingTools: boolean
    researchMode: {
        isActive: boolean
        currentRound: number
        maxRounds: number
        searchCount: number
        mandatory: boolean  // If true, must complete exactly maxRounds searches
    }
}

export function useToolCalling() {
    const { settings } = useSettings()
    const [toolState, setToolState] = useState<ToolCallState>({
        activeToolCalls: [] as ToolCall[],
        toolResults: [] as ToolCallResult[],
        isProcessingTools: false,
        researchMode: {
            isActive: false,
            currentRound: 0,
            maxRounds: 5,
            searchCount: 0,
            mandatory: false
        }
    })

    const getEnabledToolsForProvider = () => {
        const allToolNames = getAllToolDefinitions().map(tool => tool.name)
        let enabledTools: string[] = settings.enabledTools.length > 0
            ? [...settings.enabledTools]
            : allToolNames

        // Gate web_search based on BOTH toggles
        // web_search is excluded only when BOTH webSearchEnabled AND deepResearchEnabled are OFF
        // This ensures web_search is available when:
        // - webSearchEnabled is ON (normal web search mode)
        // - deepResearchEnabled is ON (deep research mode, regardless of webSearchEnabled)
        // Validates: Requirements 1.1, 1.3, 1.4
        if (!settings.webSearchEnabled && !settings.deepResearchEnabled) {
            enabledTools = enabledTools.filter(tool => tool !== 'web_search')
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
     * Process tool calls from AI response
     * Tools auto-execute without requiring user approval
     * **Validates: Requirements 2.1**
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

            const { results, formattedResults } = await processToolCalls(response, {
                provider: settings.modelProvider,
                model: settings.aiModel,
                enabledTools: enabledToolsForProcessing,
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
            setToolState(prev => ({ ...prev, isProcessingTools: false }))
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
        setToolState({
            activeToolCalls: [] as ToolCall[],
            toolResults: [] as ToolCallResult[],
            isProcessingTools: false,
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

        // Limit reached state - instructs model to provide final answer
        // Works for both normal mode (5 searches) and deep research mode (25 searches)
        // Validates: Requirements 2.2, 2.3
        if (remaining <= 0) {
            return `\n\nYou have completed all ${maxRounds} available searches. You MUST now provide your final comprehensive answer based on all the information gathered.`
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

        // ============================================================================
        // MODE DIFFERENTIATION
        // ============================================================================
        // The research context system supports two distinct modes:
        // 
        // 1. DEEP RESEARCH MODE (maxRounds >= 10, typically 25):
        //    - Triggered when deepResearchEnabled is ON
        //    - Forces multiple searches with mandatory continuation prompts
        //    - Requires minimum 6-10 searches before allowing final answer
        //    - Uses aggressive prompts to ensure comprehensive research
        //    - Validates: Requirements 4.1, 4.2, 4.3
        //
        // 2. NORMAL WEB SEARCH MODE (maxRounds > 0 && maxRounds < 10, typically 5):
        //    - Triggered when only webSearchEnabled is ON
        //    - Requires planning before executing searches
        //    - Allows model to decide when to stop (up to limit)
        //    - Uses guidance prompts rather than mandatory continuation
        //    - Validates: Requirements 2.1, 3.1, 3.2, 3.3
        //
        // The branching below ensures these modes remain completely separate.
        // Deep research prompts are preserved unchanged per Requirement 4.3.
        // ============================================================================
        
        // Regular research mode (non-mandatory) - model decides when to search
        const isDeepResearch = maxRounds >= 10  // Deep research has 25 rounds
        const isNormalSearch = maxRounds > 0 && maxRounds < 10  // Normal search has 5 rounds

        if (searchCount === 0) {
            // ----------------------------------------------------------------
            // DEEP RESEARCH MODE - Initial prompt (searchCount = 0)
            // This prompt is UNCHANGED per Requirement 4.3
            // Forces immediate web_search call with no text explanation
            // ----------------------------------------------------------------
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

            // Normal web search mode - requires planning before executing searches
            // Validates: Requirements 3.1, 3.2, 3.3
            if (isNormalSearch) {
                return `\n\n*** WEB SEARCH MODE - PLAN FIRST ***
You have access to web search with a maximum of ${maxRounds} searches.

BEFORE searching, you MUST:
1. Briefly state what information you need
2. List the specific searches you plan to make (up to ${maxRounds})
3. Explain why each search is necessary

After planning, proceed with your searches. Use them wisely - you have limited searches available.

If you already know the answer confidently without needing current information, you can respond directly without searching.`
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

        // After 1st search - FORCE continuation for deep research, allow choice for normal mode
        if (searchCount === 1) {
            // ----------------------------------------------------------------
            // DEEP RESEARCH MODE - After 1st search (searchCount = 1)
            // This prompt is UNCHANGED per Requirement 4.3
            // Forces continuation with mandatory language
            // ----------------------------------------------------------------
            if (isDeepResearch) {
                return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ONLY 1 search. You need 5-9 MORE searches.

DO NOT provide your answer yet. Your answer will be INCOMPLETE without more research.

Your next search must explore a different angle/niche. Call web_search NOW with a NEW query.

After this, continue searching until all niches are covered.`
            }

            // Normal web search mode - allow model to decide when to stop
            // Different from deep research which forces continuation
            // Validates: Requirements 2.2, 3.4
            if (isNormalSearch) {
                return `\n\n*** WEB SEARCH PROGRESS ***
You have completed 1 of ${maxRounds} available searches. ${remaining} searches remaining.

You may:
- Continue searching if you need more information, different perspectives, or verification
- Provide your answer now if you have gathered sufficient information

If continuing, use web_search with a different query to explore other aspects of the topic.`
            }

            return `\n\n*** RESEARCH PROGRESS ***
You have completed 1 of up to ${maxRounds} searches. You may continue searching if:
- You need more recent information
- You want different perspectives
- There are gaps in your knowledge
- You need to verify claims

Use web_search with different queries as needed, or provide your answer if you have sufficient information.`
        }

        // ----------------------------------------------------------------
        // DEEP RESEARCH MODE - Searches 2-5 (searchCount 2-5)
        // This prompt is UNCHANGED per Requirement 4.3
        // Forces continuation until minimum 6 searches reached
        // ----------------------------------------------------------------
        // Searches 2-5 - Still force continuation for deep research
        if (isDeepResearch && searchCount >= 2 && searchCount <= 5) {
            return `\n\n*** CONTINUE RESEARCH - MANDATORY ***
You have completed ${searchCount} search(es). You need MORE searches. Minimum 6 total required.

DO NOT provide your answer yet. Continue with a NEW niche query.

Call web_search NOW.`
        }

        // Normal mode searches 2+ - allow model to decide when to stop (up to limit)
        // Different from deep research which forces continuation
        // Validates: Requirements 2.2, 3.4
        if (isNormalSearch && searchCount >= 2 && searchCount < maxRounds) {
            // Check if this is the last available search
            if (remaining === 1) {
                return `\n\n*** WEB SEARCH PROGRESS - LAST SEARCH AVAILABLE ***
You have completed ${searchCount} of ${maxRounds} searches. You have 1 search remaining.

You may:
- Use your final search if you need one more piece of information
- Provide your answer now if you have gathered sufficient information

Choose wisely - this is your last available search.`
            }

            return `\n\n*** WEB SEARCH PROGRESS ***
You have completed ${searchCount} of ${maxRounds} available searches. ${remaining} searches remaining.

You may:
- Continue searching if you need more information or different perspectives
- Provide your answer now if you have gathered sufficient information

If continuing, use web_search with a different query to explore other aspects of the topic.`
        }

        // ----------------------------------------------------------------
        // DEEP RESEARCH MODE - Searches 6+ (searchCount 6-24)
        // This prompt is UNCHANGED per Requirement 4.3
        // Allows completion but encourages more comprehensive coverage
        // ----------------------------------------------------------------
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
        startResearchMode,
        getResearchContext
    }
}

