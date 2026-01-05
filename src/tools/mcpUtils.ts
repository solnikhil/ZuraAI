const MCP_TOOL_PREFIX = 'mcp__'

export function isMcpToolName(name: string): boolean {
    return name.startsWith(MCP_TOOL_PREFIX)
}

export function splitMcpToolName(name: string): { server: string; tool: string } | null {
    if (!isMcpToolName(name)) {
        return null
    }

    const parts = name.split('__')
    if (parts.length < 3) {
        return null
    }

    const server = parts[1]
    const tool = parts.slice(2).join('__')

    if (!server || !tool) {
        return null
    }

    return { server, tool }
}

export function formatToolDisplayName(name: string): string {
    const mcp = splitMcpToolName(name)
    if (mcp) {
        return `${mcp.server}: ${mcp.tool}`
    }
    return name.replace(/_/g, ' ')
}
