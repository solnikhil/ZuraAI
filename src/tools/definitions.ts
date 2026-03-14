import {
  TARGET_REF_ORDER,
  WEBSITE_SMOKE_TEST_ASSERTION_LIMIT,
  WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS,
  WEBSITE_SMOKE_TEST_STEP_LIMIT,
} from '../testing/types'

// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// SECURITY: Only includes tools that are implemented and enabled.

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

export interface ToolDefinition {
  name: string
  description: string
  parameters: ToolSchemaProperty & {
    type: 'object'
    properties: Record<string, ToolSchemaProperty>
    required: string[]
  }
  requiresApproval?: boolean
  category: 'search' | 'utility' | 'system' | 'browser'
}

const targetRefSchema: ToolSchemaProperty = {
  type: 'object',
  description: 'Reference to a visible element target.',
  properties: {
    by: {
      type: 'string',
      description: 'Locator strategy. Prefer role, label, text, placeholder, testId, then css only if needed.',
      enum: [...TARGET_REF_ORDER],
    },
    value: {
      type: 'string',
      description:
        'Locator value. For role locators, prefer "role|accessible name" such as "button|Continue".',
    },
  },
  required: ['by', 'value'],
}

const smokeStepSchema: ToolSchemaProperty = {
  type: 'object',
  description: 'One smoke test step to execute in order.',
  properties: {
    type: {
      type: 'string',
      description: 'Step type.',
      enum: ['goto', 'click', 'fill', 'press', 'select', 'waitForText', 'waitForElement'],
    },
    url: {
      type: 'string',
      description: 'Optional URL override for goto. Defaults to the root url when omitted.',
    },
    target: targetRefSchema,
    value: {
      type: 'string',
      description: 'Input text or selected option value for fill/select steps.',
    },
    key: {
      type: 'string',
      description: 'Keyboard key to press, for example Enter or Tab.',
    },
    text: {
      type: 'string',
      description: 'Visible text to wait for.',
    },
  },
  required: ['type'],
}

const smokeAssertionSchema: ToolSchemaProperty = {
  type: 'object',
  description: 'One visible assertion to verify after the flow.',
  properties: {
    type: {
      type: 'string',
      description: 'Assertion type.',
      enum: [
        'textVisible',
        'elementVisible',
        'elementEnabled',
        'urlContains',
        'urlEquals',
        'titleContains',
      ],
    },
    text: {
      type: 'string',
      description: 'Visible text expected on the page.',
    },
    target: targetRefSchema,
    value: {
      type: 'string',
      description: 'Expected URL or title fragment/value.',
    },
  },
  required: ['type'],
}

/**
 * Active tools in ZuraAI
 * web_search and run_website_smoke_test are main-process IPC tools.
 * research_plan is renderer-only and expands into web_search steps.
 */
