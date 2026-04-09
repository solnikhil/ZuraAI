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
// Providers WITH tool support: openrouter, groq, ollama, alibaba, fireworks

// Tool Manager - Coordinates tool execution in chat flow

import { getAllToolDefinitions, getToolByName } from './definitions'
import { convertToolsForProvider, providerSupportsTools, modelSupportsTools } from './adapters'
import type { ProviderId } from '../providers'
import {
  parseOpenRouterToolCalls,
  hasToolCalls,
  formatToolResultsForOpenRouter,
} from './adapters/openrouter'
import { executeToolCalls } from './executor'
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
import { classifyResearchQueryDuplicate } from '../components/Dashboard/ChatArea/hooks/streaming/researchLoopPolicy'
import { normalizeWebSearchQueryYear } from './webSearchPreferences'

// Type for provider API responses
type ProviderResponse = OpenRouterResponse

// Type for formatted tool results
type FormattedToolResults = OpenRouterToolResultMessage[]

/**
 * Validate that all required parameters are present in tool arguments
 * Returns an error message if validation fails, null if valid
 */
function isMissingRequiredParameterValue(value: unknown, toolDef: ToolDescriptor, param: string): boolean {
  if (value === undefined || value === null) {
    return true
  }

  const schema = toolDef.parameters.properties[param]
  if (schema?.type === 'string') {
    return typeof value !== 'string' || value.trim() === ''
  }

  return value === ''
}

function validateRequiredParameters(toolCall: ToolCall, availableTools: ToolDescriptor[]): string | null {
  const toolDef = getToolByName(toolCall.name, availableTools)

  // Check if tool exists
  if (!toolDef) {
    const availableToolNames = availableTools
      .map((t) => t.name)
      .join(', ')
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
      // Convert string numbers to actual numbers
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
      // Convert string booleans to actual booleans
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
  enabledTools?: string[] // If not provided, all tools enabled
  availableTools?: ToolDescriptor[]
  executionPolicy?: ToolExecutionPolicy
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
  skippedReason: 'budget' | 'duplicate-query' | 'duplicate-facet'
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

/**
 * Get tools formatted for the current provider
 */
export function getToolsForProvider(config: ToolManagerConfig) {
  if (!providerSupportsTools(config.provider)) {
    return null
  }

  if (!modelSupportsTools(config.provider, config.model)) {
    return null
  }

  // Filter tools if specific ones are enabled
  let tools = config.availableTools ?? getAllToolDefinitions()
  if (config.enabledTools && config.enabledTools.length > 0) {
    tools = tools.filter((t) => config.enabledTools!.includes(t.name))
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
  const priorWebSearchQueries = [...(config.executionPolicy?.priorWebSearchQueries ?? [])]
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
      continue
    }

    if (coercedToolCall.name === 'web_search') {
      executionSummary.attemptedWebSearchCount += 1

      const query = getWebSearchQuery(coercedToolCall)
      const duplicateReason = classifyResearchQueryDuplicate(query, priorWebSearchQueries)
      if (duplicateReason) {
        const duplicateResult = createSyntheticToolResult(
          coercedToolCall,
          duplicateReason === 'duplicate-query'
            ? 'Skipped duplicate web_search query in this response. Change the angle or synthesize from existing results.'
            : 'Skipped web_search call because this facet was already searched in this response. Try a different facet or synthesize from existing results.',
          duplicateReason
        )
        config.onToolStart?.(coercedToolCall)
        resultsByIndex[index] = duplicateResult
        config.onToolComplete?.(duplicateResult)
        continue
      }

      if (remainingWebSearchBudget <= 0) {
        const budgetResult = createSyntheticToolResult(
          coercedToolCall,
          'Skipped web_search call because the per-response search budget has been reached. Synthesize from the evidence already gathered.',
          'budget'
        )
        config.onToolStart?.(coercedToolCall)
        resultsByIndex[index] = budgetResult
        config.onToolComplete?.(budgetResult)
        continue
      }

      remainingWebSearchBudget -= 1
      if (query) {
        priorWebSearchQueries.push(query)
        executionSummary.executedWebSearchQueries.push(query)
      }
      executionSummary.executedWebSearchCount += 1
    }

    executableCalls.push({ index, toolCall: coercedToolCall })
  }

  // Phase 2: Fire onToolStart for all executable calls, then execute them in parallel.
  for (const { toolCall: executableToolCall } of executableCalls) {
    config.onToolStart?.(executableToolCall)
  }

  const executionPromises = executableCalls.map(async ({ index, toolCall: executableToolCall }) => {
    try {
      const result = await executeToolCalls([executableToolCall])
      resultsByIndex[index] = result[0]
      config.onToolComplete?.(result[0])
    } catch (execError: unknown) {
      const errorMessage =
        execError instanceof Error ? execError.message : `Failed to execute ${executableToolCall.name}`
      console.error(`Tool execution error for ${executableToolCall.name}:`, execError)
      const errorResult: ToolCallResult = {
        toolCall: executableToolCall,
        result: { success: false, error: errorMessage },
      }
      resultsByIndex[index] = errorResult
      config.onToolComplete?.(errorResult)
    }
  })

  await Promise.all(executionPromises)
  const results = resultsByIndex.filter((result): result is ToolCallResult => Boolean(result))

  const formattedResults = formatResultsForProvider(toolCalls, results, config.provider)

  return { toolCalls, results, formattedResults, executionSummary }
}

// Message types for different providers
interface OpenRouterMessage {
  role: string
  content?: string | null
  tool_calls?: unknown[]
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
