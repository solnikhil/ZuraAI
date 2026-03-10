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
// Providers WITH tool support: openrouter, groq, ollama, alibaba

// Tool Adapters - Convert tool definitions to provider-specific formats

export * from './openrouter'

import { ToolDefinition } from '../definitions'
import { convertToOpenRouterFormat, OpenAITool } from './openrouter'

export type ProviderToolFormat = OpenAITool[]

/**
 * Convert tools to the format required by a specific provider
 */
export function convertToolsForProvider(
  tools: ToolDefinition[],
  provider: 'openrouter' | 'groq' | 'ollama' | 'perplexity' | 'alibaba'
): ProviderToolFormat | null {
  switch (provider) {
    case 'openrouter':
    case 'groq':
    case 'ollama':
    case 'alibaba':
      // All use OpenAI-compatible format
      return convertToOpenRouterFormat(tools)

    case 'perplexity':
      // EXCLUDED: Perplexity has native search
      // DO NOT add tool support for this provider
      return null

    default:
      return null
  }
}

/**
 * Check if a provider supports function calling
 * EXCLUDED: perplexity (see header comment)
 */
export function providerSupportsTools(provider: string): boolean {
  return ['openrouter', 'groq', 'ollama', 'alibaba'].includes(provider)
}

/**
 * Get models that support function calling for each provider
 * EXCLUDED: perplexity (see header comment)
 */
export const modelsWithToolSupport: Record<string, string[]> = {
  openrouter: [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-turbo',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-4-sonnet',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-3-opus',
    'google/gemini-3-flash-preview',
    'google/gemini-3-pro-preview',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash',
    'mistralai/mistral-large',
  ],
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'qwen/qwen3-32b',
    'moonshotai/kimi-k2-instruct-0905',
    'openai/gpt-oss-safeguard-20b',
  ],
  ollama: ['llama3.1', 'llama3.2', 'mistral', 'mixtral'],
  alibaba: [
    'qwen-plus',
    'qwen-max',
    'qwen-turbo',
    'qwen-flash',
    'qwen3-max',
    'qwen3-max-preview',
    'qwen3.5-plus',
    'qwen3-32b',
    'qwen3-14b',
    'qwen3-8b',
    'qwen3-next-80b',
    'qwen3-235b',
    'qwen3-30b',
    'qwen3.5-397b',
    'qwen2.5-72b',
    'qwen2.5-32b',
    'qwen2.5-14b',
    'qwen2.5-7b',
    'qwq-plus',
    'qwen3-coder-plus',
    'qwen3-coder-flash',
  ],
}

/**
 * Check if a specific model supports function calling
 * EXCLUDED: perplexity (see header comment)
 */
export function modelSupportsTools(provider: string, model: string): boolean {
  // OpenRouter: Allow ALL models to use tools for deep research functionality
  // Models that truly don't support tools will gracefully ignore tool_calls parameter
  if (provider === 'openrouter') {
    return true
  }

  // EXCLUDED: perplexity (see header comment)

  const supportedModels = modelsWithToolSupport[provider]
  if (!supportedModels) return false

  // Check if model name starts with any supported model
  return supportedModels.some((supported) => model.toLowerCase().includes(supported.toLowerCase()))
}