export const toolDefinitions: ToolDefinition[] = [
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
            'Number of results to return (default: 10, max: 20). For broad discovery questions (e.g. "list all AI providers with free API", "what X offer Y"), use 15-20 to maximize coverage.',
          default: 10,
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
  },
  {
    name: 'research_plan',
    description:
      'Submit your research plan before executing. Call this FIRST with 2-6 search steps. We will execute each step and return combined results.',
    parameters: {
      type: 'object',
      description: 'Arguments for the research planning tool.',
      properties: {
        topic: {
          type: 'string',
          description: 'Short topic summary of the research',
        },
        steps: {
          type: 'array',
          description: '2-6 search steps to execute in order',
          items: {
            type: 'object',
            description: 'A single research step.',
            properties: {
              stepNumber: { type: 'number', description: '1-based step index' },
              query: { type: 'string', description: 'Search query for this step' },
              rationale: { type: 'string', description: 'Optional reason for this search' },
            },
            required: ['stepNumber', 'query'],
          },
        },
      },
      required: ['topic', 'steps'],
    },
    category: 'search',
  },
  {
    name: 'propose_website_smoke_test',
    description:
      'Draft a website smoke test spec for user approval. Use this first when the user asks you to test a workflow. Do not run the browser yet; propose the URL, ordered steps, and visible assertions the test will use.',
    parameters: {
      type: 'object',
      description: 'Arguments for a website smoke test proposal that must be approved before execution.',
      properties: {
        url: {
          type: 'string',
          description: 'Starting website URL. Must be http or https.',
        },
        goal: {
          type: 'string',
          description: 'Short human-readable goal for the smoke test.',
        },
        steps: {
          type: 'array',
          description: `Ordered smoke-test steps to propose. Keep it short, with at most ${WEBSITE_SMOKE_TEST_STEP_LIMIT} steps.`,
          items: smokeStepSchema,
        },
        assertions: {
          type: 'array',
          description: `Visible assertions to verify after the flow. Keep it short, with at most ${WEBSITE_SMOKE_TEST_ASSERTION_LIMIT} assertions.`,
          items: smokeAssertionSchema,
        },
        options: {
          type: 'object',
          description: 'Optional execution settings to apply if the user approves the proposal.',
          properties: {
            headless: {
              type: 'boolean',
              description: 'Whether to run the browser headless. Defaults to true.',
              default: true,
            },
            timeoutMs: {
              type: 'number',
              description: `Per-step timeout in milliseconds. Defaults to ${WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS}.`,
              default: WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS,
            },
            viewport: {
              type: 'object',
              description: 'Optional viewport size for the browser page.',
              properties: {
                width: { type: 'number', description: 'Viewport width in pixels.' },
                height: { type: 'number', description: 'Viewport height in pixels.' },
              },
              required: ['width', 'height'],
            },
            screenshots: {
              type: 'string',
              description: 'Screenshot capture mode.',
              enum: ['final-only', 'each-step', 'off'],
              default: 'final-only',
            },
            trace: {
              type: 'string',
              description: 'Trace capture mode.',
              enum: ['on-failure', 'always', 'off'],
              default: 'on-failure',
            },
          },
          required: [],
        },
      },
      required: ['url', 'goal', 'steps'],
    },
    category: 'browser',
  },
  {
    name: 'run_website_smoke_test',
    description:
      'Run an already-approved website smoke test in a real browser. Use this only after the user has approved the proposed URL, ordered steps, and visible assertions. It captures screenshots, trace artifacts, and a plain-English result summary.',
    parameters: {
      type: 'object',
      description: 'Arguments for the website smoke test runner.',
      properties: {
        url: {
          type: 'string',
          description: 'Starting website URL. Must be http or https.',
        },
        goal: {
          type: 'string',
          description: 'Short human-readable goal for the smoke test.',
        },
        steps: {
          type: 'array',
          description: `Ordered smoke-test steps to execute. Keep it short, with at most ${WEBSITE_SMOKE_TEST_STEP_LIMIT} steps.`,
          items: smokeStepSchema,
        },
        assertions: {
          type: 'array',
          description: `Visible assertions to verify after the flow. Keep it short, with at most ${WEBSITE_SMOKE_TEST_ASSERTION_LIMIT} assertions.`,
          items: smokeAssertionSchema,
        },
        options: {
          type: 'object',
          description: 'Optional execution settings for the smoke test runner.',
          properties: {
            headless: {
              type: 'boolean',
              description: 'Whether to run the browser headless. Defaults to true.',
              default: true,
            },
            timeoutMs: {
              type: 'number',
              description: `Per-step timeout in milliseconds. Defaults to ${WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS}.`,
              default: WEBSITE_SMOKE_TEST_DEFAULT_TIMEOUT_MS,
            },
            viewport: {
              type: 'object',
              description: 'Optional viewport size for the browser page.',
              properties: {
                width: { type: 'number', description: 'Viewport width in pixels.' },
                height: { type: 'number', description: 'Viewport height in pixels.' },
              },
              required: ['width', 'height'],
            },
            screenshots: {
              type: 'string',
              description: 'Screenshot capture mode.',
              enum: ['final-only', 'each-step', 'off'],
              default: 'final-only',
            },
            trace: {
              type: 'string',
              description: 'Trace capture mode.',
              enum: ['on-failure', 'always', 'off'],
              default: 'on-failure',
            },
          },
          required: [],
        },
      },
      required: ['url', 'goal', 'steps'],
    },
    category: 'browser',
  },
]

export function getAllToolDefinitions(): ToolDefinition[] {
  return toolDefinitions
}

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions().find((t) => t.name === name)
}
