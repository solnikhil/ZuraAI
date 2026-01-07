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
// 2. CODEX - Uses specialized API with built-in reasoning capabilities.
//    External tools are not compatible with their API structure.
//
// DO NOT add 'perplexity' or 'codex' to:
// - providerSupportsTools()
// - convertToolsForProvider() switch cases
// - parseToolCallsFromResponse() switch cases
// - responseHasToolCalls() switch cases
// - formatResultsForProvider() switch cases
// - buildMessagesWithToolResults() switch cases
//
// Providers WITH tool support: openrouter, gemini, groq, ollama
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
    provider: 'openrouter' | 'gemini' | 'groq' | 'ollama' | 'perplexity' | 'codex'
): ProviderToolFormat | null {
    switch (provider) {
        case 'openrouter':
        case 'groq':
            // All use OpenAI-compatible format
            return convertToOpenRouterFormat(tools)

        case 'gemini':
            return convertToGeminiFormat(tools)

        case 'ollama':
            // Ollama with compatible models (llama3.1+) uses OpenAI format
            return convertToOpenRouterFormat(tools)

        case 'perplexity':
        case 'codex':
            // EXCLUDED: Perplexity has native search, Codex has specialized API
            // DO NOT add tool support for these providers
            return null

        default:
            return null
    }
}

/**
 * Check if a provider supports function calling
 * EXCLUDED: perplexity, codex (see header comment)
 */
export function providerSupportsTools(provider: string): boolean {
    return ['openrouter', 'gemini', 'groq', 'ollama'].includes(provider)
}

/**
 * Get models that support function calling for each provider
 * EXCLUDED: perplexity, codex (see header comment)
 */
export const modelsWithToolSupport: Record<string, string[]> = {
    openrouter: [
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-4-turbo',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
        'google/gemini-pro',
        'mistralai/mistral-large',
    ],
    gemini: [
        'gemini-2.0-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
    ],
    groq: [
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'llama-4-scout',
        'mixtral-8x7b-32768',
        'meta-llama',
    ],
    ollama: [
        'llama3.1',
        'llama3.2',
        'mistral',
        'mixtral',
    ]
}

/**
 * Check if a specific model supports function calling
 * EXCLUDED: perplexity, codex (see header comment)
 */
export function modelSupportsTools(provider: string, model: string): boolean {
    // OpenRouter: Allow ALL models to use tools for deep research functionality
    // Models that truly don't support tools will gracefully ignore tool_calls parameter
    if (provider === 'openrouter') {
        return true
    }

    // EXCLUDED: codex (see header comment)
    // EXCLUDED: perplexity (see header comment)

    const supportedModels = modelsWithToolSupport[provider]
    if (!supportedModels) return false

    // Check if model name starts with any supported model
    return supportedModels.some(supported =>
        model.toLowerCase().includes(supported.toLowerCase())
    )
}

