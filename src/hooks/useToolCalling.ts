// Hook for handling tool calling in chat flows
// Tools auto-execute without requiring user approval

import { useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import {
    getToolsForProvider,
    processToolCalls,
    responseHasToolCalls,
    ToolCallResult,
} from '../tools/toolManager'
import { ToolCall } from '../tools/executor'
import type { OpenRouterResponse } from '../tools/types'
import { getAllToolDefinitions } from '../tools/definitions'
import { shouldRequestToolFollowUp } from '../tools/followUpPolicy'
import { shouldEnableTools } from '../utils/promptSelection'
import { getWebResearchToolExposure } from '../skills'

export interface ToolCallState {
    activeToolCalls: ToolCall[]
    toolResults: ToolCallResult[]
    isProcessingTools: boolean
    researchMode: {
        isActive: boolean
        currentRound: number
        maxRounds: number
        searchCount: number
    }
}

const INITIAL_TOOL_STATE: ToolCallState = {
    activeToolCalls: [],
    toolResults: [],
    isProcessingTools: false,
    researchMode: {
        isActive: false,
        currentRound: 0,
        maxRounds: 0,
        searchCount: 0,
    },
}

export function useToolCalling() {
    const { settings } = useSettings()
    const [toolState, setToolState] = useState<ToolCallState>(INITIAL_TOOL_STATE)

    const getEnabledToolsForProvider = () => {
        const allToolNames = getAllToolDefinitions().map((tool) => tool.name)
        const knownTools = new Set(allToolNames)

        let enabledTools: string[] = settings.enabledTools.length > 0
            ? settings.enabledTools.filter((tool) => knownTools.has(tool))
            : allToolNames

        const webResearchToolExposure = getWebResearchToolExposure(settings.skills)
        if (!webResearchToolExposure.exposeWebSearch) {
            enabledTools = enabledTools.filter((tool) => tool !== 'web_search' && tool !== 'research_plan')
        } else {
            if (!enabledTools.includes('web_search')) {
                enabledTools.push('web_search')
            }

            if (webResearchToolExposure.exposeResearchPlan) {
                if (!enabledTools.includes('research_plan')) {
                    enabledTools.push('research_plan')
                }
            } else {
                enabledTools = enabledTools.filter((tool) => tool !== 'research_plan')
            }
        }

        return [...new Set(enabledTools)]
    }

    const canUseToolsNow = (): boolean => {
        if (!shouldEnableTools(settings)) {
            return false
        }

        const enabledTools = getEnabledToolsForProvider()
        if (enabledTools.length === 0) {
            return false
        }

        const tools = getToolsForProvider({
            provider: settings.modelProvider,
            model: settings.aiModel,
            enabledTools,
        })

        return Array.isArray(tools) && tools.length > 0
    }

    const getToolsForRequest = () => {
        const enabledTools = getEnabledToolsForProvider()
        if (enabledTools.length === 0 || !canUseToolsNow()) {
            return null
        }

        return getToolsForProvider({
            provider: settings.modelProvider,
            model: settings.aiModel,
            enabledTools,
        })
    }

    const handleToolCalls = async (
        response: OpenRouterResponse,
        onToolStart?: (toolCall: ToolCall) => void,
        onToolComplete?: (result: ToolCallResult) => void,
        onResearchPlanProgress?: (currentStep: number, totalSteps: number, query?: string) => void
    ): Promise<{
        hasTools: boolean
        toolResults: ToolCallResult[]
        formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
        needsFollowUp: boolean
    }> => {
        if (!canUseToolsNow() || !responseHasToolCalls(response, settings.modelProvider)) {
            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false,
            }
        }

        setToolState((prev) => ({ ...prev, isProcessingTools: true }))

        try {
            const enabledToolsForProcessing = getEnabledToolsForProvider()
            const { results, formattedResults } = await processToolCalls(response, {
                provider: settings.modelProvider,
                model: settings.aiModel,
                enabledTools: enabledToolsForProcessing,
                onToolStart: (toolCall) => {
                    setToolState((prev) => ({
                        ...prev,
                        activeToolCalls: [...prev.activeToolCalls, toolCall],
                    }))
                    onToolStart?.(toolCall)
                },
                onToolComplete: (result) => {
                    setToolState((prev) => {
                        const isWebSearch = result.toolCall.name === 'web_search'
                        const isResearchPlan = result.toolCall.name === 'research_plan'
                        const planSteps = isResearchPlan && Array.isArray(result.toolCall.arguments?.steps)
                            ? result.toolCall.arguments.steps.length
                            : 0
                        const searchDelta = isWebSearch ? 1 : (isResearchPlan ? planSteps : 0)

                        return {
                            ...prev,
                            activeToolCalls: prev.activeToolCalls.filter((tc) => tc.id !== result.toolCall.id),
                            toolResults: [...prev.toolResults, result],
                            researchMode: prev.researchMode.isActive
                                ? {
                                    ...prev.researchMode,
                                    searchCount: prev.researchMode.searchCount + searchDelta,
                                }
                                : prev.researchMode,
                        }
                    })
                    onToolComplete?.(result)
                },
                onResearchPlanProgress,
            })

            setToolState((prev) => ({ ...prev, isProcessingTools: false }))

            return {
                hasTools: true,
                toolResults: results,
                formattedResults,
                needsFollowUp: shouldRequestToolFollowUp(results, formattedResults),
            }
        } catch (error: unknown) {
            setToolState((prev) => ({ ...prev, isProcessingTools: false }))
            console.error('Tool processing error:', error instanceof Error ? error.message : error)

            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false,
            }
        }
    }

    const clearToolState = () => {
        setToolState(INITIAL_TOOL_STATE)
    }

    const startResearchMode = (maxRounds: number = 0) => {
        const safeMaxRounds = Number.isFinite(maxRounds) ? Math.max(0, Math.round(maxRounds)) : 0
        setToolState((prev) => ({
            ...prev,
            researchMode: {
                isActive: true,
                currentRound: 0,
                maxRounds: safeMaxRounds,
                searchCount: 0,
            },
        }))
    }

    const getResearchContext = (
        actualSearchCount?: number,
        maxRoundsOverride?: number
    ): string => {
        const maxRounds = maxRoundsOverride ?? toolState.researchMode.maxRounds
        const isActive = maxRoundsOverride !== undefined ? maxRounds >= 0 : toolState.researchMode.isActive
        if (!isActive) {
            return ''
        }

        const searchCount = actualSearchCount ?? toolState.researchMode.searchCount
        if (maxRounds > 0) {
            const remaining = maxRounds - searchCount
            if (remaining <= 0) {
                return `\n\nYou have completed all ${maxRounds} available searches. Provide your final answer based on gathered results.`
            }

            if (searchCount > 0) {
                return `\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} of ${maxRounds} available searches. ${remaining} searches remaining. Continue only if you need more evidence.`
            }
        }

        if (searchCount > 0) {
            return `\n\n*** WEB SEARCH PROGRESS ***\nYou have completed ${searchCount} search(es). If results are sufficient, answer now; otherwise run another targeted search.`
        }

        return `\n\nYou may use web_search for up-to-date information. Run targeted searches as needed, then synthesize the final answer.`
    }

    return {
        canUseTools: canUseToolsNow(),
        getToolsForRequest,
        handleToolCalls,
        toolState,
        clearToolState,
        startResearchMode,
        getResearchContext,
    }
}
