import { beforeEach, describe, expect, it, vi } from 'vitest'

import { processToolCalls } from './toolManager'

const mocks = vi.hoisted(() => ({
  executeToolCalls: vi.fn(),
}))

vi.mock('./executor', () => ({
  executeToolCalls: mocks.executeToolCalls,
}))

function buildToolResponse(toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
            },
          })),
        },
      },
    ],
  }
}

describe('toolManager web search batch policy', () => {
  beforeEach(() => {
    mocks.executeToolCalls.mockReset()
  })

  it('skips duplicate and over-budget web_search calls without consuming budget', async () => {
    mocks.executeToolCalls.mockImplementation(async ([toolCall]) => [
      {
        toolCall,
        result: {
          success: true,
          data: { results: [{ title: String(toolCall.arguments.query) }] },
          metadata: { origin: 'builtin-main' as const },
        },
      },
    ])

    const response = buildToolResponse([
      { id: 'search-1', name: 'web_search', arguments: { query: 'zura ai architecture' } },
      { id: 'search-2', name: 'web_search', arguments: { query: 'Zura AI architecture' } },
      { id: 'search-3', name: 'web_search', arguments: { query: 'zura ai pricing' } },
    ])

    const processed = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      executionPolicy: {
        remainingWebSearchBudget: 1,
        priorWebSearchQueries: [],
      },
    })

    expect(mocks.executeToolCalls).toHaveBeenCalledTimes(1)
    expect(processed.executionSummary).toEqual({
      attemptedWebSearchCount: 3,
      executedWebSearchCount: 1,
      executedWebSearchQueries: ['zura ai architecture'],
    })
    expect(processed.results).toHaveLength(3)
    expect(processed.results[0]?.result.success).toBe(true)
    expect(processed.results[1]?.result.metadata).toMatchObject({
      origin: 'builtin-main',
      executionDisposition: 'skipped',
      skippedReason: 'duplicate-query',
    })
    expect(processed.results[2]?.result.metadata).toMatchObject({
      origin: 'builtin-main',
      executionDisposition: 'skipped',
      skippedReason: 'budget',
    })
  })

  it('keeps non-web tools unchanged while applying the web_search budget', async () => {
    mocks.executeToolCalls.mockImplementation(async ([toolCall]) => [
      {
        toolCall,
        result: {
          success: true,
          data: { ok: true },
          metadata: { origin: 'builtin-main' as const },
        },
      },
    ])

    const response = buildToolResponse([
      { id: 'search-1', name: 'web_search', arguments: { query: 'zura ai architecture' } },
      { id: 'other-1', name: 'mcp__filesystem__read_file', arguments: { path: '/tmp/demo.txt' } },
    ])

    const processed = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      availableTools: [
        {
          name: 'web_search',
          description: 'Search the web',
          parameters: {
            type: 'object',
            description: 'Search arguments',
            properties: {
              query: { type: 'string', description: 'Query' },
            },
            required: ['query'],
          },
          category: 'search',
          origin: 'builtin-main',
        },
        {
          name: 'mcp__filesystem__read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            description: 'Read arguments',
            properties: {
              path: { type: 'string', description: 'Path' },
            },
            required: ['path'],
          },
          category: 'mcp',
          origin: 'mcp',
          mcp: {
            serverId: 'filesystem',
            serverName: 'Filesystem',
            serverSlug: 'filesystem',
            namespacedName: 'mcp__filesystem__read_file',
            toolName: 'read_file',
            toolSlug: 'read_file',
            originalToolName: 'read_file',
          },
        },
      ],
      executionPolicy: {
        remainingWebSearchBudget: 1,
        priorWebSearchQueries: ['cursor pricing plans enterprise'],
      },
    })

    expect(mocks.executeToolCalls).toHaveBeenCalledTimes(2)
    expect(processed.executionSummary.executedWebSearchCount).toBe(1)
    expect(processed.results.map((result) => result.toolCall.name)).toEqual([
      'web_search',
      'mcp__filesystem__read_file',
    ])
  })

  it('rewrites inferred web_search years to a single current year unless the user asked for another year', async () => {
    mocks.executeToolCalls.mockImplementation(async ([toolCall]) => [
      {
        toolCall,
        result: {
          success: true,
          data: { results: [{ title: String(toolCall.arguments.query) }] },
          metadata: { origin: 'builtin-main' as const },
        },
      },
    ])

    const response = buildToolResponse([
      { id: 'search-1', name: 'web_search', arguments: { query: 'Claude code leak Anthropic 2024 2025' } },
    ])

    const processed = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      executionPolicy: {
        remainingWebSearchBudget: 1,
        priorWebSearchQueries: [],
        userContextText: 'give me info about the latest claude code leak',
      },
    })

    expect(mocks.executeToolCalls).toHaveBeenCalledWith([
      expect.objectContaining({
        arguments: expect.objectContaining({
          query: 'Claude code leak Anthropic 2026',
        }),
      }),
    ])
    expect(processed.results[0]?.toolCall.arguments.query).toBe('Claude code leak Anthropic 2026')
    expect(processed.executionSummary.executedWebSearchQueries).toEqual(['Claude code leak Anthropic 2026'])
  })
})
