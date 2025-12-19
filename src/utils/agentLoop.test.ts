import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
    formatToolResultForConversation,
    formatToolResultsForConversation,
    shouldContinueAgentLoop,
    extractResponseContent,
    buildToolResultMessage,
    accumulateToolResults,
    hasToolErrors,
    getToolErrors
} from './agentLoop'
import { ToolCallResult, ToolCall } from '../tools/executor'

// Arbitrary for generating random tool calls
const toolCallArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    arguments: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean()
    ))
})

// Arbitrary for generating successful tool results
const successfulToolResultArb = fc.record({
    toolCall: toolCallArb,
    result: fc.record({
        success: fc.constant(true),
        data: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.dictionary(fc.string(), fc.string())
        ),
        executionTime: fc.integer({ min: 0, max: 10000 })
    })
}) as fc.Arbitrary<ToolCallResult>

// Arbitrary for generating failed tool results
const failedToolResultArb = fc.record({
    toolCall: toolCallArb,
    result: fc.record({
        success: fc.constant(false),
        error: fc.string({ minLength: 1, maxLength: 200 }),
        executionTime: fc.integer({ min: 0, max: 10000 })
    })
}) as fc.Arbitrary<ToolCallResult>

// Arbitrary for generating any tool result (success or failure)
const toolResultArb = fc.oneof(successfulToolResultArb, failedToolResultArb)

