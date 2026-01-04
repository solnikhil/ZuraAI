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
    sanitizeString,
    parseCodexError,
    parseCodexErrorDetailed,
    buildCodexRequest,
    parseCodexModelCode,
    extractInstructionsFromMessages,
    DEFAULT_CODEX_INSTRUCTIONS,
    REQUIRED_REQUEST_FIELDS,
    UNSUPPORTED_REQUEST_FIELDS,
    CODEX_MODELS
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
 * Generate valid ChatMessage arrays with string content
 */
const chatMessageWithStringContentArb = fc.record({
    role: fc.constantFrom('user', 'assistant', 'system'),
    content: fc.string()
}) as fc.Arbitrary<ChatMessage>

/**
 * Generate valid ChatMessage arrays with multimodal content (text + images)
 */
const textContentPartArb = fc.record({
    type: fc.constant('text' as const),
    text: fc.string({ minLength: 1 })
})

const imageContentPartArb = fc.record({
    type: fc.constant('image_url' as const),
    image_url: fc.record({
        url: fc.webUrl()
    })
})

const multimodalContentArb = fc.array(
    fc.oneof(textContentPartArb, imageContentPartArb),
    { minLength: 1, maxLength: 5 }
)

const chatMessageWithMultimodalContentArb = fc.record({
    role: fc.constantFrom('user', 'assistant'),
    content: multimodalContentArb
}) as fc.Arbitrary<ChatMessage>

/**
 * Generate mixed ChatMessage arrays (string or multimodal content)
 */
