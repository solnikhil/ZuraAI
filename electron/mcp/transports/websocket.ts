import type { McpJsonRpcMessage } from '../../../src/mcp/types'

import { WebSocket } from 'ws'

import { BaseMcpTransport, serializeMcpMessage } from './base'
import {
  MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV,
  type McpReconnectPolicy,
  type McpRemoteTransportBaseOptions,
  connectWithRetry,
  isExperimentalRemoteTransportEnabled,
  normalizeMcpReconnectPolicy,
  summarizeMcpRemoteTarget,
  validateMcpRemoteUrl,
} from './remote'

const DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS = 15000
const DEFAULT_WEBSOCKET_CLOSE_TIMEOUT_MS = 5000
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000
const DEFAULT_PONG_TIMEOUT_MS = 10000

export interface WebSocketMcpTransportOptions extends McpRemoteTransportBaseOptions {
  url: string
  headers?: Record<string, string>
}

export class WebSocketMcpTransport extends BaseMcpTransport {
  readonly url: URL
  readonly headers: Record<string, string>
  readonly reconnectPolicy: McpReconnectPolicy

  private readonly featureEnabled: boolean

  private socket: WebSocket | null = null
  private closedByUser = false
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null
  private pongTimeoutId: ReturnType<typeof setTimeout> | null = null
  private awaitingPong = false
  private lastCloseCode: number | null = null
  private lastCloseReason = ''

  constructor(options: WebSocketMcpTransportOptions) {
    super('websocket')

    this.url = validateMcpRemoteUrl(options.url, 'websocket', ['ws:', 'wss:'])
    this.headers = { ...(options.headers ?? {}) }
    this.reconnectPolicy = normalizeMcpReconnectPolicy(options.reconnectPolicy)
    this.featureEnabled = isExperimentalRemoteTransportEnabled(options.featureEnabled)
  }

  protected override async performConnect(): Promise<void> {
    if (!this.featureEnabled) {
      throw this.createError(
        'connect',
        'Experimental MCP WebSocket transport is disabled',
        undefined,
        {
          details: {
            featureFlag: MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV,
            ...summarizeMcpRemoteTarget(this.url, this.headers),
            reconnectPolicy: this.reconnectPolicy,
          },
        }
      )
    }

    this.closedByUser = false

    const lastError = await connectWithRetry(this.reconnectPolicy, () => this.connectSocket())
    if (lastError) {
      throw this.createError('connect', 'Failed to establish MCP WebSocket connection', lastError, {
        details: {
          ...summarizeMcpRemoteTarget(this.url, this.headers),
          reconnectPolicy: this.reconnectPolicy,
        },
      })
    }
  }

  protected override async performDisconnect(): Promise<void> {
    this.closedByUser = true
    this.stopHeartbeat()

    const socket = this.socket
    if (!socket) {
      return
    }

    await this.withTimeout(
      () =>
        new Promise<void>((resolve) => {
          const cleanup = () => {
            socket.off('close', handleClose)
            socket.off('error', handleError)
          }
          const handleClose = () => {
            cleanup()
            resolve()
          }
          const handleError = () => {
            cleanup()
            resolve()
          }

          socket.once('close', handleClose)
          socket.once('error', handleError)

          if (socket.readyState === WebSocket.CLOSED) {
            cleanup()
            resolve()
            return
          }

          socket.close(1000, 'Client disconnect')
        }),
      {
        timeoutMs: DEFAULT_WEBSOCKET_CLOSE_TIMEOUT_MS,
        operation: 'disconnect',
        message: 'Timed out closing MCP WebSocket connection',
        details: {
          url: this.url.toString(),
        },
      }
    )

    this.socket = null
  }

  protected override async performSend(message: McpJsonRpcMessage): Promise<void> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw this.createError('send', 'MCP WebSocket is not open', undefined, {
        details: {
          url: this.url.toString(),
          readyState: socket?.readyState,
        },
      })
    }

    await new Promise<void>((resolve, reject) => {
      socket.send(serializeMcpMessage(message), (error?: Error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private async connectSocket(): Promise<void> {
    this.stopHeartbeat()
    this.socket?.removeAllListeners()
    this.socket = null

    const socket = await this.withTimeout(
      () =>
        new Promise<WebSocket>((resolve, reject) => {
          const nextSocket = new WebSocket(this.url, {
            headers: this.headers,
          })

          const cleanup = () => {
            nextSocket.off('open', handleOpen)
            nextSocket.off('error', handleError)
            nextSocket.off('unexpected-response', handleUnexpectedResponse)
          }
          const handleOpen = () => {
            cleanup()
            resolve(nextSocket)
          }
          const handleError = (error: Error) => {
            cleanup()
            reject(error)
          }
          const handleUnexpectedResponse = (
            _request: unknown,
            response: { statusCode?: number; statusMessage?: string }
          ) => {
            cleanup()
            reject(
              new Error(
                `Unexpected WebSocket response: ${response.statusCode ?? 'unknown'} ${response.statusMessage ?? ''}`.trim()
              )
            )
          }

          nextSocket.once('open', handleOpen)
          nextSocket.once('error', handleError)
          nextSocket.once('unexpected-response', handleUnexpectedResponse)
        }),
      {
        timeoutMs: DEFAULT_WEBSOCKET_CONNECT_TIMEOUT_MS,
        operation: 'connect',
        message: 'Timed out opening MCP WebSocket connection',
        details: summarizeMcpRemoteTarget(this.url, this.headers),
      }
    )

    this.socket = socket
    socket.on('message', (data: WebSocket.RawData) => {
      const payload = typeof data === 'string' ? data : data.toString('utf8')
      this.handleIncomingRawMessage(payload)
    })
    socket.on('pong', () => {
      this.awaitingPong = false
      if (this.pongTimeoutId) {
        clearTimeout(this.pongTimeoutId)
        this.pongTimeoutId = null
      }
    })
    socket.on('close', (code: number, reason: Buffer) => {
      this.lastCloseCode = code
      this.lastCloseReason = reason.toString('utf8')
      this.stopHeartbeat()
      this.socket = null

      if (!this.closedByUser) {
        this.markDisconnectedFromRemote(
          new Error(
            `MCP WebSocket closed (code: ${code}, reason: ${this.lastCloseReason || 'no reason provided'})`
          )
        )
      }
    })
    socket.on('error', (error: Error) => {
      this.emitError(
        this.createError('receive', 'MCP WebSocket transport error', error, {
          details: {
            ...summarizeMcpRemoteTarget(this.url, this.headers),
            lastCloseCode: this.lastCloseCode,
            lastCloseReason: this.lastCloseReason,
          },
        })
      )
    })

    this.startHeartbeat(socket)
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat()
    this.heartbeatIntervalId = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return
      }

      if (this.awaitingPong) {
        socket.terminate()
        return
      }

      this.awaitingPong = true
      socket.ping()
      this.pongTimeoutId = setTimeout(() => {
        if (this.awaitingPong) {
          socket.terminate()
        }
      }, DEFAULT_PONG_TIMEOUT_MS)
    }, DEFAULT_HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    this.awaitingPong = false
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId)
      this.heartbeatIntervalId = null
    }
    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId)
      this.pongTimeoutId = null
    }
  }
}
