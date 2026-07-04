// TOOL MANAGER - Coordinates tool execution in chat flow
//
// IMPORTANT: Provider Tool Support Policy
// The following providers are EXCLUDED from tool support:
//
// 1. PERPLEXITY - Has native built-in web search and research capabilities.
//    Adding external tools would interfere with their native functionality.
//
// DO NOT add 'perplexity' to tool support functions.
//
// Providers WITH tool support: openrouter, groq, ollama, alibaba, fireworks, deepseek

// Tool Manager - Coordinates tool execution in chat flow

import { getAllToolDefinitions, getToolByName } from './definitions'
import { convertToolsForProvider, providerSupportsTools, modelSupportsTools } from './adapters'
import { executeToolCalls } from './executor'
import { requiresManualToolApproval } from './approvalPolicy'
import type { ProviderId } from '../providers'
import {
  parseOpenRouterToolCalls,
  hasToolCalls,
  formatToolResultsForOpenRouter,
} from './adapters/openrouter'
import type { ServiceToolCall } from '../services/types'
import {
  ToolCall,
  ToolCallResult,
  OpenRouterResponse,
  OpenRouterToolResultMessage,
  ToolDescriptor,
  isMcpToolDescriptor,
  type ToolExecutionPolicy,
  type ToolExecutionSummary,
} from './types'
import { normalizeWebSearchQueryYear } from './webSearchPreferences'
import { trackAnalytics } from '../analytics/track'

type ProviderResponse = OpenRouterResponse

type FormattedToolResults = OpenRouterToolResultMessage[]

/**
 * Validate that all required parameters are present in tool arguments
 * Returns an error message if validation fails, null if valid
 */
function isMissingRequiredParameterValue(
  value: unknown,
  toolDef: ToolDescriptor,
  param: string
): boolean {
  if (value === undefined || value === null) {
    return true
  }

  const schema = toolDef.parameters.properties[param]
  if (schema?.type === 'string') {
    return typeof value !== 'string' || value.trim() === ''
  }

  return value === ''
}

function validateRequiredParameters(
  toolCall: ToolCall,
  availableTools: ToolDescriptor[]
): string | null {
  const toolDef = getToolByName(toolCall.name, availableTools)

  if (!toolDef) {
    const availableToolNames = availableTools.map((t) => t.name).join(', ')
    return `Unknown tool "${toolCall.name}". Available tools: ${availableToolNames}`
  }

  const requiredParams = toolDef.parameters.required || []
  const missingParams: string[] = []

  for (const param of requiredParams) {
    const value = toolCall.arguments[param]
    if (isMissingRequiredParameterValue(value, toolDef, param)) {
      missingParams.push(param)
    }
  }

  if (missingParams.length > 0) {
    return `Missing required parameter(s): ${missingParams.join(', ')}. Please provide ${missingParams.map((p) => `'${p}'`).join(' and ')} to use ${toolCall.name}.`
  }

  return null
}

/**
 * Coerce tool arguments to correct types based on tool definition schema
 */
function coerceToolArguments(toolCall: ToolCall, availableTools: ToolDescriptor[]): ToolCall {
  const toolDef = getToolByName(toolCall.name, availableTools)
  if (!toolDef) return toolCall

  const coercedArgs: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(toolCall.arguments)) {
    const paramDef = toolDef.parameters.properties[key]
    if (!paramDef) {
      // Unknown parameter, keep as-is
      coercedArgs[key] = value
      continue
    }

    // Coerce based on expected type
    if (paramDef.type === 'number') {
      if (typeof value === 'string' && value.trim() !== '') {
        const num = Number(value)
        coercedArgs[key] = isNaN(num)
          ? paramDef.default !== undefined
            ? paramDef.default
            : value
          : num
      } else if (typeof value === 'number') {
        coercedArgs[key] = value
      } else {
        coercedArgs[key] = paramDef.default !== undefined ? paramDef.default : value
      }
    } else if (paramDef.type === 'boolean') {
      if (typeof value === 'string') {
        coercedArgs[key] = value.toLowerCase() === 'true' || value === '1'
      } else {
        coercedArgs[key] = Boolean(value)
      }
    } else {
      // Keep as-is for strings, objects, arrays
      coercedArgs[key] = value
    }
  }

  return {
    ...toolCall,
    arguments: coercedArgs,
  }
}

