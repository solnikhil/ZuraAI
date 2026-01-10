// Tool Definitions - JSON Schema format compatible with OpenAI/Gemini function calling
// Only includes tools that are actually implemented and registered

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
 * Active tools in Zura AI - only includes implemented handlers
 */
export const toolDefinitions: ToolDefinition[] = [
    // ==================== SEARCH TOOLS ====================
    {
        name: 'web_search',
        description: 'Search the internet for real-time information. Use this when you need current information, news, recent events, or facts that might have changed after your knowledge cutoff date. Returns text results and images.',
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
    {
        name: 'fetch_url',
        description: 'Fetch and read the text content of a webpage. Use this to read articles, documentation, or any web page.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'The full URL to fetch (must start with http:// or https://)'
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
        description: 'Get the current date, time, day of week, and timezone information.',
        parameters: {
            type: 'object',
            properties: {
                timezone: {
                    type: 'string',
                    description: 'Optional IANA timezone (e.g., "America/New_York"). Defaults to local timezone.'
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
        description: 'Evaluate mathematical expressions. Supports arithmetic, exponents, parentheses, and functions (sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil).',
        parameters: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'The mathematical expression to evaluate. Examples: "2 + 2", "sqrt(16)", "sin(45 * pi / 180)"'
                }
            },
            required: ['expression']
        },
        category: 'utility'
    },

    // ==================== SYSTEM TOOLS ====================
    {
        name: 'read_clipboard',
        description: 'Read the current contents of the system clipboard.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        },
        requiresApproval: true,
        category: 'system'
    },
    {
        name: 'write_clipboard',
        description: 'Copy text to the system clipboard.',
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
    }
]

let dynamicToolDefinitions: ToolDefinition[] = []

export function setDynamicToolDefinitions(tools: ToolDefinition[]) {
    dynamicToolDefinitions = tools
}

export function getAllToolDefinitions(): ToolDefinition[] {
    const merged = new Map<string, ToolDefinition>()
    for (const tool of toolDefinitions) {
        merged.set(tool.name, tool)
    }
    for (const tool of dynamicToolDefinitions) {
        merged.set(tool.name, tool)
    }
    return Array.from(merged.values())
}

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
    return getAllToolDefinitions().find(t => t.name === name)
}
