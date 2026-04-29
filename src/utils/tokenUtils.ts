// Token estimation and context window optimization utilities

/**
 * Rough token estimation using character count
 * OpenAI uses ~4 chars per token on average for English
 * This is a fast approximation - use tiktoken for exact counts
 */
export function estimateTokens(text: string): number {
    if (!text) return 0
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens for a message object
 */
export function estimateMessageTokens(message: { role: string; content: string }): number {
    // Role overhead: ~4 tokens per message for role/formatting
    const roleOverhead = 4
    return roleOverhead + estimateTokens(message.content)
}

/**
 * Estimate total tokens for a conversation
 */
function estimateConversationTokens<T extends { role: string; content: string }>(
    messages: T[],
    systemPrompt?: string
): number {
    let total = 0

    if (systemPrompt) {
        total += estimateMessageTokens({ role: 'system', content: systemPrompt })
    }

    for (const msg of messages) {
        total += estimateMessageTokens(msg)
    }

    return total
}

interface ContextWindow {
    maxTokens: number
    reserveForResponse: number
}

const DEFAULT_CONTEXT_WINDOWS: Record<string, ContextWindow> = {
    'gpt-4': { maxTokens: 8192, reserveForResponse: 1000 },
    'gpt-4o': { maxTokens: 128000, reserveForResponse: 4000 },
    'gpt-4o-mini': { maxTokens: 128000, reserveForResponse: 4000 },
    'claude': { maxTokens: 200000, reserveForResponse: 4000 },
    'llama': { maxTokens: 8192, reserveForResponse: 1000 },
    'gemma': { maxTokens: 8192, reserveForResponse: 1000 },
    'mistral': { maxTokens: 32768, reserveForResponse: 2000 },
    'sonar': { maxTokens: 32768, reserveForResponse: 2000 },
    // OpenRouter models - allow up to 12k output tokens
    'openrouter': { maxTokens: 16384, reserveForResponse: 12000 },
    // Default for unknown models
    'default': { maxTokens: 8192, reserveForResponse: 1000 }
}

/**
 * Get context window for a model
 */
function getContextWindow(model: string): ContextWindow {
    const modelLower = model.toLowerCase()

    for (const [key, value] of Object.entries(DEFAULT_CONTEXT_WINDOWS)) {
        if (modelLower.includes(key)) {
            return value
        }
    }

    return DEFAULT_CONTEXT_WINDOWS.default
}

/**
 * Truncate conversation history to fit within context window
 * Strategies:
 * 1. Keep system prompt (always)
 * 2. Keep last N messages that fit
 * 3. Optionally summarize older messages
 */
function truncateHistory<T extends { role: string; content: string }>(
    messages: T[],
    systemPrompt: string | undefined,
    model: string,
    options: {
        keepLastN?: number          // Minimum messages to keep
        summarizeOlder?: boolean    // Whether to summarize truncated messages
    } = {}
): {
    truncatedMessages: Array<T | { role: string; content: string }>
    wasTruncated: boolean
    originalTokens: number
    finalTokens: number
} {
    const { keepLastN = 4, summarizeOlder = false } = options
    const contextWindow = getContextWindow(model)
    const availableTokens = contextWindow.maxTokens - contextWindow.reserveForResponse

    const originalTokens = estimateConversationTokens(messages, systemPrompt)

    // If we're under the limit, return as-is
    if (originalTokens <= availableTokens) {
        return {
            truncatedMessages: messages,
            wasTruncated: false,
            originalTokens,
            finalTokens: originalTokens
        }
    }

    // Start with system prompt tokens
    let usedTokens = systemPrompt ? estimateMessageTokens({ role: 'system', content: systemPrompt }) : 0

    // Always keep the last N messages (user-assistant pairs typically)
    const mustKeep = messages.slice(-keepLastN)
    const mustKeepTokens = mustKeep.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
    usedTokens += mustKeepTokens

    const olderMessages = messages.slice(0, -keepLastN)
    const truncatedMessages: Array<T | { role: string; content: string }> = []

    for (let i = olderMessages.length - 1; i >= 0; i--) {
        const msgTokens = estimateMessageTokens(olderMessages[i])
        if (usedTokens + msgTokens <= availableTokens) {
            truncatedMessages.unshift(olderMessages[i])
            usedTokens += msgTokens
        } else {
            // If summarization is enabled, add a summary of skipped messages
            if (summarizeOlder && i >= 0) {
                const skippedCount = i + 1
                const summaryMsg = {
                    role: 'system',
                    content: `[Previous ${skippedCount} messages were truncated to fit context window]`
                }
                truncatedMessages.unshift(summaryMsg)
                usedTokens += estimateMessageTokens(summaryMsg)
            }
            break
        }
    }

    truncatedMessages.push(...mustKeep)

    return {
        truncatedMessages,
        wasTruncated: true,
        originalTokens,
        finalTokens: usedTokens
    }
}

/**
 * Smart context builder - builds optimized message history for API calls
 */
export function buildOptimizedContext<T extends { role: string; content: string }>(
    messages: T[],
    newUserMessage: string | T,
    systemPrompt: string | undefined,
    model: string
): Array<T | { role: string; content: string }> {
    const nextUserMessage =
        typeof newUserMessage === 'string'
            ? ({ role: 'user', content: newUserMessage } as T)
            : newUserMessage

    const fullHistory = [...messages, nextUserMessage]

    // Truncate if needed
    const { truncatedMessages } = truncateHistory(fullHistory, systemPrompt, model, {
        keepLastN: 6,  // Keep at least 3 user-assistant pairs
        summarizeOlder: true
    })

    // Prepend system prompt
    const result: Array<T | { role: string; content: string }> = []
    if (systemPrompt) {
        result.push({ role: 'system', content: systemPrompt })
    }
    result.push(...truncatedMessages)

    return result
}