export type { ToolCall, ToolCallResult }

export interface ToolManagerConfig {
  provider: ProviderId
  model: string
  modelSupportsTools?: boolean
  enabledTools?: string[] // If not provided, all tools enabled
  availableTools?: ToolDescriptor[]
  executionPolicy?: ToolExecutionPolicy
  onToolBatchStart?: (toolCalls: ToolCall[]) => void
  onToolApprovalStart?: (toolCall: ToolCall) => void
  onToolApprovalResolved?: (toolCall: ToolCall, approved: boolean) => void
  requestToolApproval?: (toolCall: ToolCall) => Promise<boolean>
  onToolStart?: (toolCall: ToolCall) => void
  onToolComplete?: (result: ToolCallResult) => void
}

function getWebSearchQuery(toolCall: ToolCall): string {
  return String(toolCall.arguments?.query || '').trim()
}

function normalizeWebSearchToolCall(toolCall: ToolCall, userContextText?: string): ToolCall {
  if (toolCall.name !== 'web_search' || typeof toolCall.arguments?.query !== 'string') {
    return toolCall
  }

  const trimmedQuery = toolCall.arguments.query.trim()
  const normalizedQuery = normalizeWebSearchQueryYear(trimmedQuery, userContextText).trim()
  if (normalizedQuery === toolCall.arguments.query) {
    return toolCall
  }

  return {
    ...toolCall,
    arguments: {
      ...toolCall.arguments,
      query: normalizedQuery,
    },
  }
}

function createSyntheticToolResult(
  toolCall: ToolCall,
  error: string,
  skippedReason: 'budget'
): ToolCallResult {
  return {
    toolCall,
    result: {
      success: false,
      error,
      metadata: {
        origin: 'builtin-main',
        executionDisposition: 'skipped',
        skippedReason,
      },
    },
  }
}

function trackToolResult(result: ToolCallResult): void {
  const metadata = result.result?.metadata as Record<string, unknown> | undefined
  const durationMs =
    typeof metadata?.durationMs === 'number' && Number.isFinite(metadata.durationMs)
      ? metadata.durationMs
      : undefined
  const success = result.result?.success === true
  const errorText = success
    ? undefined
    : typeof result.result?.error === 'string'
      ? result.result.error
      : typeof metadata?.outcome === 'string'
        ? metadata.outcome
        : 'tool_error'

  trackAnalytics('tool_used', {
    toolName: result.toolCall.name,
    success,
    durationMs,
    errorCategory: errorText,
  })

  if (result.toolCall.name === 'web_search') {
    trackAnalytics('web_search_used', {
      toolName: 'web_search',
      success,
      durationMs,
      errorCategory: errorText,
    })
  }
}

/**
 * Get tools formatted for the current provider
 */
export function getToolsForProvider(config: ToolManagerConfig) {
  if (!providerSupportsTools(config.provider)) {
    return null
  }

  if (config.modelSupportsTools === false) {
    return null
  }

  if (config.modelSupportsTools !== true && !modelSupportsTools(config.provider, config.model)) {
    return null
  }

  // Filter tools if specific ones are enabled
  let tools = config.availableTools ?? getAllToolDefinitions()
  if (config.enabledTools && config.enabledTools.length > 0) {
    const order = new Map(config.enabledTools.map((name, index) => [name, index]))
    tools = tools
      .filter((t) => order.has(t.name))
      .sort(
        (a, b) =>
          (order.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.name) ?? Number.MAX_SAFE_INTEGER)
      )
  }

  return convertToolsForProvider(tools, config.provider)
}

/**
 * Parse tool calls from AI response based on provider
 * EXCLUDED: perplexity (see header comment)
 */
export function parseToolCallsFromResponse(
  response: ProviderResponse,
  provider: string
): ToolCall[] {
  return providerSupportsTools(provider)
    ? parseOpenRouterToolCalls(response as OpenRouterResponse)
    : []
}

/**
 * Check if response has tool calls based on provider
 * EXCLUDED: perplexity (see header comment)
 */
export function responseHasToolCalls(response: ProviderResponse, provider: string): boolean {
  return providerSupportsTools(provider) && hasToolCalls(response as OpenRouterResponse)
}

