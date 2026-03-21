import { describe, expect, it } from 'vitest'

import { getToolByName } from '../definitions'
import { convertToOpenRouterFormat, formatToolResultsForOpenRouter } from './openrouter'

describe('convertToOpenRouterFormat', () => {
  it('preserves nested research plan schemas', () => {
    const researchTool = getToolByName('research_plan')
    expect(researchTool).toBeDefined()

    const converted = convertToOpenRouterFormat([researchTool!])[0]
    const steps = converted.function.parameters.properties.steps as {
      items?: { properties?: Record<string, unknown> }
    }

    expect(steps.items?.properties).toBeDefined()
    expect(steps.items?.properties?.query).toBeDefined()
    expect(steps.items?.properties?.stepNumber).toBeDefined()
  })

  it('formats tool results as JSON payloads', () => {
    const formatted = formatToolResultsForOpenRouter(
      [{ id: 'tool-1', name: 'research_plan' }],
      [
        {
          success: true,
          data: {
            combinedResults: '# Research\n- Result A',
          },
        },
      ]
    )

    expect(formatted[0]?.content).toContain('combinedResults')
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
})
