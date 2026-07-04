import type { McpPromptResult, McpResourceReadResult } from './types'

export function extractTextFromResourceRead(result: McpResourceReadResult): string | null {
  const textParts = result.contents
    .map((item) => (typeof item.text === 'string' && item.text.trim() ? item.text.trim() : null))
    .filter((item): item is string => item !== null)

  if (textParts.length === 0) {
    return null
  }

  return textParts.join('\n\n')
}

export function formatResourceForComposer(
  serverName: string,
  uri: string,
  result: McpResourceReadResult
): string | null {
  const extractedText = extractTextFromResourceRead(result)
  if (!extractedText) {
    return null
  }

  return `MCP resource from ${serverName}\nURI: ${uri}\n\n${extractedText}`
}

function flattenPromptResultText(result: McpPromptResult): string {
  return result.messages
    .map((message) => {
      const contentText = stringifyPromptContent(message.content)
      if (!contentText) {
        return null
      }

      return `${capitalizeLabel(message.role || 'message')}: ${contentText}`
    })
    .filter((message): message is string => Boolean(message))
    .join('\n\n')
}

export function formatPromptForComposer(
  serverName: string,
  promptName: string,
  result: McpPromptResult
): string {
  const body = flattenPromptResultText(result)
  return `MCP prompt from ${serverName}\nPrompt: ${promptName}\n\n${body}`.trim()
}

export function stringifyPromptContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (
          typeof item === 'object' &&
          item !== null &&
          'text' in item &&
          typeof item.text === 'string'
        ) {
          return item.text.trim()
        }

        try {
          return JSON.stringify(item, null, 2)
        } catch {
          return String(item)
        }
      })
      .filter(Boolean)
      .join('\n')
  }

  if (content == null) {
    return ''
  }

  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

function capitalizeLabel(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value
}
