import { getToolByName } from '../definitions'
import type { OpenRouterResponse, OpenRouterToolCall, ToolCall } from '../types'

export interface ToolCallFallbackContext {
  lastUserMessage?: string
  reasoning?: string
}

function isJsonComplete(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.length === 0) return false

  let depth = 0
  let inString = false
  let escapeNext = false

  for (const char of trimmed) {
    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{' || char === '[') depth++
      if (char === '}' || char === ']') depth--
    }
  }

  return depth === 0 && !inString
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '').trim()
}

function wrapPrimitiveArgs(toolName: string, value: unknown): Record<string, unknown> | null {
  const toolDef = getToolByName(toolName)
  if (!toolDef) return null

  const requiredParams = toolDef.parameters.required || []
  if (requiredParams.length !== 1) return null

  return { [requiredParams[0]]: value }
}

function extractFallbackArgs(toolName: string, rawArgs: string): Record<string, unknown> | null {
  const toolDef = getToolByName(toolName)
  if (!toolDef) return null

  const requiredParams = toolDef.parameters.required || []
  if (requiredParams.length !== 1) return null

  const key = requiredParams[0]
  const trimmed = rawArgs.trim()
  if (!trimmed) return null

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const keyPattern = escapeRegExp(key)
    const bareMatch = trimmed.match(new RegExp(`^${keyPattern}\\s*[:=]\\s*(.+)$`, 'i'))
    if (bareMatch?.[1]?.trim()) {
      const value = stripOuterQuotes(bareMatch[1].trim())
      return value ? { [key]: value } : null
    }

    const value = stripOuterQuotes(trimmed)
    return value ? { [key]: value } : null
  }

  const keyPattern = escapeRegExp(key)
  const quotedMatch = trimmed.match(
    new RegExp(`["']${keyPattern}["']\\s*:\\s*["']([^"']*)`, 'i')
  )
  if (quotedMatch?.[1]?.trim()) {
    return { [key]: quotedMatch[1].trim() }
  }

  const unquotedMatch = trimmed.match(new RegExp(`${keyPattern}\\s*:\\s*([^,}\\n]+)`, 'i'))
  if (unquotedMatch?.[1]?.trim()) {
    const value = stripOuterQuotes(unquotedMatch[1].trim())
    return value ? { [key]: value } : null
  }

  return null
}

function normalizeParsedArgs(toolName: string, parsed: unknown): Record<string, unknown> | null {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }

  return wrapPrimitiveArgs(toolName, parsed)
}

function getSyntheticErrorArgs(toolName: string): Record<string, unknown> {
  const toolDef = getToolByName(toolName)
  if (!toolDef?.parameters?.required?.length) {
    return {}
  }

  return Object.fromEntries(toolDef.parameters.required.map((param) => [param, '']))
}

function extractFallbackQuery(
  toolName: string,
  fallbackContext?: ToolCallFallbackContext | null
): string | null {
  if (toolName !== 'web_search' || !fallbackContext) return null

  const { lastUserMessage, reasoning } = fallbackContext

  if (lastUserMessage && typeof lastUserMessage === 'string') {
    const trimmed = lastUserMessage.trim()
    if (trimmed.length > 0) {
      return trimmed.length > 300 ? trimmed.slice(0, 300) : trimmed
    }
  }

  if (reasoning && typeof reasoning === 'string') {
    const patterns = [
      /search\s+for\s+['"]([^'"]+)['"]/i,
      /search\s+for\s+(\S[^.]{2,80}?)(?:\s|\.|$)/i,
      /web\s+search[:\s]+['"]?([^'"]+)['"]?/i,
      /look\s+up\s+['"]?([^'".]+)['"]?/i,
      /search\s+['"]?([^'"]+)['"]?\s+(?:to|for)/i,
      /query\s*[=:]\s*['"]?([^'"]+)['"]?/i,
      /["']([^"']{3,100})["']\s+(?:to\s+)?search/i,
    ]

    for (const pattern of patterns) {
      const match = reasoning.match(pattern)
      if (match?.[1]?.trim()) {
        return match[1].trim().slice(0, 300)
      }
    }
  }

  return null
}

