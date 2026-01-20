/**
 * Property-Based Tests for MiniMax Service
 * 
 * Feature: minimax-provider
 * 
 * These tests verify the correctness properties defined in the design document
 * for the MiniMax provider integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
    streamMiniMaxCompletion,
    generateMiniMaxCompletion,
    MiniMaxRequestBody,
    ToolCallAccumulator,
    isToolCallsFinishReason,
    AccumulatedToolCall,
    ReasoningAccumulator,
    extractReasoningFromChunk,
    extractReasoningText,
    chunkHasReasoning,
    MiniMaxStreamChunk,
    MiniMaxReasoningDetail,
    extractUsageMetrics,
    accumulateUsageMetrics,
    calculateTPS,
    MiniMaxUsage,
    NormalizedUsageMetrics
} from './minimax'
import { StreamingToolCall } from './types'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('MiniMax Service Property Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    /**
     * Feature: minimax-provider, Property 1: Request Formatting
     * 
     * *For any* valid API key and message array, the MiniMax provider SHALL format the request with:
     * - Authorization header as `Bearer {apiKey}`
     * - `reasoning_split: true` in the request body
     * - Content-Type header as `application/json`
     * 
     * **Validates: Requirements 1.5, 3.1**
     */
    describe('Property 1: Request Formatting', () => {
        // Arbitrary for generating valid API keys (non-empty strings)
        const apiKeyArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
        
        // Arbitrary for generating valid model names
        const modelArb = fc.constantFrom('MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2')
        
        // Arbitrary for generating valid message content
        const messageContentArb = fc.string({ minLength: 1, maxLength: 500 })
        
        // Arbitrary for generating valid messages array
        const messagesArb = fc.array(
            fc.record({
                role: fc.constantFrom('user', 'assistant', 'system'),
                content: messageContentArb
            }),
            { minLength: 1, maxLength: 10 }
        )

        it('should always include Authorization header with Bearer token format', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    // Reset mock for each iteration
                    mockFetch.mockReset()
                    
                    // Setup mock to capture the request
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        body: createMockReadableStream([
                            'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                            'data: [DONE]\n'
                        ])
                    })

                    const generator = streamMiniMaxCompletion(apiKey, model, messages)
                    await generator.next()

                    // Verify Authorization header format
                    const headers = mockFetch.mock.calls[0][1].headers
                    expect(headers['Authorization']).toBe(`Bearer ${apiKey}`)
                }),
                { numRuns: 100 }
            )
        })

        it('should always include Content-Type header as application/json', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    mockFetch.mockReset()
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        body: createMockReadableStream([
                            'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                            'data: [DONE]\n'
                        ])
                    })

                    const generator = streamMiniMaxCompletion(apiKey, model, messages)
                    await generator.next()

                    const headers = mockFetch.mock.calls[0][1].headers
                    expect(headers['Content-Type']).toBe('application/json')
                }),
                { numRuns: 100 }
            )
        })

        it('should always include reasoning_split: true in streaming request body', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    mockFetch.mockReset()
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        body: createMockReadableStream([
                            'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                            'data: [DONE]\n'
                        ])
                    })

                    const generator = streamMiniMaxCompletion(apiKey, model, messages)
                    await generator.next()

                    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
                    expect(requestBody.reasoning_split).toBe(true)
                }),
                { numRuns: 100 }
            )
        })

        it('should always include reasoning_split: true in non-streaming request body', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    mockFetch.mockReset()
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({
                            id: '1',
                            choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }]
                        })
                    })

                    await generateMiniMaxCompletion(apiKey, model, messages)

                    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
                    expect(requestBody.reasoning_split).toBe(true)
                }),
                { numRuns: 100 }
            )
        })

        it('should always send request to correct MiniMax endpoint', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    mockFetch.mockReset()
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        body: createMockReadableStream([
                            'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                            'data: [DONE]\n'
                        ])
                    })

                    const generator = streamMiniMaxCompletion(apiKey, model, messages)
                    await generator.next()

                    const url = mockFetch.mock.calls[0][0]
                    expect(url).toBe('https://api.minimax.io/v1/chat/completions')
                }),
                { numRuns: 100 }
            )
        })

        it('should always include model and messages in request body', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    mockFetch.mockReset()
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        body: createMockReadableStream([
                            'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                            'data: [DONE]\n'
                        ])
                    })

                    const generator = streamMiniMaxCompletion(apiKey, model, messages)
                    await generator.next()

                    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
                    expect(requestBody.model).toBe(model)
                    expect(requestBody.messages).toEqual(messages)
                }),
                { numRuns: 100 }
            )
        })

        it('should include stream: true only in streaming requests', async () => {
            await fc.assert(
                fc.asyncProperty(apiKeyArb, modelArb, messagesArb, async (apiKey, model, messages) => {
                    mockFetch.mockReset()
                    
                    // Test streaming request
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        body: createMockReadableStream([
                            'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                            'data: [DONE]\n'
                        ])
                    })

                    const generator = streamMiniMaxCompletion(apiKey, model, messages)
                    await generator.next()

                    const streamingBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
                    expect(streamingBody.stream).toBe(true)

                    // Test non-streaming request
                    mockFetch.mockResolvedValueOnce({
                        ok: true,
                        json: async () => ({
                            id: '1',
                            choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }]
                        })
                    })

                    await generateMiniMaxCompletion(apiKey, model, messages)

                    const nonStreamingBody = JSON.parse(mockFetch.mock.calls[1][1].body) as MiniMaxRequestBody
                    expect(nonStreamingBody.stream).toBeUndefined()
                }),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Feature: minimax-provider, Property 3: Tool Call Accumulation
     * 
     * *For any* streaming response containing tool calls across multiple chunks, the MiniMax provider SHALL:
     * - Accumulate partial function arguments into complete JSON
     * - Preserve tool call IDs across chunks
     * - Set finish_reason to 'tool_calls' when tool calls are present
     * 
     * **Validates: Requirements 2.3, 2.4, 2.5**
     */
    describe('Property 3: Tool Call Accumulation', () => {
        // Arbitrary for generating valid tool call IDs
        const toolCallIdArb = fc.string({ minLength: 5, maxLength: 30 })
            .filter(s => s.trim().length > 0)
            .map(s => `call_${s.replace(/[^a-zA-Z0-9]/g, '')}`)
        
        // Arbitrary for generating valid function names
        const functionNameArb = fc.constantFrom('web_search', 'calculator', 'get_weather', 'read_file')
        
        // Arbitrary for generating valid JSON argument strings
        const jsonArgumentsArb = fc.record({
            query: fc.string({ minLength: 1, maxLength: 50 }),
            limit: fc.integer({ min: 1, max: 100 })
        }).map(obj => JSON.stringify(obj))
        
        // Arbitrary for generating tool call index
        const toolCallIndexArb = fc.integer({ min: 0, max: 5 })

        it('should preserve tool call IDs when accumulating across chunks', async () => {
            await fc.assert(
                fc.property(
                    toolCallIdArb,
                    functionNameArb,
                    jsonArgumentsArb,
                    (toolCallId, functionName, jsonArgs) => {
                        const accumulator = new ToolCallAccumulator()
                        
                        // First chunk with ID and name
                        accumulator.accumulate([{
                            index: 0,
                            id: toolCallId,
                            type: 'function',
                            function: { name: functionName, arguments: '' }
                        }])
                        
                        // Second chunk with arguments (split into parts)
                        const midPoint = Math.floor(jsonArgs.length / 2)
                        accumulator.accumulate([{
                            index: 0,
                            function: { arguments: jsonArgs.slice(0, midPoint) }
                        }])
                        
                        // Third chunk with remaining arguments
                        accumulator.accumulate([{
                            index: 0,
                            function: { arguments: jsonArgs.slice(midPoint) }
                        }])
                        
                        const toolCalls = accumulator.getToolCalls()
                        
                        // Property: ID should be preserved
                        expect(toolCalls.length).toBe(1)
                        expect(toolCalls[0].id).toBe(toolCallId)
                        expect(toolCalls[0].function.name).toBe(functionName)
                        expect(toolCalls[0].function.arguments).toBe(jsonArgs)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should accumulate partial arguments into complete JSON', async () => {
            await fc.assert(
                fc.property(
                    toolCallIdArb,
                    functionNameArb,
                    jsonArgumentsArb,
                    fc.integer({ min: 2, max: 10 }),
                    (toolCallId, functionName, jsonArgs, numChunks) => {
                        const accumulator = new ToolCallAccumulator()
                        
                        // Split arguments into multiple chunks
                        const chunkSize = Math.ceil(jsonArgs.length / numChunks)
                        const chunks: string[] = []
                        for (let i = 0; i < jsonArgs.length; i += chunkSize) {
                            chunks.push(jsonArgs.slice(i, i + chunkSize))
                        }
                        
                        // First chunk with ID and name
                        accumulator.accumulate([{
                            index: 0,
                            id: toolCallId,
                            type: 'function',
                            function: { name: functionName, arguments: chunks[0] || '' }
                        }])
                        
                        // Remaining chunks with arguments only
                        for (let i = 1; i < chunks.length; i++) {
                            accumulator.accumulate([{
                                index: 0,
                                function: { arguments: chunks[i] }
                            }])
                        }
                        
                        const toolCalls = accumulator.getToolCalls()
                        
                        // Property: Accumulated arguments should equal original
                        expect(toolCalls[0].function.arguments).toBe(jsonArgs)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle multiple concurrent tool calls with different indices', async () => {
            await fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            id: toolCallIdArb,
                            name: functionNameArb,
                            args: jsonArgumentsArb,
                            index: toolCallIndexArb
                        }),
                        { minLength: 1, maxLength: 5 }
                    ).map(arr => {
                        // Ensure unique indices
                        const seen = new Set<number>()
                        return arr.filter(item => {
                            if (seen.has(item.index)) return false
                            seen.add(item.index)
                            return true
                        })
                    }).filter(arr => arr.length > 0),
                    (toolCallsData) => {
                        const accumulator = new ToolCallAccumulator()
                        
                        // Accumulate all tool calls
                        for (const tc of toolCallsData) {
                            accumulator.accumulate([{
                                index: tc.index,
                                id: tc.id,
                                type: 'function',
                                function: { name: tc.name, arguments: tc.args }
                            }])
                        }
                        
                        const toolCalls = accumulator.getToolCalls()
                        
                        // Property: All tool calls should be accumulated
                        expect(toolCalls.length).toBe(toolCallsData.length)
                        
                        // Property: Each tool call should have correct data
                        for (const tc of toolCallsData) {
                            const found = toolCalls.find(t => t.id === tc.id)
                            expect(found).toBeDefined()
                            expect(found!.function.name).toBe(tc.name)
                            expect(found!.function.arguments).toBe(tc.args)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should correctly identify tool_calls finish reason', async () => {
            await fc.assert(
                fc.property(
                    fc.constantFrom('tool_calls', 'stop', 'length', 'content_filter', null, undefined),
                    (finishReason) => {
                        const result = isToolCallsFinishReason(finishReason)
                        
                        // Property: Only 'tool_calls' should return true
                        if (finishReason === 'tool_calls') {
                            expect(result).toBe(true)
                        } else {
                            expect(result).toBe(false)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should filter out incomplete tool calls (missing id or name)', async () => {
            await fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            hasId: fc.boolean(),
                            hasName: fc.boolean(),
                            id: toolCallIdArb,
                            name: functionNameArb,
                            args: jsonArgumentsArb,
                            index: toolCallIndexArb
                        }),
                        { minLength: 1, maxLength: 5 }
                    ).map(arr => {
                        // Ensure unique indices
                        const seen = new Set<number>()
                        return arr.filter(item => {
                            if (seen.has(item.index)) return false
                            seen.add(item.index)
                            return true
                        })
                    }).filter(arr => arr.length > 0),
                    (toolCallsData) => {
                        const accumulator = new ToolCallAccumulator()
                        
                        // Accumulate tool calls with potentially missing id or name
                        for (const tc of toolCallsData) {
                            accumulator.accumulate([{
                                index: tc.index,
                                id: tc.hasId ? tc.id : undefined,
                                type: 'function',
                                function: { 
                                    name: tc.hasName ? tc.name : undefined, 
                                    arguments: tc.args 
                                }
                            }])
                        }
                        
                        const toolCalls = accumulator.getToolCalls()
                        const expectedComplete = toolCallsData.filter(tc => tc.hasId && tc.hasName)
                        
                        // Property: Only complete tool calls should be returned
                        expect(toolCalls.length).toBe(expectedComplete.length)
                        
                        // Property: All returned tool calls should have id and name
                        for (const tc of toolCalls) {
                            expect(tc.id).toBeTruthy()
                            expect(tc.function.name).toBeTruthy()
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Feature: minimax-provider, Property 4: Reasoning Content Extraction
     * 
     * *For any* response containing `reasoning_details`, the MiniMax provider SHALL:
     * - Extract text content from each reasoning detail
     * - Map it to the `reasoning` field in yielded chunks
     * - Update incrementally during streaming
     * 
     * **Validates: Requirements 3.2, 3.3, 3.4**
     */
    describe('Property 4: Reasoning Content Extraction', () => {
        // Arbitrary for generating valid reasoning text
        const reasoningTextArb = fc.string({ minLength: 1, maxLength: 200 })
            .filter(s => s.trim().length > 0)
        
        // Arbitrary for generating valid reasoning detail IDs
        const reasoningIdArb = fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => s.trim().length > 0)
            .map(s => `reasoning-text-${s.replace(/[^a-zA-Z0-9]/g, '')}`)
        
        // Arbitrary for generating reasoning detail index
        const reasoningIndexArb = fc.integer({ min: 0, max: 10 })
        
        // Arbitrary for generating a single reasoning detail
        const reasoningDetailArb = fc.record({
            type: fc.constant('reasoning.text'),
            id: reasoningIdArb,
            format: fc.constant('MiniMax-response-v1'),
            index: reasoningIndexArb,
            text: reasoningTextArb
        })
        
        // Arbitrary for generating an array of reasoning details
        const reasoningDetailsArb = fc.array(reasoningDetailArb, { minLength: 1, maxLength: 5 })
            .map(arr => {
                // Ensure unique indices
                const seen = new Set<number>()
                return arr.filter(item => {
                    if (seen.has(item.index)) return false
                    seen.add(item.index)
                    return true
                })
            })
            .filter(arr => arr.length > 0)

        it('should extract text content from reasoning details', async () => {
            await fc.assert(
                fc.property(reasoningDetailsArb, (reasoningDetails) => {
                    // Create a mock chunk with reasoning details
                    const chunk: MiniMaxStreamChunk = {
                        id: 'test-chunk',
                        choices: [{
                            index: 0,
                            message: {
                                reasoning_details: reasoningDetails
                            }
                        }]
                    }
                    
                    // Extract reasoning from chunk
                    const extracted = extractReasoningFromChunk(chunk)
                    
                    // Property: Extracted reasoning should match input
                    expect(extracted).toBeDefined()
                    expect(extracted).toEqual(reasoningDetails)
                }),
                { numRuns: 100 }
            )
        })

        it('should map reasoning_details[].text to combined reasoning string', async () => {
            await fc.assert(
                fc.property(reasoningDetailsArb, (reasoningDetails) => {
                    // Extract reasoning text
                    const reasoningText = extractReasoningText(reasoningDetails)
                    
                    // Sort by index to get expected order
                    const sorted = [...reasoningDetails].sort((a, b) => a.index - b.index)
                    const expectedText = sorted.map(d => d.text).join('')
                    
                    // Property: Extracted text should be concatenation of all texts in index order
                    expect(reasoningText).toBe(expectedText)
                }),
                { numRuns: 100 }
            )
        })

        it('should correctly identify chunks with reasoning content', async () => {
            await fc.assert(
                fc.property(
                    fc.boolean(),
                    reasoningDetailsArb,
                    (hasReasoning, reasoningDetails) => {
                        // Create a mock chunk with or without reasoning
                        const chunk: MiniMaxStreamChunk = {
                            id: 'test-chunk',
                            choices: [{
                                index: 0,
                                delta: { content: 'test' },
                                message: hasReasoning ? { reasoning_details: reasoningDetails } : undefined
                            }]
                        }
                        
                        // Check if chunk has reasoning
                        const result = chunkHasReasoning(chunk)
                        
                        // Property: Result should match whether reasoning was included
                        expect(result).toBe(hasReasoning)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should accumulate reasoning incrementally across chunks', async () => {
            await fc.assert(
                fc.property(
                    fc.array(reasoningTextArb, { minLength: 2, maxLength: 10 }),
                    (textParts) => {
                        const accumulator = new ReasoningAccumulator()
                        
                        // Accumulate each text part as a separate chunk
                        for (let i = 0; i < textParts.length; i++) {
                            accumulator.accumulate([{
                                type: 'reasoning.text',
                                id: `reasoning-text-${i}`,
                                format: 'MiniMax-response-v1',
                                index: i,
                                text: textParts[i]
                            }])
                        }
                        
                        // Property: Final accumulated text should be concatenation of all parts
                        const expectedText = textParts.join('')
                        expect(accumulator.getReasoning()).toBe(expectedText)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should preserve order when accumulating reasoning with different indices', async () => {
            await fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            index: reasoningIndexArb,
                            text: reasoningTextArb
                        }),
                        { minLength: 2, maxLength: 5 }
                    ).map(arr => {
                        // Ensure unique indices
                        const seen = new Set<number>()
                        return arr.filter(item => {
                            if (seen.has(item.index)) return false
                            seen.add(item.index)
                            return true
                        })
                    }).filter(arr => arr.length > 1),
                    (parts) => {
                        const accumulator = new ReasoningAccumulator()
                        
                        // Shuffle the parts to simulate out-of-order arrival
                        const shuffled = [...parts].sort(() => Math.random() - 0.5)
                        
                        // Accumulate in shuffled order
                        for (const part of shuffled) {
                            accumulator.accumulate([{
                                type: 'reasoning.text',
                                id: `reasoning-text-${part.index}`,
                                format: 'MiniMax-response-v1',
                                index: part.index,
                                text: part.text
                            }])
                        }
                        
                        // Sort by index to get expected order
                        const sorted = [...parts].sort((a, b) => a.index - b.index)
                        const expectedText = sorted.map(p => p.text).join('')
                        
                        // Property: Accumulated text should be in index order regardless of arrival order
                        expect(accumulator.getReasoning()).toBe(expectedText)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle incremental updates to same index (delta mode - appends text)', async () => {
            // MiniMax sends delta text in each chunk (incremental)
            // Each chunk's reasoning_details[].text contains only the NEW text
            await fc.assert(
                fc.property(
                    fc.array(reasoningTextArb, { minLength: 2, maxLength: 5 }),
                    (textParts) => {
                        const accumulator = new ReasoningAccumulator()
                        
                        // Simulate delta text in each chunk
                        for (const text of textParts) {
                            accumulator.accumulate([{
                                type: 'reasoning.text',
                                id: 'reasoning-text-0',
                                format: 'MiniMax-response-v1',
                                index: 0,
                                text: text  // Delta only
                            }])
                        }
                        
                        const expectedText = textParts.join('')
                        expect(accumulator.getReasoning()).toBe(expectedText)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should return empty string when no reasoning accumulated', async () => {
            await fc.assert(
                fc.property(fc.constant(null), () => {
                    const accumulator = new ReasoningAccumulator()
                    
                    // Property: Empty accumulator should return empty string
                    expect(accumulator.getReasoning()).toBe('')
                    expect(accumulator.hasReasoning()).toBe(false)
                }),
                { numRuns: 100 }
            )
        })

        it('should handle undefined and null reasoning details gracefully', async () => {
            await fc.assert(
                fc.property(
                    fc.constantFrom(undefined, null, []),
                    (invalidInput) => {
                        // Test extractReasoningText with invalid input
                        const result = extractReasoningText(invalidInput as MiniMaxReasoningDetail[] | undefined)
                        
                        // Property: Should return undefined for invalid input
                        expect(result).toBeUndefined()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle reasoning details with missing text field', async () => {
            await fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            type: fc.constant('reasoning.text'),
                            id: reasoningIdArb,
                            format: fc.constant('MiniMax-response-v1'),
                            index: reasoningIndexArb,
                            hasText: fc.boolean(),
                            text: reasoningTextArb
                        }),
                        { minLength: 1, maxLength: 5 }
                    ).map(arr => {
                        // Ensure unique indices
                        const seen = new Set<number>()
                        return arr.filter(item => {
                            if (seen.has(item.index)) return false
                            seen.add(item.index)
                            return true
                        })
                    }).filter(arr => arr.length > 0),
                    (detailsWithFlags) => {
                        // Create reasoning details with some missing text
                        const details: MiniMaxReasoningDetail[] = detailsWithFlags.map(d => ({
                            type: d.type,
                            id: d.id,
                            format: d.format,
                            index: d.index,
                            text: d.hasText ? d.text : (undefined as unknown as string)
                        }))
                        
                        // Extract reasoning text
                        const result = extractReasoningText(details)
                        
                        // Get expected text (only from details with text)
                        const sorted = [...detailsWithFlags]
                            .filter(d => d.hasText)
                            .sort((a, b) => a.index - b.index)
                        const expectedText = sorted.map(d => d.text).join('')
                        
                        // Property: Should only include text from details that have it
                        if (expectedText.length === 0) {
                            expect(result).toBeUndefined()
                        } else {
                            expect(result).toBe(expectedText)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Feature: minimax-provider, Property 5: Usage Metrics Extraction
     * 
     * *For any* response containing usage data, the MiniMax provider SHALL:
     * - Map `prompt_tokens` to `inputTokens`
     * - Map `completion_tokens` to `outputTokens`
     * - Calculate `totalTokens` as `inputTokens + outputTokens`
     * - Extract `reasoning_tokens` from `completion_tokens_details` when present
     * 
     * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
     */
    describe('Property 5: Usage Metrics Extraction', () => {
        // Arbitrary for generating valid token counts
        const tokenCountArb = fc.integer({ min: 0, max: 100000 })
        
        // Arbitrary for generating valid reasoning token counts
        const reasoningTokensArb = fc.integer({ min: 0, max: 50000 })
        
        // Arbitrary for generating MiniMax usage objects
        const usageArb = fc.record({
            prompt_tokens: tokenCountArb,
            completion_tokens: tokenCountArb,
            total_tokens: tokenCountArb,
            hasReasoningTokens: fc.boolean(),
            reasoning_tokens: reasoningTokensArb
        })

        it('should map prompt_tokens to inputTokens', async () => {
            await fc.assert(
                fc.asyncProperty(usageArb, async (usageData) => {
                    const usage: MiniMaxUsage = {
                        prompt_tokens: usageData.prompt_tokens,
                        completion_tokens: usageData.completion_tokens,
                        total_tokens: usageData.total_tokens,
                        completion_tokens_details: usageData.hasReasoningTokens 
                            ? { reasoning_tokens: usageData.reasoning_tokens }
                            : undefined
                    }
                    
                    const result = extractUsageMetrics(usage)
                    
                    // Property: inputTokens should equal prompt_tokens
                    expect(result).toBeDefined()
                    expect(result!.inputTokens).toBe(usageData.prompt_tokens)
                }),
                { numRuns: 100 }
            )
        })

        it('should map completion_tokens to outputTokens', async () => {
            await fc.assert(
                fc.asyncProperty(usageArb, async (usageData) => {
                    const usage: MiniMaxUsage = {
                        prompt_tokens: usageData.prompt_tokens,
                        completion_tokens: usageData.completion_tokens,
                        total_tokens: usageData.total_tokens,
                        completion_tokens_details: usageData.hasReasoningTokens 
                            ? { reasoning_tokens: usageData.reasoning_tokens }
                            : undefined
                    }
                    
                    const result = extractUsageMetrics(usage)
                    
                    // Property: outputTokens should equal completion_tokens
                    expect(result).toBeDefined()
                    expect(result!.outputTokens).toBe(usageData.completion_tokens)
                }),
                { numRuns: 100 }
            )
        })

        it('should calculate totalTokens correctly', async () => {
            await fc.assert(
                fc.asyncProperty(usageArb, async (usageData) => {
                    const usage: MiniMaxUsage = {
                        prompt_tokens: usageData.prompt_tokens,
                        completion_tokens: usageData.completion_tokens,
                        total_tokens: usageData.total_tokens,
                        completion_tokens_details: usageData.hasReasoningTokens 
                            ? { reasoning_tokens: usageData.reasoning_tokens }
                            : undefined
                    }
                    
                    const result = extractUsageMetrics(usage)
                    
                    // Property: totalTokens should equal total_tokens from API when provided
                    // If total_tokens is 0 or missing, it falls back to inputTokens + outputTokens
                    expect(result).toBeDefined()
                    const expectedTotal = usageData.total_tokens || (usageData.prompt_tokens + usageData.completion_tokens)
                    expect(result!.totalTokens).toBe(expectedTotal)
                }),
                { numRuns: 100 }
            )
        })

        it('should extract reasoning_tokens when present', async () => {
            await fc.assert(
                fc.asyncProperty(usageArb, async (usageData) => {
                    const usage: MiniMaxUsage = {
                        prompt_tokens: usageData.prompt_tokens,
                        completion_tokens: usageData.completion_tokens,
                        total_tokens: usageData.total_tokens,
                        completion_tokens_details: usageData.hasReasoningTokens 
                            ? { reasoning_tokens: usageData.reasoning_tokens }
                            : undefined
                    }
                    
                    const result = extractUsageMetrics(usage)
                    
                    // Property: reasoningTokens should be extracted when present and > 0
                    expect(result).toBeDefined()
                    if (usageData.hasReasoningTokens && usageData.reasoning_tokens > 0) {
                        expect(result!.reasoningTokens).toBe(usageData.reasoning_tokens)
                    } else {
                        expect(result!.reasoningTokens).toBeUndefined()
                    }
                }),
                { numRuns: 100 }
            )
        })

        it('should return undefined for null or undefined usage', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(null, undefined),
                    async (invalidUsage) => {
                        const result = extractUsageMetrics(invalidUsage as MiniMaxUsage | undefined | null)
                        
                        // Property: Should return undefined for invalid input
                        expect(result).toBeUndefined()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle missing token fields gracefully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        hasPromptTokens: fc.boolean(),
                        hasCompletionTokens: fc.boolean(),
                        hasTotalTokens: fc.boolean(),
                        prompt_tokens: tokenCountArb,
                        completion_tokens: tokenCountArb,
                        total_tokens: tokenCountArb
                    }),
                    async (data) => {
                        // Create usage with potentially missing fields
                        const usage: any = {}
                        if (data.hasPromptTokens) usage.prompt_tokens = data.prompt_tokens
                        if (data.hasCompletionTokens) usage.completion_tokens = data.completion_tokens
                        if (data.hasTotalTokens) usage.total_tokens = data.total_tokens

                        const result = extractUsageMetrics(usage as MiniMaxUsage)

                        // Property: Should handle missing fields with defaults of 0
                        expect(result).toBeDefined()
                        const expectedInput = data.hasPromptTokens ? data.prompt_tokens : 0
                        const expectedOutput = data.hasCompletionTokens ? data.completion_tokens : 0
                        expect(result!.inputTokens).toBe(expectedInput)
                        expect(result!.outputTokens).toBe(expectedOutput)

                        // totalTokens uses provided value (even if 0), or falls back to calculated sum
                        // Note: The implementation uses ?? (nullish coalescing), so 0 is a valid value
                        const providedTotal = data.hasTotalTokens ? data.total_tokens : undefined
                        const expectedTotal = providedTotal ?? (expectedInput + expectedOutput)
                        expect(result!.totalTokens).toBe(expectedTotal)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should accumulate usage metrics correctly across multiple calls', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.array(usageArb, { minLength: 1, maxLength: 5 }),
                    async (usageDataArray) => {
                        let accumulated: NormalizedUsageMetrics | undefined = undefined
                        
                        // Accumulate all usage data
                        for (const usageData of usageDataArray) {
                            const usage: MiniMaxUsage = {
                                prompt_tokens: usageData.prompt_tokens,
                                completion_tokens: usageData.completion_tokens,
                                total_tokens: usageData.total_tokens,
                                completion_tokens_details: usageData.hasReasoningTokens 
                                    ? { reasoning_tokens: usageData.reasoning_tokens }
                                    : undefined
                            }
                            const extracted = extractUsageMetrics(usage)
                            accumulated = accumulateUsageMetrics(accumulated, extracted)
                        }
                        
                        // Calculate expected totals
                        const expectedInput = usageDataArray.reduce((sum, u) => sum + u.prompt_tokens, 0)
                        const expectedOutput = usageDataArray.reduce((sum, u) => sum + u.completion_tokens, 0)
                        // For totalTokens, we need to account for the fallback logic in extractUsageMetrics
                        // Note: Uses ?? (nullish coalescing), so only undefined/null triggers fallback, not 0
                        const expectedTotal = usageDataArray.reduce((sum, u) => {
                            const total = u.total_tokens ?? (u.prompt_tokens + u.completion_tokens)
                            return sum + total
                        }, 0)
                        const expectedReasoning = usageDataArray
                            .filter(u => u.hasReasoningTokens && u.reasoning_tokens > 0)
                            .reduce((sum, u) => sum + u.reasoning_tokens, 0)
                        
                        // Property: Accumulated values should equal sum of all inputs
                        expect(accumulated).toBeDefined()
                        expect(accumulated!.inputTokens).toBe(expectedInput)
                        expect(accumulated!.outputTokens).toBe(expectedOutput)
                        expect(accumulated!.totalTokens).toBe(expectedTotal)
                        if (expectedReasoning > 0) {
                            expect(accumulated!.reasoningTokens).toBe(expectedReasoning)
                        } else {
                            expect(accumulated!.reasoningTokens).toBeUndefined()
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should calculate TPS correctly', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 10000 }),
                    fc.integer({ min: 1, max: 60000 }),
                    async (outputTokens, latencyMs) => {
                        const tps = calculateTPS(outputTokens, latencyMs)
                        
                        // Property: TPS should be outputTokens / (latencyMs / 1000)
                        expect(tps).toBeDefined()
                        const expectedTps = outputTokens / (latencyMs / 1000)
                        expect(tps).toBeCloseTo(expectedTps, 5)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should return undefined TPS for invalid inputs', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        { outputTokens: 0, latencyMs: 1000 },
                        { outputTokens: -1, latencyMs: 1000 },
                        { outputTokens: 100, latencyMs: 0 },
                        { outputTokens: 100, latencyMs: -1 },
                        { outputTokens: 0, latencyMs: 0 }
                    ),
                    async ({ outputTokens, latencyMs }) => {
                        const tps = calculateTPS(outputTokens, latencyMs)

                        // Property: Should return undefined for invalid inputs
                        expect(tps).toBeUndefined()
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle alternative field names (input_tokens/output_tokens)', async () => {
            await fc.assert(
                fc.asyncProperty(tokenCountArb, tokenCountArb, tokenCountArb, async (inputTokens, outputTokens, totalTokens) => {
                    const usage: MiniMaxUsage = {
                        input_tokens: inputTokens,
                        output_tokens: outputTokens,
                        total_tokens: totalTokens
                    }

                    const result = extractUsageMetrics(usage)

                    // Property: Should extract tokens from alternative field names
                    expect(result).toBeDefined()
                    expect(result!.inputTokens).toBe(inputTokens)
                    expect(result!.outputTokens).toBe(outputTokens)
                    expect(result!.totalTokens).toBe(totalTokens)
                }),
                { numRuns: 100 }
            )
        })

        it('should prefer prompt_tokens over input_tokens when both are present', async () => {
            const usage: MiniMaxUsage = {
                prompt_tokens: 100,
                input_tokens: 200,
                completion_tokens: 50,
                output_tokens: 150,
                total_tokens: 150
            }

            const result = extractUsageMetrics(usage)

            // Property: Should prefer OpenAI-style field names
            expect(result).toBeDefined()
            expect(result!.inputTokens).toBe(100) // From prompt_tokens
            expect(result!.outputTokens).toBe(50) // From completion_tokens
        })
    })
})

// Helper function to create a mock ReadableStream
function createMockReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    let index = 0

    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(encoder.encode(chunks[index]))
                index++
            } else {
                controller.close()
            }
        }
    })
}
