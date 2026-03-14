import { describe, expect, it } from 'vitest'

import { getToolByName } from '../definitions'
import { convertToOpenRouterFormat, formatToolResultsForOpenRouter } from './openrouter'

describe('convertToOpenRouterFormat', () => {
  it('preserves nested website smoke test schemas', () => {
    const smokeTool = getToolByName('run_website_smoke_test')
    expect(smokeTool).toBeDefined()

    const converted = convertToOpenRouterFormat([smokeTool!])[0]
    const steps = converted.function.parameters.properties.steps as {
      items?: { properties?: Record<string, unknown> }
    }
    const options = converted.function.parameters.properties.options as {
      properties?: Record<string, unknown>
    }

    expect(steps.items?.properties).toBeDefined()
    expect(options.properties?.viewport).toBeDefined()
    expect(options.properties?.trace).toBeDefined()
  })

  it('formats website smoke proposals as concise follow-up guidance', () => {
    const formatted = formatToolResultsForOpenRouter(
      [{ id: 'tool-1', name: 'propose_website_smoke_test' }],
      [
        {
          success: true,
          data: {
            summary: 'Proposal ready.',
            proposal: {
              url: 'http://localhost:3000/',
              goal: 'Test login flow',
              steps: [
                { type: 'goto', url: 'http://localhost:3000/' },
                {
                  type: 'fill',
                  target: { by: 'placeholder', value: 'Username' },
                  value: 'admin',
                },
              ],
              assertions: [{ type: 'urlContains', value: 'dashboard' }],
            },
          },
        },
      ]
    )

    expect(formatted[0]?.content).toContain('The full proposal card is already rendered in the UI')
    expect(formatted[0]?.content).toContain('Key target assumptions: placeholder:Username')
    expect(formatted[0]?.content).toContain('do not repeat the full plan')
  })
})
