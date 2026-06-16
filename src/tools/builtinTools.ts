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
- Search when information is current, changing, outside reliable model knowledge, or explicitly requested by the user. Do not search for stable facts, math, coding concepts, creative writing, greetings, or analysis of content already provided.
- If you need a year and the user did not specify one or ask for a relative range, use only ${new Date().getFullYear()}. Do not add older years or multi-year ranges unless the user explicitly asks for them.
- For technical documentation, include the exact product/library, feature/API/error, and version when known.
- For verification, search unique entities and claim-specific terms rather than a broad paraphrase.
- When the user explicitly asks for independent slices such as years, regions, providers, products, competitors, or categories, emit multiple focused web_search calls in the same assistant turn so the app can execute them in parallel. Example: for "data across 5 years", call web_search once per year in one batch.
- Break complex topics into separate focused searches (overview, recent developments, specifics, verification), batching the independent searches together when those facets are clear up front.
- For current events or news, use topic="news" and time_range when relevant.
- Use "ultra-fast" or "fast" for latency-sensitive lookups, "basic" for normal grounding, and "advanced" only when the user needs deeper research or the first results are too weak.
- Stop once the returned evidence is sufficient. Additional searches should target a specific missing fact, conflict, official source, or independent facet.`,
    parameters: {
      type: 'object',
      description: 'Arguments for the web search tool.',
      properties: {
        query: {
          type: 'string',
          description:
            `Search query. For URL tasks, include the URL directly (with optional instruction). Examples: "https://foo.com/article" or "summarize this https://foo.com/article". For general search, use concise keywords (e.g. "X market size ${new Date().getFullYear()}", "latest AI developments"). If you include a year without user guidance, use only ${new Date().getFullYear()}. If the user asks for a relative range such as "past 5 years", emit one focused query per year in the same turn. For verification, include the claim's unique names, terms, source type, and timeframe.`,
        },
        num_results: {
          type: 'number',
          description:
            'Number of results to return per call (default: 4, max: 4). Keep each search focused and lightweight. For multiple independent facets, emit multiple web_search calls in the same turn rather than requesting more results in one call.',
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
    description: 'Capture visual context for Computer Use. Prefer targeting a specific app/window with window_id, window_title, or app_name when the task is about one app; use a full display capture only for desktop-wide or visual layout tasks. Returns a base64 PNG image with dimensions and coordinate metadata used by follow-up actions.',
    parameters: {
      type: 'object',
      description: 'Arguments for capturing a display or a specific app/window.',
      properties: {
        display_id: { type: 'string', description: 'Optional display ID for multi-monitor setups. Defaults to primary display.' },
        window_id: { type: 'string', description: 'Optional window source id from computer_list_windows, such as window:123:0.' },
        window_title: { type: 'string', description: 'Optional case-insensitive substring of the target window title.' },
        app_name: { type: 'string', description: 'Optional case-insensitive app/title substring to target a visible app window.' },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_click: {
    description: 'Click at specific pixel coordinates from the latest screen image returned by computer_screenshot. Requires a prior computer_screenshot in the current action sequence; computer_list_windows is not enough. Use the screen dimensions exactly and click the center of the intended target. The app maps screen coordinates to the real desktop. Returns an updated screen image.',
    parameters: {
      type: 'object',
      description: 'Arguments for clicking.',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the latest screen image.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the latest screen image.' },
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
    description: 'Scroll at specific coordinates from the latest screen image returned by computer_screenshot. Requires a prior computer_screenshot in the current action sequence; computer_list_windows is not enough. Move the cursor to the screen position first, then scroll.',
    parameters: {
      type: 'object',
      description: 'Arguments for scrolling.',
      properties: {
        x: { type: 'number', description: 'X coordinate from the latest screen image to scroll at.' },
        y: { type: 'number', description: 'Y coordinate from the latest screen image to scroll at.' },
        direction: { type: 'string', description: 'Scroll direction.', enum: ['up', 'down', 'left', 'right'] },
        amount: { type: 'number', description: 'Scroll amount in clicks (default 3).', default: 3 },
      },
      required: ['x', 'y', 'direction'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_cursor_position: {
    description: 'Move the cursor to specific coordinates from the latest screen image returned by computer_screenshot without clicking. Requires a prior computer_screenshot in the current action sequence; computer_list_windows is not enough. Use to hover over elements.',
    parameters: {
      type: 'object',
      description: 'Arguments for moving the cursor.',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the latest screen image.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the latest screen image.' },
      },
      required: ['x', 'y'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_list_windows: {
    description: 'List currently open application windows. Returns window titles and source ids that can be passed to computer_screenshot.window_id for app-specific visual capture. This is metadata, not visual screen context, and does not provide valid coordinates by itself.',
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
  windows_uia_snapshot: {
    description: 'Inspect Windows desktop app controls through Microsoft UI Automation. Prefer this before computer_screenshot/click/type for native Windows apps because it returns controls, supported patterns, and stable elementRef values.',
    parameters: {
      type: 'object',
      description: 'Optional window filters for UI Automation inspection.',
      properties: {
        windowTitle: { type: 'string', description: 'Optional substring of the target window title.' },
        processName: { type: 'string', description: 'Optional process name filter, such as notepad or explorer.' },
        hwnd: { type: 'number', description: 'Optional native window handle.' },
      },
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  windows_uia_invoke: {
    description: 'Invoke a Windows UI Automation element that supports InvokePattern. Prefer this over computer_click for buttons and menu items. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for invoking a UIA control.',
      properties: {
        elementRef: { type: 'string', description: 'elementRef returned by windows_uia_snapshot.' },
      },
      required: ['elementRef'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  windows_uia_set_value: {
    description: 'Set text/value on a Windows UI Automation element that supports ValuePattern. Prefer this over computer_type for supported text fields. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for setting a UIA value.',
      properties: {
        elementRef: { type: 'string', description: 'elementRef returned by windows_uia_snapshot.' },
        value: { type: 'string', description: 'Text/value to set.' },
      },
      required: ['elementRef', 'value'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  windows_uia_select: {
    description: 'Select or toggle a Windows UI Automation element that supports SelectionItemPattern or TogglePattern. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for selecting/toggling a UIA control.',
      properties: {
        elementRef: { type: 'string', description: 'elementRef returned by windows_uia_snapshot.' },
      },
      required: ['elementRef'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  system_shell: {
    description: 'Run a bounded PowerShell command for system inspection or automation. Use native file/app/window tools first when possible. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for running PowerShell.',
      properties: {
        command: { type: 'string', description: 'PowerShell command to execute.' },
        cwd: { type: 'string', description: 'Optional working directory.' },
        timeoutMs: { type: 'number', description: 'Optional timeout in milliseconds, capped at 60000.' },
        description: { type: 'string', description: 'One-line explanation of why this command is needed.' },
      },
      required: ['command', 'description'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  file_read: {
    description: 'Read a local text file directly without using the desktop UI.',
    parameters: {
      type: 'object',
      description: 'Arguments for reading a file.',
      properties: {
        path: { type: 'string', description: 'File path to read.' },
      },
      required: ['path'],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  file_write: {
    description: 'Write a local text file directly without using the desktop UI. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for writing a file.',
      properties: {
        path: { type: 'string', description: 'File path to write.' },
        content: { type: 'string', description: 'Text content to write.' },
      },
      required: ['path', 'content'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  file_search: {
    description: 'Search local filenames under a root path without opening Explorer.',
    parameters: {
      type: 'object',
      description: 'Arguments for filename search.',
      properties: {
        query: { type: 'string', description: 'Case-insensitive filename substring.' },
        root: { type: 'string', description: 'Optional root directory. Defaults to app working directory.' },
      },
      required: ['query'],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  file_move: {
    description: 'Move or rename a file/directory directly. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for moving a file or directory.',
      properties: {
        source: { type: 'string', description: 'Source path.' },
        destination: { type: 'string', description: 'Destination path.' },
      },
      required: ['source', 'destination'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  app_find: {
    description: 'Find installed Windows apps by Start Menu shortcut name. Prefer this before app_launch.',
    parameters: {
      type: 'object',
      description: 'Arguments for finding an app.',
      properties: {
        query: { type: 'string', description: 'App name substring.' },
      },
      required: ['query'],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  app_launch: {
    description: 'Launch a Windows app by name or path using native app launching. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for launching an app.',
      properties: {
        nameOrPath: { type: 'string', description: 'App executable/name or .lnk path.' },
      },
      required: ['nameOrPath'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  app_list: {
    description: 'List installed Start Menu apps without opening the Start Menu.',
    parameters: {
      type: 'object',
      description: 'No arguments required.',
      properties: {},
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  app_install: {
    description: 'Install a Windows package with winget. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for winget install.',
      properties: {
        packageId: { type: 'string', description: 'winget package id.' },
      },
      required: ['packageId'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  app_uninstall: {
    description: 'Uninstall a Windows package with winget. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for winget uninstall.',
      properties: {
        packageId: { type: 'string', description: 'winget package id.' },
      },
      required: ['packageId'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  scheduled_task_create: {
    description: 'Create a local reminder or web lookout. Use this when the user asks to remind them, check something later, watch a page, monitor a URL, or set up a recurring lookout. After creating, tell the user it is visible in the Reminders sidebar.',
    parameters: {
      type: 'object',
      description: 'Arguments for creating a scheduled task.',
      properties: {
        type: { type: 'string', description: 'Task type.', enum: ['reminder', 'web_lookout'] },
        title: { type: 'string', description: 'Short user-visible title.' },
        reminderText: { type: 'string', description: 'Reminder/checklist text. Required for reminder tasks.' },
        urls: { type: 'array', description: 'http/https URLs to watch. Public URLs and local loopback URLs are supported. Required for web_lookout tasks.', items: { type: 'string' } },
        instructions: { type: 'string', description: 'What matters for this reminder/lookout and what to ignore.' },
        intervalPreset: { type: 'string', description: 'Repeat interval after the first run. Optional; defaults to 30m when omitted.', enum: ['30m', '1h', '6h', '12h', 'daily', 'weekly'] },
        dueAt: { type: 'number', description: 'First/next run time as Unix epoch milliseconds. Required for requests like "in 1 minute", "tomorrow at 9", or any concrete due time.' },
        enabled: { type: 'boolean', description: 'Whether the task should start enabled.', default: true },
      },
      required: ['type', 'title'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  scheduled_task_update: {
    description: 'Update or pause/resume an existing local reminder/lookout by id.',
    parameters: {
      type: 'object',
      description: 'Arguments for updating a scheduled task.',
      properties: {
        id: { type: 'string', description: 'Scheduled task id.' },
        title: { type: 'string', description: 'New title.' },
        reminderText: { type: 'string', description: 'New reminder text.' },
        urls: { type: 'array', description: 'Replacement URLs for a web lookout.', items: { type: 'string' } },
        instructions: { type: 'string', description: 'New instructions.' },
        intervalPreset: { type: 'string', description: 'New interval.', enum: ['30m', '1h', '6h', '12h', 'daily', 'weekly'] },
        dueAt: { type: 'number', description: 'Optional next run time as Unix epoch milliseconds.' },
        enabled: { type: 'boolean', description: 'Set false to pause, true to resume.' },
      },
      required: ['id'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  scheduled_task_delete: {
    description: 'Delete an existing local reminder/lookout by id.',
    parameters: {
      type: 'object',
      description: 'Arguments for deleting a scheduled task.',
      properties: {
        id: { type: 'string', description: 'Scheduled task id.' },
      },
      required: ['id'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  scheduled_task_list: {
    description: 'List local reminders and web lookouts with ids, titles, schedules, and status.',
    parameters: {
      type: 'object',
      description: 'Optional filters for scheduled tasks.',
      properties: {
        type: { type: 'string', description: 'Optional task type filter.', enum: ['reminder', 'web_lookout'] },
      },
      required: [],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  scheduled_task_get_logs: {
    description: 'Get run logs/history for a local reminder or web lookout.',
    parameters: {
      type: 'object',
      description: 'Arguments for reading scheduled task logs.',
      properties: {
        id: { type: 'string', description: 'Scheduled task id.' },
        limit: { type: 'number', description: 'Maximum runs to return. Default 20, max 50.' },
      },
      required: ['id'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  window_list: {
    description: 'List top-level Windows app windows with hwnd, title, process name, and pid.',
    parameters: {
      type: 'object',
      description: 'No arguments required.',
      properties: {},
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  window_focus: {
    description: 'Focus a Windows app window by hwnd or title. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for focusing a window.',
      properties: {
        hwnd: { type: 'number', description: 'Native window handle.' },
        title: { type: 'string', description: 'Fallback title substring.' },
      },
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  window_move: {
    description: 'Move/resize a Windows app window by hwnd or title. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for moving a window.',
      properties: {
        hwnd: { type: 'number', description: 'Native window handle.' },
        title: { type: 'string', description: 'Fallback title substring.' },
        x: { type: 'number', description: 'Window x position.' },
        y: { type: 'number', description: 'Window y position.' },
        width: { type: 'number', description: 'Window width.' },
        height: { type: 'number', description: 'Window height.' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  window_close: {
    description: 'Ask a Windows app window to close by hwnd or title. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for closing a window.',
      properties: {
        hwnd: { type: 'number', description: 'Native window handle.' },
        title: { type: 'string', description: 'Fallback title substring.' },
      },
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
} satisfies Record<string, BuiltinMainToolManifestEntry>

export type BuiltinMainToolName = keyof typeof builtInMainToolManifest

const BUILTIN_MAIN_TOOL_NAMES = Object.keys(
  builtInMainToolManifest
) as BuiltinMainToolName[]

export const builtInMainToolDefinitions: ToolDescriptor[] = BUILTIN_MAIN_TOOL_NAMES.map((name) => ({
  name,
  ...builtInMainToolManifest[name],
}))

export function isBuiltinMainToolName(name: string): name is BuiltinMainToolName {
  return BUILTIN_MAIN_TOOL_NAMES.includes(name as BuiltinMainToolName)
}
