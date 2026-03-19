import type {
  McpJsonRpcErrorObject,
  McpJsonRpcId,
  McpJsonRpcMessage,
  McpTransportType,
} from '../../../src/mcp/types'

export type McpTransportLifecycleState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'disconnected'
  | 'error'

export type McpTransportMessageHandler = (message: McpJsonRpcMessage) => void
export type McpTransportErrorHandler = (error: Error) => void
export type McpTransportCloseHandler = () => void
export type McpTransportStateHandler = (state: McpTransportLifecycleState) => void

export interface McpTransportErrorContext {
  operation: 'connect' | 'disconnect' | 'send' | 'receive' | 'timeout' | 'internal'
  transportType: McpTransportType
  cause?: unknown
  timeoutMs?: number
  details?: Record<string, unknown>
}

export class McpTransportError extends Error {
  readonly context: McpTransportErrorContext

  constructor(message: string, context: McpTransportErrorContext) {
    super(message)
    this.name = 'McpTransportError'
    this.context = context
  }
}

export interface McpTransportTimeoutOptions {
  timeoutMs: number
  operation: McpTransportErrorContext['operation']
  message: string
  details?: Record<string, unknown>
}

export interface McpTransport {
  readonly type: McpTransportType

  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  getState(): McpTransportLifecycleState

  send(message: McpJsonRpcMessage): Promise<void>

  onMessage(handler: McpTransportMessageHandler): () => void
  onError(handler: McpTransportErrorHandler): () => void
  onClose(handler: McpTransportCloseHandler): () => void
  onStateChange(handler: McpTransportStateHandler): () => void

  getLastError(): Error | null
}

type HandlerSet<T> = Set<T>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isMcpJsonRpcMessage(value: unknown): value is McpJsonRpcMessage {
  if (!isRecord(value) || value.jsonrpc !== '2.0') {
    return false
  }

  const hasMethod = typeof value.method === 'string' && value.method.trim().length > 0
  const hasId = typeof value.id === 'string' || typeof value.id === 'number'
  const hasResult = 'result' in value
  const hasError = isMcpJsonRpcErrorObject((value as Record<string, unknown>).error)

  if (hasMethod) {
    if (hasResult || 'error' in value) {
      return false
    }

    return !('id' in value) || hasId
  }

  if (hasError) {
    return !hasResult && (value.id === null || hasId)
  }

  return hasId && hasResult
}

export function isMcpJsonRpcErrorObject(value: unknown): value is McpJsonRpcErrorObject {
  return (
    isRecord(value) &&
    typeof value.code === 'number' &&
    Number.isFinite(value.code) &&
    typeof value.message === 'string'
  )
}

export function isMcpJsonRpcResponse(
  value: McpJsonRpcMessage
): value is Extract<McpJsonRpcMessage, { id: McpJsonRpcId | null }> {
  return 'id' in value && !('method' in value)
}

export function serializeMcpMessage(message: McpJsonRpcMessage): string {
  return JSON.stringify(message)
}

export function serializeMcpMessageLine(message: McpJsonRpcMessage): string {
  return `${serializeMcpMessage(message)}\n`
}

export function parseMcpMessage(raw: string): McpJsonRpcMessage {
  const parsed = JSON.parse(raw) as unknown
  if (!isMcpJsonRpcMessage(parsed)) {
    throw new Error('Received invalid MCP JSON-RPC message')
  }

  return parsed
}

export function splitMcpMessageLines(chunk: string): { messages: string[]; remainder: string } {
  const normalizedChunk = chunk.replace(/\r\n/g, '\n')
  const segments = normalizedChunk.split('\n')
  const remainder = segments.pop() ?? ''

  return {
    messages: segments.map((segment) => segment.trim()).filter(Boolean),
    remainder,
  }
}

export function toMcpTransportError(
  transportType: McpTransportType,
  operation: McpTransportErrorContext['operation'],
  message: string,
  cause?: unknown,
  extra: Omit<McpTransportErrorContext, 'operation' | 'transportType' | 'cause'> = {}
): McpTransportError {
  if (cause instanceof McpTransportError) {
    return cause
  }

  return new McpTransportError(message, {
    operation,
    transportType,
    cause,
    ...extra,
  })
}

export abstract class BaseMcpTransport implements McpTransport {
  readonly type: McpTransportType

