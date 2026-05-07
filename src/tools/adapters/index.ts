// TOOL ADAPTERS - Convert tool definitions to provider-specific formats
//
// IMPORTANT: Provider Tool Support Policy
// The following providers are EXCLUDED from tool support and will NOT be
// added to the tool calling system:
//
// 1. PERPLEXITY - Has native built-in web search and research capabilities.
//    Adding external tools would interfere with their native functionality.
//
// DO NOT add 'perplexity' to:
// - providerSupportsTools()
// - convertToolsForProvider() switch cases
// - parseToolCallsFromResponse() switch cases
// - responseHasToolCalls() switch cases
// - formatResultsForProvider() switch cases
// - buildMessagesWithToolResults() switch cases
//
// Providers WITH tool support: openrouter, groq, ollama, alibaba, fireworks, deepseek

// Tool Adapters - Convert tool definitions to provider-specific formats

export * from './openrouter'
export * from './openrouterToolCalls'

import type { ToolDescriptor } from '../types'
import {
  modelSupportsTools as providerModelSupportsTools,
  providerSupportsTools as providerHasToolSupport,
  type ProviderId,
} from '../../providers'
import { convertToOpenRouterFormat, OpenAITool } from './openrouter'

export type ProviderToolFormat = OpenAITool[]

/**
 * Convert tools to the format required by a specific provider
 */
export function convertToolsForProvider(
  tools: ToolDescriptor[],
  provider: ProviderId
): ProviderToolFormat | null {
  if (!providerHasToolSupport(provider)) {
    return null
  }

  return convertToOpenRouterFormat(tools)
}

/**
 * Check if a provider supports function calling
 * EXCLUDED: perplexity (see header comment)
 */
export function providerSupportsTools(provider: string): boolean {
  return providerHasToolSupport(provider as ProviderId)
}

/**
 * Check if a specific model supports function calling
 * EXCLUDED: perplexity (see header comment)
 */
export function modelSupportsTools(provider: string, model: string): boolean {
  return providerModelSupportsTools(provider as ProviderId, model)
}
