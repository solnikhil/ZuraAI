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
} from './types'

// Type for provider API responses
type ProviderResponse = OpenRouterResponse

// Type for formatted tool results
type FormattedToolResults = OpenRouterToolResultMessage[]

/**
 * Validate that all required parameters are present in tool arguments
 * Returns an error message if validation fails, null if valid
 */
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
    // Check if parameter is missing, null, undefined, or empty string
    if (value === undefined || value === null || value === '') {
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
  onToolStart?: (toolCall: ToolCall) => void
  onToolComplete?: (result: ToolCallResult) => void
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
  switch (provider) {
    case 'openrouter':
    case 'groq':
    case 'ollama':
    case 'alibaba':
    case 'fireworks':
      return parseOpenRouterToolCalls(response as OpenRouterResponse)
    case 'perplexity':
      // EXCLUDED: This provider has native capabilities
      return []
    default:
      return []
  }
}

/**
 * Check if response has tool calls based on provider
 * EXCLUDED: perplexity (see header comment)
 */
export function responseHasToolCalls(response: ProviderResponse, provider: string): boolean {
  switch (provider) {
    case 'openrouter':
    case 'groq':
    case 'ollama':
    case 'alibaba':
    case 'fireworks':
      return hasToolCalls(response as OpenRouterResponse)
    case 'perplexity':
      // EXCLUDED: This provider has native capabilities
      return false
    default:
      return false
  }
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

  switch (provider) {
    case 'openrouter':
    case 'groq':
    case 'ollama':
    case 'alibaba':
    case 'fireworks':
      return formatToolResultsForOpenRouter(toolCalls, toolResults)
    case 'perplexity':
      // EXCLUDED: This provider has native capabilities
      return []
    default:
      return []
  }
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
}> {
  const toolCalls = parseToolCallsFromResponse(response, config.provider)

  if (toolCalls.length === 0) {
    return { toolCalls: [], results: [], formattedResults: [] }
  }

  const availableTools = config.availableTools ?? getAllToolDefinitions()

  // Phase 1: Validate, coerce, and separate valid from invalid tool calls
  const validCalls: ToolCall[] = []
  const errorResults: ToolCallResult[] = []

  for (const toolCall of toolCalls) {
    const coercedToolCall = coerceToolArguments(toolCall, availableTools)
    const validationError = validateRequiredParameters(coercedToolCall, availableTools)

    if (validationError) {
      console.warn(`Tool validation failed for ${coercedToolCall.name}:`, validationError)
      config.onToolStart?.(coercedToolCall)
      const errorResult: ToolCallResult = {
        toolCall: coercedToolCall,
        result: { success: false, error: validationError },
      }
      errorResults.push(errorResult)
      config.onToolComplete?.(errorResult)
    } else {
      validCalls.push(coercedToolCall)
    }
  }

  // Phase 2: Fire onToolStart for all valid calls, then execute in parallel
  for (const tc of validCalls) {
    config.onToolStart?.(tc)
  }

  const executionPromises = validCalls.map(async (coercedToolCall): Promise<ToolCallResult> => {
    try {
      const result = await executeToolCalls([coercedToolCall])
      config.onToolComplete?.(result[0])
      return result[0]
    } catch (execError: unknown) {
      const errorMessage =
        execError instanceof Error ? execError.message : `Failed to execute ${coercedToolCall.name}`
      console.error(`Tool execution error for ${coercedToolCall.name}:`, execError)
      const errorResult: ToolCallResult = {
        toolCall: coercedToolCall,
        result: { success: false, error: errorMessage },
      }
      config.onToolComplete?.(errorResult)
      return errorResult
    }
  })

  const executionResults = await Promise.all(executionPromises)
  const results = [...errorResults, ...executionResults]

  const formattedResults = formatResultsForProvider(toolCalls, results, config.provider)

  return { toolCalls, results, formattedResults }
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
  switch (provider) {
    case 'openrouter':
    case 'groq':
    case 'ollama':
    case 'alibaba':
    case 'fireworks':
      return [...originalMessages, assistantMessage, ...toolResults] as ProviderMessage[]

    case 'perplexity':
      // EXCLUDED: This provider has native capabilities
      return originalMessages

    default:
      return originalMessages
  }
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