describe('Agent Loop - Tool Result Incorporation', () => {
    /**
     * **Feature: agent-mode, Property 4: Tool results are incorporated into conversation**
     * **Validates: Requirements 2.3, 3.2**
     * 
     * For any tool execution that returns a result, that result SHALL be formatted
     * and included in the message history for the next AI call.
     */
    it('Property 4: Tool results are incorporated into conversation', () => {
        fc.assert(
            fc.property(
                toolResultArb,
                (toolResult) => {
                    const formatted = formatToolResultForConversation(toolResult)
                    
                    // The formatted result should be valid JSON
                    expect(() => JSON.parse(formatted)).not.toThrow()
                    
                    const parsed = JSON.parse(formatted)
                    
                    // The formatted result should contain the tool name
                    expect(parsed.tool).toBe(toolResult.toolCall.name)
                    
                    // The formatted result should contain the status
                    expect(parsed.status).toBe(toolResult.result.success ? 'success' : 'error')
                    
                    // If successful, should contain the result data
                    if (toolResult.result.success) {
                        expect(parsed.result).toEqual(toolResult.result.data)
                        expect(parsed.arguments).toEqual(toolResult.toolCall.arguments)
                    }
                    
                    // If failed, should contain the error message
                    if (!toolResult.result.success) {
                        expect(parsed.error).toBe(toolResult.result.error)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: Multiple tool results are all formatted and concatenated
     */
    it('Multiple tool results are all formatted', () => {
        fc.assert(
            fc.property(
                fc.array(toolResultArb, { minLength: 1, maxLength: 5 }),
                (toolResults) => {
                    const formatted = formatToolResultsForConversation(toolResults)
                    
                    // Each tool result should be parseable as JSON when split
                    const parts = formatted.split('\n\n').filter(p => p.trim())
                    expect(parts.length).toBe(toolResults.length)
                    
                    // Each part should be valid JSON containing the tool name
                    for (let i = 0; i < parts.length; i++) {
                        const parsed = JSON.parse(parts[i])
                        expect(parsed.tool).toBe(toolResults[i].toolCall.name)
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Agent Loop - Error Reporting', () => {
    /**
     * **Feature: agent-mode, Property 5: Tool errors are reported**
     * **Validates: Requirements 2.4**
     * 
     * For any tool execution that fails, the error message SHALL be included
     * in the conversation for the AI to observe.
     */
    it('Property 5: Tool errors are reported', () => {
        fc.assert(
            fc.property(
                failedToolResultArb,
                (toolResult) => {
                    const formatted = formatToolResultForConversation(toolResult)
                    const parsed = JSON.parse(formatted)
                    
                    // The formatted result should indicate error status
                    expect(parsed.status).toBe('error')
                    
                    // The error message should be included
                    expect(parsed.error).toBe(toolResult.result.error)
                    
                    // The tool name should be included for context
                    expect(parsed.tool).toBe(toolResult.toolCall.name)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: hasToolErrors correctly identifies errors
     */
    it('hasToolErrors correctly identifies errors in results', () => {
        fc.assert(
            fc.property(
                fc.array(toolResultArb, { minLength: 1, maxLength: 5 }),
                (toolResults) => {
                    const hasErrors = hasToolErrors(toolResults)
                    const actualHasErrors = toolResults.some(r => !r.result.success)
                    
                    expect(hasErrors).toBe(actualHasErrors)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: getToolErrors returns all error messages
     */
    it('getToolErrors returns all error messages', () => {
        fc.assert(
            fc.property(
                fc.array(failedToolResultArb, { minLength: 1, maxLength: 5 }),
                (toolResults) => {
                    const errors = getToolErrors(toolResults)
                    
                    // Should have same number of errors as failed results
                    expect(errors.length).toBe(toolResults.length)
                    
                    // Each error should contain the tool name and error message
                    for (let i = 0; i < toolResults.length; i++) {
                        expect(errors[i]).toContain(toolResults[i].toolCall.name)
                        expect(errors[i]).toContain(toolResults[i].result.error || 'Unknown error')
                    }
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Agent Loop - Sequential Execution', () => {
    /**
     * **Feature: agent-mode, Property 6: Sequential tool execution preserves order**
     * **Validates: Requirements 3.4**
     * 
     * For any sequence of tool calls, each tool's result SHALL be processed
     * before the next tool call is made.
     */
    it('Property 6: Sequential tool execution preserves order', () => {
        fc.assert(
            fc.property(
                fc.array(toolResultArb, { minLength: 1, maxLength: 10 }),
                fc.array(toolResultArb, { minLength: 1, maxLength: 10 }),
                (existingResults, newResults) => {
                    const accumulated = accumulateToolResults(existingResults, newResults)
                    
                    // The accumulated results should have the correct length
                    expect(accumulated.length).toBe(existingResults.length + newResults.length)
                    
                    // The order should be preserved: existing results first, then new results
                    for (let i = 0; i < existingResults.length; i++) {
                        expect(accumulated[i]).toEqual(existingResults[i])
                    }
                    
                    for (let i = 0; i < newResults.length; i++) {
                        expect(accumulated[existingResults.length + i]).toEqual(newResults[i])
                    }
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: Empty arrays are handled correctly
     */
    it('Accumulating with empty arrays works correctly', () => {
        fc.assert(
            fc.property(
                fc.array(toolResultArb, { minLength: 0, maxLength: 5 }),
                (results) => {
                    // Accumulating with empty existing results
                    const accumulated1 = accumulateToolResults([], results)
                    expect(accumulated1).toEqual(results)
                    
                    // Accumulating with empty new results
                    const accumulated2 = accumulateToolResults(results, [])
                    expect(accumulated2).toEqual(results)
                }
            ),
            { numRuns: 100 }
        )
    })
})

describe('Agent Loop - Response Parsing', () => {
    /**
     * Additional property: shouldContinueAgentLoop correctly identifies tool calls
     */
    it('shouldContinueAgentLoop identifies OpenAI-format tool calls', () => {
        fc.assert(
            fc.property(
                fc.array(toolCallArb, { minLength: 1, maxLength: 3 }),
                (toolCalls) => {
                    const response = {
                        choices: [{
                            message: {
                                tool_calls: toolCalls
                            }
                        }]
                    }
                    
                    // Should return true for OpenRouter/Groq/Ollama format
                    expect(shouldContinueAgentLoop(response, 'openrouter')).toBe(true)
                    expect(shouldContinueAgentLoop(response, 'groq')).toBe(true)
                    expect(shouldContinueAgentLoop(response, 'ollama')).toBe(true)
                }
            ),
            { numRuns: 100 }
        )
    })

    /**
     * Additional property: shouldContinueAgentLoop returns false for no tool calls
     */
    it('shouldContinueAgentLoop returns false when no tool calls', () => {
        const responseWithoutTools = {
            choices: [{
                message: {
                    content: 'Hello, world!'
                }
            }]
        }
        
        expect(shouldContinueAgentLoop(responseWithoutTools, 'openrouter')).toBe(false)
        expect(shouldContinueAgentLoop(responseWithoutTools, 'groq')).toBe(false)
        expect(shouldContinueAgentLoop(responseWithoutTools, 'ollama')).toBe(false)
    })

    /**
     * Additional property: extractResponseContent extracts text correctly
     */
    it('extractResponseContent extracts text from OpenAI format', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 500 }),
                (content) => {
                    const response = {
                        choices: [{
                            message: {
                                content: content
                            }
                        }]
                    }
                    
                    expect(extractResponseContent(response, 'openrouter')).toBe(content)
                    expect(extractResponseContent(response, 'groq')).toBe(content)
                    expect(extractResponseContent(response, 'ollama')).toBe(content)
                }
            ),
            { numRuns: 100 }
        )
    })
})
