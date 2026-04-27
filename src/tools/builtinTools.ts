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
  computer_screenshot: {
    description: 'Capture a screenshot of the desktop. Always call this first before performing any action to see the current screen state. Returns a base64 PNG image with screen dimensions and coordinate metadata used by follow-up actions.',
    parameters: {
      type: 'object',
      description: 'Arguments for taking a screenshot.',
      properties: {
        display_id: { type: 'string', description: 'Optional display ID for multi-monitor setups. Defaults to primary display.' },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_click: {
    description: 'Click at specific pixel coordinates from the latest computer_screenshot image. Use the screenshot dimensions exactly and click the center of the intended target. The app maps screenshot coordinates to the real desktop. Returns a post-action screenshot.',
    parameters: {
      type: 'object',
      description: 'Arguments for clicking.',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the latest screenshot image.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the latest screenshot image.' },
        button: { type: 'string', description: 'Mouse button.', enum: ['left', 'right', 'middle'], default: 'left' },
      },
      required: ['x', 'y'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_type: {
    description: 'Type text at the current cursor position. Click the target input field first before typing.',
    parameters: {
      type: 'object',
      description: 'Arguments for typing text.',
      properties: {
        text: { type: 'string', description: 'Text to type.' },
      },
      required: ['text'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_key: {
    description: 'Press a key or key combination. Use for keyboard shortcuts, Enter, Tab, Escape, arrow keys, etc. Format: "enter", "ctrl+c", "alt+tab", "shift+ctrl+s".',
    parameters: {
      type: 'object',
      description: 'Arguments for pressing keys.',
      properties: {
        key: { type: 'string', description: 'Key or combo string, e.g. "enter", "ctrl+c", "alt+tab".' },
      },
      required: ['key'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_scroll: {
    description: 'Scroll at specific coordinates from the latest computer_screenshot image. Move the cursor to the screenshot position first, then scroll.',
    parameters: {
      type: 'object',
      description: 'Arguments for scrolling.',
      properties: {
        x: { type: 'number', description: 'X coordinate from the latest screenshot image to scroll at.' },
        y: { type: 'number', description: 'Y coordinate from the latest screenshot image to scroll at.' },
        direction: { type: 'string', description: 'Scroll direction.', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', description: 'Scroll amount in clicks (default 3).', default: 3 },
      },
      required: ['x', 'y', 'direction'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_cursor_position: {
    description: 'Move the cursor to specific coordinates from the latest computer_screenshot image without clicking. Use to hover over elements.',
    parameters: {
      type: 'object',
      description: 'Arguments for moving the cursor.',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the latest screenshot image.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the latest screenshot image.' },
      },
      required: ['x', 'y'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_list_windows: {
    description: 'List all currently open application windows on the system. Returns window titles. Use this to find which apps are running before interacting with them.',
    parameters: {
      type: 'object',
      description: 'No arguments required.',
      properties: {},
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_launch_app: {
    description: 'Launch an application by name or path. On Windows use the app name (e.g. "notepad", "chrome", "code") or full path. On macOS use the app name (e.g. "Safari", "Terminal").',
    parameters: {
      type: 'object',
      description: 'Arguments for launching an app.',
      properties: {
        name: { type: 'string', description: 'Application name or executable path (e.g. "notepad", "chrome", "code", "C:\\\\Program Files\\\\app.exe").' },
      },
      required: ['name'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_find_app: {
    description: 'Search for installed applications by a fuzzy query. Returns matching app names and their launch paths. Use this when you are unsure of the exact app name — e.g. searching "discord canary" will find "Discord Canary" and its executable path. Then use computer_launch_app with the returned path.',
    parameters: {
      type: 'object',
      description: 'Arguments for finding an app.',
      properties: {
        query: { type: 'string', description: 'Fuzzy search query (e.g. "discord canary", "vs code", "firefox").' },
      },
      required: ['query'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_close_app: {
    description: 'Close an application window by its title. Use computer_list_windows first to find the exact window title.',
    parameters: {
      type: 'object',
      description: 'Arguments for closing an app.',
      properties: {
        title: { type: 'string', description: 'Window title (or substring) to close.' },
      },
      required: ['title'],
    },
    category: 'computer-use',
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
