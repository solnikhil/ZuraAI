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
import { MEMORY_TOOL_NAMES } from '../tools/memoryTools'
import { shouldContinueToolResearch, shouldRequestToolFollowUp } from '../tools/followUpPolicy'
import { shouldEnableTools } from '../utils/promptSelection'
import { createMcpToolRegistry } from '../tools/mcpRegistry'
import { getProviderModels, type ProviderId } from '../providers'
import { isWindowsRuntime } from '../utils/platform'
import { isSkillEnabled } from '../skills'

const COMPUTER_USE_TOOLS = [
    'computer_screenshot',
    'computer_click',
    'computer_type',
    'computer_key',
    'computer_scroll',
    'computer_cursor_position',
    'computer_list_windows',
    'computer_launch_app',
    'computer_find_app',
    'computer_close_app',
]

const NATIVE_WINDOWS_AGENT_TOOLS = [
    'file_search',
    'file_read',
    'file_write',
    'file_move',
    'app_find',
    'app_list',
    'app_launch',
    'app_install',
    'app_uninstall',
    'window_list',
    'window_focus',
    'window_move',
    'window_close',
    'windows_uia_snapshot',
    'windows_uia_invoke',
    'windows_uia_set_value',
    'windows_uia_select',
]

const SCHEDULED_TASK_TOOLS = [
    'scheduled_task_create',
    'scheduled_task_update',
    'scheduled_task_delete',
    'scheduled_task_list',
    'scheduled_task_get_logs',
]

export interface ToolCallState {
    activeToolCalls: ToolCall[]
    activeToolBatch: ToolCall[]
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
    activeToolBatch: [],
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

        if (!enabledTools.includes('web_search')) {
            enabledTools.push('web_search')
        }

        if (!enabledTools.includes('code_execution')) {
            enabledTools.push('code_execution')
        }

        // Memory is no longer a model-callable tool surface. Saved memories are
        // injected into the prompt for context and durable facts are captured
        // by the background extraction pipeline; the model cannot mutate the
        // memory store mid-conversation. Defensively strip any memory tool
        // names that may linger in a persisted enabledTools list.
        enabledTools = enabledTools.filter(
            (tool) => !(MEMORY_TOOL_NAMES as readonly string[]).includes(tool)
        )

        // Native Windows Agent tools supplement desktop control and should be
        // preferred before screenshot/click/type for filesystem, app, window,
        // shell, and supported UI Automation tasks. Add them explicitly so
        // older persisted enabledTools lists do not hide newly shipped tools.
        const nativeWindowsAgentToolsEnabled =
            settings.assistantMode === 'agent' &&
            isWindowsRuntime()

        if (!nativeWindowsAgentToolsEnabled) {
            enabledTools = enabledTools.filter((tool) => !NATIVE_WINDOWS_AGENT_TOOLS.includes(tool))
        } else {
            for (const tool of NATIVE_WINDOWS_AGENT_TOOLS) {
                if (!enabledTools.includes(tool)) enabledTools.push(tool)
            }
        }

        // Computer Use action surface. Windows-only (mirrors the main-process +
        // preload gates), gated behind the Computer Use skill, and exposed only
        // in agent mode.
        const computerUseSurfaceEnabled =
            settings.assistantMode === 'agent' &&
            isWindowsRuntime() &&
            isSkillEnabled(settings.skills, 'computer_use')

        if (!computerUseSurfaceEnabled) {
            enabledTools = enabledTools.filter((tool) => !COMPUTER_USE_TOOLS.includes(tool))
        } else {
            for (const tool of COMPUTER_USE_TOOLS) {
                if (!enabledTools.includes(tool)) enabledTools.push(tool)
            }
        }

        // Terminal skill (`system_shell`). Windows-only and gated behind the
        // Terminal skill toggle, but exposed in BOTH chat and agent modes
        // (parity with code_execution). Per-command approval is enforced by the
        // main-process TerminalApprovalManager in chat mode and by the renderer
        // agent approval gate in agent mode.
        const terminalSurfaceEnabled =
            isWindowsRuntime() &&
            isSkillEnabled(settings.skills, 'terminal')

