// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

import type { ToolDescriptor } from './types'

export type ToolSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface ToolSchemaProperty {
  type: ToolSchemaType
  description: string
  enum?: string[]
  default?: unknown
  properties?: Record<string, ToolSchemaProperty>
  required?: string[]
  items?: ToolSchemaProperty
}

export type ToolDefinition = ToolDescriptor

/**
 * Active tools in ZuraAI
 * web_search is a main-process IPC tool.
 */
export const builtInToolDefinitions: ToolDefinition[] = [
  {
    name: 'web_search',
    description: `Search the internet for real-time information. Returns text results and images.

URL-aware behavior:
- If the query contains specific URL(s), this tool automatically routes to focused URL extraction (Tavily Extract).
- URL only (e.g. "https://example.com/page"): extract that page directly.
- Query + URL (e.g. "summarize pricing https://example.com/pricing"): extract and rerank content for the query.
- Natural-language query without URL: search with Tavily.

Query formulation best practices:
- Keep queries concise (under 400 chars). Use search keywords, not full sentences.
- Use keyword-focused phrasing: "OpenAI GPT-5 release date ${new Date().getFullYear()}" not "Can you tell me when OpenAI will release GPT-5?"
- Break complex topics into separate focused searches (overview, recent developments, specifics, verification).
- For current events or news, use topic="news" and time_range when relevant.`,
    parameters: {
      type: 'object',
      description: 'Arguments for the web search tool.',
      properties: {
        query: {
          type: 'string',
          description:
            `Search query. For URL tasks, include the URL directly (with optional instruction). Examples: "https://foo.com/article" or "summarize this https://foo.com/article". For general search, use concise keywords (e.g. "X market size ${new Date().getFullYear()}", "latest AI developments").`,
        },
        num_results: {
          type: 'number',
          description:
            'Number of results to return per call (default: 4, max: 4). Keep each search focused and lightweight. If coverage is still incomplete, call web_search again with a new angle rather than requesting a larger batch in one call.',
          default: 4,
        },
        search_depth: {
          type: 'string',
          description:
            'Search depth: "basic" for quick results, "advanced" for specific/detailed information (higher relevance)',
          enum: ['basic', 'advanced'],
          default: 'basic',
        },
        time_range: {
          type: 'string',
          description: 'Filter by recency. Use for time-sensitive queries (news, recent events, latest data).',
          enum: ['day', 'week', 'month', 'year'],
        },
        topic: {
          type: 'string',
          description:
            'Content type: "general" for broad searches, "news" for current events and real-time updates, "finance" for market/financial topics.',
          enum: ['general', 'news', 'finance'],
          default: 'general',
        },
      },
      required: ['query'],
    },
    category: 'search',
    origin: 'builtin-main',
  },
]

export const toolDefinitions = builtInToolDefinitions

export function getBuiltinToolDefinitions(): ToolDefinition[] {
  return builtInToolDefinitions
}

export function getAllToolDefinitions(runtimeTools: ToolDescriptor[] = []): ToolDescriptor[] {
  return [...builtInToolDefinitions, ...runtimeTools]
}

/**
 * Get tool definition by name
 */
export function getToolByName(
  name: string,
  runtimeTools: ToolDescriptor[] = []
): ToolDescriptor | undefined {
  return getAllToolDefinitions(runtimeTools).find((t) => t.name === name)
}
