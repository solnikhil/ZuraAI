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

  it('forces final synthesis after the practical uncapped search budget is exhausted', async () => {
    const streamCalls: Array<{ toolChoice?: unknown }> = []
    let invocation = 0

    mocks.createProviderStreamClient.mockReturnValue({
      stream: async function* (request: { toolChoice?: unknown }) {
        streamCalls.push({ toolChoice: request.toolChoice })
        invocation += 1

        if (invocation <= 6) {
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

    expect(handleToolCalls).toHaveBeenCalledTimes(6)
    expect(streamCalls).toHaveLength(7)
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
      })
      .mockResolvedValueOnce({
        hasTools: true,
        toolResults: [buildWebSearchToolResult('dup_2', 'cursor team pricing costs')],
        formattedResults: [{ role: 'tool', tool_call_id: 'dup_2', content: 'duplicate results' }],
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

  it('falls back to a deterministic search summary when synthesis and recovery both end blank', async () => {
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

    expect(streamCalls).toHaveLength(3)
    expect(streamCalls[1]?.toolChoice).toBe('none')
    expect(streamCalls[2]?.toolChoice).toBe('none')
    expect(streamResult.content).toContain('provider did not return a final written synthesis')
    expect(streamResult.content).toContain('No verified evidence of a murder-for-hire plot')
  })
})
