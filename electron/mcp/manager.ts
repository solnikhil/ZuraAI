import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import * as readline from 'readline'
import type { ToolResult } from '../tools/types'
import type { McpListToolsResult, McpServerConfig, McpServerStatus, McpToolDefinition } from './types'

const MCP_TOOL_PREFIX = 'mcp__'
const MCP_PROTOCOL_VERSION = '2024-11-05'
const DEFAULT_TIMEOUT_MS = 30000

interface JsonRpcRequest {
    jsonrpc: '2.0'
    id?: number
    method: string
    params?: unknown
}

interface JsonRpcResponse {
    jsonrpc?: '2.0'
    id?: number
    result?: any
    error?: { message?: string; code?: number; data?: unknown }
}

interface PendingRequest {
    resolve: (value: any) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
}

export function isMcpToolName(name: string): boolean {
    return name.startsWith(MCP_TOOL_PREFIX)
}

export function formatMcpToolName(serverName: string, toolName: string): string {
    return `${MCP_TOOL_PREFIX}${serverName}__${toolName}`
}

export function parseMcpToolName(name: string): { serverName: string; toolName: string } | null {
    if (!isMcpToolName(name)) {
        return null
    }

    const parts = name.split('__')
    if (parts.length < 3) {
        return null
    }

    const serverName = parts[1]
    const toolName = parts.slice(2).join('__')

    if (!serverName || !toolName) {
        return null
    }

    return { serverName, toolName }
}

function parseArgs(value?: string): string[] {
    if (!value) return []
    return value
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean)
}

function parseKeyValueLines(value?: string, separator: string = '='): Record<string, string> {
    if (!value) return {}
    const lines = value.split(/\r?\n/)
    const entries: Record<string, string> = {}

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            continue
        }

        const index = trimmed.indexOf(separator)
        if (index <= 0) {
            continue
        }

        const key = trimmed.slice(0, index).trim()
        const val = trimmed.slice(index + 1).trim()
        if (key) {
            entries[key] = val
        }
    }

    return entries
}

function normalizeSchemaType(value: unknown): 'string' | 'number' | 'boolean' | 'object' | 'array' {
    if (Array.isArray(value)) {
        return normalizeSchemaType(value[0])
    }
    switch (value) {
        case 'integer':
        case 'number':
            return 'number'
        case 'boolean':
            return 'boolean'
        case 'array':
            return 'array'
        case 'object':
            return 'object'
        default:
            return 'string'
    }
}

function toToolParameters(schema: any) {
    if (!schema || schema.type !== 'object' || typeof schema !== 'object') {
        return { type: 'object' as const, properties: {}, required: [] as string[] }
    }

    const properties: Record<string, any> = schema.properties || {}
    const required = Array.isArray(schema.required) ? schema.required : []
    const mapped: Record<string, any> = {}

    for (const [key, prop] of Object.entries(properties)) {
        const type = normalizeSchemaType(prop?.type)
        const description = typeof prop?.description === 'string' ? prop.description : ''
        const enumValues = Array.isArray(prop?.enum)
            ? prop.enum.filter((val: unknown) => typeof val === 'string')
            : undefined
        const defaultValue = prop?.default

        mapped[key] = {
            type,
            description,
            ...(enumValues && enumValues.length > 0 ? { enum: enumValues } : {}),
            ...(defaultValue !== undefined ? { default: defaultValue } : {})
        }
    }

    return {
        type: 'object' as const,
        properties: mapped,
        required
    }
}

function extractTextContent(content: any): string | null {
    if (!Array.isArray(content)) return null
    const texts = content
        .map((block) => {
            if (block && typeof block.text === 'string') {
                return block.text
            }
            return null
        })
        .filter(Boolean) as string[]
    return texts.length > 0 ? texts.join('\n') : null
}

class StdioMcpClient {
    private process: ChildProcessWithoutNullStreams | null = null
    private rl: readline.Interface | null = null
    private pending = new Map<number, PendingRequest>()
    private nextId = 1
    private initialized = false
    private initializing: Promise<void> | null = null

    constructor(private config: McpServerConfig) {}

    updateConfig(config: McpServerConfig) {
        this.config = config
        this.reset()
    }

    async request(method: string, params?: unknown, timeoutMs?: number) {
        await this.ensureInitialized()
        return this.sendRequest(method, params, timeoutMs)
    }

