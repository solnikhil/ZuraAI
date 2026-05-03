import { describe, expect, it } from 'vitest'

import { getToolByName } from '../definitions'
import { convertToOpenRouterFormat, formatToolResultsForOpenRouter } from './openrouter'
import { extractInlineToolCallsFromContent, extractXmlToolCallsFromContent } from './openrouterToolCalls'

describe('convertToOpenRouterFormat', () => {
  it('preserves web search schemas during conversion', () => {
    const searchTool = getToolByName('web_search')
    expect(searchTool).toBeDefined()

    const converted = convertToOpenRouterFormat([searchTool!])[0]

    expect(converted.function.parameters.properties.query).toBeDefined()
    expect(converted.function.parameters.properties.search_depth).toBeDefined()
    expect(converted.function.parameters.properties.topic).toBeDefined()
  })

  it('formats tool results as JSON payloads', () => {
    const formatted = formatToolResultsForOpenRouter(
      [{ id: 'tool-1', name: 'web_search' }],
      [
        {
          success: true,
          data: {
            results: [{ title: 'Result A', url: 'https://example.com', snippet: 'Snippet' }],
          },
        },
      ]
    )

    expect(formatted[0]?.content).toContain('results')
    expect(formatted[0]?.content).toContain('Result A')
  })

  it('formats skipped web search results without exposing duplicate policy details', () => {
    const formatted = formatToolResultsForOpenRouter(
      [{ id: 'tool-1', name: 'web_search' }],
      [
        {
          success: false,
          error: 'Skipped duplicate web_search query in this response.',
          metadata: {
            origin: 'builtin-main',
            executionDisposition: 'skipped',
            skippedReason: 'duplicate-query',
          },
        },
      ]
    )

    expect(formatted[0]?.content).toContain('No additional web_search results')
    expect(formatted[0]?.content).not.toContain('duplicate')
    expect(formatted[0]?.content).not.toContain('Skipped')
  })

  it('preserves dynamic MCP JSON Schema fields during conversion', () => {
    const converted = convertToOpenRouterFormat([
      {
        name: 'mcp__docs__search_reference',
        description: 'Search a documentation index',
        origin: 'mcp',
        category: 'mcp',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'integer', description: 'Result cap', default: 5 },
          },
          required: ['query'],
          additionalProperties: false,
          oneOf: [
            {
              properties: {
                query: { type: 'string' },
              },
            },
          ],
        },
        mcp: {
          namespacedName: 'mcp__docs__search_reference',
          serverId: 'server-1',
          originalToolName: 'search_reference',
          serverName: 'Docs',
        },
      },
    ])[0]

    expect(converted.function.parameters.additionalProperties).toBe(false)
    expect(converted.function.parameters.oneOf).toEqual([
      {
        properties: {
          query: { type: 'string' },
        },
      },
    ])
    expect(converted.function.parameters.properties.limit).toEqual(
      expect.objectContaining({ type: 'integer', default: 5 })
    )
  })

  it('extracts XML-style fallback tool calls from assistant content', () => {
    const extracted = extractXmlToolCallsFromContent(
      'Before\n<tool_call>web_search <arg_key>query</arg_key><arg_value>global LGBTQ population statistics</arg_value></tool_call>\nAfter'
    )

    expect(extracted.toolCalls).toEqual([
      {
        id: 'content-tool-call-1',
        name: 'web_search',
        arguments: {
          query: 'global LGBTQ population statistics',
        },
      },
    ])
    expect(extracted.cleanedContent).toBe('Before\n\nAfter')
    expect(extracted.format).toBe('xml')
  })

  it('extracts XML-style tool calls that use tool_name and nested argument tags', () => {
    const extracted = extractXmlToolCallsFromContent(
      [
        'Before',
        '<tool_call>',
        '<tool_name>web_search</tool_name>',
        '<arguments>',
        '<query>latest openrouter tool calling issue</query>',
        '</arguments>',
        '</tool_call>',
        'After',
      ].join('\n')
    )

    expect(extracted.toolCalls).toEqual([
      {
        id: 'content-tool-call-1',
        name: 'web_search',
        arguments: {
          query: 'latest openrouter tool calling issue',
        },
      },
    ])
    expect(extracted.cleanedContent).toBe('Before\n\nAfter')
    expect(extracted.format).toBe('xml')
  })

  it('extracts DSML-style tool calls from assistant content', () => {
    const extracted = extractInlineToolCallsFromContent(
      [
        'Before',
        '<| | DSML | | tool_calls>',
        '<| | DSML | | invoke name="web_search">',
        '<| | DSML | | parameter name="query" string="true">JEE Main registration count 2026</| | DSML | | parameter>',
        '<| | DSML | | parameter name="num_results" string="false">5</| | DSML | | parameter>',
        '<| | DSML | | parameter name="search_depth" string="true">advanced</| | DSML | | parameter>',
        '</| | DSML | | invoke>',
        '</| | DSML | | tool_calls>',
        'After',
      ].join('\n')
    )

    expect(extracted.toolCalls).toEqual([
      {
        id: 'content-tool-call-1',
        name: 'web_search',
        arguments: {
          query: 'JEE Main registration count 2026',
          num_results: '5',
          search_depth: 'advanced',
        },
      },
    ])
    expect(extracted.cleanedContent).toBe('Before\n\nAfter')
    expect(extracted.format).toBe('dsml')
  })
})
