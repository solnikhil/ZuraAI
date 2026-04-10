// Hook for handling tool calling in chat flows
// Tools auto-execute without requiring user approval

import { useMemo, useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { useOptionalMcp } from '../mcp/McpContext'
import {
    getToolsForProvider,
    processToolCalls,
    responseHasToolCalls,
    ToolCallResult,
} from '../tools/toolManager'
import { ToolCall } from '../tools/executor'
import {
    isSkippedBuiltinToolResult,
    type ToolCallingResponse,
    type ToolExecutionPolicy,
    type ToolExecutionSummary,
} from '../tools/types'
import { getAllToolDefinitions, getBuiltinToolDefinitions } from '../tools/definitions'
import { shouldRequestToolFollowUp } from '../tools/followUpPolicy'
import { shouldEnableTools } from '../utils/promptSelection'
import { getWebResearchToolExposure } from '../skills'
import { createMcpToolRegistry } from '../tools/mcpRegistry'
import type { ProviderId } from '../providers'

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
    const mcp = useOptionalMcp()
    const [toolState, setToolState] = useState<ToolCallState>(INITIAL_TOOL_STATE)

    const runtimeMcpTools = useMemo(
        () => createMcpToolRegistry({
            servers: mcp?.servers ?? [],
            runtimeStates: mcp?.runtimeStates ?? [],
            tools: mcp?.tools ?? [],
        }),
        [mcp?.runtimeStates, mcp?.servers, mcp?.tools]
    )

    const availableTools = useMemo(
        () => getAllToolDefinitions(runtimeMcpTools),
        [runtimeMcpTools]
    )

    const getEnabledToolsForProvider = () => {
        const builtinToolNames = getBuiltinToolDefinitions().map((tool) => tool.name)
        const knownBuiltInTools = new Set(builtinToolNames)
        const runtimeMcpToolNames = runtimeMcpTools.map((tool) => tool.name)

        let enabledTools: string[] = settings.enabledTools.length > 0
            ? settings.enabledTools.filter((tool) => knownBuiltInTools.has(tool))
            : builtinToolNames

        const webResearchToolExposure = getWebResearchToolExposure(settings.skills)
        if (!webResearchToolExposure.exposeWebSearch) {
            enabledTools = enabledTools.filter((tool) => tool !== 'web_search')
        } else {
            if (!enabledTools.includes('web_search')) {
                enabledTools.push('web_search')
            }
        }

        return [...new Set([...enabledTools, ...runtimeMcpToolNames])]
    }

    const normalizeSelectedModelCode = (provider: ProviderId, modelCode: string): string => {
        const trimmed = modelCode.trim()
        if (provider === 'openrouter' && trimmed.startsWith('openrouter/')) {
            return trimmed.slice('openrouter/'.length)
        }

        return trimmed
    }

    const getCurrentModelSupportsTools = (): boolean | undefined => {
        const provider = settings.modelProvider
        const selectedModelCode = normalizeSelectedModelCode(provider, settings.aiModel)

        const providerModels = provider === 'openrouter'
            ? settings.configuredModels
            : provider === 'groq'
                ? settings.groqModels
                : provider === 'alibaba'
                    ? settings.alibabaModels
                    : provider === 'fireworks'
                        ? settings.fireworksModels
                        : provider === 'ollama'
                            ? settings.ollamaModels
                            : provider === 'perplexity'
                                ? settings.perplexityModels
                                : []

        const selectedModel = providerModels.find((model) => {
            const candidateCode = normalizeSelectedModelCode(provider, model.code)
            return candidateCode === selectedModelCode
        })

        return typeof selectedModel?.supportsToolCall === 'boolean'
            ? selectedModel.supportsToolCall
            : undefined
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
            modelSupportsTools: getCurrentModelSupportsTools(),
            enabledTools,
            availableTools,
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
            modelSupportsTools: getCurrentModelSupportsTools(),
            enabledTools,
            availableTools,
        })
    }

    const handleToolCalls = async (
        response: ToolCallingResponse,
    onToolStart?: (toolCall: ToolCall) => void,
    onToolComplete?: (result: ToolCallResult) => void,
    executionPolicy?: ToolExecutionPolicy
  ): Promise<{
        hasTools: boolean
        toolResults: ToolCallResult[]
        formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
        needsFollowUp: boolean
        executionSummary: ToolExecutionSummary
    }> => {
        if (!canUseToolsNow() || !responseHasToolCalls(response, settings.modelProvider)) {
            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false,
                executionSummary: {
                    attemptedWebSearchCount: 0,
                    executedWebSearchCount: 0,
                    executedWebSearchQueries: [],
                },
            }
        }

        setToolState((prev) => ({ ...prev, isProcessingTools: true }))

        try {
            const enabledToolsForProcessing = getEnabledToolsForProvider()
            const { results, formattedResults, executionSummary } = await processToolCalls(response, {
                provider: settings.modelProvider,
                model: settings.aiModel,
                enabledTools: enabledToolsForProcessing,
                availableTools,
                executionPolicy,
                onToolStart: (toolCall) => {
                    setToolState((prev) => ({
                        ...prev,
                        activeToolCalls: [...prev.activeToolCalls, toolCall],
                    }))
                    onToolStart?.(toolCall)
                },
                onToolComplete: (result) => {
                    setToolState((prev) => {
                        const isExecutedWebSearch =
                            result.toolCall.name === 'web_search' &&
                            !isSkippedBuiltinToolResult(result.result.metadata)
                        const searchDelta = isExecutedWebSearch ? 1 : 0

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
            })

            setToolState((prev) => ({ ...prev, isProcessingTools: false }))

            return {
                hasTools: true,
                toolResults: results,
                formattedResults,
                needsFollowUp: shouldRequestToolFollowUp(results, formattedResults),
                executionSummary,
            }
        } catch (error: unknown) {
            setToolState((prev) => ({ ...prev, isProcessingTools: false }))
            console.error('Tool processing error:', error instanceof Error ? error.message : error)

            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false,
                executionSummary: {
                    attemptedWebSearchCount: 0,
                    executedWebSearchCount: 0,
                    executedWebSearchQueries: [],
                },
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
