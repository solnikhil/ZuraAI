import type { ToolDescriptor } from './types'

type BuiltinMainToolManifestEntry = Omit<ToolDescriptor, 'name'> & {
  origin: 'builtin-main'
}

export const builtInMainToolManifest = {
  web_search: {
    description: `Search the internet for real-time information. Returns text results and images.

URL-aware behavior:
- If the query contains specific URL(s), this tool automatically routes to focused URL extraction (Tavily Extract).
- URL only (e.g. "https://example.com/page"): extract that page directly.
- Query + URL (e.g. "summarize pricing https://example.com/pricing"): extract and rerank content for the query.
- Natural-language query without URL: search with Tavily.

Query formulation best practices:
- Keep queries concise (under 400 chars). Use search keywords, not full sentences.
- Use keyword-focused phrasing: "OpenAI GPT-5 release date ${new Date().getFullYear()}" not "Can you tell me when OpenAI will release GPT-5?"
- If you need a year and the user did not specify one, use only ${new Date().getFullYear()}. Do not add older years or multi-year ranges unless the user explicitly asks for them.
- Break complex topics into separate focused searches (overview, recent developments, specifics, verification).
- For current events or news, use topic="news" and time_range when relevant.`,
    parameters: {
      type: 'object',
      description: 'Arguments for the web search tool.',
      properties: {
        query: {
          type: 'string',
          description:
            `Search query. For URL tasks, include the URL directly (with optional instruction). Examples: "https://foo.com/article" or "summarize this https://foo.com/article". For general search, use concise keywords (e.g. "X market size ${new Date().getFullYear()}", "latest AI developments"). If you include a year without user guidance, use only ${new Date().getFullYear()}.`,
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
            'Tavily search depth. Use "ultra-fast" for the lowest latency, "fast" for a quick balanced search, "basic" for standard coverage, and "advanced" for maximum depth and relevance. If omitted, the app applies the user-selected Search APIs default.',
          enum: ['ultra-fast', 'fast', 'basic', 'advanced'],
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
  code_execution: {
    description: `Execute JavaScript or Python code in a secure remote sandbox. Returns stdout, stderr, and exit code.

Sandbox constraints:
- No filesystem access. No network access. No persistent state between calls.
- Execution is time-limited (30 seconds) and memory-limited (512 MB).
- Output is limited to ~999 characters. Keep printed output concise.
- Each call requires explicit user approval before running.

When to use:
- Calculations the model cannot do reliably (large numbers, statistics, date math).
- Data transformations (parsing, formatting, aggregation).
- Algorithm verification or logic that benefits from actual execution.

Best practices:
- Use print()/console.log() to produce output — the return value of the last expression is not captured.
- Keep code concise and self-contained.
- Prefer Python for math and data tasks, JavaScript for string/JSON manipulation.`,
    parameters: {
      type: 'object',
      description: 'Arguments for the code execution tool.',
      properties: {
        code: {
          type: 'string',
          description: 'The source code to execute. Must use print() (Python) or console.log() (JavaScript) to produce output.',
        },
        language: {
          type: 'string',
          description: 'Programming language to use.',
          enum: ['javascript', 'python'],
        },
        description: {
          type: 'string',
          description: 'A brief one-line summary of what this code does (e.g. "Calculate factorial of 20").',
        },
      },
      required: ['code', 'language', 'description'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
} satisfies Record<string, BuiltinMainToolManifestEntry>

export type BuiltinMainToolName = keyof typeof builtInMainToolManifest

export const BUILTIN_MAIN_TOOL_NAMES = Object.keys(
  builtInMainToolManifest
) as BuiltinMainToolName[]

export const builtInMainToolDefinitions: ToolDescriptor[] = BUILTIN_MAIN_TOOL_NAMES.map((name) => ({
  name,
  ...builtInMainToolManifest[name],
}))

export function isBuiltinMainToolName(name: string): name is BuiltinMainToolName {
  return BUILTIN_MAIN_TOOL_NAMES.includes(name as BuiltinMainToolName)
}
