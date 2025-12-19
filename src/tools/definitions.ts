// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling

export interface ToolParameter {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array'
    description: string
    enum?: string[]
    default?: any
    items?: {
        type: 'string' | 'number' | 'boolean' | 'object'
        enum?: string[]
        properties?: Record<string, any>
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
    requiresApproval?: boolean  // If true, ask user before executing
    category: 'search' | 'utility' | 'file' | 'system' | 'computer' | 'app' | 'browser'
}

/**
 * Core tools available in Zura AI
 * These definitions are converted to provider-specific formats by adapters
 */
export const toolDefinitions: ToolDefinition[] = [
    // ==================== SEARCH TOOLS ====================
    {
        name: 'web_search',
        description: 'Search the internet for real-time information. Use this when you need current information, news, recent events, or facts that might have changed after your knowledge cutoff date. Returns relevant search results with titles, URLs, and snippets.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query to look up. Be specific and include relevant keywords.'
                },
                num_results: {
                    type: 'number',
                    description: 'Number of results to return as an integer (default: 5, max: 10). Must be a number, not a string.',
                    default: 5
                }
            },
            required: ['query']
        },
        category: 'search'
    },
    {
        name: 'fetch_url',
        description: 'Fetch and read the text content of a webpage. Use this to read articles, documentation, or any web page the user references. Returns the main text content extracted from the HTML.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The full URL to fetch content from (must start with http:// or https://)'
                },
                max_length: {
                    type: 'number',
                    description: 'Maximum characters to return (default: 10000)',
                    default: 10000
                }
            },
            required: ['url']
        },
        category: 'search'
    },

    // ==================== UTILITY TOOLS ====================
    {
        name: 'get_datetime',
        description: 'Get the current date, time, day of week, and timezone information. Use this when the user asks about the current time or date.',
        parameters: {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'Optional IANA timezone (e.g., "America/New_York", "Europe/London"). Defaults to user\'s local timezone.'
                },
                format: {
                    type: 'string',
                    description: 'Output format: "full" (default), "date_only", "time_only"',
                    enum: ['full', 'date_only', 'time_only'],
                    default: 'full'
                }
            },
            required: []
        },
        category: 'utility'
    },
    {
        name: 'calculator',
        description: 'Evaluate mathematical expressions. Supports basic arithmetic (+, -, *, /), exponents (^), parentheses, and common math functions (sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil). Also supports constants pi and e.',
        parameters: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'The mathematical expression to evaluate. Examples: "2 + 2", "sqrt(16)", "sin(45 * pi / 180)", "2^10", "log(100)"'
                }
            },
            required: ['expression']
        },
        category: 'utility'
    },

    // ==================== SYSTEM TOOLS ====================
    {
        name: 'read_clipboard',
        description: 'Read the current contents of the system clipboard. Use this when the user asks you to look at or analyze something they\'ve copied.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        requiresApproval: true,  // Privacy-sensitive
        category: 'system'
    },
    {
        name: 'write_clipboard',
        description: 'Copy text to the system clipboard. Use this when the user asks you to copy something for them.',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to copy to the clipboard'
                }
            },
            required: ['text']
        },
        category: 'system'
    },

    // ==================== COMPUTER CONTROL TOOLS (Phase 1) ====================
    // Mouse Control
    {
        name: 'move_mouse',
        description: 'Move the mouse cursor to specified screen coordinates. Use this to position the cursor before clicking or interacting.',
        parameters: {
            type: 'object',
            properties: {
                x: {
                    type: 'number',
                    description: 'X coordinate on screen (pixels from left edge)'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate on screen (pixels from top edge)'
                }
            },
            required: ['x', 'y']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'click',
        description: 'Click at specified screen coordinates. Use this to click buttons, links, or UI elements.',
        parameters: {
            type: 'object',
            properties: {
                x: {
                    type: 'number',
                    description: 'X coordinate on screen (pixels from left edge)'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate on screen (pixels from top edge)'
                },
                button: {
                    type: 'string',
                    description: 'Mouse button to click: "left" (default), "right", or "middle"',
                    enum: ['left', 'right', 'middle'],
                    default: 'left'
                }
            },
            required: ['x', 'y']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'double_click',
        description: 'Double click at specified screen coordinates. Use this for actions that require double-clicking.',
        parameters: {
            type: 'object',
            properties: {
                x: {
                    type: 'number',
                    description: 'X coordinate on screen (pixels from left edge)'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate on screen (pixels from top edge)'
                }
            },
            required: ['x', 'y']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'drag',
        description: 'Drag from start coordinates to end coordinates. Use this to move windows, select text, or drag UI elements.',
        parameters: {
            type: 'object',
            properties: {
                startX: {
                    type: 'number',
                    description: 'Starting X coordinate'
                },
                startY: {
                    type: 'number',
                    description: 'Starting Y coordinate'
                },
                endX: {
                    type: 'number',
                    description: 'Ending X coordinate'
                },
                endY: {
                    type: 'number',
                    description: 'Ending Y coordinate'
                }
            },
            required: ['startX', 'startY', 'endX', 'endY']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'scroll',
        description: 'Scroll the mouse wheel in specified direction. Use this to scroll pages, lists, or documents.',
        parameters: {
            type: 'object',
            properties: {
                direction: {
                    type: 'string',
                    description: 'Scroll direction',
                    enum: ['up', 'down', 'left', 'right']
                },
                amount: {
                    type: 'number',
                    description: 'Scroll amount in pixels (default: 3)',
                    default: 3
                }
            },
            required: ['direction']
        },
        requiresApproval: true,
        category: 'computer'
    },
    // Keyboard Control
    {
        name: 'type_text',
        description: 'Type text character by character. Use this to enter text into input fields, search boxes, or text editors.',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to type'
                },
                delay: {
                    type: 'number',
                    description: 'Delay between keystrokes in milliseconds (default: 10)',
                    default: 10
                }
            },
            required: ['text']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'press_key',
        description: 'Press a single key. Use this for special keys like Enter, Tab, Escape, Arrow keys, Function keys, etc.',
        parameters: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'Key to press: enter, tab, escape, backspace, delete, space, up, down, left, right, home, end, pageup, pagedown, f1-f12, etc.'
                }
            },
            required: ['key']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'hotkey',
        description: 'Press a keyboard shortcut combination (e.g., Ctrl+C, Alt+Tab). Use this for common shortcuts.',
        parameters: {
            type: 'object',
            properties: {
                modifiers: {
                    type: 'array',
                    description: 'Modifier keys: ["ctrl"], ["alt"], ["shift"], ["meta"] or combinations',
                    items: {
                        type: 'string',
                        enum: ['ctrl', 'alt', 'shift', 'meta', 'win']
                    }
                },
                key: {
                    type: 'string',
                    description: 'The key to press with modifiers (e.g., "c", "v", "a", "s", "z", "x")'
                }
            },
            required: ['modifiers', 'key']
        },
        requiresApproval: true,
        category: 'computer'
    },
    {
        name: 'hold_key',
        description: 'Hold a key down for specified duration. Use this for special key combinations or gaming scenarios.',
        parameters: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'Key to hold'
                },
                duration: {
                    type: 'number',
                    description: 'Duration to hold key in milliseconds'
                }
            },
            required: ['key', 'duration']
        },
        requiresApproval: true,
        category: 'computer'
    },
    // Screen Understanding
    {
        name: 'capture_screen',
        description: 'Capture a screenshot of the entire screen. Returns the image as base64 data.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'computer'
    },
    {
        name: 'capture_region',
        description: 'Capture a screenshot of a specific region of the screen. Returns the image as base64 data.',
        parameters: {
            type: 'object',
            properties: {
                x: {
                    type: 'number',
                    description: 'X coordinate of top-left corner'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate of top-left corner'
                },
                width: {
                    type: 'number',
                    description: 'Width of region in pixels'
                },
                height: {
                    type: 'number',
                    description: 'Height of region in pixels'
                }
            },
            required: ['x', 'y', 'width', 'height']
        },
        category: 'computer'
    },
    {
        name: 'get_screen_text',
        description: 'Extract all text from the screen using OCR (Optical Character Recognition). Use this to read text from images, screenshots, or non-selectable text.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'computer'
    },
    {
        name: 'get_text_at',
        description: 'Extract text from a specific region of the screen using OCR.',
        parameters: {
            type: 'object',
            properties: {
                x: {
                    type: 'number',
                    description: 'X coordinate of top-left corner'
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate of top-left corner'
                },
                width: {
                    type: 'number',
                    description: 'Width of region in pixels'
                },
                height: {
                    type: 'number',
                    description: 'Height of region in pixels'
                }
            },
            required: ['x', 'y', 'width', 'height']
        },
        category: 'computer'
    },

    // ==================== APPLICATION MANAGEMENT TOOLS (Phase 2) ====================
    {
        name: 'launch_app',
        description: 'Launch an application by name or executable path. Use this to open programs.',
        parameters: {
            type: 'object',
            properties: {
                name_or_path: {
                    type: 'string',
                    description: 'Application name (e.g., "notepad") or full path to executable'
                }
            },
            required: ['name_or_path']
        },
        requiresApproval: true,
        category: 'app'
    },
    {
        name: 'close_app',
        description: 'Close an application by name. Use this to terminate running programs.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Application name (without .exe extension)'
                }
            },
            required: ['name']
        },
        requiresApproval: true,
        category: 'app'
    },
    {
        name: 'list_running_apps',
        description: 'List all currently running applications.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'app'
    },
    {
        name: 'focus_window',
        description: 'Bring a window to the foreground by its title. Use this to switch between windows.',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Window title (partial match supported)'
                }
            },
            required: ['title']
        },
        requiresApproval: true,
        category: 'app'
    },
    {
        name: 'minimize_window',
        description: 'Minimize a window by its title.',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Window title'
                }
            },
            required: ['title']
        },
        requiresApproval: true,
        category: 'app'
    },
    {
        name: 'maximize_window',
        description: 'Maximize a window by its title.',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Window title'
                }
            },
            required: ['title']
        },
        requiresApproval: true,
        category: 'app'
    },
    {
        name: 'list_windows',
        description: 'List all open windows with their titles.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'app'
    },
    {
        name: 'get_active_window',
        description: 'Get information about the currently active window.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'app'
    },

    // ==================== FILE SYSTEM TOOLS (Phase 2) ====================
    {
        name: 'read_file',
        description: 'Read the contents of a text file. Use this to read documents, code files, or configuration files.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file to read'
                }
            },
            required: ['path']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'write_file',
        description: 'Write content to a file. Creates the file if it doesn\'t exist, overwrites if it does.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file to write'
                },
                content: {
                    type: 'string',
                    description: 'Content to write to the file'
                }
            },
            required: ['path', 'content']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'create_file',
        description: 'Create a new empty file.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file to create'
                }
            },
            required: ['path']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'delete_file',
        description: 'Delete a file. Use with caution - this action cannot be undone.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file to delete'
                }
            },
            required: ['path']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'list_directory',
        description: 'List files and subdirectories in a directory.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the directory'
                }
            },
            required: ['path']
        },
        category: 'file'
    },
    {
        name: 'create_directory',
        description: 'Create a new directory (folder).',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the directory to create'
                }
            },
            required: ['path']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'copy_file',
        description: 'Copy a file from source to destination.',
        parameters: {
            type: 'object',
            properties: {
                src: {
                    type: 'string',
                    description: 'Source file path'
                },
                dest: {
                    type: 'string',
                    description: 'Destination file path'
                }
            },
            required: ['src', 'dest']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'move_file',
        description: 'Move or rename a file from source to destination.',
        parameters: {
            type: 'object',
            properties: {
                src: {
                    type: 'string',
                    description: 'Source file path'
                },
                dest: {
                    type: 'string',
                    description: 'Destination file path'
                }
            },
            required: ['src', 'dest']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'file_exists',
        description: 'Check if a file or directory exists.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to check'
                }
            },
            required: ['path']
        },
        category: 'file'
    },
    {
        name: 'get_file_info',
        description: 'Get detailed information about a file (size, dates, type).',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file'
                }
            },
            required: ['path']
        },
        category: 'file'
    },
    {
        name: 'open_file',
        description: 'Open a file with its default application.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the file to open'
                }
            },
            required: ['path']
        },
        requiresApproval: true,
        category: 'file'
    },
    {
        name: 'open_folder',
        description: 'Open a folder in Windows Explorer.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Path to the folder to open'
                }
            },
            required: ['path']
        },
        category: 'file'
    },

    // ==================== SYSTEM OPERATIONS TOOLS (Phase 2) ====================
    {
        name: 'run_command',
        description: 'Execute a shell command. Use with caution - only safe commands are allowed.',
        parameters: {
            type: 'object',
            properties: {
                cmd: {
                    type: 'string',
                    description: 'Command to execute'
                }
            },
            required: ['cmd']
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'get_system_info',
        description: 'Get system information (OS, CPU, memory, etc.).',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'system'
    },
    {
        name: 'get_running_processes',
        description: 'List all running processes.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'system'
    },
    {
        name: 'kill_process',
        description: 'Terminate a running process by name or PID. Use with caution.',
        parameters: {
            type: 'object',
            properties: {
                name_or_pid: {
                    type: 'string',
                    description: 'Process name (e.g., "notepad") or PID (e.g., "1234")'
                }
            },
            required: ['name_or_pid']
        },
        requiresApproval: true,
        category: 'system'
    },

    // ==================== TASK PLANNING & EXECUTION TOOLS (Phase 3) ====================
    {
        name: 'create_task_plan',
        description: 'Create a multi-step task plan from a high-level goal. Use this to break down complex tasks into executable steps.',
        parameters: {
            type: 'object',
            properties: {
                goal: {
                    type: 'string',
                    description: 'High-level goal or task description'
                },
                steps: {
                    type: 'array',
                    description: 'Optional predefined steps. If not provided, AI will generate steps.',
                    items: {
                        type: 'object',
                        properties: {
                            description: { type: 'string' },
                            tool: { type: 'string' },
                            args: { type: 'object' }
                        }
                    }
                }
            },
            required: ['goal']
        },
        category: 'system'
    },
    {
        name: 'execute_task_step',
        description: 'Execute the next step in a task plan.',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'string',
                    description: 'Task ID from create_task_plan'
                }
            },
            required: ['taskId']
        },
        category: 'system'
    },
    {
        name: 'get_task_status',
        description: 'Get the current status and progress of a task.',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'string',
                    description: 'Task ID'
                }
            },
            required: ['taskId']
        },
        category: 'system'
    },
    {
        name: 'cancel_task',
        description: 'Cancel a running task.',
        parameters: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'string',
                    description: 'Task ID to cancel'
                }
            },
            required: ['taskId']
        },
        category: 'system'
    },
    {
        name: 'list_tasks',
        description: 'List all active tasks.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'system'
    },

    // ==================== MEMORY & CONTEXT TOOLS (Phase 3) ====================
    {
        name: 'store_memory',
        description: 'Store information in memory for later retrieval. Use short-term for current session, medium-term for recent tasks, long-term for persistent knowledge.',
        parameters: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Memory type',
                    enum: ['short', 'medium', 'long']
                },
                content: {
                    type: 'string',
                    description: 'Content to store'
                },
                metadata: {
                    type: 'object',
                    description: 'Optional metadata'
                }
            },
            required: ['type', 'content']
        },
        category: 'system'
    },
    {
        name: 'search_memories',
        description: 'Search stored memories by content.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query'
                },
                type: {
                    type: 'string',
                    description: 'Filter by memory type',
                    enum: ['short', 'medium', 'long']
                },
                limit: {
                    type: 'number',
                    description: 'Maximum results (default: 10)',
                    default: 10
                }
            },
            required: ['query']
        },
        category: 'system'
    },
    {
        name: 'store_preference',
        description: 'Store a user preference for future reference.',
        parameters: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'Preference key'
                },
                value: {
                    type: 'string',
                    description: 'Preference value'
                }
            },
            required: ['key', 'value']
        },
        category: 'system'
    },
    {
        name: 'get_preference',
        description: 'Retrieve a stored user preference.',
        parameters: {
            type: 'object',
            properties: {
                key: {
                    type: 'string',
                    description: 'Preference key'
                }
            },
            required: ['key']
        },
        category: 'system'
    },
    {
        name: 'store_task_sequence',
        description: 'Store a successful task sequence for learning.',
        parameters: {
            type: 'object',
            properties: {
                goal: {
                    type: 'string',
                    description: 'Task goal'
                },
                steps: {
                    type: 'array',
                    description: 'Steps that were executed',
                    items: {
                        type: 'object'
                    }
                }
            },
            required: ['goal', 'steps']
        },
        category: 'system'
    },
    {
        name: 'find_similar_tasks',
        description: 'Find similar previously executed tasks.',
        parameters: {
            type: 'object',
            properties: {
                goal: {
                    type: 'string',
                    description: 'Task goal to find similar tasks for'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum results (default: 5)',
                    default: 5
                }
            },
            required: ['goal']
        },
        category: 'system'
    },

    // ==================== VISUAL UNDERSTANDING TOOLS (Phase 3) ====================
    {
        name: 'find_element',
        description: 'Find UI element on screen using AI vision. Requires vision model integration.',
        parameters: {
            type: 'object',
            properties: {
                description: {
                    type: 'string',
                    description: 'Description of element to find'
                },
                screenshot: {
                    type: 'string',
                    description: 'Optional base64 screenshot (if not provided, will capture screen)'
                }
            },
            required: ['description']
        },
        category: 'computer'
    },
    {
        name: 'detect_changes',
        description: 'Detect changes between two screenshots using AI vision.',
        parameters: {
            type: 'object',
            properties: {
                before: {
                    type: 'string',
                    description: 'Base64 image of before state'
                },
                after: {
                    type: 'string',
                    description: 'Base64 image of after state'
                }
            },
            required: ['before', 'after']
        },
        category: 'computer'
    },
    {
        name: 'extract_structured_data',
        description: 'Extract structured data from screenshot using AI vision.',
        parameters: {
            type: 'object',
            properties: {
                screenshot: {
                    type: 'string',
                    description: 'Base64 screenshot image'
                },
                schema: {
                    type: 'object',
                    description: 'Schema defining data structure to extract'
                }
            },
            required: ['screenshot', 'schema']
        },
        category: 'computer'
    },

    // ==================== SAFETY & AUDIT TOOLS (Phase 4) ====================
    {
        name: 'log_action',
        description: 'Log an action to the audit log (internal use).',
        parameters: {
            type: 'object',
            properties: {
                toolName: { type: 'string', description: 'Tool name' },
                args: { type: 'object', description: 'Tool arguments' },
                result: { type: 'object', description: 'Tool result' },
                success: { type: 'boolean', description: 'Whether tool succeeded' },
                userApproved: { type: 'boolean', description: 'Whether user approved' },
                sessionId: { type: 'string', description: 'Session ID' }
            },
            required: ['toolName', 'args', 'result', 'success', 'userApproved']
        },
        category: 'system'
    },
    {
        name: 'get_audit_log',
        description: 'Retrieve audit log entries for security and debugging.',
        parameters: {
            type: 'object',
            properties: {
                toolName: {
                    type: 'string',
                    description: 'Filter by tool name'
                },
                limit: {
                    type: 'number',
                    description: 'Maximum results (default: 100)',
                    default: 100
                },
                since: {
                    type: 'number',
                    description: 'Timestamp to filter from (Unix timestamp)'
                }
            },
            required: []
        },
        category: 'system'
    },
    {
        name: 'check_restrictions',
        description: 'Check if an action is restricted (internal use).',
        parameters: {
            type: 'object',
            properties: {
                toolName: { type: 'string', description: 'Tool name to check' },
                args: { type: 'object', description: 'Tool arguments to check' }
            },
            required: ['toolName', 'args']
        },
        category: 'system'
    },

    // ==================== BROWSER AUTOMATION TOOLS (Phase 5) ====================
    {
        name: 'open_url',
        description: 'Open a URL in a browser. Returns a pageId for subsequent operations.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'URL to open (must start with http:// or https://)'
                },
                newTab: {
                    type: 'boolean',
                    description: 'Open in new tab (default: false)',
                    default: false
                }
            },
            required: ['url']
        },
        requiresApproval: true,
        category: 'browser'
    },
    {
        name: 'navigate_to',
        description: 'Navigate to a URL in an existing browser page.',
        parameters: {
            type: 'object',
            properties: {
                pageId: {
                    type: 'string',
                    description: 'Page ID from open_url'
                },
                url: {
                    type: 'string',
                    description: 'URL to navigate to'
                }
            },
            required: ['pageId', 'url']
        },
        category: 'browser'
    },
    {
        name: 'click_element',
        description: 'Click an element on a webpage by CSS selector.',
        parameters: {
            type: 'object',
            properties: {
                pageId: {
                    type: 'string',
                    description: 'Page ID from open_url'
                },
                selector: {
                    type: 'string',
                    description: 'CSS selector for the element'
                }
            },
            required: ['pageId', 'selector']
        },
        requiresApproval: true,
        category: 'browser'
    },
    {
        name: 'type_in_element',
        description: 'Type text into an input element on a webpage.',
        parameters: {
            type: 'object',
            properties: {
                pageId: {
                    type: 'string',
                    description: 'Page ID from open_url'
                },
                selector: {
                    type: 'string',
                    description: 'CSS selector for the input element'
                },
                text: {
                    type: 'string',
                    description: 'Text to type'
                }
            },
            required: ['pageId', 'selector', 'text']
        },
        requiresApproval: true,
        category: 'browser'
    },
    {
        name: 'get_page_content',
        description: 'Get the text or HTML content of a webpage.',
        parameters: {
            type: 'object',
            properties: {
                pageId: {
                    type: 'string',
                    description: 'Page ID from open_url'
                },
                format: {
                    type: 'string',
                    description: 'Content format',
                    enum: ['text', 'html'],
                    default: 'text'
                }
            },
            required: ['pageId']
        },
        category: 'browser'
    },
    {
        name: 'wait_for_element',
        description: 'Wait for an element to appear on the page.',
        parameters: {
            type: 'object',
            properties: {
                pageId: {
                    type: 'string',
                    description: 'Page ID from open_url'
                },
                selector: {
                    type: 'string',
                    description: 'CSS selector to wait for'
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (default: 30000)',
                    default: 30000
                }
            },
            required: ['pageId', 'selector']
        },
        category: 'browser'
    },
    {
        name: 'extract_data',
        description: 'Extract data from a webpage using CSS selectors.',
        parameters: {
            type: 'object',
            properties: {
                pageId: {
                    type: 'string',
                    description: 'Page ID from open_url'
                },
                selectors: {
                    type: 'object',
                    description: 'Object mapping keys to CSS selectors (e.g., {"title": "h1", "price": ".price"})'
                }
            },
            required: ['pageId', 'selectors']
        },
        category: 'browser'
    },

    // ==================== WORKFLOW AUTOMATION TOOLS (Phase 5) ====================
    {
        name: 'record_workflow',
        description: 'Record a sequence of actions as a reusable workflow.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Workflow name'
                },
                steps: {
                    type: 'array',
                    description: 'Steps in the workflow',
                    items: {
                        type: 'object',
                        properties: {
                            tool: { type: 'string' },
                            args: { type: 'object' }
                        }
                    }
                }
            },
            required: ['name', 'steps']
        },
        category: 'system'
    },
    {
        name: 'execute_workflow',
        description: 'Execute a previously recorded workflow.',
        parameters: {
            type: 'object',
            properties: {
                workflowId: {
                    type: 'string',
                    description: 'Workflow ID from record_workflow'
                }
            },
            required: ['workflowId']
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'list_workflows',
        description: 'List all recorded workflows.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        category: 'system'
    },
    {
        name: 'schedule_workflow',
        description: 'Schedule a workflow to run at specified times.',
        parameters: {
            type: 'object',
            properties: {
                workflowId: {
                    type: 'string',
                    description: 'Workflow ID'
                },
                schedule: {
                    type: 'string',
                    description: 'Schedule expression (cron format or time-based)'
                }
            },
            required: ['workflowId', 'schedule']
        },
        requiresApproval: true,
        category: 'system'
    },

    // ==================== INTEGRATION API TOOLS (Phase 5) ====================
    {
        name: 'send_email',
        description: 'Send an email via Gmail or Outlook. Requires OAuth setup.',
        parameters: {
            type: 'object',
            properties: {
                to: {
                    type: 'string',
                    description: 'Recipient email address'
                },
                subject: {
                    type: 'string',
                    description: 'Email subject'
                },
                body: {
                    type: 'string',
                    description: 'Email body'
                },
                provider: {
                    type: 'string',
                    description: 'Email provider',
                    enum: ['gmail', 'outlook'],
                    default: 'gmail'
                }
            },
            required: ['to', 'subject', 'body']
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'create_calendar_event',
        description: 'Create a calendar event in Google Calendar or Outlook. Requires OAuth setup.',
        parameters: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Event title'
                },
                start: {
                    type: 'string',
                    description: 'Start time (ISO 8601 format)'
                },
                end: {
                    type: 'string',
                    description: 'End time (ISO 8601 format)'
                },
                provider: {
                    type: 'string',
                    description: 'Calendar provider',
                    enum: ['google', 'outlook'],
                    default: 'google'
                }
            },
            required: ['title', 'start', 'end']
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'send_message',
        description: 'Send a message via Slack, Discord, or Teams. Requires API setup.',
        parameters: {
            type: 'object',
            properties: {
                platform: {
                    type: 'string',
                    description: 'Messaging platform',
                    enum: ['slack', 'discord', 'teams']
                },
                channel: {
                    type: 'string',
                    description: 'Channel or recipient identifier'
                },
                message: {
                    type: 'string',
                    description: 'Message content'
                }
            },
            required: ['platform', 'channel', 'message']
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'upload_to_cloud',
        description: 'Upload a file to OneDrive or Google Drive. Requires OAuth setup.',
        parameters: {
            type: 'object',
            properties: {
                provider: {
                    type: 'string',
                    description: 'Cloud storage provider',
                    enum: ['onedrive', 'googledrive']
                },
                filePath: {
                    type: 'string',
                    description: 'Local file path to upload'
                },
                remotePath: {
                    type: 'string',
                    description: 'Optional remote path/folder'
                }
            },
            required: ['provider', 'filePath']
        },
        requiresApproval: true,
        category: 'system'
    }
]

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
    return toolDefinitions.find(t => t.name === name)
}

/**
 * Get all tools in a category
 */
export function getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return toolDefinitions.filter(t => t.category === category)
}

/**
 * Get tools that require user approval
 */
export function getSensitiveTools(): ToolDefinition[] {
    return toolDefinitions.filter(t => t.requiresApproval)
}

