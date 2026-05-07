/**
 * Unit tests for computeTokenBreakdown
 * Tests the pure token breakdown logic extracted from TokenUsageIndicator
 */

import { describe, it, expect } from 'vitest'
import {
  computeTokenBreakdown,
  DEFAULT_MAX_CONTEXT,
  type ComputeTokenBreakdownParams,
} from './TokenUsageIndicator'

function makeParams(
  overrides: Partial<ComputeTokenBreakdownParams> = {}
): ComputeTokenBreakdownParams {
  return {
    messages: [],
    systemPrompt: '',
    currentInput: '',
    streamingContent: '',
    maxContext: undefined,
    ...overrides,
  }
}

describe('computeTokenBreakdown', () => {
  describe('empty / idle state', () => {
    it('returns all zeros when there is no input, no messages, no streaming', () => {
      const result = computeTokenBreakdown(makeParams())
      expect(result.systemPrompt).toBe(0)
      expect(result.chatMessages).toBe(0)
      expect(result.currentInput).toBe(0)
      expect(result.attachments).toBe(0)
      expect(result.imageAttachments).toBe(0)
      expect(result.streamingOutput).toBe(0)
      expect(result.responseReserve).toBe(0)
      expect(result.totalUsed).toBe(0)
      expect(result.totalWithReserve).toBe(0)
      expect(result.fillRatio).toBe(0)
      expect(result.reserveFillRatio).toBe(0)
      expect(result.status).toBe('normal')
    })

    it('uses DEFAULT_MAX_CONTEXT when maxContext is undefined', () => {
      const result = computeTokenBreakdown(makeParams())
      expect(result.maxContext).toBe(DEFAULT_MAX_CONTEXT)
      expect(result.remaining).toBe(DEFAULT_MAX_CONTEXT)
    })
  })

  describe('maxContext handling', () => {
    it('uses the provided maxContext when defined', () => {
      const result = computeTokenBreakdown(makeParams({ maxContext: 200000 }))
      expect(result.maxContext).toBe(200000)
      expect(result.remaining).toBe(200000)
    })

    it('falls back to DEFAULT_MAX_CONTEXT when maxContext is undefined', () => {
      const result = computeTokenBreakdown(makeParams({ maxContext: undefined }))
      expect(result.maxContext).toBe(DEFAULT_MAX_CONTEXT)
    })
  })

  describe('system prompt tokens', () => {
    it('counts system prompt tokens (text/4 + 4 role overhead)', () => {
      // "Hello" = 5 chars -> ceil(5/4) = 2 tokens + 4 role overhead = 6
      const result = computeTokenBreakdown(makeParams({ systemPrompt: 'Hello' }))
      expect(result.systemPrompt).toBe(6)
      expect(result.totalUsed).toBe(6)
    })

    it('returns 0 for empty system prompt', () => {
      const result = computeTokenBreakdown(makeParams({ systemPrompt: '' }))
      expect(result.systemPrompt).toBe(0)
    })
  })

  describe('chat messages tokens', () => {
    it('sums tokens for each message with role overhead', () => {
      const messages = [
        { role: 'user', content: 'Hello there' },       // ceil(11/4)=3 + 4 = 7
        { role: 'assistant', content: 'Hi!' },           // ceil(3/4)=1 + 4 = 5
      ]
      const result = computeTokenBreakdown(makeParams({ messages }))
      expect(result.chatMessages).toBe(12)
    })

    it('returns 0 for empty messages array', () => {
      const result = computeTokenBreakdown(makeParams({ messages: [] }))
      expect(result.chatMessages).toBe(0)
    })
  })

  describe('current input tokens', () => {
    it('estimates tokens for the current input text', () => {
      // "abcdefgh" = 8 chars -> ceil(8/4) = 2
      const result = computeTokenBreakdown(makeParams({ currentInput: 'abcdefgh' }))
      expect(result.currentInput).toBe(2)
    })

    it('returns 0 for empty input', () => {
      const result = computeTokenBreakdown(makeParams({ currentInput: '' }))
      expect(result.currentInput).toBe(0)
    })
  })

  describe('streaming output tokens', () => {
    it('estimates tokens for streaming content', () => {
      // 16 chars -> ceil(16/4) = 4
      const result = computeTokenBreakdown(
        makeParams({ streamingContent: '0123456789abcdef' })
      )
      expect(result.streamingOutput).toBe(4)
    })

    it('returns 0 for empty streaming content', () => {
      const result = computeTokenBreakdown(makeParams({ streamingContent: '' }))
      expect(result.streamingOutput).toBe(0)
    })
  })

  describe('attachment and response reserve tokens', () => {
    it('counts text attachment context separately from current input', () => {
      const result = computeTokenBreakdown(
        makeParams({
          currentInput: 'ask',
          attachmentText: 'a'.repeat(40),
        })
      )
      expect(result.currentInput).toBe(1)
      expect(result.attachments).toBe(10)
      expect(result.totalUsed).toBe(11)
    })

    it('counts image attachments with a bounded approximation', () => {
      const result = computeTokenBreakdown(
        makeParams({
          imageAttachments: [{ size: 0 }, { size: 4096 }],
        })
      )
      expect(result.imageAttachments).toBe(85 + 86)
      expect(result.totalUsed).toBe(171)
    })

    it('adds response reserve to totalWithReserve without inflating totalUsed', () => {
      const result = computeTokenBreakdown(
        makeParams({
          maxContext: 100,
          currentInput: 'abcd',
          responseReserve: 25,
        })
      )
      expect(result.totalUsed).toBe(1)
      expect(result.responseReserve).toBe(25)
      expect(result.totalWithReserve).toBe(26)
      expect(result.remaining).toBe(99)
      expect(result.remainingAfterReserve).toBe(74)
    })
  })

  describe('totalUsed', () => {
    it('sums all token categories', () => {
      const result = computeTokenBreakdown(
        makeParams({
          systemPrompt: 'sys',             // ceil(3/4)=1 + 4 = 5
          messages: [{ role: 'user', content: 'msg' }], // ceil(3/4)=1 + 4 = 5
          currentInput: 'type',            // ceil(4/4) = 1
          streamingContent: 'streaming',   // ceil(9/4) = 3
        })
      )
      expect(result.totalUsed).toBe(5 + 5 + 1 + 3)
    })
  })

  describe('remaining', () => {
    it('is maxContext minus totalUsed', () => {
      const result = computeTokenBreakdown(
        makeParams({
          maxContext: 1000,
          currentInput: 'abcd',  // 1 token
        })
      )
      expect(result.remaining).toBe(999)
    })

    it('is clamped to 0 when totalUsed exceeds maxContext', () => {
      // Make totalUsed > maxContext
      const longInput = 'a'.repeat(400)  // 100 tokens
      const result = computeTokenBreakdown(
        makeParams({
          maxContext: 10,
          currentInput: longInput,
        })
      )
      expect(result.remaining).toBe(0)
    })

    it('clamps remainingAfterReserve to 0 when reserve pushes over maxContext', () => {
      const result = computeTokenBreakdown(
        makeParams({
          maxContext: 10,
          currentInput: 'abcd',
          responseReserve: 20,
        })
      )
      expect(result.remaining).toBe(9)
      expect(result.remainingAfterReserve).toBe(0)
    })
  })

  describe('fillRatio', () => {
    it('is 0 when no tokens are used', () => {
      const result = computeTokenBreakdown(makeParams({ maxContext: 1000 }))
      expect(result.fillRatio).toBe(0)
    })

    it('is proportional to usage', () => {
      // 4 chars -> 1 token used, maxContext 100
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 100, currentInput: 'abcd' })
      )
      expect(result.fillRatio).toBeCloseTo(0.01, 5)
    })

    it('is clamped to 1 when usage exceeds maxContext', () => {
      const longInput = 'a'.repeat(400)  // 100 tokens
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 10, currentInput: longInput })
      )
      expect(result.fillRatio).toBe(1)
    })

    it('is 0 when maxContext is 0', () => {
      // Edge case: should not divide by zero
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 0, currentInput: 'test' })
      )
      expect(result.fillRatio).toBe(0)
    })
  })

  describe('status thresholds', () => {
    it('is normal below the caution threshold', () => {
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 100, currentInput: 'a'.repeat(200) })
      )
      expect(result.status).toBe('normal')
      expect(result.reserveUsagePercent).toBe(50)
    })

    it('is caution at the caution threshold', () => {
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 100, currentInput: 'a'.repeat(288) })
      )
      expect(result.status).toBe('caution')
    })

    it('is critical near the model limit', () => {
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 100, currentInput: 'a'.repeat(360) })
      )
      expect(result.status).toBe('critical')
    })

    it('is over-limit when response reserve exceeds the model window', () => {
      const result = computeTokenBreakdown(
        makeParams({ maxContext: 100, currentInput: 'a'.repeat(200), responseReserve: 50 })
      )
      expect(result.status).toBe('over-limit')
      expect(result.reserveFillRatio).toBe(1)
    })
  })

  describe('combined scenario', () => {
    it('correctly computes a realistic chat scenario', () => {
      const systemPrompt = 'You are a helpful assistant.'
      const result = computeTokenBreakdown({
        systemPrompt,                                            // ceil(28/4)=7 + 4 = 11
        messages: [
          { role: 'user', content: 'What is 2+2?' },            // ceil(12/4)=3 + 4 = 7
          { role: 'assistant', content: 'The answer is 4.' },   // ceil(16/4)=4 + 4 = 8
        ],
        currentInput: 'Thanks!',  // ceil(7/4) = 2
        streamingContent: '',
        responseReserve: 10,
        maxContext: 128000,
      })
      expect(result.systemPrompt).toBe(11)
      expect(result.chatMessages).toBe(15)
      expect(result.currentInput).toBe(2)
      expect(result.streamingOutput).toBe(0)
      expect(result.totalUsed).toBe(28)
      expect(result.totalWithReserve).toBe(38)
      expect(result.maxContext).toBe(128000)
      expect(result.remaining).toBe(128000 - 28)
      expect(result.remainingAfterReserve).toBe(128000 - 38)
      expect(result.fillRatio).toBeCloseTo(28 / 128000, 8)
      expect(result.reserveFillRatio).toBeCloseTo(38 / 128000, 8)
    })
  })
})
