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
import { getToolByName } from '../tools/definitions'
import { shouldEnableTools } from '../utils/promptSelection'

export interface ToolCallState {
    activeToolCalls: ToolCall[]
    toolResults: ToolCallResult[]
    isProcessingTools: boolean
    pendingApproval: ToolCall | null
}

export interface ApprovalCallbacks {
    onApprove: () => void
    onReject: () => void
}

export function useToolCalling() {
    const { settings } = useSettings()
    const [toolState, setToolState] = useState<ToolCallState>({
        activeToolCalls: [],
        toolResults: [],
        isProcessingTools: false,
        pendingApproval: null
    })

    // Refs to store approval resolution callbacks
    const approvalResolveRef = useRef<((approved: boolean) => void) | null>(null)

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
            enabledTools: settings.enabledTools.length > 0 ? settings.enabledTools : undefined
        })

        return tools !== null
    }

    /**
     * Get tools formatted for current provider
     */
    const getToolsForRequest = () => {
        if (!canUseTools()) return null

        return getToolsForProvider({
            provider: settings.modelProvider,
            model: settings.aiModel,
            enabledTools: settings.enabledTools.length > 0 ? settings.enabledTools : undefined
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
            const { toolCalls, results, formattedResults } = await processToolCalls(response, {
                provider: settings.modelProvider,
                model: settings.aiModel,
                enabledTools: settings.enabledTools.length > 0 ? settings.enabledTools : undefined,
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
                    setToolState(prev => ({
                        ...prev,
                        activeToolCalls: prev.activeToolCalls.filter(tc => tc.id !== result.toolCall.id),
                        toolResults: [...prev.toolResults, result]
                    }))
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
            activeToolCalls: [],
            toolResults: [],
            isProcessingTools: false,
            pendingApproval: null
        })
    }

    return {
        canUseTools: canUseTools(),
        getToolsForRequest,
        handleToolCalls,
        toolState,
        clearToolState,
        handleApprovalResponse,
        shouldRequireApproval
    }
}

