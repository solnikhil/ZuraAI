import type { McpJsonRpcMessage } from '../../../src/mcp/types'

import { BaseMcpTransport } from './base'
import {
  MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV,
  type McpReconnectPolicy,
  type McpRemoteTransportBaseOptions,
  isExperimentalRemoteTransportEnabled,
  normalizeMcpReconnectPolicy,
  validateMcpRemoteUrl,
} from './remote'

export interface WebSocketMcpTransportOptions extends McpRemoteTransportBaseOptions {
  url: string
  headers?: Record<string, string>
}

export class WebSocketMcpTransport extends BaseMcpTransport {
  readonly url: URL
  readonly headers: Record<string, string>
  readonly reconnectPolicy: McpReconnectPolicy

  private readonly featureEnabled: boolean

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
            url: this.url.toString(),
            reconnectPolicy: this.reconnectPolicy,
          },
        }
      )
    }

    throw this.createError('connect', 'MCP WebSocket transport is not implemented yet', undefined, {
      details: {
        url: this.url.toString(),
        reconnectPolicy: this.reconnectPolicy,
      },
    })
  }

  protected override async performDisconnect(): Promise<void> {
    return Promise.resolve()
  }

  protected override async performSend(_message: McpJsonRpcMessage): Promise<void> {
    throw this.createError(
      'send',
      'MCP WebSocket transport send is unavailable until the transport is implemented'
    )
  }
}
