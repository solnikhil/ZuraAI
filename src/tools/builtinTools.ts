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
          description: `Search query. For URL tasks, include the URL directly (with optional instruction). Examples: "https://foo.com/article" or "summarize this https://foo.com/article". For general search, use concise keywords (e.g. "X market size ${new Date().getFullYear()}", "latest AI developments"). If you include a year without user guidance, use only ${new Date().getFullYear()}. If the user asks for a relative range such as "past 5 years", emit one focused query per year in the same turn. For verification, include the claim's unique names, terms, source type, and timeframe.`,
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
          description:
            'Filter by recency. Use for time-sensitive queries (news, recent events, latest data).',
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
          description:
            'The source code to execute. Must use print() (Python) or console.log() (JavaScript) to produce output.',
        },
        language: {
          type: 'string',
          description: 'Programming language to use.',
          enum: ['javascript', 'python'],
        },
        description: {
          type: 'string',
          description:
            'A brief one-line summary of what this code does (e.g. "Calculate factorial of 20").',
        },
        mutatesState: {
          type: 'boolean',
          description:
            'Whether this sandboxed code is intended to mutate external state. For this remote sandbox, this should normally be false.',
        },
      },
      required: ['code', 'language', 'description'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  activate_skill: {
    description: `Load full instructions for an installed Agent Skill.

Use this when the user's task matches a skill listed in the Agent Skills catalog. The tool returns the selected SKILL.md body wrapped in <skill_content> tags plus a capped list of bundled resources. It does not execute bundled scripts or grant extra permissions.`,
    parameters: {
      type: 'object',
      description: 'Arguments for loading an Agent Skill.',
      properties: {
        name: {
          type: 'string',
          description: 'The exact skill name from the available Agent Skills catalog.',
        },
      },
      required: ['name'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  mcp_request_add: {
    description: `Request adding an MCP server for the user to review.

Use this when the user asks to add, install, or connect an MCP server such as Gmail, GitHub, Notion, or a custom MCP endpoint.

Safety rules:
- Prefer mode="catalogue" with a concise query for known/common MCPs.
- Use mode="custom" only when the user gave a specific command or URL.
- Never include raw API keys, tokens, passwords, private keys, or secret values.
- This only creates a review request; the user must approve before the MCP is added.
- Added MCP servers stay untrusted until the user reviews and trusts discovered tools.`,
    parameters: {
      type: 'object',
      description: 'Arguments for requesting an MCP server add review.',
      properties: {
        mode: {
          type: 'string',
          description: 'Use catalogue for bundled MCPs, custom for a user-provided command or URL.',
          enum: ['catalogue', 'custom'],
          default: 'catalogue',
        },
        query: {
          type: 'string',
          description: 'Search text such as "gmail", "github", or a short custom server name.',
        },
        catalogueEntryId: {
          type: 'string',
          description: 'Optional exact bundled catalogue entry id or name.',
        },
        reason: {
          type: 'string',
          description: 'One short sentence explaining why this MCP should be added.',
        },
        custom: {
          type: 'object',
          description: 'Custom MCP config. Do not include raw secrets.',
          properties: {
            name: { type: 'string' },
            transport: { type: 'string', enum: ['stdio', 'sse', 'websocket'] },
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            cwd: { type: 'string' },
            url: { type: 'string' },
            env: { type: 'array', items: { type: 'string' } },
            headers: { type: 'array', items: { type: 'string' } },
            authMode: {
              type: 'string',
              enum: [
                'none',
                'envSecret',
                'headerSecret',
                'bearerToken',
                'basicAuth',
                'oauth2Pkce',
                'jsonCredential',
                'connectionString',
              ],
            },
          },
        },
      },
      required: ['mode', 'reason'],
    },
    category: 'mcp',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  computer_screenshot: {
    description:
      'Capture visual context for Computer Use. Prefer targeting a specific app/window with window_id, window_title, or app_name when the task is about one app; use a full display capture only for desktop-wide or visual layout tasks. Returns a base64 PNG image with dimensions and coordinate metadata used by follow-up actions.',
    parameters: {
      type: 'object',
      description: 'Arguments for capturing a display or a specific app/window.',
      properties: {
        display_id: {
          type: 'string',
          description: 'Optional display ID for multi-monitor setups. Defaults to primary display.',
        },
        window_id: {
          type: 'string',
          description:
            'Optional window source id from computer_list_windows, such as window:123:0.',
        },
        window_title: {
          type: 'string',
          description: 'Optional case-insensitive substring of the target window title.',
        },
        app_name: {
          type: 'string',
          description:
            'Optional case-insensitive app/title substring to target a visible app window.',
        },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_click: {
    description:
      'Click at specific pixel coordinates from the latest screen image returned by computer_screenshot. Requires a prior computer_screenshot in the current action sequence; computer_list_windows is not enough. Use the screen dimensions exactly and click the center of the intended target. The app maps screen coordinates to the real desktop. Returns an updated screen image.',
    parameters: {
      type: 'object',
      description: 'Arguments for clicking.',
      properties: {
        x: { type: 'number', description: 'X coordinate in pixels from the latest screen image.' },
        y: { type: 'number', description: 'Y coordinate in pixels from the latest screen image.' },
        button: {
          type: 'string',
          description: 'Mouse button.',
          enum: ['left', 'right', 'middle'],
          default: 'left',
        },
      },
      required: ['x', 'y'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_type: {
    description:
      'Type text at the current cursor position. Click the target input field first before typing.',
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
    description:
      'Press a key or key combination. Use for keyboard shortcuts, Enter, Tab, Escape, arrow keys, etc. Format: "enter", "ctrl+c", "alt+tab", "shift+ctrl+s".',
    parameters: {
      type: 'object',
      description: 'Arguments for pressing keys.',
      properties: {
        key: {
          type: 'string',
          description: 'Key or combo string, e.g. "enter", "ctrl+c", "alt+tab".',
        },
      },
      required: ['key'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_scroll: {
    description:
      'Scroll at specific coordinates from the latest screen image returned by computer_screenshot. Requires a prior computer_screenshot in the current action sequence; computer_list_windows is not enough. Move the cursor to the screen position first, then scroll.',
    parameters: {
      type: 'object',
      description: 'Arguments for scrolling.',
      properties: {
        x: {
          type: 'number',
          description: 'X coordinate from the latest screen image to scroll at.',
        },
        y: {
          type: 'number',
          description: 'Y coordinate from the latest screen image to scroll at.',
        },
        direction: {
          type: 'string',
          description: 'Scroll direction.',
          enum: ['up', 'down', 'left', 'right'],
        },
        amount: { type: 'number', description: 'Scroll amount in clicks (default 3).', default: 3 },
      },
      required: ['x', 'y', 'direction'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  computer_cursor_position: {
    description:
      'Move the cursor to specific coordinates from the latest screen image returned by computer_screenshot without clicking. Requires a prior computer_screenshot in the current action sequence; computer_list_windows is not enough. Use to hover over elements.',
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
    description:
      'List currently open application windows. Returns window titles and source ids that can be passed to computer_screenshot.window_id for app-specific visual capture. This is metadata, not visual screen context, and does not provide valid coordinates by itself.',
    parameters: {
      type: 'object',
      description: 'No arguments required.',
      properties: {},
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  ui_get_app_state: {
    description:
      'Inspect the current Windows desktop/app state for reliable Agent Mode UI automation. Returns a fresh screenshot, active window metadata, a compact accessibility tree, stable element_id values, supported element actions, bounds, and truncation metadata. Use this before UI actions and prefer element_id actions over coordinates.',
    parameters: {
      type: 'object',
      description: 'Optional filters and compactness controls for state capture.',
      properties: {
        windowTitle: {
          type: 'string',
          description: 'Optional substring of the target window title.',
        },
        processName: {
          type: 'string',
          description: 'Optional process name filter, such as notepad or explorer.',
        },
        hwnd: { type: 'number', description: 'Optional native window handle.' },
        max_depth: {
          type: 'number',
          description: 'Maximum accessibility tree depth. Defaults to 4.',
        },
        max_elements: {
          type: 'number',
          description: 'Maximum number of elements. Defaults to 120, capped at 300.',
        },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  ui_find: {
    description:
      'Search the latest or requested ui_get_app_state accessibility tree for elements by role, label/name, value, text, enabled/visible/focused state, or parent element_id. Use this instead of manually parsing a large tree.',
    parameters: {
      type: 'object',
      description: 'Search filters for the accessibility tree.',
      properties: {
        state_id: {
          type: 'string',
          description: 'Optional state_id from ui_get_app_state. Defaults to the latest state.',
        },
        query: {
          type: 'string',
          description: 'Text substring to match across name, value, automation id, or role.',
        },
        role: {
          type: 'string',
          description: 'Exact role/control type, such as Button, Edit, MenuItem, or CheckBox.',
        },
        name: { type: 'string', description: 'Substring of the element label/name.' },
        value: { type: 'string', description: 'Substring of the element value.' },
        text: {
          type: 'string',
          description: 'Text substring to match across accessible text fields.',
        },
        enabled: { type: 'boolean', description: 'Optional enabled-state filter.' },
        visible: { type: 'boolean', description: 'Optional visible-state filter.' },
        focused: { type: 'boolean', description: 'Optional focused-state filter.' },
        parent_element_id: { type: 'string', description: 'Optional parent element_id scope.' },
        limit: {
          type: 'number',
          description: 'Maximum matches to return. Defaults to 20, capped at 50.',
        },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  ui_wait_for: {
    description:
      'Wait for a Windows UI condition, such as an element/text/focus/window match, then return the fresh app state and matches. Use this for loading states, dialogs, toasts, and window changes instead of blind polling or sleeps.',
    parameters: {
      type: 'object',
      description: 'Wait condition filters. Same matching fields as ui_find.',
      properties: {
        query: { type: 'string', description: 'Text substring to wait for.' },
        role: { type: 'string', description: 'Exact role/control type to wait for.' },
        name: { type: 'string', description: 'Element label/name substring to wait for.' },
        value: { type: 'string', description: 'Element value substring to wait for.' },
        text: { type: 'string', description: 'Text substring to wait for.' },
        enabled: { type: 'boolean', description: 'Optional enabled-state filter.' },
        visible: { type: 'boolean', description: 'Optional visible-state filter.' },
        focused: { type: 'boolean', description: 'Optional focused-state filter.' },
        parent_element_id: { type: 'string', description: 'Optional parent element_id scope.' },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds. Defaults to 5000, capped at 30000.',
        },
        interval_ms: {
          type: 'number',
          description: 'Polling interval in milliseconds. Defaults to 250.',
        },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
  },
  ui_click: {
    description:
      'Click a Windows UI element by element_id. Uses UI Automation InvokePattern when available, otherwise clicks the element bounds center. Coordinates are supported only as an explicit fallback. Requires approval and returns fresh app state.',
    parameters: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'element_id from ui_get_app_state or ui_find.' },
        x: {
          type: 'number',
          description: 'Fallback desktop X coordinate when no element_id is available.',
        },
        y: {
          type: 'number',
          description: 'Fallback desktop Y coordinate when no element_id is available.',
        },
        button: { type: 'string', enum: ['left', 'right', 'middle'], default: 'left' },
      },
      required: [],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  ui_type_text: {
    description:
      'Type text into a target UI element by element_id. Focuses or clicks the target first, types text, and returns fresh app state. Requires approval.',
    parameters: {
      type: 'object',
      properties: {
        element_id: {
          type: 'string',
          description: 'Optional target element_id from ui_get_app_state or ui_find.',
        },
        text: { type: 'string', description: 'Text to type.' },
      },
      required: ['text'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  ui_set_value: {
    description:
      'Set a UI element value by element_id using UI Automation ValuePattern only. Requires approval and returns fresh app state.',
    parameters: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'element_id from ui_get_app_state or ui_find.' },
        value: { type: 'string', description: 'Text/value to set.' },
      },
      required: ['element_id', 'value'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  ui_select: {
    description:
      'Select or toggle a UI element by element_id using UI Automation SelectionItemPattern or TogglePattern. Requires approval and returns fresh app state.',
    parameters: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'element_id from ui_get_app_state or ui_find.' },
      },
      required: ['element_id'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  ui_scroll: {
    description:
      'Scroll a UI element by element_id. Uses UI Automation ScrollPattern when available, otherwise scrolls at the element bounds center. Coordinates are fallback only. Requires approval and returns fresh app state.',
    parameters: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'element_id from ui_get_app_state or ui_find.' },
        x: {
          type: 'number',
          description: 'Fallback desktop X coordinate when no element_id is available.',
        },
        y: {
          type: 'number',
          description: 'Fallback desktop Y coordinate when no element_id is available.',
        },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], default: 'down' },
        amount: { type: 'number', description: 'Scroll amount. Defaults to 3.' },
      },
      required: ['direction'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  ui_focus: {
    description:
      'Focus a UI element by element_id through UI Automation. Requires approval and returns fresh app state.',
    parameters: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'element_id from ui_get_app_state or ui_find.' },
      },
      required: ['element_id'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  ui_key: {
    description:
      'Press a key or keyboard shortcut, such as enter, escape, tab, ctrl+c, alt+tab, or ctrl+shift+s. Requires approval and returns fresh app state.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key or combo string.' },
      },
      required: ['key'],
    },
    category: 'computer-use',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  windows_uia_snapshot: {
    description:
      'Inspect Windows desktop app controls through Microsoft UI Automation. Prefer this before computer_screenshot/click/type for native Windows apps because it returns controls, supported patterns, and stable elementRef values.',
    parameters: {
      type: 'object',
      description: 'Optional window filters for UI Automation inspection.',
      properties: {
        windowTitle: {
          type: 'string',
          description: 'Optional substring of the target window title.',
        },
        processName: {
          type: 'string',
          description: 'Optional process name filter, such as notepad or explorer.',
        },
        hwnd: { type: 'number', description: 'Optional native window handle.' },
      },
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  windows_uia_invoke: {
    description:
      'Invoke a Windows UI Automation element that supports InvokePattern. Prefer this over computer_click for buttons and menu items. Requires approval.',
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
    description:
      'Set text/value on a Windows UI Automation element that supports ValuePattern. Prefer this over computer_type for supported text fields. Requires approval.',
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
    description:
      'Select or toggle a Windows UI Automation element that supports SelectionItemPattern or TogglePattern. Requires approval.',
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
    description:
      'Run a bounded PowerShell command for system inspection or automation. Use native file/app/window tools first when possible. Requires approval. Set mutatesState=false for read-only inspection commands such as Get-ComputerInfo, Get-ItemProperty, or directory listings; set mutatesState=true for commands that create, edit, delete, install, launch, stop, configure, or otherwise change local state.',
    parameters: {
      type: 'object',
      description: 'Arguments for running PowerShell.',
      properties: {
        command: { type: 'string', description: 'PowerShell command to execute.' },
        cwd: { type: 'string', description: 'Optional working directory.' },
        timeoutMs: {
          type: 'number',
          description: 'Optional timeout in milliseconds, capped at 60000.',
        },
        description: {
          type: 'string',
          description: 'One-line explanation of why this command is needed.',
        },
        mutatesState: {
          type: 'boolean',
          description:
            'Whether the command is intended to change local system, file, app, process, or configuration state. Use false for read-only inspection.',
        },
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
    description:
      'Write a local text file directly without using the desktop UI. Requires approval.',
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
        root: {
          type: 'string',
          description: 'Optional root directory. Defaults to app working directory.',
        },
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
    description:
      'Find installed Windows apps using the native Windows app index. Prefer this before app_launch.',
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
    description:
      'Launch a Windows app by name or path using native app launching. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for launching an app.',
      properties: {
        nameOrPath: { type: 'string', description: 'App executable/name or .lnk path.' },
        appUserModelId: {
          type: 'string',
          description: 'Optional Windows AppUserModelID from app_find/app_list.',
        },
      },
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  app_list: {
    description:
      'List installed Windows apps from the native Windows app index without opening Start/Search.',
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
    description:
      'Create a local reminder, web lookout, or AI automation. Use this when the user asks to remind them, check something later, watch a page, monitor a URL, set up a recurring lookout, or create an AI automation. After creating, tell the user it is visible in the Reminders sidebar.',
    parameters: {
      type: 'object',
      description: 'Arguments for creating a scheduled task.',
      properties: {
        type: {
          type: 'string',
          description: 'Task type.',
          enum: ['reminder', 'web_lookout', 'ai_automation'],
        },
        title: { type: 'string', description: 'Short user-visible title.' },
        reminderText: {
          type: 'string',
          description: 'Reminder/checklist text. Required for reminder tasks.',
        },
        urls: {
          type: 'array',
          description:
            'http/https URLs to watch. Public URLs and local loopback URLs are supported. Required for web_lookout tasks.',
          items: { type: 'string' },
        },
        instructions: {
          type: 'string',
          description:
            'What matters for this reminder, lookout, or AI automation and what to ignore.',
        },
        prompt: {
          type: 'string',
          description:
            'Reusable user-facing instruction for an AI automation. Required for ai_automation tasks.',
        },
        automationMode: {
          type: 'string',
          description:
            'AI automation mode. Use prompt for direct scheduled outputs, watch for meaningful-change checks, and agent only when the user explicitly wants tool-enabled work.',
          enum: ['prompt', 'watch', 'agent'],
        },
        contextSources: {
          type: 'array',
          description:
            'Optional context sources for an AI automation, such as current_datetime, chat, folder_memory, url, file, or mcp_resource.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['current_datetime', 'folder_memory', 'chat', 'url', 'file', 'mcp_resource'],
              },
              id: { type: 'string' },
              label: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        allowedTools: {
          type: 'array',
          description:
            'Tool names an agent-mode AI automation may use. Include only tools the user requested.',
          items: { type: 'string' },
        },
        approvalMode: {
          type: 'string',
          description: 'Approval policy for agent-mode automation tool use.',
          enum: ['read_only', 'ask_each_run', 'trusted_repeat'],
        },
        outputDestinations: {
          type: 'array',
          description:
            'Where AI automation output should be delivered. Every AI automation also creates a background chat run.',
          items: {
            type: 'string',
            enum: ['log', 'notification', 'email', 'chat', 'artifact'],
          },
        },
        notifyPolicy: {
          type: 'string',
          description: 'When to notify for an AI automation.',
          enum: ['every_run', 'meaningful_change', 'error_only'],
        },
        schedule: {
          type: 'object',
          description:
            'Exact AI automation schedule. For daily/weekly schedules use timeOfDay as HH:mm local time; weekdays use 0 for Sunday.',
        },
        intervalPreset: {
          type: 'string',
          description:
            'Repeat interval after the first run. Optional; defaults to 30m when omitted.',
          enum: ['1m', '30m', '1h', '6h', '12h', 'daily', 'weekly'],
        },
        dueAt: {
          type: 'number',
          description:
            'First/next run time as Unix epoch milliseconds. Required for requests like "in 1 minute", "tomorrow at 9", or any concrete due time.',
        },
        enabled: {
          type: 'boolean',
          description: 'Whether the task should start enabled.',
          default: true,
        },
      },
      required: ['type', 'title'],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  scheduled_task_update: {
    description:
      'Update or pause/resume an existing local reminder, lookout, or AI automation by id.',
    parameters: {
      type: 'object',
      description: 'Arguments for updating a scheduled task.',
      properties: {
        id: { type: 'string', description: 'Scheduled task id.' },
        title: { type: 'string', description: 'New title.' },
        reminderText: { type: 'string', description: 'New reminder text.' },
        urls: {
          type: 'array',
          description: 'Replacement URLs for a web lookout.',
          items: { type: 'string' },
        },
        instructions: { type: 'string', description: 'New instructions.' },
        prompt: {
          type: 'string',
          description: 'New reusable prompt for an AI automation.',
        },
        automationMode: {
          type: 'string',
          description: 'New AI automation mode.',
          enum: ['prompt', 'watch', 'agent'],
        },
        contextSources: {
          type: 'array',
          description: 'Replacement context sources for an AI automation.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['current_datetime', 'folder_memory', 'chat', 'url', 'file', 'mcp_resource'],
              },
              id: { type: 'string' },
              label: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        allowedTools: {
          type: 'array',
          description: 'Replacement allowed tool names for an agent-mode AI automation.',
          items: { type: 'string' },
        },
        approvalMode: {
          type: 'string',
          description: 'New approval policy for agent-mode automation tool use.',
          enum: ['read_only', 'ask_each_run', 'trusted_repeat'],
        },
        outputDestinations: {
          type: 'array',
          description: 'Replacement output destinations for an AI automation.',
          items: {
            type: 'string',
            enum: ['log', 'notification', 'email', 'chat', 'artifact'],
          },
        },
        notifyPolicy: {
          type: 'string',
          description: 'New AI automation notification policy.',
          enum: ['every_run', 'meaningful_change', 'error_only'],
        },
        schedule: {
          type: 'object',
          description: 'Replacement exact schedule for an AI automation.',
        },
        intervalPreset: {
          type: 'string',
          description: 'New interval.',
          enum: ['1m', '30m', '1h', '6h', '12h', 'daily', 'weekly'],
        },
        dueAt: {
          type: 'number',
          description: 'Optional next run time as Unix epoch milliseconds.',
        },
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
    description:
      'List local reminders, web lookouts, and AI automations with ids, titles, schedules, and status.',
    parameters: {
      type: 'object',
      description: 'Optional filters for scheduled tasks.',
      properties: {
        type: {
          type: 'string',
          description: 'Optional task type filter.',
          enum: ['reminder', 'web_lookout', 'ai_automation'],
        },
      },
      required: [],
    },
    category: 'utility',
    origin: 'builtin-main',
  },
  scheduled_task_get_logs: {
    description: 'Get run logs/history for a local reminder, web lookout, or AI automation.',
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
  system_active_window: {
    description:
      'Read the current foreground Windows app/window context: hwnd, title, process id, process name, and executable path. Use this before OS-level actions that refer to "this app" or "the current window".',
    parameters: {
      type: 'object',
      description: 'No arguments required.',
      properties: {},
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  system_status: {
    description:
      'Read local Windows system status including battery, fixed disk capacity/free space, and active network adapters. Read-only.',
    parameters: {
      type: 'object',
      description: 'No arguments required.',
      properties: {},
      required: [],
    },
    category: 'system',
    origin: 'builtin-main',
  },
  system_settings_open: {
    description: 'Open an allowlisted Windows Settings page. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for opening Windows Settings.',
      properties: {
        page: {
          type: 'string',
          description: 'Settings page to open.',
          enum: ['display', 'sound', 'bluetooth', 'network', 'notifications', 'apps', 'privacy'],
        },
      },
      required: ['page'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  system_open_path: {
    description: 'Open a local file or folder with the OS default handler. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for opening a local path.',
      properties: {
        path: { type: 'string', description: 'Absolute local file or folder path.' },
      },
      required: ['path'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
  window_snap: {
    description:
      'Snap a Windows app window to a common layout preset. Targets the given hwnd/title or the current foreground window. Requires approval.',
    parameters: {
      type: 'object',
      description: 'Arguments for snapping a window.',
      properties: {
        hwnd: { type: 'number', description: 'Optional native window handle.' },
        title: { type: 'string', description: 'Optional fallback title substring.' },
        preset: {
          type: 'string',
          description: 'Snap layout preset.',
          enum: ['left', 'right', 'top', 'bottom', 'maximize', 'center'],
          default: 'left',
        },
      },
      required: ['preset'],
    },
    category: 'system',
    origin: 'builtin-main',
    requiresApproval: true,
  },
} satisfies Record<string, BuiltinMainToolManifestEntry>

export type BuiltinMainToolName = keyof typeof builtInMainToolManifest

const BUILTIN_MAIN_TOOL_NAMES = Object.keys(builtInMainToolManifest) as BuiltinMainToolName[]

export const builtInMainToolDefinitions: ToolDescriptor[] = BUILTIN_MAIN_TOOL_NAMES.map((name) => ({
  name,
  ...builtInMainToolManifest[name],
}))

export function isBuiltinMainToolName(name: string): name is BuiltinMainToolName {
  return BUILTIN_MAIN_TOOL_NAMES.includes(name as BuiltinMainToolName)
}
