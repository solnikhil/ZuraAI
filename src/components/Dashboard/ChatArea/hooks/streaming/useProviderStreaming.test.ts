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
import { SEARCH_SYNTHESIS_FAILURE_MESSAGE } from './streamingUtils'

function streamFrom(events: Array<Record<string, unknown>>) {
  return async function* () {
    for (const event of events) {
      yield event
    }
  }
}

function buildWebSearchToolResult(id: string, query: string) {
  return {
    toolCall: {
      id,
      name: 'web_search',
      arguments: { query },
    },
    result: {
      success: true,
      data: { results: [{ title: query }] },
    },
  }
}

function buildExecutionSummary(...queries: string[]) {
  return {
    attemptedWebSearchCount: queries.length,
    executedWebSearchCount: queries.length,
    executedWebSearchQueries: queries,
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

  it('pushes fast plain-text responses into the isolated streaming state for non-thinking models', async () => {
    mocks.createProviderStreamClient.mockReturnValue({
      stream: streamFrom([
        { type: 'text-delta', delta: 'Hello' },
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

    await result.current.runProviderStream({
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'hello' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
    })

    expect(mocks.updateStreaming).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Hello',
        phase: 'answering',
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
          yield { type: 'usage', usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 } }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'text-delta', delta: 'Final answer from follow-up.' }
        yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 6, totalTokens: 9 } }
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
        executionSummary: buildExecutionSummary('zura'),
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
    expect(streamResult.usage).toEqual(
      expect.objectContaining({
        inputTokens: 3,
        outputTokens: 6,
        totalTokens: 9,
      })
    )
    expect(updateStreamingMessage).toHaveBeenLastCalledWith(
      'session-1',
      'message-1',
      expect.objectContaining({
        content: 'Final answer from follow-up.',
        usage: expect.objectContaining({
          inputTokens: 3,
          outputTokens: 6,
          totalTokens: 9,
        }),
        toolResults: [toolResult],
      })
    )
  })

  it('preserves OpenRouter reasoning_details on tool-call follow-up messages', async () => {
    let capturedResponse: any

    mocks.createProviderStreamClient.mockReturnValue({
      stream: streamFrom([
        {
          type: 'reasoning-delta',
          delta: 'Need a current source.',
        },
        {
          type: 'reasoning-details',
          details: [{
            id: 'reasoning-1',
            format: 'anthropic-claude-v1',
            type: 'reasoning.summary',
            summary: 'Need a current source.',
          }],
        },
        {
          type: 'tool-call-delta',
          delta: [{
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"zura ai latest docs"}' },
          }],
        },
        { type: 'finish', finishReason: 'tool_calls' },
      ]),
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockImplementation(async (response) => {
      capturedResponse = response
      return {
        hasTools: true,
        toolResults: [buildWebSearchToolResult('call_1', 'zura ai latest docs')],
        formattedResults: [],
        needsFollowUp: false,
        executionSummary: buildExecutionSummary('zura ai latest docs'),
      }
    })

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'anthropic/claude-sonnet-4.5',
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

    await result.current.runProviderStream({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4.5',
      sessionId: 'session-1',
      messageId: 'message-reasoning',
      messages: [{ role: 'user', content: 'latest docs?' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(handleToolCalls).toHaveBeenCalledTimes(1)
    expect(capturedResponse.choices[0].message).toEqual(
      expect.objectContaining({
        tool_calls: [
          expect.objectContaining({
            id: 'call_1',
          }),
        ],
        reasoning_details: [
          expect.objectContaining({
            id: 'reasoning-1',
            type: 'reasoning.summary',
          }),
        ],
      })
    )
  })

  it('preserves stripped pre-tool text as a thinking block for non-reasoning models', async () => {
    mocks.createProviderStreamClient.mockReturnValue({
      stream: streamFrom([
        { type: 'text-delta', delta: 'Let me check the docs.' },
        {
          type: 'tool-call-delta',
          delta: [{
            index: 0,
            id: 'call_prelude',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"kimi k2.5 turbo thinking model"}' },
          }],
        },
        { type: 'finish', finishReason: 'tool_calls' },
      ]),
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [
        buildWebSearchToolResult('call_prelude', 'kimi k2.5 turbo thinking model'),
      ],
      formattedResults: [],
      needsFollowUp: false,
      executionSummary: buildExecutionSummary('kimi k2.5 turbo thinking model'),
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
      messageId: 'message-prelude',
      messages: [{ role: 'user', content: 'is kimi k2.5 turbo thinking?' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamResult.thinkingBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'thinking',
          content: 'Let me check the docs.',
        }),
        expect.objectContaining({
          type: 'searching',
          query: 'kimi k2.5 turbo thinking model',
        }),
      ])
    )
    expect(streamResult.thinkingBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'searching',
          query: 'kimi k2.5 turbo thinking model',
        }),
      ])
    )
    expect(updateStreamingMessage).toHaveBeenCalledWith(
      'session-1',
      'message-prelude',
      expect.objectContaining({
        content: '',
        thinkingBlocks: expect.arrayContaining([
          expect.objectContaining({
            type: 'thinking',
            content: 'Let me check the docs.',
          }),
        ]),
      })
    )
  })

  it('recovers XML-style tool markup from content without leaking it into the final message', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    mocks.createProviderStreamClient.mockReturnValue({
      stream: streamFrom([
        {
          type: 'text-delta',
          delta:
            '<tool_call>web_search <arg_key>query</arg_key><arg_value>global gay population percentage statistics</arg_value></tool_call>',
        },
        { type: 'finish', finishReason: 'stop' },
      ]),
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [
        buildWebSearchToolResult('content-tool-call-1', 'global gay population percentage statistics'),
      ],
      formattedResults: [],
      needsFollowUp: false,
      executionSummary: buildExecutionSummary('global gay population percentage statistics'),
    })

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'openai/gpt-4.1',
          modelProvider: 'openrouter',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          openRouterDebug: true,
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
      messageId: 'message-xml',
      messages: [{ role: 'user', content: 'fact check this' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(handleToolCalls).toHaveBeenCalledTimes(1)
    expect(streamResult.content).toBe('')
    expect(streamResult.toolResults).toEqual([
      buildWebSearchToolResult('content-tool-call-1', 'global gay population percentage statistics'),
    ])
    expect(updateStreamingMessage).toHaveBeenLastCalledWith(
      'session-1',
      'message-xml',
      expect.objectContaining({
        content: '',
        toolResults: [
          buildWebSearchToolResult('content-tool-call-1', 'global gay population percentage statistics'),
        ],
      })
    )
    expect(debugSpy).toHaveBeenCalledWith(
      '[openrouter-debug]',
      'xml-tool-call-recovered',
      expect.objectContaining({
        toolNames: ['web_search'],
      })
    )
    debugSpy.mockRestore()
  })

  it('supports parallel web_search batches until the total executed cap is reached', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai overview"}' },
              },
              {
                index: 1,
                id: 'call_2',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai pricing"}' },
              },
              {
                index: 2,
                id: 'call_3',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai docs"}' },
              },
            ],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        if (invocation === 2) {
          yield {
            type: 'tool-call-delta',
            delta: [
              {
                index: 0,
                id: 'call_4',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai reviews"}' },
              },
              {
                index: 1,
                id: 'call_5',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai changelog"}' },
              },
              {
                index: 2,
                id: 'call_6',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai github"}' },
              },
              {
                index: 3,
                id: 'call_7',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai release notes"}' },
              },
              {
                index: 4,
                id: 'call_8',
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"zura ai roadmap"}' },
              },
            ],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'text-delta', delta: 'Final answer after eight searches.' }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi
      .fn()
      .mockResolvedValueOnce({
        hasTools: true,
        toolResults: [
          buildWebSearchToolResult('call_1', 'zura ai overview'),
          buildWebSearchToolResult('call_2', 'zura ai pricing'),
          buildWebSearchToolResult('call_3', 'zura ai docs'),
        ],
        formattedResults: [
          { role: 'tool', tool_call_id: 'call_1', content: 'overview' },
          { role: 'tool', tool_call_id: 'call_2', content: 'pricing' },
          { role: 'tool', tool_call_id: 'call_3', content: 'docs' },
        ],
        needsFollowUp: true,
        executionSummary: buildExecutionSummary(
          'zura ai overview',
          'zura ai pricing',
          'zura ai docs'
        ),
      })
      .mockResolvedValueOnce({
        hasTools: true,
        toolResults: [
          buildWebSearchToolResult('call_4', 'zura ai reviews'),
          buildWebSearchToolResult('call_5', 'zura ai changelog'),
          buildWebSearchToolResult('call_6', 'zura ai github'),
          buildWebSearchToolResult('call_7', 'zura ai release notes'),
          buildWebSearchToolResult('call_8', 'zura ai roadmap'),
        ],
        formattedResults: [
          { role: 'tool', tool_call_id: 'call_4', content: 'reviews' },
          { role: 'tool', tool_call_id: 'call_5', content: 'changelog' },
          { role: 'tool', tool_call_id: 'call_6', content: 'github' },
          { role: 'tool', tool_call_id: 'call_7', content: 'release notes' },
          { role: 'tool', tool_call_id: 'call_8', content: 'roadmap' },
        ],
        needsFollowUp: true,
        executionSummary: buildExecutionSummary(
          'zura ai reviews',
          'zura ai changelog',
          'zura ai github',
          'zura ai release notes',
          'zura ai roadmap'
        ),
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
      messages: [{ role: 'user', content: 'research zura ai' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(handleToolCalls).toHaveBeenCalledTimes(2)
    expect(handleToolCalls.mock.calls[0]?.[1]).toMatchObject({
      executionPolicy: { remainingWebSearchBudget: 8, priorWebSearchQueries: [] },
    })
    expect(handleToolCalls.mock.calls[1]?.[1]).toMatchObject({
      executionPolicy: {
        remainingWebSearchBudget: 5,
        priorWebSearchQueries: ['zura ai overview', 'zura ai pricing', 'zura ai docs'],
      },
    })
    expect(streamCalls).toHaveLength(3)
    expect(streamCalls.at(-1)?.toolChoice).toBe('none')
    expect(updateStreamingMessage).toHaveBeenCalledWith(
      'session-1',
      'message-1',
      expect.objectContaining({
        researchStatus: expect.objectContaining({
          currentSearches: ['zura ai overview', 'zura ai pricing', 'zura ai docs'],
        }),
      })
    )
    expect(streamResult.content).toBe('Final answer after eight searches.')
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

  it('forces final synthesis after the practical uncapped search budget is exhausted', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation <= 8) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: `call_${invocation}`,
              type: 'function',
              function: {
                name: 'web_search',
                arguments: JSON.stringify({ query: `research angle ${invocation}` }),
              },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'text-delta', delta: 'Final synthesized answer.' }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi
      .fn()
      .mockImplementation(async (_response, _options) => {
        const index = handleToolCalls.mock.calls.length
        const query = `research angle ${index}`
        const toolResult = buildWebSearchToolResult(`call_${index}`, query)
        return {
          hasTools: true,
          toolResults: [toolResult],
          formattedResults: [{ role: 'tool', tool_call_id: `call_${index}`, content: query }],
          needsFollowUp: true,
          executionSummary: buildExecutionSummary(query),
        }
      })

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'accounts/fireworks/routers/kimi-k2p5-turbo',
          modelProvider: 'fireworks',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          fireworksApiKey: 'fw-key',
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
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p5-turbo',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'research this deeply' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(handleToolCalls).toHaveBeenCalledTimes(8)
    expect(streamCalls).toHaveLength(9)
    expect(streamCalls.at(-1)?.toolChoice).toBe('none')
    expect(streamResult.content).toBe('Final synthesized answer.')
  })

  it('forces final synthesis when the model repeats the same search facet with minor rewording', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation <= 2) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: `dup_${invocation}`,
              type: 'function',
              function: {
                name: 'web_search',
                arguments: JSON.stringify({
                  query: invocation === 1 ? 'cursor pricing plans enterprise' : 'cursor team pricing costs',
                }),
              },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'text-delta', delta: 'Answer after deduped search loop.' }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi
      .fn()
      .mockResolvedValueOnce({
        hasTools: true,
        toolResults: [buildWebSearchToolResult('dup_1', 'cursor pricing plans enterprise')],
        formattedResults: [{ role: 'tool', tool_call_id: 'dup_1', content: 'first results' }],
        needsFollowUp: true,
        executionSummary: buildExecutionSummary('cursor pricing plans enterprise'),
      })
      .mockResolvedValueOnce({
        hasTools: true,
        toolResults: [buildWebSearchToolResult('dup_2', 'cursor team pricing costs')],
        formattedResults: [{ role: 'tool', tool_call_id: 'dup_2', content: 'duplicate results' }],
        needsFollowUp: true,
        executionSummary: buildExecutionSummary('cursor team pricing costs'),
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
      messages: [{ role: 'user', content: 'research cursor pricing' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(handleToolCalls).toHaveBeenCalledTimes(2)
    expect(streamCalls).toHaveLength(3)
    expect(streamCalls.at(-1)?.toolChoice).toBe('none')
    expect(streamResult.content).toBe('Answer after deduped search loop.')
  })

  it('drops partial assistant text from tool-call rounds instead of persisting truncated preludes', async () => {
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* () {
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'text-delta',
            delta: "I'll search for information about Cursor - I assume you're asking about the AI-powered code editor that's been",
          }
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_cursor',
              type: 'function',
              function: {
                name: 'web_search',
                arguments: '{"query":"Cursor code editor history"}',
              },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'text-delta', delta: 'Cursor is an AI-powered code editor created by Anysphere.' }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_cursor', 'Cursor code editor history')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_cursor', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('Cursor code editor history'),
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
      messages: [{ role: 'user', content: 'tell me about cursor history' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamResult.content).toBe('Cursor is an AI-powered code editor created by Anysphere.')
    expect(streamResult.content).not.toContain("I'll search for information")
  })

  it('forces a final synthesis pass when the provider ends the research loop without an answer', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"latest ipl result"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        if (invocation === 2) {
          yield { type: 'finish', finishReason: 'stop' }
          return
        }

        yield { type: 'text-delta', delta: 'RR beat CSK in the latest completed IPL result.' }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_1', 'latest ipl result')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('latest ipl result'),
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
      messages: [{ role: 'user', content: 'latest ipl result' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 0,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(3)
    expect(streamCalls.at(-1)?.toolChoice).toBe('none')
    expect(streamResult.content).toBe('RR beat CSK in the latest completed IPL result.')
  })

  it('retries final synthesis once when a search-only response still ends blank', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"anthropic capybara model"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        if (invocation === 2) {
          yield { type: 'finish', finishReason: 'stop' }
          return
        }

        yield {
          type: 'text-delta',
          delta: 'I could not verify any official Anthropic model named Capybara from the search results.',
        }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_1', 'anthropic capybara model')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('anthropic capybara model'),
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
      messages: [{ role: 'user', content: 'tell me about anthropic capybara' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(3)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamResult.content).toBe(
      'I could not verify any official Anthropic model named Capybara from the search results.'
    )
  })

  it('retries post-search synthesis when the provider falls back to a knowledge-cutoff answer', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"epstein files latest findings 2026"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        if (invocation === 2) {
          yield {
            type: 'text-delta',
            delta:
              'The latest findings as of my knowledge cutoff in 2023 are limited. Consult official documentation or recent peer-reviewed literature for newer updates.',
          }
          yield { type: 'finish', finishReason: 'stop' }
          return
        }

        yield {
          type: 'text-delta',
          delta:
            'The February 2026 release reported a large tranche of Epstein-related documents, but reporting emphasized that many names appeared only in peripheral records and not as evidence of wrongdoing.',
        }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_1', 'epstein files latest findings 2026')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('epstein files latest findings 2026'),
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
      messages: [{ role: 'user', content: 'Tell me about epstein files latest findings' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(3)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamResult.content).toBe(
      'The February 2026 release reported a large tranche of Epstein-related documents, but reporting emphasized that many names appeared only in peripheral records and not as evidence of wrongdoing.'
    )
    expect(streamResult.content).not.toContain('knowledge cutoff')
  })

  it('retries plain-text-only synthesis when no-tools follow-ups still return tool calls', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation <= 3) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: `call_${invocation}`,
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"kimi k2 turbo coding benchmarks"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield {
          type: 'text-delta',
          delta: 'Kimi K2 Turbo appears competitive on coding-oriented benchmarks, but the strongest conclusion depends on which benchmark suite and recency window you trust most.',
        }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_1', 'kimi k2 turbo coding benchmarks')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('kimi k2 turbo coding benchmarks'),
    })

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'accounts/fireworks/routers/kimi-k2p5-turbo',
          modelProvider: 'fireworks',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          fireworksApiKey: 'fw-key',
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
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p5-turbo',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'tell me about kimi k2 turbo coding benchmarks' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(4)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamCalls[3]?.toolChoice).toBe('none')
    expect(streamResult.content).toContain('Kimi K2 Turbo appears competitive')
    expect(streamResult.finishReason).toBe('stop')
  })

  it('shows a clean failure message when all synthesis attempts end blank', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"diddy 50 cent hit allegation"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [{
        toolCall: {
          id: 'call_1',
          name: 'web_search',
          arguments: { query: 'diddy 50 cent hit allegation' },
        },
        result: {
          success: true,
          data: {
            results: [
              {
                title: 'No verified evidence of a murder-for-hire plot',
                snippet: 'Coverage describes allegations and lawsuits, but no verified court finding tied Combs to a hit on 50 Cent.',
              },
            ],
          },
        },
      }],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('diddy 50 cent hit allegation'),
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
      messages: [{ role: 'user', content: 'did he put a hit on 50 cent' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(4)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamCalls[3]?.toolChoice).toBe('none')
    expect(streamResult.content).toBe(SEARCH_SYNTHESIS_FAILURE_MESSAGE)
    expect(streamResult.finishReason).toBeUndefined()
    expect(streamResult.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCall: expect.objectContaining({
            name: 'web_search',
          }),
        }),
      ])
    )
    expect(updateStreamingMessage).toHaveBeenCalledWith(
      'session-1',
      'message-1',
      expect.objectContaining({
        content: SEARCH_SYNTHESIS_FAILURE_MESSAGE,
      })
    )
  })

  it('shows the same clean failure message when every synthesis retry stays ungrounded', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation === 1) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"qwen 3.6 plus thinking mode"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }

        yield {
          type: 'text-delta',
          delta:
            'The latest findings as of my knowledge cutoff are limited. Consult official documentation for newer updates.',
        }
        yield { type: 'finish', finishReason: 'stop' }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_1', 'qwen 3.6 plus thinking mode')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('qwen 3.6 plus thinking mode'),
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
      messages: [{ role: 'user', content: 'is qwen 3.6 plus a thinking model' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(4)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamCalls[3]?.toolChoice).toBe('none')
    expect(streamResult.content).toBe(SEARCH_SYNTHESIS_FAILURE_MESSAGE)
    expect(streamResult.finishReason).toBeUndefined()
    expect(streamResult.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCall: expect.objectContaining({
            name: 'web_search',
          }),
        }),
      ])
    )
  })

  it('shows the same clean failure message when every synthesis retry returns tool calls', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation <= 4) {
          yield {
            type: 'tool-call-delta',
            delta: [{
              index: 0,
              id: `call_${invocation}`,
              type: 'function',
              function: { name: 'web_search', arguments: '{"query":"qwen plus model studio docs"}' },
            }],
          }
          yield { type: 'finish', finishReason: 'tool_calls' }
          return
        }
      },
    })

    const updateStreamingMessage = vi.fn()
    const handleToolCalls = vi.fn().mockResolvedValueOnce({
      hasTools: true,
      toolResults: [buildWebSearchToolResult('call_1', 'qwen plus model studio docs')],
      formattedResults: [{ role: 'tool', tool_call_id: 'call_1', content: 'search results' }],
      needsFollowUp: true,
      executionSummary: buildExecutionSummary('qwen plus model studio docs'),
    })

    const { result } = renderHook(() =>
      useProviderStreaming({
        settings: {
          aiModel: 'accounts/fireworks/routers/kimi-k2p5-turbo',
          modelProvider: 'fireworks',
          temperature: 0.4,
          maxTokens: 1024,
          streamResponses: true,
          fireworksApiKey: 'fw-key',
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
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p5-turbo',
      sessionId: 'session-1',
      messageId: 'message-1',
      messages: [{ role: 'user', content: 'is qwen plus a thinking model' }],
      startTime: performance.now() - 25,
      researchMaxRounds: 1,
      syncToStreamingContext: false,
      enableTools: true,
    })

    expect(streamCalls).toHaveLength(4)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamCalls[3]?.toolChoice).toBe('none')
    expect(streamResult.content).toBe(SEARCH_SYNTHESIS_FAILURE_MESSAGE)
    expect(streamResult.finishReason).toBeUndefined()
  })
})