    close() {
        this.reset()
    }

    private reset() {
        this.initialized = false
        this.initializing = null
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout)
            pending.reject(new Error('MCP connection closed'))
        }
        this.pending.clear()

        if (this.rl) {
            this.rl.close()
            this.rl = null
        }
        if (this.process) {
            this.process.kill()
            this.process = null
        }
    }

    private async ensureInitialized() {
        if (this.initialized) return
        if (this.initializing) {
            await this.initializing
            return
        }

        this.initializing = (async () => {
            await this.ensureProcess()
            await this.sendRequest('initialize', {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: {
                    name: 'Zura',
                    version: process.env.npm_package_version || '1.0.0'
                }
            }, this.config.timeoutMs || DEFAULT_TIMEOUT_MS)
            await this.sendNotification('notifications/initialized')
            this.initialized = true
        })()

        await this.initializing
    }

    private async ensureProcess() {
        if (this.process && this.process.exitCode === null) {
            return
        }

        const env = {
            ...process.env,
            ...parseKeyValueLines(this.config.env)
        }
        const args = parseArgs(this.config.args)
        const cwd = this.config.cwd || process.cwd()

        if (!this.config.command) {
            throw new Error('MCP server command is required for stdio transport')
        }

        this.process = spawn(this.config.command, args, {
            cwd,
            env,
            stdio: 'pipe'
        })

        this.process.on('exit', () => {
            this.reset()
        })

        this.process.on('error', (error) => {
            console.error('[MCP] process error:', error)
            this.reset()
        })

        this.rl = readline.createInterface({ input: this.process.stdout })
        this.rl.on('line', (line) => this.handleLine(line))

        this.process.stderr.on('data', (data) => {
            const message = data.toString().trim()
            if (message) {
                console.warn(`[MCP:${this.config.name}] ${message}`)
            }
        })
    }

    private handleLine(line: string) {
        let message: JsonRpcResponse | null = null
        try {
            message = JSON.parse(line)
        } catch {
            return
        }

        if (!message || typeof message.id !== 'number') {
            return
        }

        const pending = this.pending.get(message.id)
        if (!pending) {
            return
        }

        clearTimeout(pending.timeout)
        this.pending.delete(message.id)

        if (message.error) {
            pending.reject(new Error(message.error.message || 'MCP error'))
            return
        }

        pending.resolve(message.result)
    }

    private sendNotification(method: string, params?: unknown) {
        if (!this.process) {
            return
        }

        const payload: JsonRpcRequest = { jsonrpc: '2.0', method, params }
        this.process.stdin.write(`${JSON.stringify(payload)}\n`)
    }

    private sendRequest(method: string, params?: unknown, timeoutMs?: number): Promise<any> {
        if (!this.process) {
            return Promise.reject(new Error('MCP process not running'))
        }

        const id = this.nextId++
        const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
        const timeout = setTimeout(() => {
            const pending = this.pending.get(id)
            if (pending) {
                this.pending.delete(id)
                pending.reject(new Error(`MCP request timed out for ${method}`))
            }
        }, timeoutMs || DEFAULT_TIMEOUT_MS)

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, timeout })
            this.process!.stdin.write(`${JSON.stringify(payload)}\n`)
        })
    }
}

class HttpMcpClient {
    private initialized = false
    private initializing: Promise<void> | null = null

    constructor(private config: McpServerConfig) {}

    updateConfig(config: McpServerConfig) {
        this.config = config
        this.initialized = false
        this.initializing = null
    }

    async request(method: string, params?: unknown, timeoutMs?: number) {
        await this.ensureInitialized()
        return this.sendRequest(method, params, timeoutMs)
    }

    private async ensureInitialized() {
        if (this.initialized) return
        if (this.initializing) {
            await this.initializing
            return
        }

        this.initializing = (async () => {
            await this.sendRequest('initialize', {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: {
                    name: 'Zura',
                    version: process.env.npm_package_version || '1.0.0'
                }
            }, this.config.timeoutMs || DEFAULT_TIMEOUT_MS)
            await this.sendNotification('notifications/initialized')
            this.initialized = true
        })()

        await this.initializing
    }

    private async sendNotification(method: string, params?: unknown) {
        await this.sendRequest(method, params, this.config.timeoutMs || DEFAULT_TIMEOUT_MS, true)
    }

