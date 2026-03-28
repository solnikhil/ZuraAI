const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:'])

export function normalizeSafeHttpUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function isSafeHttpUrl(rawUrl: string): boolean {
  return normalizeSafeHttpUrl(rawUrl) !== null
}