/**
 * Format tool results for sending back to AI based on provider
 * EXCLUDED: perplexity (see header comment)
 */
export function formatResultsForProvider(
  toolCalls: ToolCall[],
  results: ToolCallResult[],
  provider: string
): FormattedToolResults {
  const toolResults = results.map((r) => r.result)

  return providerSupportsTools(provider)
    ? formatToolResultsForOpenRouter(toolCalls, toolResults)
    : []
}

/**
 * Process tool calls from AI response
 * Returns the results formatted for the provider
 */
export async function processToolCalls(
  response: ProviderResponse,
  config: ToolManagerConfig
): Promise<{
  toolCalls: ToolCall[]
  results: ToolCallResult[]
  formattedResults: FormattedToolResults
  executionSummary: ToolExecutionSummary
}> {
  const toolCalls = parseToolCallsFromResponse(response, config.provider)
  const executionSummary: ToolExecutionSummary = {
    attemptedWebSearchCount: 0,
    executedWebSearchCount: 0,
    executedWebSearchQueries: [],
  }

  if (toolCalls.length === 0) {
    return { toolCalls: [], results: [], formattedResults: [], executionSummary }
  }

  const availableTools = config.availableTools ?? getAllToolDefinitions()

  // Phase 1: Validate, apply web search batch policy, and preserve result ordering.
  const executableCalls: Array<{ index: number; toolCall: ToolCall }> = []
  const resultsByIndex = new Array<ToolCallResult>(toolCalls.length)
  let remainingWebSearchBudget = Math.max(
    0,
    Math.floor(config.executionPolicy?.remainingWebSearchBudget ?? Number.MAX_SAFE_INTEGER)
  )
  let remainingToolCallBudget = Math.max(
    0,
    Math.floor(config.executionPolicy?.remainingToolCallBudget ?? Number.MAX_SAFE_INTEGER)
  )
  const userContextText = config.executionPolicy?.userContextText

  for (const [index, toolCall] of toolCalls.entries()) {
    const coercedToolCall = normalizeWebSearchToolCall(
      coerceToolArguments(toolCall, availableTools),
      userContextText
    )
    const validationError = validateRequiredParameters(coercedToolCall, availableTools)

    if (validationError) {
      console.warn(`Tool validation failed for ${coercedToolCall.name}:`, validationError)
      config.onToolStart?.(coercedToolCall)
      const errorResult: ToolCallResult = {
        toolCall: coercedToolCall,
        result: { success: false, error: validationError },
      }
      resultsByIndex[index] = errorResult
      config.onToolComplete?.(errorResult)
      trackToolResult(errorResult)
      continue
    }

    if (coercedToolCall.name === 'web_search') {
      executionSummary.attemptedWebSearchCount += 1

      const query = getWebSearchQuery(coercedToolCall)
      if (remainingWebSearchBudget <= 0) {
        const budgetResult = createSyntheticToolResult(
          coercedToolCall,
          'Web search budget for this response has been reached. No additional results.',
          'budget'
        )
        config.onToolStart?.(coercedToolCall)
        resultsByIndex[index] = budgetResult
        config.onToolComplete?.(budgetResult)
        trackToolResult(budgetResult)
        continue
      }

      remainingWebSearchBudget -= 1
      if (query) {
        executionSummary.executedWebSearchQueries.push(query)
      }
      executionSummary.executedWebSearchCount += 1
    }

    if (remainingToolCallBudget <= 0) {
      const budgetResult = createSyntheticToolResult(
        coercedToolCall,
        'Tool call budget for this response has been reached. No additional tools were executed.',
        'budget'
      )
      config.onToolStart?.(coercedToolCall)
      resultsByIndex[index] = budgetResult
      config.onToolComplete?.(budgetResult)
      trackToolResult(budgetResult)
      continue
    }
    remainingToolCallBudget -= 1

    executableCalls.push({ index, toolCall: coercedToolCall })
  }

  // Phase 2: Gate executable calls behind optional manual approval, then execute approved calls.
  const executableToolCalls = executableCalls.map(({ toolCall }) => toolCall)
  if (executableToolCalls.length > 0) {
    config.onToolBatchStart?.(executableToolCalls)
  }

  for (const { index, toolCall: executableToolCall } of executableCalls) {
    if (
      config.requestToolApproval &&
      requiresManualToolApproval(executableToolCall, availableTools)
    ) {
      config.onToolApprovalStart?.(executableToolCall)
      const approved = await config.requestToolApproval(executableToolCall)
      config.onToolApprovalResolved?.(executableToolCall, approved)

      if (!approved) {
        if (executableToolCall.name === 'web_search') {
          executionSummary.executedWebSearchCount = Math.max(
            0,
            executionSummary.executedWebSearchCount - 1
          )
          const query = getWebSearchQuery(executableToolCall)
          executionSummary.executedWebSearchQueries =
            executionSummary.executedWebSearchQueries.filter((candidate) => candidate !== query)
        }
        const rejectedResult: ToolCallResult = {
          toolCall: executableToolCall,
          result: {
            success: false,
            error: 'Tool call rejected by user.',
          },
        }
        resultsByIndex[index] = rejectedResult
        config.onToolComplete?.(rejectedResult)
        trackToolResult(rejectedResult)
        continue
      }
    }

    config.onToolStart?.(executableToolCall)
  }

  const approvedExecutableCalls = executableCalls.filter(({ index }) => !resultsByIndex[index])

  const executionPromises = approvedExecutableCalls.map(
    async ({ index, toolCall: executableToolCall }) => {
      try {
        const executeOptions = config.requestToolApproval
          ? {
              userContextText,
              bypassNativeApproval: true,
              sessionId: config.executionPolicy?.sessionId,
              messageId: config.executionPolicy?.messageId,
            }
          : {
              userContextText,
              sessionId: config.executionPolicy?.sessionId,
              messageId: config.executionPolicy?.messageId,
            }
        const result = await executeToolCalls([executableToolCall], executeOptions)
        resultsByIndex[index] = result[0]
        config.onToolComplete?.(result[0])
        trackToolResult(result[0])
      } catch (execError: unknown) {
        const errorMessage =
          execError instanceof Error
            ? execError.message
            : `Failed to execute ${executableToolCall.name}`
        console.error(`Tool execution error for ${executableToolCall.name}:`, execError)
        const errorResult: ToolCallResult = {
          toolCall: executableToolCall,
          result: { success: false, error: errorMessage },
        }
        resultsByIndex[index] = errorResult
        config.onToolComplete?.(errorResult)
        trackToolResult(errorResult)
      }
    }
  )

  await Promise.all(executionPromises)
  const results = resultsByIndex.filter((result): result is ToolCallResult => Boolean(result))

  const formattedResults = formatResultsForProvider(toolCalls, results, config.provider)

  return { toolCalls, results, formattedResults, executionSummary }
}

