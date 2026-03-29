import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateStreaming: vi.fn(),
  createProviderStreamClient: vi.fn(),
}))

vi.mock('../../../../../contexts/StreamingContext', () => ({
  useStreamingActions: () => ({
    updateStreaming: mocks.updateStreaming,
  }),
}))

vi.mock('./providerStreamClient', () => ({
  createProviderStreamClient: mocks.createProviderStreamClient,
}))

import { useProviderStreaming } from './useProviderStreaming'

function streamFrom(events: Array<Record<string, unknown>>) {
  return async function* () {
    for (const event of events) {
      yield event
    }
  }
}

describe('useProviderStreaming', () => {
  beforeEach(() => {
    mocks.updateStreaming.mockReset()
    mocks.createProviderStreamClient.mockReset()
  })

  it('accumulates plain text responses through the shared orchestrator', async () => {
    mocks.createProviderStreamClient.mockReturnValue({
      stream: streamFrom([
        { type: 'text-delta', delta: 'Hello' },
        { type: 'usage', usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } },
        { type: 'finish', finishReason: 'stop' },
      ]),
    })

    const updateStreamingMessage = vi.fn()
    const throttledUpdateStreamingMessage = vi.fn()

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'openai/gpt-4.1',
          modelProvider: 'openrouter',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          openRouterApiKey: 'or-key',
        },
        toolCalling: {
          canUseTools: false,
          getToolsForRequest: () => null,
          handleToolCalls: vi.fn(),
          getResearchContext: () => '',
        },
        updateStreamingMessage,
        flushThrottledUpdates: vi.fn(),
        throttledUpdateStreamingMessage,
      })
    )

    const streamResult = await result.current.runProviderStream({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'hello' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
    })

    expect(streamResult.content).toBe('Hello')
    expect(streamResult.model).toBe('openrouter/openai/gpt-4.1')
    expect(streamResult.usage).toEqual(
      expect.objectContaining({
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
      })
    )
    expect(updateStreamingMessage).toHaveBeenLastCalledWith(
      'session-1',
      'message-1',
      expect.objectContaining({
        content: 'Hello',
        model: 'openrouter/openai/gpt-4.1',
      })
    )
    expect(throttledUpdateStreamingMessage).not.toHaveBeenCalled()
  })

  it('reuses the same orchestrator for tool calls and follow-up answers', async () => {
    const streamCalls: Array<{ messages: Array<{ role: string }>; toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { messages: Array<{ role: string }>; toolChoice?: unknown }) {
        streamCalls.push({ messages: request.messages, toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"zura"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'text-delta', delta: 'Final answer from follow-up.' }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const toolResult = {
      toolCall: {
        id: 'call_1',
        name: 'web_search',
        arguments: { query: 'zura' },
      },
      result: {
        success: true,
        data: { results: [{ title: 'Zura' }] },
      },
    }
    const handleToolCalls = vi
      .fn()
      .mockResolvedValueOnce({
        hasTools: true,
        toolResults: [toolResult],
        formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'Search results' }],
        needsFollowUp: true,
      })

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'openai/gpt-4.1',
          modelProvider: 'openrouter',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          openRouterApiKey: 'or-key',
        },
        toolCalling: {
          canUseTools: true,
          getToolsForRequest: () => [{
            type: 'function',
            function: {
              name: 'web_search',
              description: 'Search the web',
              parameters: { type: 'object', properties: {} },
            },
          }],
          handleToolCalls,
          getResearchContext: () => 'Research context',
        },
        updateStreamingMessage,
        flushThrottledUpdates: vi.fn(),
        throttledUpdateStreamingMessage: vi.fn(),
      })
    )

    const streamResult = await result.current.runProviderStream({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'research zura' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 2,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(handleToolCalls).toHaveBeenCalledTimes(1)
    expect(streamCalls).toHaveLength(2)
    expect(streamCalls[1]?.messages.some((message) => message.role === 'tool')).toBe(true)
    expect(streamResult.content).toBe('Final answer from follow-up.')
    expect(streamResult.toolResults).toEqual([toolResult])
    expect(updateStreamingMessage).toHaveBeenLastCalledWith(
      'session-1',
      'message-1',
      expect.objectContaining({
        content: 'Final answer from follow-up.',
        toolResults: [toolResult],
      })
    )
  })

  it('applies citation cleanup through the shared native-search path', async () => {
    mocks.createProviderStreamClient.mockReturnValue({
      stream: streamFrom([
        { type: 'text-delta', delta: 'Answer [1]' },
        { type: 'citation', citations: ['https://example.com/source'] },
        { type: 'finish', finishReason: 'stop' },
      ]),
    })

    const updateStreamingMessage = vi.fn()

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'sonar',
          modelProvider: 'perplexity',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          perplexityApiKey: 'px-key',
        },
        toolCalling: {
          canUseTools: false,
          getToolsForRequest: () => null,
          handleToolCalls: vi.fn(),
          getResearchContext: () => '',
        },
        updateStreamingMessage,
        flushThrottledUpdates: vi.fn(),
        throttledUpdateStreamingMessage: vi.fn(),
      })
    )

    const streamResult = await result.current.runProviderStream({
      provider: 'perplexity',
      model: 'sonar',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'cite this' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
    })

    expect(streamResult.content).toBe('Answer [[1]](https://example.com/source)')
  })
})