        if (!terminalSurfaceEnabled) {
            enabledTools = enabledTools.filter((tool) => tool !== 'system_shell')
        } else if (!enabledTools.includes('system_shell')) {
            enabledTools.push('system_shell')
        }

        const remindersSurfaceEnabled = isSkillEnabled(settings.skills, 'reminders')
        if (!remindersSurfaceEnabled) {
            enabledTools = enabledTools.filter((tool) => !SCHEDULED_TASK_TOOLS.includes(tool))
        } else {
            for (const tool of SCHEDULED_TASK_TOOLS) {
                if (!enabledTools.includes(tool)) enabledTools.push(tool)
            }
        }

        const nativePriority = new Map(NATIVE_WINDOWS_AGENT_TOOLS.map((tool, index) => [tool, index]))
        const computerPriorityOffset = NATIVE_WINDOWS_AGENT_TOOLS.length
        const computerPriority = new Map(COMPUTER_USE_TOOLS.map((tool, index) => [tool, computerPriorityOffset + index]))
        const prioritizedEnabledTools = [...new Set(enabledTools)].sort((a, b) => {
            const aPriority = nativePriority.get(a) ?? computerPriority.get(a) ?? Number.MAX_SAFE_INTEGER
            const bPriority = nativePriority.get(b) ?? computerPriority.get(b) ?? Number.MAX_SAFE_INTEGER
            if (aPriority !== bPriority) return aPriority - bPriority
            return enabledTools.indexOf(a) - enabledTools.indexOf(b)
        })

        return [...new Set([...prioritizedEnabledTools, ...runtimeMcpToolNames])]
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
        const providerModels = getProviderModels(settings, provider)

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
        executionPolicy?: ToolExecutionPolicy,
        approvalCallbacks?: {
            onToolApprovalStart?: (toolCall: ToolCall) => void
            onToolApprovalResolved?: (toolCall: ToolCall, approved: boolean) => void
            requestToolApproval?: (toolCall: ToolCall) => Promise<boolean>
        }
    ): Promise<{
        hasTools: boolean
        toolResults: ToolCallResult[]
        formattedResults: Array<{ role: string; content: string; tool_call_id?: string }>
        needsFollowUp: boolean
        shouldContinueResearch: boolean
        executionSummary: ToolExecutionSummary
    }> => {
        if (!canUseToolsNow() || !responseHasToolCalls(response, settings.modelProvider)) {
            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false,
                shouldContinueResearch: false,
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
                onToolApprovalStart: approvalCallbacks?.onToolApprovalStart,
                onToolApprovalResolved: approvalCallbacks?.onToolApprovalResolved,
                requestToolApproval: settings.assistantMode === 'agent'
                    ? approvalCallbacks?.requestToolApproval
                    : undefined,
                onToolBatchStart: (toolCalls) => {
                    setToolState((prev) => ({
                        ...prev,
                        activeToolCalls: toolCalls,
                        activeToolBatch: toolCalls,
                    }))
                },
                onToolStart: (toolCall) => {
                    setToolState((prev) => ({
                        ...prev,
                        activeToolCalls: prev.activeToolCalls.some((activeToolCall) => activeToolCall.id === toolCall.id)
                            ? prev.activeToolCalls
                            : [...prev.activeToolCalls, toolCall],
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

            setToolState((prev) => ({
                ...prev,
                activeToolCalls: [],
                activeToolBatch: [],
                isProcessingTools: false,
            }))

            return {
                hasTools: true,
                toolResults: results,
                formattedResults,
                needsFollowUp: shouldRequestToolFollowUp(results, formattedResults),
                shouldContinueResearch: shouldContinueToolResearch(results),
                executionSummary,
            }
        } catch (error: unknown) {
            setToolState((prev) => ({
                ...prev,
                activeToolCalls: [],
                activeToolBatch: [],
                isProcessingTools: false,
            }))
            console.error('Tool processing error:', error instanceof Error ? error.message : error)

            return {
                hasTools: false,
                toolResults: [],
                formattedResults: [],
                needsFollowUp: false,
                shouldContinueResearch: false,
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
