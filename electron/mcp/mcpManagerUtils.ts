export function createResourceCacheKey(serverId: string, uri: string): string {
  return `${serverId}::resource::${uri}`
}

export function createPromptCacheKey(
  serverId: string,
  promptName: string,
  args: Record<string, unknown>
): string {
  return `${serverId}::prompt::${promptName}::${stableStringify(args)}`
}

export function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  )

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`
}

export function normalizeServerId(serverId: string): string {
  if (typeof serverId !== 'string' || !serverId.trim()) {
    throw new Error('Invalid MCP server id')
  }

  return serverId.trim()
}

export function getOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
