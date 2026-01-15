// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  enum?: string[]
  default?: string | number | boolean
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required: string[]
  }
  requiresApproval?: boolean
  category: 'search' | 'utility' | 'system'
}

/**
 * Active tools in Zura AI
 * NOTE: Per request, only "web_search" is enabled.
 */
export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the internet for real-time information. Returns text results and images.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up. Be specific and include relevant keywords.'
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 5, max: 10)',
          default: 5
        },
        search_depth: {
          type: 'string',
          description: 'Search depth: "basic" for quick results, "advanced" for more comprehensive research',
          enum: ['basic', 'advanced'],
          default: 'basic'
        }
      },
      required: ['query']
    },
    category: 'search'
  },
]

export function getAllToolDefinitions(): ToolDefinition[] {
  return toolDefinitions
}

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions().find(t => t.name === name)
}
