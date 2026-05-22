import type { ServiceAssistantMessage } from '../services/types'
import type { ToolCallResult } from '../tools/types'
import type {
  ChatDiagnosticEvent,
  ChatDiagnosticMessageSummary,
  ChatDiagnosticToolSummary,
} from './chatDiagnostics'

const MESSAGE_PREVIEW_LIMIT = 180

function textPreview(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > MESSAGE_PREVIEW_LIMIT
    ? `${normalized.slice(0, MESSAGE_PREVIEW_LIMIT)}...[truncated]`
    : normalized
}

export function summarizeDiagnosticMessages(
  messages: Array<ServiceAssistantMessage & { images?: string[]; thinking?: string }>
): ChatDiagnosticMessageSummary[] {
  return messages.map((message) => {
    if (typeof message.content === 'string') {
      return {
        role: message.role,
        contentType: message.content ? 'text' : 'empty',
        textLength: message.content.length,
        textPreview: textPreview(message.content),
      }
    }

    const text = message.content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text || '')
      .join('\n')

    return {
      role: message.role,
      contentType: message.content.length > 0 ? 'parts' : 'empty',
      textLength: text.length,
      textPreview: textPreview(text),
      partTypes: message.content.map((part) => part.type),
    }
  })
}

export function summarizeDiagnosticToolResult(result: ToolCallResult): ChatDiagnosticToolSummary {
  return {
    id: result.toolCall.id,
    name: result.toolCall.name,
    arguments: result.toolCall.arguments,
    success: result.result.success,
    executionTime: result.result.executionTime,
    origin: result.result.metadata?.origin,
    error: result.result.error,
  }
}

export function appendChatDiagnosticEvent(event: ChatDiagnosticEvent): void {
  if (!import.meta.env.DEV) return
  if (!window.ipcRenderer?.invoke) return

  void window.ipcRenderer.invoke('chat-diagnostics:append-event', event).catch((error) => {
    console.warn('[chat-diagnostics] failed to append event', error)
  })
}
