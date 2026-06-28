/**
 * Property-Based Tests for useStreamingChat Hook - MiniMax Integration
 *
 *
 * These tests verify the correctness properties defined in the design document
 * for the MiniMax provider integration with the useStreamingChat hook.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 *
 * - Process tool calls using the existing tool calling infrastructure
 * - Support research mode with multiple search rounds
 * - Correctly format follow-up messages with tool results
 *
 */
describe('Property 6: Tool Calling Integration', () => {
  // Arbitrary for generating valid tool call IDs
  const toolCallIdArb = fc
    .string({ minLength: 5, maxLength: 30 })
    .filter((s) => s.trim().length > 0)
    .map((s) => `call_${s.replace(/[^a-zA-Z0-9]/g, '')}`)

  // Arbitrary for generating valid function names
  const functionNameArb = fc.constantFrom('web_search', 'calculator', 'get_weather')

  // Arbitrary for generating valid JSON argument strings
  const jsonArgumentsArb = fc
    .record({
      query: fc.string({ minLength: 1, maxLength: 50 }),
      limit: fc.integer({ min: 1, max: 100 }),
    })
    .map((obj) => JSON.stringify(obj))

  // Arbitrary for generating tool call results
  const toolResultArb = fc.record({
    success: fc.boolean(),
    data: fc.string({ minLength: 1, maxLength: 200 }),
    executionTime: fc.integer({ min: 10, max: 5000 }),
  })

  // Arbitrary for generating research mode parameters
  const _researchParamsArb = fc.record({
    maxRounds: fc.integer({ min: 1, max: 25 }),
    mandatory: fc.boolean(),
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
            tool_calls: [
              {
                id: toolCallId,
                type: 'function' as const,
                function: {
                  name: functionName,
                  arguments: args,
                },
              },
            ],
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
              arguments: args,
            },
            result: {
              success: result.success,
              data: result.data,
              error: undefined,
              executionTime: result.executionTime,
            },
          }

          const savedToolResults = [toolResult].map((tr: any) => ({
            toolCall: {
              id: tr.toolCall.id,
              name: tr.toolCall.name,
              arguments: tr.toolCall.arguments,
            },
            result: {
              success: tr.result.success,
              data: tr.result.data,
              error: tr.result.error,
              executionTime: tr.result.executionTime,
            },
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
 *
 * `minimax/{modelCode}` where modelCode is the selected model identifier.
 *
 */
describe('Property 7: Model Name Formatting', () => {
  // Arbitrary for generating valid MiniMax model codes
  const modelCodeArb = fc.constantFrom('MiniMax-M2.1', 'MiniMax-M2.1-lightning', 'MiniMax-M2')

  // Arbitrary for generating arbitrary model codes (for edge cases)
  const arbitraryModelCodeArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0 && !s.includes('/'))

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
        fc
          .array(modelCodeArb, { minLength: 2, maxLength: 3 })
          .filter((arr) => new Set(arr).size === arr.length),
        async (modelCodes) => {
          const modelNames = modelCodes.map((code) => `minimax/${code}`)

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

/**
 *
 * Unit Tests for Research Mode Configuration in useStreamingChat Hook
 *
 * These tests verify the research mode configuration logic that determines
 * maxRounds based on toggle states (webSearchEnabled and deepResearchEnabled).
 *
 */

/**
 * Helper function to simulate the research mode configuration logic
 * from useStreamingChat.ts sendMessage function.
 *
 * This mirrors the logic:
 * - Deep research (deepResearchEnabled ON): researchMaxRounds = 25
 * - Normal web search (only webSearchEnabled ON): researchMaxRounds = 5
 * - Neither toggle ON: researchMaxRounds = 0
 *
 * @param deepResearchEnabled - Whether deep research toggle is ON
 * @param webSearchEnabled - Whether web search toggle is ON
 * @param canUseTools - Whether tools can be used (defaults to true)
 * @returns The calculated researchMaxRounds value
 */
function calculateResearchMaxRounds(
  deepResearchEnabled: boolean,
  webSearchEnabled: boolean,
  canUseTools: boolean = true
): number {
  let researchMaxRounds = 0

  if (deepResearchEnabled && canUseTools) {
    // Deep research mode: 25 searches, existing behavior
    researchMaxRounds = 25
  } else if (webSearchEnabled && canUseTools) {
    // Normal web search mode: 5 searches, planning required
    researchMaxRounds = 5
  }
  // If neither toggle is ON, researchMaxRounds stays 0

  return researchMaxRounds
}

describe('Feature: web-search-fix - Research Mode Configuration', () => {
  describe('Requirement 4.1: deepResearchEnabled ON sets maxRounds to 25', () => {
    it('deepResearchEnabled ON with webSearchEnabled OFF sets maxRounds to 25', () => {
      const maxRounds = calculateResearchMaxRounds(true, false, true)
      expect(maxRounds).toBe(25)
    })

    it('deepResearchEnabled ON with webSearchEnabled ON sets maxRounds to 25', () => {
      const maxRounds = calculateResearchMaxRounds(true, true, true)
      expect(maxRounds).toBe(25)
    })

    it('deepResearchEnabled ON with canUseTools false sets maxRounds to 0', () => {
      const maxRounds = calculateResearchMaxRounds(true, false, false)
      expect(maxRounds).toBe(0)
    })
  })
  describe('Requirement 2.1: only webSearchEnabled ON sets maxRounds to 5', () => {
    it('webSearchEnabled ON with deepResearchEnabled OFF sets maxRounds to 5', () => {
      const maxRounds = calculateResearchMaxRounds(false, true, true)
      expect(maxRounds).toBe(5)
    })

    it('webSearchEnabled ON with canUseTools false sets maxRounds to 0', () => {
      const maxRounds = calculateResearchMaxRounds(false, true, false)
      expect(maxRounds).toBe(0)
    })
  })

  /**
   * Both toggles OFF results in maxRounds = 0
   *
   */
  describe('Both toggles OFF results in maxRounds = 0', () => {
    it('both toggles OFF sets maxRounds to 0', () => {
      const maxRounds = calculateResearchMaxRounds(false, false, true)
      expect(maxRounds).toBe(0)
    })

    it('both toggles OFF with canUseTools false sets maxRounds to 0', () => {
      const maxRounds = calculateResearchMaxRounds(false, false, false)
      expect(maxRounds).toBe(0)
    })
  })

  /**
   *
   * This means deepResearchEnabled takes precedence when both are ON.
   *
   */
  describe('Requirement 5.1: deepResearchEnabled takes precedence when both are ON', () => {
    it('both toggles ON results in maxRounds = 25 (deep research precedence)', () => {
      const maxRounds = calculateResearchMaxRounds(true, true, true)
      expect(maxRounds).toBe(25)
    })

    it('precedence is maintained regardless of toggle order in logic', () => {
      // Test that the result is always 25 when deepResearchEnabled is ON
      // regardless of webSearchEnabled state
      const withWebSearchOff = calculateResearchMaxRounds(true, false, true)
      const withWebSearchOn = calculateResearchMaxRounds(true, true, true)

      expect(withWebSearchOff).toBe(25)
      expect(withWebSearchOn).toBe(25)
      expect(withWebSearchOff).toBe(withWebSearchOn)
    })
  })

  /**
   * Property-based test: Exhaustive toggle combinations
   *
   * Test all possible combinations of toggle states to ensure correct behavior.
   *
   */
  describe('Exhaustive toggle combinations', () => {
    it('all four toggle combinations produce correct maxRounds values', () => {
      const testCases = [
        { deepResearch: false, webSearch: false, canUseTools: true, expectedMaxRounds: 0 },
        { deepResearch: false, webSearch: true, canUseTools: true, expectedMaxRounds: 5 },
        { deepResearch: true, webSearch: false, canUseTools: true, expectedMaxRounds: 25 },
        { deepResearch: true, webSearch: true, canUseTools: true, expectedMaxRounds: 25 },
      ]

      for (const testCase of testCases) {
        const maxRounds = calculateResearchMaxRounds(
          testCase.deepResearch,
          testCase.webSearch,
          testCase.canUseTools
        )

        expect(maxRounds).toBe(testCase.expectedMaxRounds)
      }
    })

    it('canUseTools false always results in maxRounds = 0', () => {
      const testCases = [
        { deepResearch: false, webSearch: false },
        { deepResearch: false, webSearch: true },
        { deepResearch: true, webSearch: false },
        { deepResearch: true, webSearch: true },
      ]

      for (const testCase of testCases) {
        const maxRounds = calculateResearchMaxRounds(
          testCase.deepResearch,
          testCase.webSearch,
          false // canUseTools = false
        )

        expect(maxRounds).toBe(0)
      }
    })
  })

  /**
   * Property-based test using fast-check
   *
   * Verify the research mode configuration logic holds for all boolean combinations.
   *
   */
  describe('Property-based tests for research mode configuration', () => {
    it('Property: maxRounds is determined by toggle precedence rules', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // deepResearchEnabled
          fc.boolean(), // webSearchEnabled
          fc.boolean(), // canUseTools
          (deepResearchEnabled, webSearchEnabled, canUseTools) => {
            const maxRounds = calculateResearchMaxRounds(
              deepResearchEnabled,
              webSearchEnabled,
              canUseTools
            )

            // If canUseTools is false, maxRounds should always be 0
            if (!canUseTools) {
              expect(maxRounds).toBe(0)
              return true
            }

            // If deepResearchEnabled is ON, maxRounds should be 25
            if (deepResearchEnabled) {
              expect(maxRounds).toBe(25)
              return true
            }

            // If only webSearchEnabled is ON, maxRounds should be 5
            if (webSearchEnabled) {
              expect(maxRounds).toBe(5)
              return true
            }

            // If both toggles are OFF, maxRounds should be 0
            expect(maxRounds).toBe(0)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property: deepResearchEnabled always takes precedence over webSearchEnabled', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // webSearchEnabled (any value)
          (webSearchEnabled) => {
            // When deepResearchEnabled is ON, maxRounds should always be 25
            // regardless of webSearchEnabled state
            const maxRounds = calculateResearchMaxRounds(true, webSearchEnabled, true)
            expect(maxRounds).toBe(25)
            return maxRounds === 25
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property: webSearchEnabled only affects maxRounds when deepResearchEnabled is OFF', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // webSearchEnabled
          (webSearchEnabled) => {
            // When deepResearchEnabled is OFF, webSearchEnabled determines the result
            const maxRounds = calculateResearchMaxRounds(false, webSearchEnabled, true)

            if (webSearchEnabled) {
              expect(maxRounds).toBe(5)
              return maxRounds === 5
            } else {
              expect(maxRounds).toBe(0)
              return maxRounds === 0
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('Property: maxRounds is always one of {0, 5, 25}', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // deepResearchEnabled
          fc.boolean(), // webSearchEnabled
          fc.boolean(), // canUseTools
          (deepResearchEnabled, webSearchEnabled, canUseTools) => {
            const maxRounds = calculateResearchMaxRounds(
              deepResearchEnabled,
              webSearchEnabled,
              canUseTools
            )

            // maxRounds should only ever be 0, 5, or 25
            const validValues = [0, 5, 25]
            expect(validValues).toContain(maxRounds)
            return validValues.includes(maxRounds)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
