// TOOL MANAGER - Coordinates tool execution in chat flow
//
// IMPORTANT: Provider Tool Support Policy
// Providers WITH tool support: openrouter, groq, ollama, alibaba, fireworks, deepseek

// Tool Manager - Coordinates tool execution in chat flow

import { getAllToolDefinitions } from './definitions'
import { validateToolCall } from '@zura/provider-core'
import { convertToolsForProvider, providerSupportsTools, modelSupportsTools } from './adapters'
import { executeToolCalls } from './executor'
import { requiresManualToolApproval } from './approvalPolicy'
import { getToolSecurityProfile } from './builtinMainToolContract'
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
  type ToolApprovalDecision,
  type ToolApprovalAuthorization,
} from './types'
import { normalizeWebSearchQueryYear } from './webSearchPreferences'
import { trackAnalytics } from '../analytics/track'

type ProviderResponse = OpenRouterResponse

type FormattedToolResults = OpenRouterToolResultMessage[]

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
  onToolApprovalResolved?: (toolCall: ToolCall, decision: ToolApprovalDecision) => void
  requestToolApproval?: (toolCall: ToolCall) => Promise<ToolApprovalAuthorization | boolean>
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

function normalizeApprovalDecision(
  value: ToolApprovalAuthorization | boolean
): ToolApprovalAuthorization {
  return typeof value === 'boolean'
    ? { approved: value, outcome: value ? 'approved_once' : 'rejected' }
    : value
}

function withoutApprovalAuthorization(decision: ToolApprovalAuthorization): ToolApprovalDecision {
  return { approved: decision.approved, outcome: decision.outcome }
}

function approvalFailureMessage(outcome: ToolApprovalDecision['outcome']): string {
  switch (outcome) {
    case 'rejected':
      return 'Tool call rejected by user.'
    case 'timed_out':
      return 'Tool approval timed out.'
    case 'cancelled':
      return 'Tool approval was cancelled.'
    case 'unavailable':
      return 'Tool approval is unavailable.'
    case 'error':
      return 'Tool approval failed because the approval service returned an error.'
    default:
      return 'Tool call was not approved.'
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
 */
export function responseHasToolCalls(response: ProviderResponse, provider: string): boolean {
  return providerSupportsTools(provider) && hasToolCalls(response as OpenRouterResponse)
}

/**
 * Format tool results for sending back to AI based on provider
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

  const coreToolDefinitions = availableTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters as Record<string, unknown>,
    strict: true,
  }))

  for (const [index, toolCall] of toolCalls.entries()) {
    const normalizedToolCall = normalizeWebSearchToolCall(toolCall, userContextText)
    const validation = normalizedToolCall.validationError
      ? null
      : validateToolCall({
          id: normalizedToolCall.id,
          name: normalizedToolCall.name,
          rawArguments: normalizedToolCall.arguments,
          tools: coreToolDefinitions,
        })
    const validationError =
      normalizedToolCall.validationError ||
      (validation && !validation.ok ? validation.error.message : null)

    if (validationError) {
      console.warn(`Tool validation failed for ${normalizedToolCall.name}:`, validationError)
      config.onToolStart?.(normalizedToolCall)
      const errorResult: ToolCallResult = {
        toolCall: normalizedToolCall,
        result: { success: false, error: validationError },
      }
      resultsByIndex[index] = errorResult
      config.onToolComplete?.(errorResult)
      trackToolResult(errorResult)
      continue
    }

    if (!validation || !validation.ok) {
      throw new Error('Tool validation reached an inconsistent state.')
    }
    const validatedToolCall = validation.toolCall

    if (validatedToolCall.name === 'web_search') {
      executionSummary.attemptedWebSearchCount += 1

      const query = getWebSearchQuery(validatedToolCall)
      if (remainingWebSearchBudget <= 0) {
        const budgetResult = createSyntheticToolResult(
          validatedToolCall,
          'Web search budget for this response has been reached. No additional results.',
          'budget'
        )
        config.onToolStart?.(validatedToolCall)
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
        validatedToolCall,
        'Tool call budget for this response has been reached. No additional tools were executed.',
        'budget'
      )
      config.onToolStart?.(validatedToolCall)
      resultsByIndex[index] = budgetResult
      config.onToolComplete?.(budgetResult)
      trackToolResult(budgetResult)
      continue
    }
    remainingToolCallBudget -= 1

    executableCalls.push({ index, toolCall: validatedToolCall })
  }

  // Phase 2: Gate executable calls behind optional manual approval, then execute approved calls.
  const executableToolCalls = executableCalls.map(({ toolCall }) => toolCall)
  if (executableToolCalls.length > 0) {
    config.onToolBatchStart?.(executableToolCalls)
  }

  const approvalTokensByIndex = new Map<number, string>()
  for (const { index, toolCall: executableToolCall } of executableCalls) {
    if (
      config.requestToolApproval &&
      requiresManualToolApproval(executableToolCall, availableTools)
    ) {
      config.onToolApprovalStart?.(executableToolCall)
      const approvalDecision = normalizeApprovalDecision(
        await config.requestToolApproval(executableToolCall)
      )
      config.onToolApprovalResolved?.(
        executableToolCall,
        withoutApprovalAuthorization(approvalDecision)
      )

      if (!approvalDecision.approved) {
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
            error: approvalFailureMessage(approvalDecision.outcome),
          },
        }
        resultsByIndex[index] = rejectedResult
        config.onToolComplete?.(rejectedResult)
        trackToolResult(rejectedResult)
        continue
      }

      if (approvalDecision.approvalToken) {
        approvalTokensByIndex.set(index, approvalDecision.approvalToken)
      }
    }

    config.onToolStart?.(executableToolCall)
  }

  const approvedExecutableCalls = executableCalls.filter(({ index }) => !resultsByIndex[index])

  const executeApprovedCall = async ({
    index,
    toolCall: executableToolCall,
  }: (typeof approvedExecutableCalls)[number]) => {
    try {
      // Remove the authorization from local approval state before dispatch so this
      // exact execution closure is the only code path that can forward it.
      const approvalToken = approvalTokensByIndex.get(index)
      approvalTokensByIndex.delete(index)
      const executeOptions = {
        runId: config.executionPolicy?.runId,
        userContextText,
        approvalToken,
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

  let serialMutationTail: Promise<void> = Promise.resolve()
  const executionPromises = approvedExecutableCalls.map((call) => {
    const concurrency = getToolSecurityProfile(
      call.toolCall.name,
      call.toolCall.arguments
    )?.concurrency
    if (concurrency === 'parallel') return executeApprovedCall(call)

    const scheduled = serialMutationTail.then(() => executeApprovedCall(call))
    serialMutationTail = scheduled.then(
      () => undefined,
      () => undefined
    )
    return scheduled
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
  tool_calls?: ServiceToolCall[]
}

type ProviderMessage = OpenRouterMessage

/**
 * Build messages array with tool results for follow-up API call
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
