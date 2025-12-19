// Tool Types - Shared type definitions

export interface ToolResult {
    success: boolean
    data?: any
    error?: string
}

export type ToolHandler = (args: any) => Promise<ToolResult>