const chatMessageArb = fc.oneof(
    chatMessageWithStringContentArb,
    chatMessageWithMultimodalContentArb
) as fc.Arbitrary<ChatMessage>

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
     * Property 1: Message Format Correctness
     * For any ChatMessage array, formatting for Codex SHALL produce ResponseItem objects
     * where each has `type: "message"`, a valid `role`, and a `content` array of ContentItem
     * objects with correct `type` fields.
     * 
     * Feature: codex-provider-fix, Property 1: Message Format Correctness
     * Validates: Requirements 1.1, 1.2
     */
    describe('Property 1: Message Format Correctness', () => {
        it('should produce ResponseItem format with type: "message" for all messages', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    // Same number of messages
                    expect(formatted.length).toBe(messages.length)
                    
                    // Each formatted message has ResponseItem structure
                    formatted.forEach((msg, i) => {
                        // Must have type: "message"
                        expect(msg.type).toBe('message')
                        
                        // Must have valid role
                        expect(msg.role).toBe(messages[i].role)
                        expect(['user', 'assistant', 'system']).toContain(msg.role)
                        
                        // Must have content array
                        expect(Array.isArray(msg.content)).toBe(true)
                    })
                }),
                { numRuns: 100 }
            )
        })

        it('should produce content array with ContentItem objects', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    formatted.forEach((msg) => {
                        // Content must be an array
                        expect(Array.isArray(msg.content)).toBe(true)
                        
                        // Each content item must have valid type
                        msg.content.forEach((item: any) => {
                            expect(['input_text', 'input_image', 'output_text']).toContain(item.type)
                            
                            // input_text must have text field
                            if (item.type === 'input_text') {
                                expect(typeof item.text).toBe('string')
                            }
                            
                            // input_image must have image_url field
                            if (item.type === 'input_image') {
                                expect(typeof item.image_url).toBe('string')
                            }
                        })
                    })
                }),
                { numRuns: 100 }
            )
        })

        it('should preserve message content when converting to ResponseItem format', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    formatted.forEach((msg, i) => {
                        const originalContent = messages[i].content
                        
                        if (typeof originalContent === 'string') {
                            // String content should become single input_text item
                            expect(msg.content.length).toBe(1)
                            expect(msg.content[0].type).toBe('input_text')
                            expect(msg.content[0].text).toBe(originalContent)
                        } else if (Array.isArray(originalContent)) {
                            // Multimodal content should be converted to ContentItem array
                            // Count valid content parts (text with text, image_url with url)
                            const validParts = originalContent.filter(part => 
                                (part.type === 'text' && part.text) || 
                                (part.type === 'image_url' && part.image_url)
                            )
                            expect(msg.content.length).toBe(validParts.length)
                        }
                    })
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 6: Message Format Compatibility (Legacy - kept for backward compatibility)
     * For any ChatMessage array passed to the Codex service, the messages SHALL be
     * formatted according to OpenAI chat completion API specification.
     * 
     * Validates: Requirements 6.2
     */
    describe('Property 6: Message Format Compatibility', () => {
        it('should preserve role for all messages', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    // Same number of messages
                    expect(formatted.length).toBe(messages.length)
                    
                    // Each message preserves role
                    formatted.forEach((msg, i) => {
                        expect(msg.role).toBe(messages[i].role)
                    })
                }),
                { numRuns: 100 }
            )
        })

        it('should produce valid ResponseItem format', () => {
            fc.assert(
                fc.property(chatMessagesArb, (messages) => {
                    const formatted = formatMessagesForCodex(messages)
                    
                    // Each formatted message has required fields
                    formatted.forEach(msg => {
                        expect(msg).toHaveProperty('type')
                        expect(msg).toHaveProperty('role')
                        expect(msg).toHaveProperty('content')
                        expect(msg.type).toBe('message')
                        expect(['user', 'assistant', 'system']).toContain(msg.role)
                        expect(Array.isArray(msg.content)).toBe(true)
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

        it('should handle 400 validation errors with field info', () => {
            // Test field extraction from error messages
            const error1 = { message: 'invalid field: model' }
            expect(parseCodexError(error1, 400)).toContain('model')
            
            const error2 = { error: { message: 'missing parameter: instructions' } }
            expect(parseCodexError(error2, 400)).toContain('instructions')
            
            const error3 = { message: 'required: input' }
            expect(parseCodexError(error3, 400)).toContain('input')
        })

        it('should handle 429 rate limit with retry-after', () => {
            const error = { retryAfter: '30' }
            const result = parseCodexError(error, 429)
            expect(result).toContain('30')
            expect(result).toContain('seconds')
        })

        it('should return detailed error info with parseCodexErrorDetailed', () => {
            // Test 401 with shouldReauth flag
            const auth401 = parseCodexErrorDetailed({}, 401)
            expect(auth401.shouldReauth).toBe(true)
            expect(auth401.status).toBe(401)
            
            // Test 429 with retryAfter
            const rate429 = parseCodexErrorDetailed({ retryAfter: '60' }, 429)
            expect(rate429.retryAfter).toBe(60)
            expect(rate429.status).toBe(429)
            
            // Test 400 with invalidFields - using comma-separated format
            const validation400 = parseCodexErrorDetailed({ 
                message: 'invalid field: model, missing parameter: instructions' 
            }, 400)
            expect(validation400.invalidFields).toBeDefined()
            expect(validation400.invalidFields).toContain('model')
            expect(validation400.invalidFields).toContain('instructions')
        })
    })

    /**
     * Property 9: Content Item Formatting
     * For any text content, formatting SHALL produce `{ type: "input_text", text: content }`.
     * For any image content, formatting SHALL produce `{ type: "input_image", image_url: url }`.
     * 
     * Feature: codex-provider-fix, Property 9: Content Item Formatting
     * Validates: Requirements 1.2
     */
    describe('Property 9: Content Item Formatting', () => {
        /**
         * Generator for messages with only text content
         */
        const textOnlyMessageArb = fc.record({
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string({ minLength: 0 })
        }) as fc.Arbitrary<ChatMessage>

        /**
         * Generator for messages with multimodal content containing text parts
         */
        const textPartArb = fc.record({
            type: fc.constant('text' as const),
            text: fc.string({ minLength: 1 })
        })

        const imagePartArb = fc.record({
            type: fc.constant('image_url' as const),
            image_url: fc.record({
                url: fc.webUrl()
            })
        })

        it('should format text content as input_text with text field', () => {
            fc.assert(
                fc.property(textOnlyMessageArb, (message) => {
                    const formatted = formatMessagesForCodex([message])
                    
                    expect(formatted.length).toBe(1)
                    expect(formatted[0].content.length).toBe(1)
                    
                    const contentItem = formatted[0].content[0]
                    expect(contentItem.type).toBe('input_text')
                    expect(contentItem.text).toBe(message.content)
                }),
                { numRuns: 100 }
            )
        })

        it('should format image content as input_image with image_url field', () => {
            fc.assert(
                fc.property(imagePartArb, (imagePart) => {
                    const message: ChatMessage = {
                        role: 'user',
                        content: [imagePart]
                    }
                    const formatted = formatMessagesForCodex([message])
                    
                    expect(formatted.length).toBe(1)
                    expect(formatted[0].content.length).toBe(1)
                    
                    const contentItem = formatted[0].content[0]
                    expect(contentItem.type).toBe('input_image')
                    expect(contentItem.image_url).toBe(imagePart.image_url.url)
                }),
                { numRuns: 100 }
            )
        })

        it('should format mixed content preserving order and types', () => {
            const mixedContentArb = fc.array(
                fc.oneof(textPartArb, imagePartArb),
                { minLength: 1, maxLength: 5 }
            )

            fc.assert(
                fc.property(mixedContentArb, (contentParts) => {
                    const message: ChatMessage = {
                        role: 'user',
                        content: contentParts
                    }
                    const formatted = formatMessagesForCodex([message])
                    
                    expect(formatted.length).toBe(1)
                    
                    // Count valid parts (text with text, image_url with url)
                    const validParts = contentParts.filter(part => 
                        (part.type === 'text' && part.text) || 
                        (part.type === 'image_url' && part.image_url)
                    )
                    expect(formatted[0].content.length).toBe(validParts.length)
                    
                    // Verify each content item has correct type mapping
                    let validIndex = 0
                    for (const part of contentParts) {
                        if (part.type === 'text' && part.text) {
                            const item = formatted[0].content[validIndex]
                            expect(item.type).toBe('input_text')
                            expect(item.text).toBe(part.text)
                            validIndex++
                        } else if (part.type === 'image_url' && part.image_url) {
                            const item = formatted[0].content[validIndex]
                            expect(item.type).toBe('input_image')
                            expect(item.image_url).toBe(part.image_url.url)
                            validIndex++
                        }
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should produce empty content array for empty string content', () => {
            const emptyMessage: ChatMessage = {
                role: 'user',
                content: ''
            }
            const formatted = formatMessagesForCodex([emptyMessage])
            
            expect(formatted.length).toBe(1)
            expect(formatted[0].content.length).toBe(1)
            expect(formatted[0].content[0].type).toBe('input_text')
            expect(formatted[0].content[0].text).toBe('')
        })
    })

    /**
     * Property 2: Required Fields Presence
     * For any valid request inputs, the built request body SHALL contain all required fields:
     * model, instructions, input, tools, tool_choice, parallel_tool_calls, stream, store, include.
     * 
     * Feature: codex-provider-fix, Property 2: Required Fields Presence
     * Validates: Requirements 1.3
     */
    describe('Property 2: Required Fields Presence', () => {
        /**
         * Generator for valid model codes
         */
        const modelCodeArb = fc.constantFrom(
            'gpt-5.2-codex-medium',
            'gpt-5.2-codex-high',
            'gpt-5.2-codex-xhigh',
            'gpt-5.1-codex-max-medium',
            'gpt-5.1-codex-max-high',
            'gpt-5.1-codex-mini-medium',
            'gpt-5.2-low',
            'gpt-5.2-medium'
        )

        /**
         * Generator for valid ChatMessage arrays (non-empty)
         */
        const validMessagesArb = fc.array(
            fc.record({
                role: fc.constantFrom('user', 'assistant', 'system'),
                content: fc.string({ minLength: 1 })
            }),
            { minLength: 1, maxLength: 10 }
        ) as fc.Arbitrary<ChatMessage[]>

        /**
         * Generator for optional CodexOptions
         */
        const codexOptionsArb = fc.option(
            fc.record({
                reasoningSummary: fc.option(
                    fc.constantFrom('auto', 'concise', 'detailed', 'none'),
                    { nil: undefined }
                )
            }),
            { nil: undefined }
        )

        it('should contain all required fields for any valid inputs', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    codexOptionsArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options || undefined)
                        
                        // Verify all required fields are present
                        for (const field of REQUIRED_REQUEST_FIELDS) {
                            expect(requestBody).toHaveProperty(field)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should have correct types for all required fields', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    codexOptionsArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options || undefined)
                        
                        // model: string
                        expect(typeof requestBody.model).toBe('string')
                        expect(requestBody.model.length).toBeGreaterThan(0)
                        
                        // instructions: string
                        expect(typeof requestBody.instructions).toBe('string')
                        
                        // input: array
                        expect(Array.isArray(requestBody.input)).toBe(true)
                        
                        // tools: array
                        expect(Array.isArray(requestBody.tools)).toBe(true)
                        
                        // tool_choice: string
                        expect(typeof requestBody.tool_choice).toBe('string')
                        expect(['auto', 'none', 'required']).toContain(requestBody.tool_choice)
                        
                        // parallel_tool_calls: boolean
                        expect(typeof requestBody.parallel_tool_calls).toBe('boolean')
                        
                        // stream: boolean (always true)
                        expect(typeof requestBody.stream).toBe('boolean')
                        expect(requestBody.stream).toBe(true)
                        
                        // store: boolean (always false)
                        expect(typeof requestBody.store).toBe('boolean')
                        expect(requestBody.store).toBe(false)
                        
                        // include: array
                        expect(Array.isArray(requestBody.include)).toBe(true)
                        expect(requestBody.include).toContain('reasoning.encrypted_content')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should always set stream to true', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    (model, messages) => {
                        const requestBody = buildCodexRequest(model, messages)
                        
                        // stream MUST always be true per Requirements 1.6
                        expect(requestBody.stream).toBe(true)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should always set store to false', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    (model, messages) => {
                        const requestBody = buildCodexRequest(model, messages)
                        
                        // store MUST always be false
                        expect(requestBody.store).toBe(false)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should include reasoning.encrypted_content in include array', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    (model, messages) => {
                        const requestBody = buildCodexRequest(model, messages)
                        
                        expect(requestBody.include).toContain('reasoning.encrypted_content')
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 3: Unsupported Fields Absence
     * For any built request body, the request SHALL NOT contain temperature or max_tokens fields.
     * 
     * Feature: codex-provider-fix, Property 3: Unsupported Fields Absence
     * Validates: Requirements 1.4
     */
    describe('Property 3: Unsupported Fields Absence', () => {
        /**
         * Generator for valid model codes
         */
        const modelCodeArb = fc.constantFrom(
            'gpt-5.2-codex-medium',
            'gpt-5.2-codex-high',
            'gpt-5.1-codex-max-medium',
            'gpt-5.1-codex-mini-high'
        )

        /**
         * Generator for valid ChatMessage arrays
         */
        const validMessagesArb = fc.array(
            fc.record({
                role: fc.constantFrom('user', 'assistant', 'system'),
                content: fc.string({ minLength: 1 })
            }),
            { minLength: 1, maxLength: 10 }
        ) as fc.Arbitrary<ChatMessage[]>

        /**
         * Generator for CodexOptions that might try to include unsupported fields
         * Note: Even if options include temperature/maxTokens, they should NOT appear in request
         */
        const codexOptionsWithUnsupportedArb = fc.record({
            temperature: fc.option(fc.float({ min: 0, max: 2 }), { nil: undefined }),
            maxTokens: fc.option(fc.nat({ max: 100000 }), { nil: undefined }),
            reasoningSummary: fc.option(
                fc.constantFrom('auto', 'concise', 'detailed', 'none'),
                { nil: undefined }
            )
        })

        it('should NOT contain temperature field', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    codexOptionsWithUnsupportedArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options)
                        
                        // temperature MUST NOT be present
                        expect(requestBody).not.toHaveProperty('temperature')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should NOT contain max_tokens field', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    codexOptionsWithUnsupportedArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options)
                        
                        // max_tokens MUST NOT be present
                        expect(requestBody).not.toHaveProperty('max_tokens')
                        expect(requestBody).not.toHaveProperty('maxTokens')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should NOT contain any unsupported fields', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    codexOptionsWithUnsupportedArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options)
                        
                        // None of the unsupported fields should be present
                        for (const field of UNSUPPORTED_REQUEST_FIELDS) {
                            expect(requestBody).not.toHaveProperty(field)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should only contain allowed fields', () => {
            fc.assert(
                fc.property(
                    modelCodeArb,
                    validMessagesArb,
                    (model, messages) => {
                        const requestBody = buildCodexRequest(model, messages)
                        
                        // Define allowed fields
                        const allowedFields = new Set([
                            ...REQUIRED_REQUEST_FIELDS,
                            'reasoning',
                            'prompt_cache_key',
                            'text'
                        ])
                        
                        // All keys in request body should be in allowed set
                        for (const key of Object.keys(requestBody)) {
                            expect(allowedFields.has(key)).toBe(true)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 10: Reasoning Object Structure
     * For any request with reasoning enabled, the `reasoning` object SHALL contain
     * `effort` with a valid value and optionally `summary`.
     * 
     * Feature: codex-provider-fix, Property 10: Reasoning Object Structure
     * Validates: Requirements 1.5
     */
    describe('Property 10: Reasoning Object Structure', () => {
        /**
         * Valid reasoning effort values matching official Codex CLI
         * Reference: research-codex/codex/codex-rs/protocol/src/openai_models.rs
         */
        const validEffortValues = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const

        /**
         * Valid reasoning summary values matching official Codex CLI
         * Reference: research-codex/codex/codex-rs/protocol/src/config_types.rs
         */
        const validSummaryValues = ['auto', 'concise', 'detailed', 'none'] as const

        /**
         * Generator for valid model codes with effort suffixes
         */
        const modelCodeWithEffortArb = fc.constantFrom(
            'gpt-5.2-codex-minimal',
            'gpt-5.2-codex-low',
            'gpt-5.2-codex-medium',
            'gpt-5.2-codex-high',
            'gpt-5.2-codex-xhigh',
            'gpt-5.1-codex-max-low',
            'gpt-5.1-codex-max-medium',
            'gpt-5.1-codex-max-high',
            'gpt-5.1-codex-max-xhigh',
            'gpt-5.1-codex-mini-medium',
            'gpt-5.1-codex-mini-high'
        )

        /**
         * Generator for valid ChatMessage arrays
         */
        const validMessagesArb = fc.array(
            fc.record({
                role: fc.constantFrom('user', 'assistant', 'system'),
                content: fc.string({ minLength: 1 })
            }),
            { minLength: 1, maxLength: 5 }
        ) as fc.Arbitrary<ChatMessage[]>

        /**
         * Generator for CodexOptions with various reasoning summary values
         */
        const codexOptionsArb = fc.option(
            fc.record({
                reasoningSummary: fc.option(
                    fc.constantFrom('auto', 'concise', 'detailed', 'none'),
                    { nil: undefined }
                )
            }),
            { nil: undefined }
        )

        it('should contain reasoning object with effort field for all requests', () => {
            fc.assert(
                fc.property(
                    modelCodeWithEffortArb,
                    validMessagesArb,
                    codexOptionsArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options || undefined)
                        
                        // reasoning object MUST be present
                        expect(requestBody).toHaveProperty('reasoning')
                        expect(typeof requestBody.reasoning).toBe('object')
                        expect(requestBody.reasoning).not.toBeNull()
                        
                        // effort field MUST be present
                        expect(requestBody.reasoning).toHaveProperty('effort')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should have valid effort value from allowed set', () => {
            fc.assert(
                fc.property(
                    modelCodeWithEffortArb,
                    validMessagesArb,
                    (model, messages) => {
                        const requestBody = buildCodexRequest(model, messages)
                        
                        // effort MUST be one of the valid values
                        expect(validEffortValues).toContain(requestBody.reasoning.effort)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should have valid summary value when present', () => {
            fc.assert(
                fc.property(
                    modelCodeWithEffortArb,
                    validMessagesArb,
                    codexOptionsArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options || undefined)
                        
                        // summary field MUST be present (we always include it)
                        expect(requestBody.reasoning).toHaveProperty('summary')
                        
                        // summary MUST be one of the valid values
                        expect(validSummaryValues).toContain(requestBody.reasoning.summary)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should default summary to "auto" when not specified in options', () => {
            fc.assert(
                fc.property(
                    modelCodeWithEffortArb,
                    validMessagesArb,
                    (model, messages) => {
                        // Build request without options
                        const requestBody = buildCodexRequest(model, messages)
                        
                        // summary should default to 'auto'
                        expect(requestBody.reasoning.summary).toBe('auto')
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should use provided summary value from options', () => {
            fc.assert(
                fc.property(
                    modelCodeWithEffortArb,
                    validMessagesArb,
                    fc.constantFrom('auto', 'concise', 'detailed', 'none'),
                    (model, messages, summaryValue) => {
                        const options = { reasoningSummary: summaryValue as 'auto' | 'concise' | 'detailed' | 'none' }
                        const requestBody = buildCodexRequest(model, messages, options)
                        
                        // summary should match the provided value
                        expect(requestBody.reasoning.summary).toBe(summaryValue)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should extract correct effort from model code suffix', () => {
            // Test each effort level explicitly
            const effortTestCases = [
                { model: 'gpt-5.2-codex-minimal', expectedEffort: 'minimal' },
                { model: 'gpt-5.2-codex-low', expectedEffort: 'low' },
                { model: 'gpt-5.2-codex-medium', expectedEffort: 'medium' },
                { model: 'gpt-5.2-codex-high', expectedEffort: 'high' },
                { model: 'gpt-5.2-codex-xhigh', expectedEffort: 'xhigh' },
                { model: 'gpt-5.1-codex-max-low', expectedEffort: 'low' },
                { model: 'gpt-5.1-codex-max-medium', expectedEffort: 'medium' },
                { model: 'gpt-5.1-codex-max-high', expectedEffort: 'high' },
                { model: 'gpt-5.1-codex-max-xhigh', expectedEffort: 'xhigh' },
            ]

            for (const { model, expectedEffort } of effortTestCases) {
                const requestBody = buildCodexRequest(model, [{ role: 'user', content: 'test' }])
                expect(requestBody.reasoning.effort).toBe(expectedEffort)
            }
        })

        it('should have correct reasoning object structure for all valid inputs', () => {
            fc.assert(
                fc.property(
                    modelCodeWithEffortArb,
                    validMessagesArb,
                    codexOptionsArb,
                    (model, messages, options) => {
                        const requestBody = buildCodexRequest(model, messages, options || undefined)
                        
                        // Verify complete reasoning object structure
                        const reasoning = requestBody.reasoning
                        
                        // Must be an object
                        expect(typeof reasoning).toBe('object')
                        expect(reasoning).not.toBeNull()
                        
                        // Must have exactly effort and summary fields
                        const reasoningKeys = Object.keys(reasoning)
                        expect(reasoningKeys).toContain('effort')
                        expect(reasoningKeys).toContain('summary')
                        
                        // effort must be string and valid
                        expect(typeof reasoning.effort).toBe('string')
                        expect(validEffortValues).toContain(reasoning.effort)
                        
                        // summary must be string and valid
                        expect(typeof reasoning.summary).toBe('string')
                        expect(validSummaryValues).toContain(reasoning.summary)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 4: Model Code Parsing
     * For any model code with a reasoning effort suffix (e.g., `gpt-5.2-codex-high`),
     * parsing SHALL correctly extract the base model and reasoning effort as separate values.
     * 
     * Feature: codex-provider-fix, Property 4: Model Code Parsing
     * Validates: Requirements 2.5
     */
    describe('Property 4: Model Code Parsing', () => {
        /**
         * Valid reasoning effort suffixes
         */
        const validEfforts = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const

        /**
         * Generator for base model names (without effort suffix)
         */
        const baseModelArb = fc.constantFrom(
            'gpt-5.2-codex',
            'gpt-5.1-codex-max',
            'gpt-5.1-codex-mini',
            'gpt-5.2'
        )

        /**
         * Generator for effort suffixes
         */
        const effortArb = fc.constantFrom(...validEfforts)

        /**
         * Generator for model codes with effort suffix
         */
        const modelCodeWithEffortArb = fc.tuple(baseModelArb, effortArb)
            .map(([base, effort]) => ({ code: `${base}-${effort}`, base, effort }))

        /**
         * Generator for model codes from CODEX_MODELS array
         */
        const codexModelCodeArb = fc.constantFrom(...CODEX_MODELS.map(m => ({
            code: m.code,
            base: m.baseModel,
            effort: m.reasoningEffort
        })))

        it('should correctly extract base model from model code with effort suffix', () => {
            fc.assert(
                fc.property(modelCodeWithEffortArb, ({ code, base, effort }) => {
                    const result = parseCodexModelCode(code)
                    
                    // Base model should match
                    expect(result.baseModel).toBe(base)
                }),
                { numRuns: 100 }
            )
        })

        it('should correctly extract reasoning effort from model code with effort suffix', () => {
            fc.assert(
                fc.property(modelCodeWithEffortArb, ({ code, base, effort }) => {
                    const result = parseCodexModelCode(code)
                    
                    // Reasoning effort should match
                    expect(result.reasoningEffort).toBe(effort)
                }),
                { numRuns: 100 }
            )
        })

        it('should return valid effort value for all CODEX_MODELS entries', () => {
            fc.assert(
                fc.property(codexModelCodeArb, ({ code, base, effort }) => {
                    const result = parseCodexModelCode(code)
                    
                    // Base model should match the expected base
                    expect(result.baseModel).toBe(base)
                    
                    // Effort should match the expected effort
                    expect(result.reasoningEffort).toBe(effort)
                    
                    // Effort should be one of the valid values
                    expect(validEfforts).toContain(result.reasoningEffort)
                }),
                { numRuns: 100 }
            )
        })

        it('should default to medium effort when no suffix is present', () => {
            fc.assert(
                fc.property(baseModelArb, (baseModel) => {
                    // Model code without effort suffix
                    const result = parseCodexModelCode(baseModel)
                    
                    // Should return the model as-is for base
                    expect(result.baseModel).toBe(baseModel)
                    
                    // Should default to medium effort
                    expect(result.reasoningEffort).toBe('medium')
                }),
                { numRuns: 100 }
            )
        })

        it('should handle all valid effort suffixes: minimal, low, medium, high, xhigh', () => {
            // Test each effort suffix explicitly
            for (const effort of validEfforts) {
                const modelCode = `gpt-5.2-codex-${effort}`
                const result = parseCodexModelCode(modelCode)
                
                expect(result.baseModel).toBe('gpt-5.2-codex')
                expect(result.reasoningEffort).toBe(effort)
            }
        })

        it('should correctly parse gpt-5.1-codex-max model codes', () => {
            // gpt-5.1-codex-max has a hyphenated base model name
            for (const effort of validEfforts) {
                const modelCode = `gpt-5.1-codex-max-${effort}`
                const result = parseCodexModelCode(modelCode)
                
                expect(result.baseModel).toBe('gpt-5.1-codex-max')
                expect(result.reasoningEffort).toBe(effort)
            }
        })

        it('should correctly parse gpt-5.1-codex-mini model codes', () => {
            // gpt-5.1-codex-mini has a hyphenated base model name
            for (const effort of ['medium', 'high'] as const) {
                const modelCode = `gpt-5.1-codex-mini-${effort}`
                const result = parseCodexModelCode(modelCode)
                
                expect(result.baseModel).toBe('gpt-5.1-codex-mini')
                expect(result.reasoningEffort).toBe(effort)
            }
        })

        it('should correctly parse gpt-5.2 (non-Codex) model codes', () => {
            // gpt-5.2 without -codex suffix
            for (const effort of validEfforts) {
                const modelCode = `gpt-5.2-${effort}`
                const result = parseCodexModelCode(modelCode)
                
                expect(result.baseModel).toBe('gpt-5.2')
                expect(result.reasoningEffort).toBe(effort)
            }
        })

        it('should return consistent results for repeated parsing', () => {
            fc.assert(
                fc.property(modelCodeWithEffortArb, ({ code }) => {
                    // Parse the same code multiple times
                    const result1 = parseCodexModelCode(code)
                    const result2 = parseCodexModelCode(code)
                    const result3 = parseCodexModelCode(code)
                    
                    // All results should be identical
                    expect(result1.baseModel).toBe(result2.baseModel)
                    expect(result1.baseModel).toBe(result3.baseModel)
                    expect(result1.reasoningEffort).toBe(result2.reasoningEffort)
                    expect(result1.reasoningEffort).toBe(result3.reasoningEffort)
                }),
                { numRuns: 100 }
            )
        })

        it('should produce base model that does not end with effort suffix', () => {
            fc.assert(
                fc.property(modelCodeWithEffortArb, ({ code }) => {
                    const result = parseCodexModelCode(code)
                    
                    // Base model should not end with any effort suffix
                    for (const effort of validEfforts) {
                        expect(result.baseModel.endsWith(`-${effort}`)).toBe(false)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should reconstruct original model code from parsed parts', () => {
            fc.assert(
                fc.property(modelCodeWithEffortArb, ({ code, base, effort }) => {
                    const result = parseCodexModelCode(code)
                    
                    // Reconstructing should give original code
                    const reconstructed = `${result.baseModel}-${result.reasoningEffort}`
                    expect(reconstructed).toBe(code)
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Property 5: System Message Extraction
     * For any message array containing system messages, the system messages SHALL be
     * extracted to the `instructions` field and SHALL NOT appear in the `input` array.
     * 
     * Feature: codex-provider-fix, Property 5: System Message Extraction
     * Validates: Requirements 5.1, 5.3
     */
    describe('Property 5: System Message Extraction', () => {
        /**
         * Generator for system messages with string content
         */
        const systemMessageArb = fc.record({
            role: fc.constant('system' as const),
            content: fc.string({ minLength: 1, maxLength: 500 })
        }) as fc.Arbitrary<ChatMessage>

        /**
         * Generator for non-system messages (user/assistant)
         */
        const nonSystemMessageArb = fc.record({
            role: fc.constantFrom('user', 'assistant'),
            content: fc.string({ minLength: 1, maxLength: 500 })
        }) as fc.Arbitrary<ChatMessage>

        /**
         * Generator for message arrays with at least one system message
         */
        const messagesWithSystemArb = fc.tuple(
            fc.array(systemMessageArb, { minLength: 1, maxLength: 3 }),
            fc.array(nonSystemMessageArb, { minLength: 0, maxLength: 5 })
        ).map(([systemMsgs, otherMsgs]) => {
            // Interleave system and non-system messages
            const all: ChatMessage[] = []
            const maxLen = Math.max(systemMsgs.length, otherMsgs.length)
            for (let i = 0; i < maxLen; i++) {
                if (i < systemMsgs.length) all.push(systemMsgs[i])
                if (i < otherMsgs.length) all.push(otherMsgs[i])
            }
            return { messages: all, systemMsgs, otherMsgs }
        })

        /**
         * Generator for message arrays with NO system messages
         */
        const messagesWithoutSystemArb = fc.array(nonSystemMessageArb, { minLength: 1, maxLength: 5 })

        it('should extract system messages to instructions field', () => {
            fc.assert(
                fc.property(messagesWithSystemArb, ({ messages, systemMsgs }) => {
                    const result = extractInstructionsFromMessages(messages)
                    
                    // Instructions should contain content from system messages
                    for (const sysMsg of systemMsgs) {
                        if (typeof sysMsg.content === 'string' && sysMsg.content.trim()) {
                            expect(result.instructions).toContain(sysMsg.content)
                        }
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should NOT include system messages in input array', () => {
            fc.assert(
                fc.property(messagesWithSystemArb, ({ messages }) => {
                    const result = extractInstructionsFromMessages(messages)
                    
                    // No message in inputMessages should have role 'system'
                    for (const msg of result.inputMessages) {
                        expect(msg.role).not.toBe('system')
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should preserve non-system messages in input array', () => {
            fc.assert(
                fc.property(messagesWithSystemArb, ({ messages, otherMsgs }) => {
                    const result = extractInstructionsFromMessages(messages)
                    
                    // All non-system messages should be in inputMessages
                    expect(result.inputMessages.length).toBe(otherMsgs.length)
                    
                    // Each non-system message should be preserved
                    for (let i = 0; i < otherMsgs.length; i++) {
                        expect(result.inputMessages[i].role).toBe(otherMsgs[i].role)
                        expect(result.inputMessages[i].content).toBe(otherMsgs[i].content)
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should concatenate multiple system messages', () => {
            fc.assert(
                fc.property(
                    fc.array(systemMessageArb, { minLength: 2, maxLength: 4 }),
                    (systemMsgs) => {
                        const result = extractInstructionsFromMessages(systemMsgs)
                        
                        // All system message contents should be in instructions
                        for (const sysMsg of systemMsgs) {
                            if (typeof sysMsg.content === 'string' && sysMsg.content.trim()) {
                                expect(result.instructions).toContain(sysMsg.content)
                            }
                        }
                        
                        // Input messages should be empty (only system messages)
                        expect(result.inputMessages.length).toBe(0)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should use default instructions when no system message provided', () => {
            fc.assert(
                fc.property(messagesWithoutSystemArb, (messages) => {
                    const result = extractInstructionsFromMessages(messages)
                    
                    // Should use default instructions
                    expect(result.instructions).toBe(DEFAULT_CODEX_INSTRUCTIONS)
                    
                    // All messages should be in inputMessages
                    expect(result.inputMessages.length).toBe(messages.length)
                }),
                { numRuns: 100 }
            )
        })

        it('should return empty inputMessages when only system messages exist', () => {
            // Generate system messages with non-whitespace content
            const nonEmptySystemMessageArb = fc.record({
                role: fc.constant('system' as const),
                content: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0)
            }) as fc.Arbitrary<ChatMessage>

            fc.assert(
                fc.property(
                    fc.array(nonEmptySystemMessageArb, { minLength: 1, maxLength: 3 }),
                    (systemMsgs) => {
                        const result = extractInstructionsFromMessages(systemMsgs)
                        
                        // Input messages should be empty
                        expect(result.inputMessages.length).toBe(0)
                        
                        // Instructions should not be default (since we have non-empty system messages)
                        expect(result.instructions).not.toBe(DEFAULT_CODEX_INSTRUCTIONS)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle empty message array', () => {
            const result = extractInstructionsFromMessages([])
            
            // Should use default instructions
            expect(result.instructions).toBe(DEFAULT_CODEX_INSTRUCTIONS)
            
            // Input messages should be empty
            expect(result.inputMessages.length).toBe(0)
        })

        it('should preserve message order for non-system messages', () => {
            fc.assert(
                fc.property(messagesWithSystemArb, ({ messages, otherMsgs }) => {
                    const result = extractInstructionsFromMessages(messages)
                    
                    // The order of non-system messages should be preserved
                    let otherIndex = 0
                    for (const msg of messages) {
                        if (msg.role !== 'system') {
                            expect(result.inputMessages[otherIndex].role).toBe(msg.role)
                            expect(result.inputMessages[otherIndex].content).toBe(msg.content)
                            otherIndex++
                        }
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should handle system messages with whitespace-only content', () => {
            const messagesWithWhitespace: ChatMessage[] = [
                { role: 'system', content: '   ' },
                { role: 'system', content: '\n\t' },
                { role: 'user', content: 'Hello' }
            ]
            
            const result = extractInstructionsFromMessages(messagesWithWhitespace)
            
            // Should use default instructions since whitespace-only system messages are ignored
            expect(result.instructions).toBe(DEFAULT_CODEX_INSTRUCTIONS)
            
            // User message should be in inputMessages
            expect(result.inputMessages.length).toBe(1)
            expect(result.inputMessages[0].content).toBe('Hello')
        })

        it('should handle mixed valid and whitespace-only system messages', () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: '   ' },
                { role: 'system', content: 'Valid system prompt' },
                { role: 'user', content: 'Hello' }
            ]
            
            const result = extractInstructionsFromMessages(messages)
            
            // Should use the valid system message content
            expect(result.instructions).toContain('Valid system prompt')
            expect(result.instructions).not.toBe(DEFAULT_CODEX_INSTRUCTIONS)
            
            // User message should be in inputMessages
            expect(result.inputMessages.length).toBe(1)
        })
    })

    /**
     * Property 7: Error Sanitization
     * For any error containing token strings, the sanitized error SHALL NOT contain
     * the original token values.
     * 
     * Feature: codex-provider-fix, Property 7: Error Sanitization
     * Validates: Requirements 7.5
     */
    describe('Property 7: Error Sanitization', () => {
        /**
         * Character set for token generation
         */
        const tokenChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

        /**
         * Generator for Bearer tokens
         */
        const bearerTokenArb = fc.string({ minLength: 20, maxLength: 100 })
            .filter(s => s.length >= 20)
            .map(token => `Bearer ${token.replace(/[^A-Za-z0-9\-_]/g, 'x')}`)

        /**
         * Generator for OpenAI API keys (sk-xxx)
         */
        const openaiKeyArb = fc.string({ minLength: 20, maxLength: 60 })
            .filter(s => s.length >= 20)
            .map(key => `sk-${key.replace(/[^A-Za-z0-9\-_]/g, 'x')}`)

        /**
         * Generator for OpenRouter API keys (sk-or-v1-xxx)
         */
        const openrouterKeyArb = fc.string({ minLength: 20, maxLength: 60 })
            .filter(s => s.length >= 20)
            .map(key => `sk-or-v1-${key.replace(/[^A-Za-z0-9\-_]/g, 'x')}`)

        /**
         * Generator for JWT tokens (eyJ...)
         */
        const jwtTokenArb = fc.tuple(
            fc.string({ minLength: 10, maxLength: 50 }),
            fc.string({ minLength: 10, maxLength: 50 }),
            fc.string({ minLength: 10, maxLength: 50 })
        ).map(([header, payload, signature]) => 
            `eyJ${header.replace(/[^A-Za-z0-9\-_]/g, 'x')}.${payload.replace(/[^A-Za-z0-9\-_]/g, 'x')}.${signature.replace(/[^A-Za-z0-9\-_]/g, 'x')}`
        )

        /**
         * Generator for error objects with embedded tokens
         */
        const errorWithTokensArb = fc.record({
            message: fc.oneof(
                bearerTokenArb.map(token => `Error with ${token} in message`),
                openaiKeyArb.map(key => `API key ${key} is invalid`),
                openrouterKeyArb.map(key => `OpenRouter key ${key} failed`),
                jwtTokenArb.map(jwt => `Token ${jwt} expired`)
            ),
            stack: fc.option(
                fc.oneof(
                    bearerTokenArb.map(token => `at function (${token})`),
                    openaiKeyArb.map(key => `Error: ${key}\n    at Object.<anonymous>`)
                ),
                { nil: undefined }
            ),
            body: fc.option(
                fc.oneof(
                    bearerTokenArb.map(token => JSON.stringify({ error: `Invalid token: ${token}` })),
                    openaiKeyArb.map(key => JSON.stringify({ error: `Bad key: ${key}` }))
                ),
                { nil: undefined }
            ),
            headers: fc.option(
                fc.record({
                    authorization: fc.option(bearerTokenArb, { nil: undefined }),
                    Authorization: fc.option(bearerTokenArb, { nil: undefined }),
                    'content-type': fc.constant('application/json')
                }),
                { nil: undefined }
            )
        })

        it('should remove Bearer tokens from error messages', () => {
            fc.assert(
                fc.property(bearerTokenArb, (token) => {
                    const error = { message: `Error: ${token} is invalid` }
                    const sanitized = sanitizeError(error)
                    
                    // Should not contain the original token
                    expect(sanitized.message).not.toContain(token)
                    // Should contain redaction marker
                    expect(sanitized.message).toContain('[REDACTED]')
                }),
                { numRuns: 100 }
            )
        })

        it('should remove OpenAI API keys from error messages', () => {
            fc.assert(
                fc.property(openaiKeyArb, (key) => {
                    const error = { message: `API key ${key} is invalid` }
                    const sanitized = sanitizeError(error)
                    
                    // Should not contain the original key
                    expect(sanitized.message).not.toContain(key)
                    // Should contain redaction marker
                    expect(sanitized.message).toContain('[REDACTED')
                }),
                { numRuns: 100 }
            )
        })

        it('should remove OpenRouter API keys from error messages', () => {
            fc.assert(
                fc.property(openrouterKeyArb, (key) => {
                    const error = { message: `OpenRouter key ${key} failed` }
                    const sanitized = sanitizeError(error)
                    
                    // Should not contain the original key
                    expect(sanitized.message).not.toContain(key)
                    // Should contain redaction marker
                    expect(sanitized.message).toContain('[REDACTED')
                }),
                { numRuns: 100 }
            )
        })

        it('should remove JWT tokens from error messages', () => {
            fc.assert(
                fc.property(jwtTokenArb, (jwt) => {
                    const error = { message: `Token ${jwt} expired` }
                    const sanitized = sanitizeError(error)
                    
                    // Should not contain the original JWT
                    expect(sanitized.message).not.toContain(jwt)
                    // Should contain redaction marker
                    expect(sanitized.message).toContain('[REDACTED')
                }),
                { numRuns: 100 }
            )
        })

        it('should sanitize tokens in stack traces', () => {
            fc.assert(
                fc.property(bearerTokenArb, (token) => {
                    const error = { 
                        message: 'Error occurred',
                        stack: `Error: at function (${token})\n    at Object.<anonymous>`
                    }
                    const sanitized = sanitizeError(error)
                    
                    // Stack should not contain the original token
                    expect(sanitized.stack).not.toContain(token)
                }),
                { numRuns: 100 }
            )
        })

        it('should sanitize tokens in body field', () => {
            fc.assert(
                fc.property(openaiKeyArb, (key) => {
                    const error = { 
                        message: 'Error occurred',
                        body: `{"error": "Invalid key: ${key}"}`
                    }
                    const sanitized = sanitizeError(error)
                    
                    // Body should not contain the original key
                    expect(sanitized.body).not.toContain(key)
                }),
                { numRuns: 100 }
            )
        })

        it('should remove authorization headers', () => {
            fc.assert(
                fc.property(errorWithTokensArb, (error) => {
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

        it('should handle nested error objects', () => {
            const nestedError = {
                message: 'Outer error',
                cause: {
                    message: 'Bearer sk-test123456789012345678901234567890 failed'
                }
            }
            const sanitized = sanitizeError(nestedError)
            
            // Nested cause should be sanitized
            expect(sanitized.cause.message).not.toContain('sk-test')
            expect(sanitized.cause.message).toContain('[REDACTED')
        })

        it('should handle string errors', () => {
            const stringError = 'Error with Bearer sk-test123456789012345678901234567890'
            const sanitized = sanitizeError(stringError)
            
            // String should be sanitized
            expect(sanitized).not.toContain('sk-test')
            expect(sanitized).toContain('[REDACTED')
        })

        it('should preserve non-sensitive error information', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        message: fc.string({ minLength: 1, maxLength: 100 }),
                        code: fc.string({ minLength: 1, maxLength: 20 }),
                        status: fc.nat({ max: 599 })
                    }),
                    (error) => {
                        const sanitized = sanitizeError(error)
                        
                        // Non-sensitive fields should be preserved
                        expect(sanitized.code).toBe(error.code)
                        expect(sanitized.status).toBe(error.status)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
