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

export interface SseMcpTransportOptions extends McpRemoteTransportBaseOptions {
  url: string
  headers?: Record<string, string>
}

export class SseMcpTransport extends BaseMcpTransport {
  readonly url: URL
  readonly headers: Record<string, string>
  readonly reconnectPolicy: McpReconnectPolicy

  private readonly featureEnabled: boolean

  constructor(options: SseMcpTransportOptions) {
    super('sse')

    this.url = validateMcpRemoteUrl(options.url, 'sse', ['http:', 'https:'])
    this.headers = { ...(options.headers ?? {}) }
    this.reconnectPolicy = normalizeMcpReconnectPolicy(options.reconnectPolicy)
    this.featureEnabled = isExperimentalRemoteTransportEnabled(options.featureEnabled)
  }

  protected override async performConnect(): Promise<void> {
    if (!this.featureEnabled) {
      throw this.createError('connect', 'Experimental MCP SSE transport is disabled', undefined, {
        details: {
          featureFlag: MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV,
          url: this.url.toString(),
          reconnectPolicy: this.reconnectPolicy,
        },
      })
    }

    throw this.createError('connect', 'MCP SSE transport is not implemented yet', undefined, {
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
    throw this.createError('send', 'MCP SSE transport send is unavailable until the transport is implemented')
  }
}
