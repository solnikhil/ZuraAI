/**
 * Property-based tests for Codex Provider Service
 * 
 * Feature: codex-provider
 * Uses Vitest with fast-check for property-based testing
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    CodexResponse,
    CodexStreamChunk,
    formatMessagesForCodex,
    formatImageForCodex,
    parseCodexResponse,
    extractCodexUsage,
    sanitizeError,
    parseCodexError
} from './codex'
import { ChatMessage } from './types'

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generate valid CodexResponse objects
 */
const codexResponseArb = fc.record({
    id: fc.string({ minLength: 1 }),
    choices: fc.array(
        fc.record({
            message: fc.record({
                role: fc.constantFrom('assistant', 'user', 'system'),
                content: fc.string()
            }),
            finish_reason: fc.option(fc.constantFrom('stop', 'length', 'content_filter'), { nil: null })
        }),
        { minLength: 1, maxLength: 3 }
    ),
    usage: fc.option(
        fc.record({
            prompt_tokens: fc.nat({ max: 100000 }),
            completion_tokens: fc.nat({ max: 100000 }),
            total_tokens: fc.nat({ max: 200000 })
        }),
        { nil: undefined }
    )
}) as fc.Arbitrary<CodexResponse>

/**
 * Generate valid CodexStreamChunk objects
 */
const codexStreamChunkArb = fc.record({
    id: fc.string({ minLength: 1 }),
    choices: fc.array(
        fc.record({
            delta: fc.option(
                fc.record({
                    content: fc.option(fc.string(), { nil: undefined }),
                    role: fc.option(fc.constantFrom('assistant'), { nil: undefined })
                }),
                { nil: undefined }
            ),
            finish_reason: fc.option(fc.constantFrom('stop', 'length'), { nil: null })
        }),
        { minLength: 1, maxLength: 1 }
    ),
    usage: fc.option(
        fc.record({
            prompt_tokens: fc.nat({ max: 100000 }),
            completion_tokens: fc.nat({ max: 100000 }),
            total_tokens: fc.nat({ max: 200000 })
        }),
        { nil: undefined }
    )
}) as fc.Arbitrary<CodexStreamChunk>

/**
 * Generate valid ChatMessage arrays
 */
const chatMessageArb = fc.record({
    role: fc.constantFrom('user', 'assistant', 'system'),
    content: fc.string()
}) as fc.Arbitrary<ChatMessage>

const chatMessagesArb = fc.array(chatMessageArb, { minLength: 1, maxLength: 10 })

/**
 * Generate base64 image data
 */
const base64ImageArb = fc.tuple(
    fc.constantFrom('image/png', 'image/jpeg', 'image/gif', 'image/webp'),
    fc.base64String({ minLength: 10, maxLength: 100 })
).map(([mimeType, data]) => ({
    dataUrl: `data:${mimeType};base64,${data}`,
    rawBase64: data,
    mimeType
}))

/**
 * Generate error objects with potential sensitive data
 */
const errorWithSensitiveDataArb = fc.record({
    message: fc.oneof(
        fc.constant('Bearer sk-abc123xyz token error'),
        fc.constant('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U failed'),
        fc.constant('API key sk-or-v1-abc123 is invalid'),
        fc.string()
    ),
    headers: fc.option(
        fc.record({
            authorization: fc.option(fc.string(), { nil: undefined }),
            Authorization: fc.option(fc.string(), { nil: undefined }),
            'content-type': fc.constant('application/json')
        }),
        { nil: undefined }
    )
})

// ============================================================================
// Property Tests
// ============================================================================

