interface ToolPresentation {
  isMcp: boolean
  toolLabel: string
  serverLabel?: string
  combinedLabel: string
}

function humanizeSlug(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getToolPresentation(toolName: string): ToolPresentation {
  const mcpMatch = /^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/i.exec(toolName)
  if (!mcpMatch) {
    const toolLabel = humanizeSlug(toolName)
    return {
      isMcp: false,
      toolLabel,
      combinedLabel: toolLabel,
    }
  }

  const [, serverSlug, toolSlug] = mcpMatch
  const toolLabel = humanizeSlug(toolSlug)
  const serverLabel = humanizeSlug(serverSlug)

  return {
    isMcp: true,
    toolLabel,
    serverLabel,
    combinedLabel: `${toolLabel} on ${serverLabel}`,
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function normalizePrimitiveValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return null
}

export function getToolArgumentSummary(args?: Record<string, unknown>): string | null {
  if (!args || typeof args !== 'object') {
    return null
  }

  const preferredKeys = ['description', 'query', 'url', 'path', 'filePath', 'command', 'prompt', 'topic', 'name']

  for (const key of preferredKeys) {
    const value = normalizePrimitiveValue(args[key])
    if (value) {
      return truncateText(value, 72)
    }
  }

  for (const value of Object.values(args)) {
    const normalized = normalizePrimitiveValue(value)
    if (normalized) {
      return truncateText(normalized, 72)
    }
  }

  return null
}

export function stringifyToolValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value === undefined) {
    return 'No output returned.'
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function getToolValuePreview(value: unknown, maxLength = 200): string | null {
  const text = stringifyToolValue(value).trim()
  if (!text) {
    return null
  }

  const singleLine = text.replace(/\s+/g, ' ')
  return truncateText(singleLine, maxLength)
}
