// Tool Types - Shared type definitions

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export type ToolHandler = (args: unknown) => Promise<ToolResult>
