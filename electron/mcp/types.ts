export type McpTransport = 'stdio' | 'http'

export interface McpServerConfig {
    id: string
    name: string
    enabled: boolean
    transport: McpTransport
    command?: string
    args?: string
    cwd?: string
    env?: string
    url?: string
    headers?: string
    requiresApproval?: boolean
    timeoutMs?: number
}

export interface McpServerStatus {
    id: string
    name: string
    enabled: boolean
    status: 'ready' | 'error' | 'disabled'
    error?: string
    toolCount?: number
}

export interface McpToolDefinition {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: Record<string, {
            type: 'string' | 'number' | 'boolean' | 'object' | 'array'
            description: string
            enum?: string[]
            default?: unknown
        }>
        required: string[]
    }
    requiresApproval?: boolean
    category: 'search' | 'utility' | 'system'
}

export interface McpListToolsResult {
    tools: McpToolDefinition[]
    servers: McpServerStatus[]
}
