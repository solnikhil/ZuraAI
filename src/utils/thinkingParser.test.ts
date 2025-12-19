import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { parseThinkingContent } from './thinkingParser'

// Arbitrary for generating random thinking content (non-empty, non-whitespace strings without thinking markers)
const safeContentArb = fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => 
        s.trim().length > 0 && // Must have non-whitespace content
        !s.toLowerCase().includes('thinking') && 
        !s.toLowerCase().includes('final answer') &&
        !s.includes('<think>') &&
        !s.includes('</think>') &&
        !s.includes('<redacted_reasoning>') &&
        !s.includes('</redacted_reasoning>')
    )

// Arbitrary for generating XML-style thinking content
const xmlThinkingContentArb = fc.record({
    thinking: safeContentArb,
    answer: safeContentArb,
    tagType: fc.constantFrom('think', 'redacted_reasoning')
}).map(({ thinking, answer, tagType }) => ({
    raw: `<${tagType}>${thinking}</${tagType}>\n\n${answer}`,
    expectedThinking: thinking.trim(),
    expectedAnswer: answer.trim()
}))

// Arbitrary for generating markdown-style thinking content
const markdownThinkingContentArb = fc.record({
    thinking: safeContentArb,
    answer: safeContentArb,
    thinkingFormat: fc.constantFrom('**Thinking...**', 'Thinking...', '**Thinking**', 'Thinking'),
    answerFormat: fc.constantFrom('**Final Answer:**', 'Final Answer:', '**Final Answer**', 'Final Answer')
}).map(({ thinking, answer, thinkingFormat, answerFormat }) => ({
    raw: `${thinkingFormat}\n${thinking}\n\n${answerFormat}\n${answer}`,
    expectedThinking: thinking.trim(),
    expectedAnswer: answer.trim()
}))

// Arbitrary for generating content with only Final Answer marker
const finalAnswerOnlyArb = fc.record({
    beforeAnswer: safeContentArb,
    answer: safeContentArb,
    answerFormat: fc.constantFrom('**Final Answer:**', 'Final Answer:', '**Final Answer**')
}).map(({ beforeAnswer, answer, answerFormat }) => ({
    raw: `${beforeAnswer}\n\n${answerFormat}\n${answer}`,
    expectedThinking: beforeAnswer.trim(),
    expectedAnswer: answer.trim()
}))

// Arbitrary for generating plain content without any thinking markers
const plainContentArb = safeContentArb.map(content => ({
    raw: content,
    expectedThinking: undefined,
    expectedAnswer: content
}))

describe('Thinking Content Parsing', () => {
    /**
     * Thinking content is parsed correctly
     * **Validates: Requirements 6.1**
     * 
     * For any AI response containing thinking markers (e.g., <think>, **Thinking...**),
     * the parseThinkingContent function SHALL extract the thinking portion separately from the answer.
     */
    describe('Property 8: Thinking content is parsed correctly', () => {
        it('XML-style tags are parsed correctly', () => {
            fc.assert(
                fc.property(
                    xmlThinkingContentArb,
                    ({ raw, expectedThinking, expectedAnswer }) => {
                        const result = parseThinkingContent(raw)
                        
                        // Thinking should be extracted
                        expect(result.thinking).toBeDefined()
                        expect(result.thinking).toBe(expectedThinking)
                        
                        // Answer should be extracted
                        expect(result.answer).toBe(expectedAnswer)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Markdown-style thinking markers are parsed correctly', () => {
            fc.assert(
                fc.property(
                    markdownThinkingContentArb,
                    ({ raw, expectedThinking, expectedAnswer }) => {
                        const result = parseThinkingContent(raw)
                        
                        // Thinking should be extracted
                        expect(result.thinking).toBeDefined()
                        // The thinking content should contain the expected thinking
                        expect(result.thinking).toContain(expectedThinking)
                        
                        // Answer should be extracted
                        expect(result.answer).toBe(expectedAnswer)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Final Answer only format is parsed correctly', () => {
            fc.assert(
                fc.property(
                    finalAnswerOnlyArb,
                    ({ raw, expectedThinking, expectedAnswer }) => {
                        const result = parseThinkingContent(raw)
                        
                        // Thinking should be extracted from content before Final Answer
                        expect(result.thinking).toBeDefined()
                        expect(result.thinking).toBe(expectedThinking)
                        
                        // Answer should be extracted
                        expect(result.answer).toBe(expectedAnswer)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('Plain content without markers returns undefined thinking', () => {
            fc.assert(
                fc.property(
                    plainContentArb,
                    ({ raw, expectedThinking, expectedAnswer }) => {
                        const result = parseThinkingContent(raw)
                        
                        // Thinking should be undefined for plain content
                        expect(result.thinking).toBe(expectedThinking)
                        
                        // Answer should be the original content
                        expect(result.answer).toBe(expectedAnswer)
                    }
                ),
                { numRuns: 100 }
            )
        })
    })

    /**
     * Additional property: Empty or whitespace-only input returns undefined thinking
     */
    it('Empty or whitespace input returns undefined thinking', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('', '   ', '\n', '\t', '\n\n'),
                (input) => {
                    const result = parseThinkingContent(input)
                    
                    expect(result.thinking).toBeUndefined()
                    expect(result.answer).toBe(input)
                }
            ),
            { numRuns: 10 }
        )
    })

    /**
     * Additional property: Parsing is idempotent for the answer portion
     * If we parse content and get an answer, parsing that answer again should return the same answer
     */
    it('Parsing answer portion is idempotent', () => {
        fc.assert(
            fc.property(
                fc.oneof(xmlThinkingContentArb, markdownThinkingContentArb, plainContentArb),
                ({ raw }) => {
                    const firstParse = parseThinkingContent(raw)
                    const secondParse = parseThinkingContent(firstParse.answer)
                    
                    // The answer from second parse should be the same as first parse answer
                    // (since the answer shouldn't contain thinking markers)
                    expect(secondParse.answer).toBe(firstParse.answer)
                }
            ),
            { numRuns: 100 }
        )
    })
})
