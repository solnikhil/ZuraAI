// Tool Types - Shared type definitions

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ToolHandlerContext {
  senderWebContentsId: number
  /** Opaque chat-run identity supplied outside model-visible tool arguments. */
  runId?: string
  /** Main-owned cancellation signal for this run. Handlers should stop promptly when supported. */
  signal?: AbortSignal
  sendToRenderer?: (
    channel: 'background-window:run-stopped',
    payload: {
      runId: string
      reason: 'stop-and-release' | 'stop-task' | 'target-lost' | 'overlay-failed'
    }
  ) => void
}

export type ToolHandler = (args: unknown, context?: ToolHandlerContext) => Promise<ToolResult>