  private state: McpTransportLifecycleState = 'idle'
  private lastError: Error | null = null
  private readonly messageHandlers: HandlerSet<McpTransportMessageHandler> = new Set()
  private readonly errorHandlers: HandlerSet<McpTransportErrorHandler> = new Set()
  private readonly closeHandlers: HandlerSet<McpTransportCloseHandler> = new Set()
  private readonly stateHandlers: HandlerSet<McpTransportStateHandler> = new Set()

  protected constructor(type: McpTransportType) {
    this.type = type
  }

  async connect(): Promise<void> {
    if (this.state === 'connected') {
      return
    }

    if (this.state === 'connecting') {
      throw this.createError('connect', 'Transport is already connecting')
    }

    if (this.state === 'disconnecting') {
      throw this.createError('connect', 'Transport cannot connect while disconnecting')
    }

    this.setState('connecting')
    this.lastError = null

    try {
      await this.performConnect()
      this.setState('connected')
    } catch (error) {
      const transportError = this.createError('connect', 'Transport connect failed', error)
      this.lastError = transportError
      this.setState('error')
      this.emitError(transportError)
      throw transportError
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected' || this.state === 'idle') {
      this.setState('disconnected')
      return
    }

    if (this.state === 'disconnecting') {
      return
    }

    this.setState('disconnecting')

    try {
      await this.performDisconnect()
    } catch (error) {
      const transportError = this.createError('disconnect', 'Transport disconnect failed', error)
      this.lastError = transportError
      this.setState('error')
      this.emitError(transportError)
      throw transportError
    }

    this.setState('disconnected')
    this.emitClose()
  }

  isConnected(): boolean {
    return this.state === 'connected'
  }

  getState(): McpTransportLifecycleState {
    return this.state
  }

  async send(message: McpJsonRpcMessage): Promise<void> {
    if (!this.isConnected()) {
      throw this.createError('send', 'Transport is not connected')
    }

    try {
      await this.performSend(message)
    } catch (error) {
      const transportError = this.createError('send', 'Transport send failed', error)
      this.lastError = transportError
      this.emitError(transportError)
      throw transportError
    }
  }

  onMessage(handler: McpTransportMessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  onError(handler: McpTransportErrorHandler): () => void {
    this.errorHandlers.add(handler)
    return () => {
      this.errorHandlers.delete(handler)
    }
  }

  onClose(handler: McpTransportCloseHandler): () => void {
    this.closeHandlers.add(handler)
    return () => {
      this.closeHandlers.delete(handler)
    }
  }

  onStateChange(handler: McpTransportStateHandler): () => void {
    this.stateHandlers.add(handler)
    return () => {
      this.stateHandlers.delete(handler)
    }
  }

  getLastError(): Error | null {
    return this.lastError
  }

  protected abstract performConnect(): Promise<void>
  protected abstract performDisconnect(): Promise<void>
  protected abstract performSend(message: McpJsonRpcMessage): Promise<void>

  protected emitMessage(message: McpJsonRpcMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message)
    }
  }

  protected emitError(error: Error): void {
    this.lastError = error
    for (const handler of this.errorHandlers) {
      handler(error)
    }
  }

  protected emitClose(): void {
    for (const handler of this.closeHandlers) {
      handler()
    }
  }

  protected handleIncomingRawMessage(raw: string): void {
    try {
      const message = parseMcpMessage(raw)
      this.emitMessage(message)
    } catch (error) {
      this.emitError(
        this.createError('receive', 'Failed to parse incoming transport message', error)
      )
    }
  }

  protected async withTimeout<T>(
    operation: () => Promise<T>,
    options: McpTransportTimeoutOptions
  ): Promise<T> {
    const { timeoutMs, operation: operationName, message, details } = options

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return operation()
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              this.createError('timeout', message, undefined, {
                timeoutMs,
                details: {
                  ...details,
                  timedOutOperation: operationName,
                },
              })
            )
          }, timeoutMs)
        }),
      ])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  protected createError(
    operation: McpTransportErrorContext['operation'],
    message: string,
    cause?: unknown,
    extra: Omit<McpTransportErrorContext, 'operation' | 'transportType' | 'cause'> = {}
  ): McpTransportError {
    return toMcpTransportError(this.type, operation, message, cause, extra)
  }

  protected markDisconnectedFromRemote(cause?: unknown): void {
    if (cause) {
      this.emitError(this.createError('internal', 'Transport closed unexpectedly', cause))
    }

    this.setState('disconnected')
    this.emitClose()
  }

  private setState(nextState: McpTransportLifecycleState): void {
    if (this.state === nextState) {
      return
    }

    this.state = nextState
    for (const handler of this.stateHandlers) {
      handler(nextState)
    }
  }
}