function tryRepairIncompleteJson(str: string): string | null {
  const trimmed = str.trim()
  if (!trimmed || trimmed.length < 2) return null

  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let escapeNext = false
  let inStringChar = ''

  for (const char of trimmed) {
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === '\\') {
      escapeNext = true
      continue
    }
    if ((char === '"' || char === "'") && !inString) {
      inString = true
      inStringChar = char
      continue
    }
    if (char === inStringChar) {
      inString = false
      continue
    }
    if (!inString) {
      if (char === '{') openBraces++
      if (char === '}') openBraces--
      if (char === '[') openBrackets++
      if (char === ']') openBrackets--
    }
  }

  if (openBraces <= 0 && openBrackets <= 0 && !inString) return null

  let suffix = ''
  if (inString) suffix += inStringChar
  suffix += ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))
  return trimmed + suffix
}

function parseToolArguments(toolName: string, rawArgs: string): Record<string, unknown> | null {
  const argsStr = rawArgs?.trim() || ''
  if (!argsStr) return null

  if (isJsonComplete(argsStr)) {
    try {
      const parsed = JSON.parse(argsStr)
      const normalized = normalizeParsedArgs(toolName, parsed)
      if (normalized) {
        return normalized
      }
    } catch (error) {
      console.warn('[openrouter] Failed to parse tool arguments, falling back:', {
        tool: toolName,
        error: error instanceof Error ? error.message : String(error),
        args: argsStr.slice(0, 200),
      })
    }

    return extractFallbackArgs(toolName, argsStr)
  }

  const repaired = tryRepairIncompleteJson(argsStr)
  if (repaired) {
    try {
      const parsed = JSON.parse(repaired)
      const normalized = normalizeParsedArgs(toolName, parsed)
      if (normalized) {
        return normalized
      }
    } catch {
      /* fall through to extractFallbackArgs */
    }
  }

  const fallback = extractFallbackArgs(toolName, argsStr)
  if (fallback) {
    console.info('[openrouter] Incomplete JSON for tool call, recovered via fallback:', {
      tool: toolName,
      argsPreview: argsStr.slice(0, 80),
    })
  } else {
    console.warn('[openrouter] Incomplete JSON for tool call, fallback failed:', {
      tool: toolName,
      argsLength: argsStr.length,
      argsPreview: argsStr.slice(0, 100),
    })
  }

  return fallback
}

export function parseOpenRouterToolCalls(
  response: OpenRouterResponse & { _fallbackContext?: ToolCallFallbackContext }
): ToolCall[] {
  const message = response.choices?.[0]?.message

  if (!message?.tool_calls || message.tool_calls.length === 0) {
    return []
  }

  const fallbackContext = response._fallbackContext
  const toolCalls: ToolCall[] = []

  message.tool_calls.forEach((toolCall: OpenRouterToolCall) => {
    const rawArgs = toolCall.function.arguments || ''
    let args = parseToolArguments(toolCall.function.name, rawArgs)

    if (!args) {
      let fallbackQuery = extractFallbackQuery(toolCall.function.name, fallbackContext)
      if (!fallbackQuery && toolCall.function.name === 'web_search' && rawArgs.trim().length > 0) {
        const match =
          rawArgs.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"?/i) ??
          rawArgs.match(/"query"\s*:\s*"([^"]*)/i)
        const extracted = match?.[1]?.trim()
        if (extracted && extracted.length > 0) {
          fallbackQuery = extracted.replace(/\\(.)/g, '$1')
        }
      }

      if (fallbackQuery) {
        args = { query: fallbackQuery }
        console.info('[openrouter] Empty args for web_search, used fallback from context:', {
          query: fallbackQuery.slice(0, 60) + (fallbackQuery.length > 60 ? '...' : ''),
        })
      } else {
        console.warn(
          '[openrouter] Tool call had empty/invalid arguments, using synthetic error args so model receives a result:',
          {
            tool: toolCall.function.name,
            argsLength: rawArgs.length,
            argsPreview: rawArgs.slice(0, 100),
          }
        )
        args = getSyntheticErrorArgs(toolCall.function.name)
      }
    }

    toolCalls.push({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: args,
    })
  })

  return toolCalls
}

export function hasToolCalls(response: OpenRouterResponse): boolean {
  const message = response.choices?.[0]?.message
  return Boolean(message?.tool_calls && message.tool_calls.length > 0)
}
