export function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase()
}

export function acronym(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function hasWordPrefix(text: string, query: string): boolean {
  const normalized = text.trim().toLowerCase()
  const q = normalizeSearchQuery(query)
  if (!q) return true
  if (normalized === q) return true
  if (normalized.startsWith(q)) {
    const next = normalized.charAt(q.length)
    return !next || !/[a-z0-9]/.test(next)
  }
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(q)}(?=$|[^a-z0-9])`, 'i')
  return re.test(normalized)
}

export function scoreAppSearch(name: string, aliases: string[], query: string): number {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return 0
  const normalizedName = normalizeSearchQuery(name)
  const normalizedAliases = aliases.map(normalizeSearchQuery).filter(Boolean)
  let score = 0
  if (normalizedName === normalizedQuery) score = 1000
  else if (normalizedName.startsWith(normalizedQuery)) score = 850
  else if (normalizedName.split(/[^a-z0-9]+/).some((part) => part.startsWith(normalizedQuery))) score = 760
  else if (acronym(normalizedName).startsWith(normalizedQuery)) score = 700
  else if (hasWordPrefix(normalizedName, normalizedQuery)) score = 520
  else if (normalizedAliases.some((alias) => alias.startsWith(normalizedQuery) || hasWordPrefix(alias, normalizedQuery))) score = 430
  return score
}

export function scoreWindowSearch(title: string, processName: string, query: string): number {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return 0
  const normalizedTitle = normalizeSearchQuery(title)
  const normalizedProcess = normalizeSearchQuery(processName)
  if (normalizedProcess === normalizedQuery || normalizedProcess.startsWith(normalizedQuery)) return 900
  if (normalizedTitle === normalizedQuery || normalizedTitle.startsWith(normalizedQuery)) return 820
  if (hasWordPrefix(normalizedProcess, normalizedQuery)) return 480
  if (hasWordPrefix(normalizedTitle, normalizedQuery)) return 560
  return 0
}

export function scoreGenericSearch(fields: string[], query: string): number {
  const normalizedQuery = normalizeSearchQuery(query)
  if (!normalizedQuery) return 0
  let score = 0
  for (const field of fields) {
    const normalized = normalizeSearchQuery(field)
    if (!normalized) continue
    if (normalized === normalizedQuery) score = Math.max(score, 1000)
    else if (normalized.startsWith(normalizedQuery)) score = Math.max(score, 850)
    else if (hasWordPrefix(normalized, normalizedQuery)) score = Math.max(score, 520)
    else if (normalized.includes(normalizedQuery)) score = Math.max(score, 360)
  }
  return score
}