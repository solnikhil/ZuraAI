/**
 * Unit tests for MiniMax service
 * Tests API key validation, request body formatting, SSE parsing, and error handling
 * 
 * Requirements: 1.3, 1.7, 2.3, 2.4, 2.5, 9.1, 9.2, 9.3, 9.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    streamMiniMaxCompletion,
    generateMiniMaxCompletion,
    MiniMaxStreamChunk,
    MiniMaxResponse,
    MiniMaxRequestBody,
    ToolCallAccumulator,
    isToolCallsFinishReason,
    extractToolCallsFromChunk,
    chunkHasToolCalls
} from './minimax'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('MiniMax Service', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('API Key Validation', () => {
        it('throws error when API key is missing for streaming', async () => {
            const generator = streamMiniMaxCompletion('', 'MiniMax-M2.1', [{ role: 'user', content: 'Hello' }])
            await expect(generator.next()).rejects.toThrow('MiniMax API Key is missing')
        })

        it('throws error when API key is undefined for streaming', async () => {
            const generator = streamMiniMaxCompletion(undefined as unknown as string, 'MiniMax-M2.1', [{ role: 'user', content: 'Hello' }])
            await expect(generator.next()).rejects.toThrow('MiniMax API Key is missing')
        })

        it('throws error when API key is missing for non-streaming', async () => {
            await expect(
                generateMiniMaxCompletion('', 'MiniMax-M2.1', [{ role: 'user', content: 'Hello' }])
            ).rejects.toThrow('MiniMax API Key is missing')
        })

        it('throws error when API key is undefined for non-streaming', async () => {
            await expect(
                generateMiniMaxCompletion(undefined as unknown as string, 'MiniMax-M2.1', [{ role: 'user', content: 'Hello' }])
            ).rejects.toThrow('MiniMax API Key is missing')
        })
    })

    describe('Request Body Formatting', () => {
        it('includes required fields in streaming request', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                    'data: [DONE]\n'
                ])
            })

            const generator = streamMiniMaxCompletion('test-api-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hello' }])
            await generator.next()

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.minimax.io/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer test-api-key',
                        'Content-Type': 'application/json'
                    }
                })
            )

            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
            expect(requestBody.model).toBe('MiniMax-M2.1')
            expect(requestBody.messages).toEqual([{ role: 'user', content: 'Hello' }])
            expect(requestBody.stream).toBe(true)
            expect(requestBody.reasoning_split).toBe(true)
        })

        it('includes optional parameters when provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                    'data: [DONE]\n'
                ])
            })

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hello' }],
                { temperature: 0.7, maxTokens: 1000 }
            )
            await generator.next()

            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
            expect(requestBody.temperature).toBe(0.7)
            expect(requestBody.max_tokens).toBe(1000)
        })

        it('includes tools when provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                    'data: [DONE]\n'
                ])
            })

            const tools = [{
                type: 'function' as const,
                function: {
                    name: 'web_search',
                    description: 'Search the web',
                    parameters: { type: 'object', properties: {} }
                }
            }]

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hello' }],
                { tools, toolChoice: 'auto' }
            )
            await generator.next()

            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
            expect(requestBody.tools).toEqual(tools)
            expect(requestBody.tool_choice).toBe('auto')
        })

        it('defaults tool_choice to auto when tools provided without toolChoice', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hi"}}]}\n',
                    'data: [DONE]\n'
                ])
            })

            const tools = [{
                type: 'function' as const,
                function: { name: 'test', description: 'Test' }
            }]

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hello' }],
                { tools }
            )
            await generator.next()

            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
            expect(requestBody.tool_choice).toBe('auto')
        })

        it('does not include stream flag in non-streaming request', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: '1',
                    choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }]
                })
            })

            await generateMiniMaxCompletion('test-api-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hello' }])

            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as MiniMaxRequestBody
            expect(requestBody.stream).toBeUndefined()
            expect(requestBody.reasoning_split).toBe(true)
        })
    })

    describe('SSE Parsing', () => {
        it('parses valid SSE chunks', async () => {
            const chunks: MiniMaxStreamChunk[] = []
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Hello"}}]}\n',
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":" World"}}]}\n',
                    'data: [DONE]\n'
                ])
            })

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hi' }],
                { onChunk: (chunk) => chunks.push(chunk) }
            )

            for await (const chunk of generator) {
                // Consume generator
            }

            expect(chunks).toHaveLength(2)
            expect(chunks[0].choices[0].delta?.content).toBe('Hello')
            expect(chunks[1].choices[0].delta?.content).toBe(' World')
        })

        it('handles [DONE] marker correctly', async () => {
            const chunks: MiniMaxStreamChunk[] = []
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Test"}}]}\n',
                    'data: [DONE]\n',
                    'data: {"id":"2","choices":[{"index":0,"delta":{"content":"Should not appear"}}]}\n'
                ])
            })

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hi' }],
                { onChunk: (chunk) => chunks.push(chunk) }
            )

            for await (const chunk of generator) {
                // Consume generator
            }

            expect(chunks).toHaveLength(1)
            expect(chunks[0].choices[0].delta?.content).toBe('Test')
        })

        it('skips empty lines', async () => {
            const chunks: MiniMaxStreamChunk[] = []
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    '\n',
                    '   \n',
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Test"}}]}\n',
                    '\n',
                    'data: [DONE]\n'
                ])
            })

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hi' }],
                { onChunk: (chunk) => chunks.push(chunk) }
            )

            for await (const chunk of generator) {
                // Consume generator
            }

            expect(chunks).toHaveLength(1)
        })

        it('skips invalid JSON chunks', async () => {
            const chunks: MiniMaxStreamChunk[] = []
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: invalid json\n',
                    'data: {"id":"1","choices":[{"index":0,"delta":{"content":"Valid"}}]}\n',
                    'data: [DONE]\n'
                ])
            })

            const generator = streamMiniMaxCompletion(
                'test-api-key',
                'MiniMax-M2.1',
                [{ role: 'user', content: 'Hi' }],
                { onChunk: (chunk) => chunks.push(chunk) }
            )

            for await (const chunk of generator) {
                // Consume generator
            }

            expect(chunks).toHaveLength(1)
            expect(chunks[0].choices[0].delta?.content).toBe('Valid')
            expect(consoleSpy).toHaveBeenCalled()

            consoleSpy.mockRestore()
        })
    })

    describe('Error Handling', () => {
        it('throws error for 401 status (invalid API key)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                text: async () => '{"error":{"message":"Invalid API key"}}'
            })

            const generator = streamMiniMaxCompletion('invalid-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            await expect(generator.next()).rejects.toThrow('Invalid MiniMax API key. Please check your credentials.')
        })

        it('throws error for 429 status (rate limit)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                text: async () => '{"error":{"message":"Rate limit exceeded"}}'
            })

            const generator = streamMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            await expect(generator.next()).rejects.toThrow('MiniMax rate limit exceeded. Please wait and try again.')
        })

        it('throws error for 500+ status (server error)', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: async () => '{"error":{"message":"Server error"}}'
            })

            const generator = streamMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            await expect(generator.next()).rejects.toThrow('MiniMax server error. Please try again later.')
        })

        it('extracts error from base_resp.status_msg', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                text: async () => '{"base_resp":{"status_code":1001,"status_msg":"Custom MiniMax error message"}}'
            })

            const generator = streamMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            await expect(generator.next()).rejects.toThrow('Custom MiniMax error message')
        })

        it('handles base_resp error in streaming chunk', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: createMockReadableStream([
                    'data: {"id":"1","choices":[],"base_resp":{"status_code":1001,"status_msg":"MiniMax streaming error"}}\n'
                ])
            })

            const generator = streamMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            await expect(generator.next()).rejects.toThrow('MiniMax streaming error')
        })

        it('handles base_resp error in non-streaming response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    id: '1',
                    choices: [],
                    base_resp: { status_code: 1001, status_msg: 'Non-streaming error' }
                })
            })

            await expect(
                generateMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            ).rejects.toThrow('Non-streaming error')
        })

        it('throws error when response reader is unavailable', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                body: null
            })

            const generator = streamMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])
            await expect(generator.next()).rejects.toThrow('Failed to get response reader')
        })
    })

    describe('Non-Streaming Response', () => {
        it('returns parsed response correctly', async () => {
            const mockResponse: MiniMaxResponse = {
                id: 'test-id',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Hello! How can I help you?'
                    },
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 20,
                    total_tokens: 30
                }
            }

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            })

            const result = await generateMiniMaxCompletion('test-key', 'MiniMax-M2.1', [{ role: 'user', content: 'Hi' }])

            expect(result.id).toBe('test-id')
            expect(result.choices[0].message.content).toBe('Hello! How can I help you?')
            expect(result.usage?.total_tokens).toBe(30)
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


    describe('Tool Call Accumulation', () => {
        describe('ToolCallAccumulator', () => {
            it('accumulates tool calls from multiple chunks', () => {
                const accumulator = new ToolCallAccumulator()
                
                // First chunk with tool call id and partial name
                accumulator.accumulate([{
                    index: 0,
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'web_search', arguments: '{"q' }
                }])
                
                // Second chunk with more arguments
                accumulator.accumulate([{
                    index: 0,
                    function: { arguments: 'uery":"test' }
                }])
                
                // Third chunk with final arguments
                accumulator.accumulate([{
                    index: 0,
                    function: { arguments: '"}' }
                }])
                
                const toolCalls = accumulator.getToolCalls()
                expect(toolCalls).toHaveLength(1)
                expect(toolCalls[0].id).toBe('call_123')
                expect(toolCalls[0].function.name).toBe('web_search')
                expect(toolCalls[0].function.arguments).toBe('{"query":"test"}')
            })

            it('handles multiple concurrent tool calls', () => {
                const accumulator = new ToolCallAccumulator()
                
                // First tool call
                accumulator.accumulate([{
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'web_search', arguments: '{"query":"first"}' }
                }])
                
                // Second tool call
                accumulator.accumulate([{
                    index: 1,
                    id: 'call_2',
                    type: 'function',
                    function: { name: 'calculator', arguments: '{"expr":"1+1"}' }
                }])
                
                const toolCalls = accumulator.getToolCalls()
                expect(toolCalls).toHaveLength(2)
                expect(toolCalls[0].id).toBe('call_1')
                expect(toolCalls[0].function.name).toBe('web_search')
                expect(toolCalls[1].id).toBe('call_2')
                expect(toolCalls[1].function.name).toBe('calculator')
            })

            it('filters out incomplete tool calls', () => {
                const accumulator = new ToolCallAccumulator()
                
                // Complete tool call
                accumulator.accumulate([{
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'web_search', arguments: '{}' }
                }])
                
                // Incomplete tool call (no id)
                accumulator.accumulate([{
                    index: 1,
                    type: 'function',
                    function: { name: 'incomplete', arguments: '{}' }
                }])
                
                // Incomplete tool call (no name)
                accumulator.accumulate([{
                    index: 2,
                    id: 'call_3',
                    type: 'function',
                    function: { arguments: '{}' }
                }])
                
                const toolCalls = accumulator.getToolCalls()
                expect(toolCalls).toHaveLength(1)
                expect(toolCalls[0].id).toBe('call_1')
            })

            it('hasToolCalls returns correct state', () => {
                const accumulator = new ToolCallAccumulator()
                
                expect(accumulator.hasToolCalls()).toBe(false)
                
                accumulator.accumulate([{
                    index: 0,
                    id: 'call_1',
                    function: { name: 'test' }
                }])
                
                expect(accumulator.hasToolCalls()).toBe(true)
            })

            it('clear removes all accumulated tool calls', () => {
                const accumulator = new ToolCallAccumulator()
                
                accumulator.accumulate([{
                    index: 0,
                    id: 'call_1',
                    function: { name: 'test', arguments: '{}' }
                }])
                
                expect(accumulator.hasToolCalls()).toBe(true)
                
                accumulator.clear()
                
                expect(accumulator.hasToolCalls()).toBe(false)
                expect(accumulator.getToolCalls()).toHaveLength(0)
            })

            it('handles undefined and empty arrays gracefully', () => {
                const accumulator = new ToolCallAccumulator()
                
                accumulator.accumulate(undefined)
                accumulator.accumulate([])
                
                expect(accumulator.hasToolCalls()).toBe(false)
            })
        })

        describe('isToolCallsFinishReason', () => {
            it('returns true for tool_calls finish reason', () => {
                expect(isToolCallsFinishReason('tool_calls')).toBe(true)
            })

            it('returns false for other finish reasons', () => {
                expect(isToolCallsFinishReason('stop')).toBe(false)
                expect(isToolCallsFinishReason('length')).toBe(false)
                expect(isToolCallsFinishReason('content_filter')).toBe(false)
            })

            it('returns false for null and undefined', () => {
                expect(isToolCallsFinishReason(null)).toBe(false)
                expect(isToolCallsFinishReason(undefined)).toBe(false)
            })
        })

        describe('extractToolCallsFromChunk', () => {
            it('extracts tool calls from chunk delta', () => {
                const chunk: MiniMaxStreamChunk = {
                    id: 'test',
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_1',
                                type: 'function',
                                function: { name: 'test', arguments: '{}' }
                            }]
                        }
                    }]
                }
                
                const toolCalls = extractToolCallsFromChunk(chunk)
                expect(toolCalls).toHaveLength(1)
                expect(toolCalls![0].id).toBe('call_1')
            })

            it('returns undefined when no tool calls present', () => {
                const chunk: MiniMaxStreamChunk = {
                    id: 'test',
                    choices: [{
                        index: 0,
                        delta: { content: 'Hello' }
                    }]
                }
                
                expect(extractToolCallsFromChunk(chunk)).toBeUndefined()
            })
        })

        describe('chunkHasToolCalls', () => {
            it('returns true when chunk has tool calls', () => {
                const chunk: MiniMaxStreamChunk = {
                    id: 'test',
                    choices: [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: 'call_1',
                                function: { name: 'test' }
                            }]
                        }
                    }]
                }
                
                expect(chunkHasToolCalls(chunk)).toBe(true)
            })

            it('returns false when chunk has no tool calls', () => {
                const chunk: MiniMaxStreamChunk = {
                    id: 'test',
                    choices: [{
                        index: 0,
                        delta: { content: 'Hello' }
                    }]
                }
                
                expect(chunkHasToolCalls(chunk)).toBe(false)
            })

            it('returns false when tool_calls is empty array', () => {
                const chunk: MiniMaxStreamChunk = {
                    id: 'test',
                    choices: [{
                        index: 0,
                        delta: { tool_calls: [] }
                    }]
                }
                
                expect(chunkHasToolCalls(chunk)).toBe(false)
            })
        })

        describe('Streaming with tool calls', () => {
            it('yields chunks with tool calls', async () => {
                const chunks: MiniMaxStreamChunk[] = []
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    body: createMockReadableStream([
                        'data: {"id":"1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"web_search","arguments":"{\\"query\\""}}]}}]}\n',
                        'data: {"id":"1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"test\\"}"}}]}}]}\n',
                        'data: {"id":"1","choices":[{"index":0,"finish_reason":"tool_calls"}]}\n',
                        'data: [DONE]\n'
                    ])
                })

                const accumulator = new ToolCallAccumulator()
                let finishReason: string | null = null

                const generator = streamMiniMaxCompletion(
                    'test-api-key',
                    'MiniMax-M2.1',
                    [{ role: 'user', content: 'Search for test' }],
                    {
                        tools: [{
                            type: 'function',
                            function: { name: 'web_search', description: 'Search the web' }
                        }],
                        onChunk: (chunk) => {
                            chunks.push(chunk)
                            accumulator.accumulate(extractToolCallsFromChunk(chunk))
                            if (chunk.choices?.[0]?.finish_reason) {
                                finishReason = chunk.choices[0].finish_reason
                            }
                        }
                    }
                )

                for await (const chunk of generator) {
                    // Consume generator
                }

                expect(chunks).toHaveLength(3)
                expect(isToolCallsFinishReason(finishReason)).toBe(true)
                
                const toolCalls = accumulator.getToolCalls()
                expect(toolCalls).toHaveLength(1)
                expect(toolCalls[0].id).toBe('call_1')
                expect(toolCalls[0].function.name).toBe('web_search')
                expect(toolCalls[0].function.arguments).toBe('{"query":"test"}')
            })
        })
    })
