import { describe, expect, it } from 'vitest'

import { getToolByName } from '../definitions'
import { convertToOpenRouterFormat, formatToolResultsForOpenRouter } from './openrouter'
import { extractXmlToolCallsFromContent } from './openrouterToolCalls'

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
  })
})