// Message types for different providers
interface OpenRouterMessage {
  role: string
  content?: string | null
  tool_calls?: ServiceToolCall[]
}

type ProviderMessage = OpenRouterMessage

/**
 * Build messages array with tool results for follow-up API call
 * EXCLUDED: perplexity (see header comment)
 */
export function buildMessagesWithToolResults(
  originalMessages: ProviderMessage[],
  assistantMessage: ProviderMessage,
  toolResults: FormattedToolResults,
  provider: string
): ProviderMessage[] {
  return providerSupportsTools(provider)
    ? ([...originalMessages, assistantMessage, ...toolResults] as ProviderMessage[])
    : originalMessages
}

/**
 * Get a summary of available tools for the system prompt
 */
export function getToolsSummaryForPrompt(
  enabledTools?: string[],
  availableTools: ToolDescriptor[] = getAllToolDefinitions()
): string {
  let tools = availableTools
  if (enabledTools && enabledTools.length > 0) {
    tools = tools.filter((t) => enabledTools.includes(t.name))
  }

  const toolsList = tools
    .map((tool) => {
      if (isMcpToolDescriptor(tool)) {
        return `- ${tool.name} [MCP ${tool.mcp.serverName}/${tool.mcp.originalToolName}]: ${tool.description}`
      }

      return `- ${tool.name}: ${tool.description}`
    })
    .join('\n')

  return `You have access to the following tools:

${toolsList}

When you need to use a tool, the system will automatically execute the tool call and provide you with the result. Some tools may return a proposal that requires user approval before any external action happens; follow the tool description and the returned result.`
}
