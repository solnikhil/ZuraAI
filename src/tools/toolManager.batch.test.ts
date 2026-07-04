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

  it('auto-runs read-only tools without manual approval', async () => {
    mocks.executeToolCalls.mockImplementation(async ([toolCall]) => [
      {
        toolCall,
        result: {
          success: true,
          data: { results: [] },
          metadata: { origin: 'builtin-main' as const },
        },
      },
    ])

    const response = buildToolResponse([
      { id: 'file-search-1', name: 'file_search', arguments: { query: 'desktop', root: 'C:\\Users\\Nikhil\\Desktop' } },
    ])
    const requestToolApproval = vi.fn(async () => false)
    const onToolApprovalStart = vi.fn()

    const result = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      requestToolApproval,
      onToolApprovalStart,
    })

    expect(requestToolApproval).not.toHaveBeenCalled()
    expect(onToolApprovalStart).not.toHaveBeenCalled()
    expect(mocks.executeToolCalls).toHaveBeenCalledTimes(1)
    expect(result.results[0]?.result.success).toBe(true)
  })

  it('blocks execution when manual approval for a mutating tool is rejected', async () => {
    const response = buildToolResponse([
      {
        id: 'shell-1',
        name: 'system_shell',
        arguments: { command: 'Remove-Item C:\\tmp\\demo.txt', description: 'delete demo file' },
      },
    ])

    const result = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      requestToolApproval: async () => false,
    })

    expect(mocks.executeToolCalls).not.toHaveBeenCalled()
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          success: false,
          error: 'Tool call rejected by user.',
        }),
      })
    )
  })

  it('executes five independent year-sliced web_search calls as one parallel batch and preserves order', async () => {
    const startedQueries: string[] = []
    const batchQueries: string[][] = []
    const resolvers: Array<() => void> = []
    mocks.executeToolCalls.mockImplementation(async ([toolCall]) => {
      startedQueries.push(String(toolCall.arguments.query))
      await new Promise<void>((resolve) => {
        resolvers.push(resolve)
      })
      return [
        {
          toolCall,
          result: {
            success: true,
            data: { query: toolCall.arguments.query, results: [{ title: String(toolCall.arguments.query) }] },
            metadata: { origin: 'builtin-main' as const },
          },
        },
      ]
    })

    const response = buildToolResponse([
      { id: 'search-2021', name: 'web_search', arguments: { query: 'AI market size 2021' } },
      { id: 'search-2022', name: 'web_search', arguments: { query: 'AI market size 2022' } },
      { id: 'search-2023', name: 'web_search', arguments: { query: 'AI market size 2023' } },
      { id: 'search-2024', name: 'web_search', arguments: { query: 'AI market size 2024' } },
      { id: 'search-2025', name: 'web_search', arguments: { query: 'AI market size 2025' } },
    ])

    const processedPromise = processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      executionPolicy: {
        remainingWebSearchBudget: 5,
        priorWebSearchQueries: [],
        userContextText: 'Search AI market size data across 5 years from 2021 through 2025',
      },
      onToolBatchStart: (toolCalls) => {
        batchQueries.push(toolCalls.map((toolCall) => String(toolCall.arguments.query)))
      },
    })

    await vi.waitFor(() => {
      expect(startedQueries).toHaveLength(5)
    })
    expect(batchQueries).toEqual([[
      'AI market size 2021',
      'AI market size 2022',
      'AI market size 2023',
      'AI market size 2024',
      'AI market size 2025',
    ]])
    expect(resolvers).toHaveLength(5)
    resolvers.forEach((resolve) => resolve())

    const processed = await processedPromise

    expect(mocks.executeToolCalls).toHaveBeenCalledTimes(5)
    expect(processed.executionSummary).toEqual({
      attemptedWebSearchCount: 5,
      executedWebSearchCount: 5,
      executedWebSearchQueries: [
        'AI market size 2021',
        'AI market size 2022',
        'AI market size 2023',
        'AI market size 2024',
        'AI market size 2025',
      ],
    })
    expect(processed.results.map((result) => result.toolCall.id)).toEqual([
      'search-2021',
      'search-2022',
      'search-2023',
      'search-2024',
      'search-2025',
    ])
    expect(processed.formattedResults.map((result) => result.tool_call_id)).toEqual([
      'search-2021',
      'search-2022',
      'search-2023',
      'search-2024',
      'search-2025',
    ])
  })

  it('executes repeated web_search calls until the budget is consumed', async () => {
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
        remainingWebSearchBudget: 2,
        priorWebSearchQueries: [],
      },
    })

    expect(mocks.executeToolCalls).toHaveBeenCalledTimes(2)
    expect(processed.executionSummary).toEqual({
      attemptedWebSearchCount: 3,
      executedWebSearchCount: 2,
      executedWebSearchQueries: ['zura ai architecture', 'Zura AI architecture'],
    })
    expect(processed.results).toHaveLength(3)
    expect(processed.results[0]?.result.success).toBe(true)
    expect(processed.results[1]?.result.success).toBe(true)
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

  it('enforces the overall tool call budget before execution', async () => {
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
      { id: 'search-1', name: 'web_search', arguments: { query: 'alpha' } },
      { id: 'search-2', name: 'web_search', arguments: { query: 'beta' } },
    ])

    const processed = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      executionPolicy: {
        remainingWebSearchBudget: 5,
        remainingToolCallBudget: 1,
      },
    })

    expect(mocks.executeToolCalls).toHaveBeenCalledTimes(1)
    expect(mocks.executeToolCalls.mock.calls[0]?.[0]).toHaveLength(1)
    expect(processed.results[0]?.result.success).toBe(true)
    expect(processed.results[1]?.result.success).toBe(false)
    expect(processed.results[1]?.result.error).toContain('Tool call budget')
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

    expect(mocks.executeToolCalls).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          arguments: expect.objectContaining({
            query: 'Claude code leak Anthropic 2026',
          }),
        }),
      ],
      { userContextText: 'give me info about the latest claude code leak' }
    )
    expect(processed.results[0]?.toolCall.arguments.query).toBe('Claude code leak Anthropic 2026')
    expect(processed.executionSummary.executedWebSearchQueries).toEqual(['Claude code leak Anthropic 2026'])
  })

  it('rejects whitespace-only required string arguments before execution', async () => {
    const response = buildToolResponse([
      { id: 'search-1', name: 'web_search', arguments: { query: '   ' } },
    ])

    const processed = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      executionPolicy: {
        remainingWebSearchBudget: 1,
        priorWebSearchQueries: [],
      },
    })

    expect(mocks.executeToolCalls).not.toHaveBeenCalled()
    expect(processed.executionSummary).toEqual({
      attemptedWebSearchCount: 0,
      executedWebSearchCount: 0,
      executedWebSearchQueries: [],
    })
    expect(processed.results[0]?.result.success).toBe(false)
    expect(processed.results[0]?.result.error).toContain("Please provide 'query'")
  })

  it('trims web_search queries before execution and tracking', async () => {
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
      { id: 'search-1', name: 'web_search', arguments: { query: '  zura ai architecture  ' } },
    ])

    const processed = await processToolCalls(response, {
      provider: 'openrouter',
      model: 'openai/gpt-4.1',
      executionPolicy: {
        remainingWebSearchBudget: 1,
        priorWebSearchQueries: [],
      },
    })

    expect(mocks.executeToolCalls).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          arguments: expect.objectContaining({
            query: 'zura ai architecture',
          }),
        }),
      ],
      { userContextText: undefined }
    )
    expect(processed.results[0]?.toolCall.arguments.query).toBe('zura ai architecture')
    expect(processed.executionSummary.executedWebSearchQueries).toEqual(['zura ai architecture'])
  })
})