    private async sendRequest(method: string, params?: unknown, timeoutMs?: number, notification?: boolean) {
        if (!this.config.url) {
            throw new Error('MCP server URL is required for HTTP transport')
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS)
        const headers = {
            'content-type': 'application/json',
            ...parseKeyValueLines(this.config.headers, ':')
        }

        const payload: JsonRpcRequest = {
            jsonrpc: '2.0',
            method,
            params
        }
        if (!notification) {
            payload.id = Date.now() + Math.floor(Math.random() * 1000)
        }

        try {
            const response = await fetch(this.config.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            })

            if (!response.ok) {
                const body = await response.text().catch(() => '')
                throw new Error(`MCP HTTP ${response.status}: ${body || response.statusText}`)
            }

            if (notification) {
                return
            }

            const data = (await response.json()) as JsonRpcResponse
            if (data.error) {
                throw new Error(data.error.message || 'MCP error')
            }
            return data.result
        } finally {
            clearTimeout(timeout)
        }
    }
}

export class McpManager {
    private configs: McpServerConfig[] = []
    private stdioClients = new Map<string, StdioMcpClient>()
    private httpClients = new Map<string, HttpMcpClient>()

    setServerConfigs(configs: McpServerConfig[]) {
        this.configs = Array.isArray(configs) ? configs : []
        this.resetClients()
    }

    async listTools(configsOverride?: McpServerConfig[]): Promise<McpListToolsResult> {
        if (configsOverride) {
            this.setServerConfigs(configsOverride)
        }

        const tools: McpToolDefinition[] = []
        const servers: McpServerStatus[] = []

        for (const config of this.configs) {
            if (!config.enabled) {
                servers.push({
                    id: config.id,
                    name: config.name,
                    enabled: false,
                    status: 'disabled'
                })
                continue
            }

            try {
                const client = this.getClient(config)
                const result = await client.request('tools/list', {}, config.timeoutMs)
                const list = Array.isArray(result?.tools) ? result.tools : []
                for (const tool of list) {
                    tools.push(this.mapToolDefinition(config, tool))
                }
                servers.push({
                    id: config.id,
                    name: config.name,
                    enabled: true,
                    status: 'ready',
                    toolCount: list.length
                })
            } catch (error) {
                servers.push({
                    id: config.id,
                    name: config.name,
                    enabled: true,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'MCP connection failed'
                })
            }
        }

        return { tools, servers }
    }

    async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
        const parsed = parseMcpToolName(toolName)
        if (!parsed) {
            return {
                success: false,
                error: `Invalid MCP tool name: ${toolName}`
            }
        }

        const config = this.configs.find((item) => item.name === parsed.serverName)
        if (!config || !config.enabled) {
            return {
                success: false,
                error: `MCP server not found or disabled: ${parsed.serverName}`
            }
        }

        try {
            const client = this.getClient(config)
            const result = await client.request('tools/call', {
                name: parsed.toolName,
                arguments: args || {}
            }, config.timeoutMs)

            if (result?.isError) {
                const text = extractTextContent(result.content)
                return {
                    success: false,
                    error: text || 'MCP tool returned an error'
                }
            }

            return {
                success: true,
                data: result
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'MCP tool call failed'
            }
        }
    }

    private resetClients() {
        for (const client of this.stdioClients.values()) {
            client.close()
        }
        this.stdioClients.clear()
        this.httpClients.clear()
    }

    private getClient(config: McpServerConfig) {
        if (config.transport === 'http') {
            const existing = this.httpClients.get(config.id)
            if (existing) {
                existing.updateConfig(config)
                return existing
            }
            const client = new HttpMcpClient(config)
            this.httpClients.set(config.id, client)
            return client
        }

        const existing = this.stdioClients.get(config.id)
        if (existing) {
            existing.updateConfig(config)
            return existing
        }

        const client = new StdioMcpClient(config)
        this.stdioClients.set(config.id, client)
        return client
    }

    private mapToolDefinition(config: McpServerConfig, tool: any): McpToolDefinition {
        const name = tool?.name || 'unknown'
        const description = tool?.description || `MCP tool from ${config.name}`
        const inputSchema = tool?.inputSchema || tool?.input_schema

        return {
            name: formatMcpToolName(config.name, name),
            description,
            parameters: toToolParameters(inputSchema),
            requiresApproval: config.requiresApproval === true,
            category: 'utility'
        }
    }
}

export const mcpManager = new McpManager()
