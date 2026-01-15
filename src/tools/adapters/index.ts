// ============================================================================
// TOOL ADAPTERS - Convert tool definitions to provider-specific formats
// ============================================================================
//
// IMPORTANT: Provider Tool Support Policy
// ----------------------------------------
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
// Providers WITH tool support: openrouter, gemini, groq, ollama, minimax
// ============================================================================

// Tool Adapters - Convert tool definitions to provider-specific formats

export * from './openrouter'
export * from './gemini'

import { ToolDefinition } from '../definitions'
import { convertToOpenRouterFormat, OpenAITool } from './openrouter'
import { convertToGeminiFormat, GeminiTools } from './gemini'

export type ProviderToolFormat = OpenAITool[] | GeminiTools

/**
 * Convert tools to the format required by a specific provider
 */
export function convertToolsForProvider(
    tools: ToolDefinition[],
    provider: 'openrouter' | 'gemini' | 'groq' | 'ollama' | 'perplexity' | 'minimax'
): ProviderToolFormat | null {
    switch (provider) {
        case 'openrouter':
        case 'groq':
        case 'ollama':
        case 'minimax':
            // All use OpenAI-compatible format
            return convertToOpenRouterFormat(tools)

        case 'gemini':
            return convertToGeminiFormat(tools)

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
    return ['openrouter', 'gemini', 'groq', 'ollama', 'minimax'].includes(provider)
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
    gemini: [
        'gemini-3-flash-preview',
        'gemini-3-pro-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
    ],
    groq: [
        'llama-4-scout',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'deepseek-r1-distill-llama-70b',
        'mixtral-8x7b-32768',
    ],
    ollama: [
        'llama3.1',
        'llama3.2',
        'mistral',
        'mixtral',
    ],
    minimax: [
        'MiniMax-M2.1',
        'MiniMax-M2.1-lightning',
        'MiniMax-M2',
    ]
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
    return supportedModels.some(supported =>
        model.toLowerCase().includes(supported.toLowerCase())
    )
}

