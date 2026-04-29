import type { McpJsonRpcMessage } from '../../../src/mcp/types'

import { BaseMcpTransport, serializeMcpMessage } from './base'
import {
  MCP_EXPERIMENTAL_REMOTE_TRANSPORTS_ENV,
  type McpReconnectPolicy,
  type McpRemoteTransportBaseOptions,
  connectWithRetry,
  isExperimentalRemoteTransportEnabled,
  isRetryableHttpStatus,
  normalizeMcpReconnectPolicy,
  resolveValidatedMcpRemoteUrl,
  summarizeMcpRemoteTarget,
  validateMcpRemoteUrl,
} from './remote'

const DEFAULT_SSE_CONNECT_TIMEOUT_MS = 15000
const DEFAULT_SSE_SEND_TIMEOUT_MS = 15000

export interface SseMcpTransportOptions extends McpRemoteTransportBaseOptions {
  url: string
  headers?: Record<string, string>
}

export class SseMcpTransport extends BaseMcpTransport {
  readonly url: URL
  readonly headers: Record<string, string>
  readonly reconnectPolicy: McpReconnectPolicy

  private readonly featureEnabled: boolean

  private activeStreamAbortController: AbortController | null = null
  private readonly pendingSendControllers = new Set<AbortController>()
  private streamPromise: Promise<void> | null = null
  private messageEndpoint: URL | null = null
  private closedByUser = false

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
          ...summarizeMcpRemoteTarget(this.url, this.headers),
          reconnectPolicy: this.reconnectPolicy,
        },
      })
    }

    this.closedByUser = false
    this.messageEndpoint = this.url

    const lastError = await connectWithRetry(this.reconnectPolicy, () => this.openStream())
    if (lastError) {
      throw this.createError('connect', 'Failed to establish MCP SSE stream', lastError, {
        details: {
          ...summarizeMcpRemoteTarget(this.url, this.headers),
          reconnectPolicy: this.reconnectPolicy,
        },
      })
    }
  }

  protected override async performDisconnect(): Promise<void> {
    this.closedByUser = true

    for (const controller of this.pendingSendControllers) {
      controller.abort()
    }
    this.pendingSendControllers.clear()

    this.activeStreamAbortController?.abort()

    try {
      await this.streamPromise?.catch(() => undefined)
    } finally {
      this.activeStreamAbortController = null
      this.streamPromise = null
      this.messageEndpoint = this.url
    }
  }

  protected override async performSend(message: McpJsonRpcMessage): Promise<void> {
    const endpoint = this.messageEndpoint ?? this.url
    const controller = new AbortController()
    this.pendingSendControllers.add(controller)

    try {
      const response = await this.withTimeout(
        async () =>
          fetch(endpoint, {
            method: 'POST',
            headers: {
              accept: 'application/json, text/plain, */*',
              'content-type': 'application/json',
              ...this.headers,
            },
            body: serializeMcpMessage(message),
            signal: controller.signal,
          }),
        {
          timeoutMs: DEFAULT_SSE_SEND_TIMEOUT_MS,
          operation: 'send',
          message: 'Timed out sending MCP SSE request',
          details: {
            endpoint: endpoint.toString(),
          },
        }
      )

      if (!response.ok) {
        const responseText = await safeReadResponseText(response)
        throw this.createError('send', `MCP SSE POST failed with ${response.status} ${response.statusText}`, undefined, {
          details: {
            endpoint: endpoint.toString(),
            status: response.status,
            statusText: response.statusText,
            retryable: isRetryableHttpStatus(response.status),
            bodyPreview: responseText,
          },
        })
      }
    } finally {
      this.pendingSendControllers.delete(controller)
    }
  }

  private async openStream(): Promise<void> {
    this.activeStreamAbortController?.abort()
    const controller = new AbortController()
    this.activeStreamAbortController = controller

    const response = await this.withTimeout(
      async () =>
        fetch(this.url, {
          method: 'GET',
          headers: {
            accept: 'text/event-stream',
            'cache-control': 'no-cache',
            ...this.headers,
          },
          signal: controller.signal,
        }),
      {
        timeoutMs: DEFAULT_SSE_CONNECT_TIMEOUT_MS,
        operation: 'connect',
        message: 'Timed out opening MCP SSE stream',
        details: summarizeMcpRemoteTarget(this.url, this.headers),
      }
    )

    if (!response.ok) {
      const responseText = await safeReadResponseText(response)
      throw this.createError('connect', `MCP SSE stream failed with ${response.status} ${response.statusText}`, undefined, {
        details: {
          ...summarizeMcpRemoteTarget(this.url, this.headers),
          status: response.status,
          statusText: response.statusText,
          retryable: isRetryableHttpStatus(response.status),
          bodyPreview: responseText,
        },
      })
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('text/event-stream')) {
      throw this.createError('connect', 'MCP SSE endpoint did not return an event stream', undefined, {
        details: {
          ...summarizeMcpRemoteTarget(this.url, this.headers),
          contentType,
        },
      })
    }

    if (!response.body) {
      throw this.createError('connect', 'MCP SSE response body was empty', undefined, {
        details: summarizeMcpRemoteTarget(this.url, this.headers),
      })
    }

    this.streamPromise = this.consumeStream(response.body, controller)
  }

  private async consumeStream(body: ReadableStream<Uint8Array>, controller: AbortController): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const processed = consumeSseBuffer(buffer, (event) => this.handleSseEvent(event))
        buffer = processed
      }

      buffer += decoder.decode()
      consumeSseBuffer(buffer, (event) => this.handleSseEvent(event), true)

      if (!this.closedByUser && !controller.signal.aborted) {
        this.markDisconnectedFromRemote(new Error('MCP SSE stream ended unexpectedly'))
      }
    } catch (error) {
      if (this.closedByUser || controller.signal.aborted) {
        return
      }

      this.markDisconnectedFromRemote(error)
    } finally {
      reader.releaseLock()
      if (this.activeStreamAbortController === controller) {
        this.activeStreamAbortController = null
        this.streamPromise = null
      }
    }
  }

  private handleSseEvent(event: SseEvent): void {
    const eventType = event.event || 'message'
    const payload = event.data.trim()
    if (!payload) {
      return
    }

    if (eventType === 'endpoint') {
      try {
        this.messageEndpoint = resolveValidatedMcpRemoteUrl(payload, this.url, 'sse', ['http:', 'https:'], {
          requireSameOrigin: true,
        })
      } catch (error) {
        this.markDisconnectedFromRemote(
          this.createError('receive', 'MCP SSE endpoint event was invalid', error, {
            details: {
              streamUrl: this.url.toString(),
              endpoint: payload,
            },
          })
        )
      }
      return
    }

    if (eventType === 'message' || eventType === 'jsonrpc') {
      this.handleIncomingRawMessage(payload)
    }
  }
}

