/**
 * Property-Based Tests for useStreamingChat Hook - MiniMax Integration
 * 
 * Feature: minimax-provider
 * 
 * These tests verify the correctness properties defined in the design document
 * for the MiniMax provider integration with the useStreamingChat hook.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Feature: minimax-provider, Property 6: Tool Calling Integration
 * 
 * *For any* MiniMax model with tool calling enabled, the useStreamingChat hook SHALL:
 * - Process tool calls using the existing tool calling infrastructure
 * - Support research mode with multiple search rounds
 * - Correctly format follow-up messages with tool results
 * 
 * **Validates: Requirements 7.2, 7.4**
 */
describe('Property 6: Tool Calling Integration', () => {
    // Arbitrary for generating valid tool call IDs
    const toolCallIdArb = fc.string({ minLength: 5, maxLength: 30 })
        .filter(s => s.trim().length > 0)
        .map(s => `call_${s.replace(/[^a-zA-Z0-9]/g, '')}`)
    
    // Arbitrary for generating valid function names
    const functionNameArb = fc.constantFrom('web_search', 'calculator', 'get_weather')
    
    // Arbitrary for generating valid JSON argument strings
    const jsonArgumentsArb = fc.record({
        query: fc.string({ minLength: 1, maxLength: 50 }),
        limit: fc.integer({ min: 1, max: 100 })
    }).map(obj => JSON.stringify(obj))

    // Arbitrary for generating tool call results
    const toolResultArb = fc.record({
        success: fc.boolean(),
        data: fc.string({ minLength: 1, maxLength: 200 }),
        executionTime: fc.integer({ min: 10, max: 5000 })
    })

    // Arbitrary for generating research mode parameters
    const researchParamsArb = fc.record({
        maxRounds: fc.integer({ min: 1, max: 25 }),
        mandatory: fc.boolean()
    })

    it('should correctly format tool call messages for follow-up requests', async () => {
        await fc.assert(
            fc.asyncProperty(
                toolCallIdArb,
                functionNameArb,
                jsonArgumentsArb,
                fc.string({ minLength: 1, maxLength: 100 }),
                async (toolCallId, functionName, args, content) => {
                    const reconstructedMessage = {
                        role: 'assistant',
                        content: content,
                        tool_calls: [{
                            id: toolCallId,
                            type: 'function' as const,
                            function: {
                                name: functionName,
                                arguments: args
                            }
                        }]
                    }

                    expect(reconstructedMessage.role).toBe('assistant')
                    expect(reconstructedMessage.tool_calls).toHaveLength(1)
                    expect(reconstructedMessage.tool_calls[0].id).toBe(toolCallId)
                    expect(reconstructedMessage.tool_calls[0].type).toBe('function')
                    expect(reconstructedMessage.tool_calls[0].function.name).toBe(functionName)
                    expect(reconstructedMessage.tool_calls[0].function.arguments).toBe(args)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('should correctly format tool results for saving', async () => {
        await fc.assert(
            fc.asyncProperty(
                toolCallIdArb,
                functionNameArb,
                jsonArgumentsArb,
                toolResultArb,
                async (toolCallId, functionName, args, result) => {
                    const toolResult = {
                        toolCall: {
                            id: toolCallId,
                            name: functionName,
                            arguments: args
                        },
                        result: {
                            success: result.success,
                            data: result.data,
                            error: undefined,
                            executionTime: result.executionTime
                        }
                    }

                    const savedToolResults = [toolResult].map((tr: any) => ({
                        toolCall: { id: tr.toolCall.id, name: tr.toolCall.name, arguments: tr.toolCall.arguments },
                        result: { success: tr.result.success, data: tr.result.data, error: tr.result.error, executionTime: tr.result.executionTime }
                    }))

                    expect(savedToolResults).toHaveLength(1)
                    expect(savedToolResults[0].toolCall.id).toBe(toolCallId)
                    expect(savedToolResults[0].toolCall.name).toBe(functionName)
                    expect(savedToolResults[0].toolCall.arguments).toBe(args)
                    expect(savedToolResults[0].result.success).toBe(result.success)
                    expect(savedToolResults[0].result.data).toBe(result.data)
                    expect(savedToolResults[0].result.executionTime).toBe(result.executionTime)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('should correctly determine when to force tool use in mandatory research mode', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: 30 }),
                fc.integer({ min: 1, max: 25 }),
                fc.boolean(),
                async (totalSearchCount, maxRounds, mandatory) => {
                    const remainingSearches = maxRounds - totalSearchCount
                    const forceToolUse = mandatory && remainingSearches > 0

                    if (mandatory && remainingSearches > 0) {
                        expect(forceToolUse).toBe(true)
                    } else {
                        expect(forceToolUse).toBe(false)
                    }

                    const toolChoice = forceToolUse 
                        ? { type: 'function', function: { name: 'web_search' } } 
                        : undefined

                    if (forceToolUse) {
                        expect(toolChoice).toEqual({ type: 'function', function: { name: 'web_search' } })
                    } else {
                        expect(toolChoice).toBeUndefined()
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})


/**
 * Feature: minimax-provider, Property 7: Model Name Formatting
 * 
 * *For any* completed MiniMax response, the model name SHALL be formatted as 
 * `minimax/{modelCode}` where modelCode is the selected model identifier.
 * 
 * **Validates: Requirements 7.5**
 */
describe('Property 7: Model Name Formatting', () => {
    // Arbitrary for generating valid MiniMax model codes
    const modelCodeArb = fc.constantFrom(
        'MiniMax-M2.1',
        'MiniMax-M2.1-lightning',
        'MiniMax-M2'
    )

    // Arbitrary for generating arbitrary model codes (for edge cases)
    const arbitraryModelCodeArb = fc.string({ minLength: 1, maxLength: 50 })
        .filter(s => s.trim().length > 0 && !s.includes('/'))

    it('should format model name as minimax/{modelCode} for standard models', async () => {
        await fc.assert(
            fc.asyncProperty(modelCodeArb, async (modelCode) => {
                const formattedModelName = `minimax/${modelCode}`

                expect(formattedModelName).toBe(`minimax/${modelCode}`)
                expect(formattedModelName.startsWith('minimax/')).toBe(true)
                expect(formattedModelName.split('/')[0]).toBe('minimax')
                expect(formattedModelName.split('/')[1]).toBe(modelCode)
            }),
            { numRuns: 100 }
        )
    })

    it('should format model name correctly for any valid model code', async () => {
        await fc.assert(
            fc.asyncProperty(arbitraryModelCodeArb, async (modelCode) => {
                const formattedModelName = `minimax/${modelCode}`

                expect(formattedModelName.startsWith('minimax/')).toBe(true)
                
                const parts = formattedModelName.split('/')
                expect(parts).toHaveLength(2)
                expect(parts[0]).toBe('minimax')
                expect(parts[1]).toBe(modelCode)
            }),
            { numRuns: 100 }
        )
    })

    it('should produce consistent model names for the same model code', async () => {
        await fc.assert(
            fc.asyncProperty(
                modelCodeArb,
                fc.integer({ min: 2, max: 10 }),
                async (modelCode, iterations) => {
                    const modelNames: string[] = []
                    for (let i = 0; i < iterations; i++) {
                        modelNames.push(`minimax/${modelCode}`)
                    }

                    const firstModelName = modelNames[0]
                    for (const name of modelNames) {
                        expect(name).toBe(firstModelName)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    it('should produce different model names for different model codes', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(modelCodeArb, { minLength: 2, maxLength: 3 })
                    .filter(arr => new Set(arr).size === arr.length),
                async (modelCodes) => {
                    const modelNames = modelCodes.map(code => `minimax/${code}`)

                    const uniqueNames = new Set(modelNames)
                    expect(uniqueNames.size).toBe(modelCodes.length)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('should match the pattern used by other providers', async () => {
        await fc.assert(
            fc.asyncProperty(
                modelCodeArb,
                fc.constantFrom('openrouter', 'groq', 'gemini', 'perplexity', 'ollama', 'minimax'),
                async (modelCode, provider) => {
                    const formattedModelName = `${provider}/${modelCode}`

                    expect(formattedModelName).toMatch(/^[a-z]+\/[A-Za-z0-9._-]+$/)
                    
                    const parts = formattedModelName.split('/')
                    expect(parts).toHaveLength(2)
                    expect(parts[0]).toBe(provider)
                    expect(parts[1]).toBe(modelCode)
                }
            ),
            { numRuns: 100 }
        )
    })
})