describe('Codex Provider - Property Tests', () => {
    /**
     * Property 3: Response Format Consistency
     * For any valid Codex API response, parsing SHALL produce a CodexResponse object
     * with: id (string), choices array with message objects, and optional usage metadata.
     * 
     * Validates: Requirements 1.4
     */
    describe('Property 3: Response Format Consistency', () => {
        it('should parse any valid CodexResponse and extract content', () => {
            fc.assert(
                fc.property(codexResponseArb, (response) => {
                    // Parse response
                    const content = parseCodexResponse(response)
                    
                    // Content should be a string
                    expect(typeof content).toBe('string')
                    
                    // If choices exist with message, content should match
                    if (response.choices.length > 0 && response.choices[0].message) {
                        expect(content).toBe(response.choices[0].message.content)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should have consistent structure for all valid responses', () => {
            fc.assert(
                fc.property(codexResponseArb, (response) => {
                    // Response must have id
                    expect(typeof response.id).toBe('string')
                    
                    // Response must have choices array
                    expect(Array.isArray(response.choices)).toBe(true)
                    expect(response.choices.length).toBeGreaterThan(0)
                    
                    // Each choice must have message with role and content
                    response.choices.forEach(choice => {
                        expect(typeof choice.message.role).toBe('string')
                        expect(typeof choice.message.content).toBe('string')
                    })
                    
                    // Usage is optional but if present, must have correct structure
                    if (response.usage) {
                        expect(typeof response.usage.prompt_tokens).toBe('number')
                        expect(typeof response.usage.completion_tokens).toBe('number')
                        expect(typeof response.usage.total_tokens).toBe('number')
                    }
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 6: Message Format Compatibility
     * For any ChatMessage array passed to the Codex service, the messages SHALL be
     * formatted according to OpenAI chat completion API specification.
     * 
     * Validates: Requirements 6.2
     */
    describe('Property 6: Message Format Compatibility', () => {
        it('should preserve role and content for all messages', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    // Same number of messages
                    expect(formatted.length).toBe(messages.length)
                    
                    // Each message preserves role and content
                    formatted.forEach((msg, i) => {
                        expect(msg.role).toBe(messages[i].role)
                        expect(msg.content).toBe(messages[i].content)
                    })
                }),
                { numRuns: 100 }
            )
        })

        it('should produce valid OpenAI-compatible format', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    // Each formatted message has required fields
                    formatted.forEach(msg => {
                        expect(msg).toHaveProperty('role')
                        expect(msg).toHaveProperty('content')
                        expect(['user', 'assistant', 'system']).toContain(msg.role)
                    })
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 7: Response Metadata Extraction
     * For any Codex response containing usage metadata, the system SHALL extract
     * and report: prompt_tokens as inputTokens, completion_tokens as outputTokens,
     * and total_tokens as totalTokens.
     * 
     * Validates: Requirements 6.4, 6.5
     */
    describe('Property 7: Response Metadata Extraction', () => {
        it('should correctly extract usage from CodexResponse', () => {
            fc.assert(
                fc.property(codexResponseArb, (response) => {
                    const usage = extractCodexUsage(response)
                    
                    // Usage object has correct structure
                    expect(typeof usage.inputTokens).toBe('number')
                    expect(typeof usage.outputTokens).toBe('number')
                    expect(typeof usage.totalTokens).toBe('number')
                    
                    // Values are non-negative
                    expect(usage.inputTokens).toBeGreaterThanOrEqual(0)
                    expect(usage.outputTokens).toBeGreaterThanOrEqual(0)
                    expect(usage.totalTokens).toBeGreaterThanOrEqual(0)
                    
                    // If response has usage, values should match
                    if (response.usage) {
                        expect(usage.inputTokens).toBe(response.usage.prompt_tokens)
                        expect(usage.outputTokens).toBe(response.usage.completion_tokens)
                        expect(usage.totalTokens).toBe(response.usage.total_tokens)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should correctly extract usage from CodexStreamChunk', () => {
            fc.assert(
                fc.property(codexStreamChunkArb, (chunk) => {
                    const usage = extractCodexUsage(chunk)
                    
                    // Usage object has correct structure
                    expect(typeof usage.inputTokens).toBe('number')
                    expect(typeof usage.outputTokens).toBe('number')
                    expect(typeof usage.totalTokens).toBe('number')
                    
                    // Values are non-negative
                    expect(usage.inputTokens).toBeGreaterThanOrEqual(0)
                    expect(usage.outputTokens).toBeGreaterThanOrEqual(0)
                    expect(usage.totalTokens).toBeGreaterThanOrEqual(0)
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 8: Vision Message Handling
     * For any message containing image data when using a vision-capable Codex model,
     * the image SHALL be formatted as base64 inline_data with correct mime_type.
     * 
     * Validates: Requirements 6.6
     */
    describe('Property 8: Vision Message Handling', () => {
        it('should format images with correct structure', () => {
            fc.assert(
                fc.property(base64ImageArb, ({ dataUrl, mimeType }) => {
                    const formatted = formatImageForCodex(dataUrl, mimeType)
                    
                    // Has correct type
                    expect(formatted.type).toBe('image_url')
                    
                    // Has image_url with url
                    expect(formatted.image_url).toBeDefined()
                    expect(typeof formatted.image_url.url).toBe('string')
                    
                    // URL contains base64 data
                    expect(formatted.image_url.url).toContain('base64,')
                    
                    // URL contains mime type
                    expect(formatted.image_url.url).toContain(mimeType)
                }),
                { numRuns: 100 }
            )
        })

        it('should handle raw base64 without data URL prefix', () => {
            fc.assert(
                fc.property(base64ImageArb, ({ rawBase64, mimeType }) => {
                    const formatted = formatImageForCodex(rawBase64, mimeType)
                    
                    // Should still produce valid structure
                    expect(formatted.type).toBe('image_url')
                    expect(formatted.image_url.url).toContain('base64,')
                    expect(formatted.image_url.url).toContain(mimeType)
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 9: Safe Error Handling
     * For any error occurring during Codex operations, the error SHALL be logged
     * with sufficient detail for debugging BUT the log output SHALL NOT contain
     * the Auth_Token or any credential data.
     * 
     * Validates: Requirements 5.6, 7.3, 8.3
     */
    describe('Property 9: Safe Error Handling', () => {
        it('should sanitize Bearer tokens from error messages', () => {
            fc.assert(
                fc.property(errorWithSensitiveDataArb, (error) => {
                    const sanitized = sanitizeError(error)
                    
                    // Message should not contain Bearer tokens
                    if (sanitized.message) {
                        expect(sanitized.message).not.toMatch(/Bearer\s+[A-Za-z0-9\-_]{10,}/i)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should sanitize API keys from error messages', () => {
            fc.assert(
                fc.property(errorWithSensitiveDataArb, (error) => {
                    const sanitized = sanitizeError(error)
                    
                    // Message should not contain sk- prefixed keys
                    if (sanitized.message) {
                        expect(sanitized.message).not.toMatch(/sk-[A-Za-z0-9\-_]{10,}/i)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should sanitize JWT tokens from error messages', () => {
            fc.assert(
                fc.property(errorWithSensitiveDataArb, (error) => {
                    const sanitized = sanitizeError(error)
                    
                    // Message should not contain JWT tokens (eyJ...)
                    if (sanitized.message) {
                        expect(sanitized.message).not.toMatch(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/i)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should remove authorization headers', () => {
            fc.assert(
                fc.property(errorWithSensitiveDataArb, (error) => {
                    const sanitized = sanitizeError(error)
                    
                    // Headers should not contain authorization
                    if (sanitized.headers) {
                        expect(sanitized.headers).not.toHaveProperty('authorization')
                        expect(sanitized.headers).not.toHaveProperty('Authorization')
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should produce user-friendly error messages', () => {
            // Test specific error codes
            expect(parseCodexError({}, 401)).toContain('sign in')
            expect(parseCodexError({}, 429)).toContain('Rate limit')
            expect(parseCodexError({}, 503)).toContain('unavailable')
            expect(parseCodexError({ message: 'model not found' }, 400)).toContain('model')
        })
    })
})