interface SseEvent {
  event?: string
  data: string
}

function consumeSseBuffer(
  buffer: string,
  onEvent: (event: SseEvent) => void,
  flushRemainder = false
): string {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const separator = '\n\n'
  let remainder = normalized

  while (true) {
    const separatorIndex = remainder.indexOf(separator)
    if (separatorIndex === -1) {
      break
    }

    const rawEvent = remainder.slice(0, separatorIndex)
    remainder = remainder.slice(separatorIndex + separator.length)
    emitParsedSseEvent(rawEvent, onEvent)
  }

  if (flushRemainder && remainder.trim()) {
    emitParsedSseEvent(remainder, onEvent)
    return ''
  }

  return remainder
}

function emitParsedSseEvent(rawEvent: string, onEvent: (event: SseEvent) => void): void {
  let eventName: string | undefined
  const dataLines: string[] = []

  for (const line of rawEvent.split('\n')) {
    if (!line || line.startsWith(':')) {
      continue
    }

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line
    const value = separatorIndex >= 0 ? line.slice(separatorIndex + 1).replace(/^\s/, '') : ''

    if (field === 'event') {
      eventName = value
      continue
    }

    if (field === 'data') {
      dataLines.push(value)
    }
  }

  if (dataLines.length > 0) {
    onEvent({ event: eventName, data: dataLines.join('\n') })
  }
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.slice(0, 400)
  } catch {
    return ''
  }
}
