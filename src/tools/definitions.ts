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
    description: `Search the internet for real-time information. Returns text results and images.

Query formulation best practices:
- Keep queries concise (under 400 chars). Use search keywords, not full sentences.
- Use keyword-focused phrasing: "OpenAI GPT-5 release date 2025" not "Can you tell me when OpenAI will release GPT-5?"
- Break complex topics into separate focused searches (overview, recent developments, specifics, verification).
- For current events or news, use topic="news" and time_range when relevant.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Use concise keywords (e.g. "X market size 2025", "latest AI developments"). Avoid conversational phrasing like "Can you find..." or "I want to know...".'
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 5, max: 10)',
          default: 5
        },
        search_depth: {
          type: 'string',
          description: 'Search depth: "basic" for quick results, "advanced" for specific/detailed information (higher relevance)',
          enum: ['basic', 'advanced'],
          default: 'basic'
        },
        time_range: {
          type: 'string',
          description: 'Filter by recency. Use for time-sensitive queries (news, recent events, latest data).',
          enum: ['day', 'week', 'month', 'year']
        },
        topic: {
          type: 'string',
          description: 'Content type: "general" for broad searches, "news" for current events and real-time updates.',
          enum: ['general', 'news'],
          default: 'general'
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
