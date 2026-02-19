// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  enum?: string[]
  default?: string | number | boolean
  /** For type: 'array' - schema of array items */
  items?: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
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
 * web_search is the only main-process IPC tool.
 * research_plan is renderer-only and expands into web_search steps.
 */
export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'web_search',
    description: `Search the internet for real-time information. Returns text results and images.

Query formulation best practices:
- Keep queries concise (under 400 chars). Use search keywords, not full sentences.
- Use keyword-focused phrasing: "OpenAI GPT-5 release date ${new Date().getFullYear()}" not "Can you tell me when OpenAI will release GPT-5?"
- Break complex topics into separate focused searches (overview, recent developments, specifics, verification).
- For current events or news, use topic="news" and time_range when relevant.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: `Search query. Use concise keywords (e.g. "X market size ${new Date().getFullYear()}", "latest AI developments"). Avoid conversational phrasing like "Can you find..." or "I want to know...".`
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 10, max: 20). For broad discovery questions (e.g. "list all AI providers with free API", "what X offer Y"), use 15-20 to maximize coverage.',
          default: 10
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
  {
    name: 'research_plan',
    description: 'Submit your research plan before executing. Call this FIRST with 2-6 search steps. We will execute each step and return combined results.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Short topic summary of the research'
        },
        steps: {
          type: 'array',
          description: '2-6 search steps to execute in order',
          items: {
            type: 'object',
            properties: {
              stepNumber: { type: 'number', description: '1-based step index' },
              query: { type: 'string', description: 'Search query for this step' },
              rationale: { type: 'string', description: 'Optional reason for this search' }
            },
            required: ['stepNumber', 'query']
          }
        }
      },
      required: ['topic', 'steps']
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
