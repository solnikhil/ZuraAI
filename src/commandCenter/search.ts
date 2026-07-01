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

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = rows[0]
    rows[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const temp = rows[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[j] = Math.min(
        rows[j] + 1,
        rows[j - 1] + 1,
        previous + cost,
      )
      previous = temp
    }
  }
  return rows[b.length]
}

export function fuzzyNameScore(name: string, query: string): number {
  const normalizedName = normalizeSearchQuery(name)
  const normalizedQuery = normalizeSearchQuery(query)
  if (normalizedQuery.length < 3 || normalizedName.length < 3) return 0
  const maxDistance = normalizedQuery.length <= 4 ? 1 : 2
  const prefixWindow = normalizedName.slice(0, Math.max(normalizedQuery.length, Math.min(normalizedName.length, normalizedQuery.length + 1)))
  if (levenshtein(prefixWindow, normalizedQuery) <= maxDistance) return 640
  for (const word of normalizedName.split(/[^a-z0-9]+/).filter((part) => part.length >= 3)) {
    const wordPrefix = word.slice(0, Math.max(normalizedQuery.length, Math.min(word.length, normalizedQuery.length + 1)))
    if (levenshtein(wordPrefix, normalizedQuery) <= maxDistance) return 600
  }
  return 0
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
  if (score === 0) score = fuzzyNameScore(normalizedName, normalizedQuery)
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