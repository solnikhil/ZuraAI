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
        case 'codex':
            // All use OpenAI-compatible format
            return convertToOpenRouterFormat(tools)

        case 'gemini':
            return convertToGeminiFormat(tools)

        case 'ollama':
            // Ollama with compatible models (llama3.1+) uses OpenAI format
            return convertToOpenRouterFormat(tools)

        case 'perplexity':
            // Perplexity has built-in search, doesn't support custom tools
            return null

        default:
            return null
    }
}

/**
 * Check if a provider supports function calling
 */
export function providerSupportsTools(provider: string): boolean {
    return ['openrouter', 'gemini', 'groq', 'ollama', 'codex'].includes(provider)
}

/**
 * Get models that support function calling for each provider
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
 */
export function modelSupportsTools(provider: string, model: string): boolean {
    const supportedModels = modelsWithToolSupport[provider]
    if (!supportedModels) return false

    // Check if model name starts with any supported model
    return supportedModels.some(supported =>
        model.toLowerCase().includes(supported.toLowerCase())
    )
}

