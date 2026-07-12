export type CommandCenterSearchSource =
  | 'app'
  | 'file'
  | 'folder'
  | 'setting'
  | 'window'
  | 'chat'
  | 'workflow'
  | 'action'
  | 'extension'

export interface ParsedCommandCenterQuery {
  raw: string
  normalizedText: string
  terms: string[]
  phrases: string[]
  excluded: string[]
  sources: CommandCenterSearchSource[]
  filters: {
    kind?: string
    ext?: string
    modified?: string
    size?: string
  }
}

const SOURCE_ALIASES: Record<string, CommandCenterSearchSource> = {
  app: 'app',
  file: 'file',
  folder: 'folder',
  setting: 'setting',
  settings: 'setting',
  window: 'window',
  chat: 'chat',
  workflow: 'workflow',
  action: 'action',
  extension: 'extension',
  extn: 'extension',
}

const FILTER_NAMES = new Set(['kind', 'ext', 'modified', 'size'])

export function normalizeSearchQuery(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function parseCommandCenterQuery(value: string): ParsedCommandCenterQuery {
  const raw = value.slice(0, 120).trim()
  const terms: string[] = []
  const phrases: string[] = []
  const excluded: string[] = []
  const sources = new Set<CommandCenterSearchSource>()
  const filters: ParsedCommandCenterQuery['filters'] = {}
  const tokens = raw.match(/-?"[^"]*"|-?\S+/g) ?? []

  for (const token of tokens) {
    const negative = token.startsWith('-')
    const unprefixed = negative ? token.slice(1) : token
    const quoted = unprefixed.startsWith('"') && unprefixed.endsWith('"')
    const literal = normalizeSearchQuery(quoted ? unprefixed.slice(1, -1) : unprefixed)
    if (!literal) continue

    if (!quoted) {
      const separator = literal.indexOf(':')
      if (separator >= 0) {
        const key = literal.slice(0, separator)
        const filterValue = literal.slice(separator + 1)
        const source = SOURCE_ALIASES[key]
        if (source && !negative) {
          sources.add(source)
          if (filterValue) terms.push(filterValue)
          continue
        }
        if (FILTER_NAMES.has(key) && filterValue && !negative) {
          filters[key as keyof typeof filters] = filterValue
          continue
        }
        // Unknown field/property syntax is ignored. This prevents arbitrary
        // AQS/SQL property names or filesystem scopes from reaching main.
        continue
      }
    }

    if (negative) excluded.push(literal)
    else if (quoted) phrases.push(literal)
    else terms.push(literal)
  }

  return {
    raw,
    normalizedText: [...phrases, ...terms].join(' '),
    terms: Array.from(new Set(terms)),
    phrases: Array.from(new Set(phrases)),
    excluded: Array.from(new Set(excluded)),
    sources: Array.from(sources),
    filters,
  }
}

export function queryAllowsSource(
  query: ParsedCommandCenterQuery,
  source: CommandCenterSearchSource
): boolean {
  return query.sources.length === 0 || query.sources.includes(source)
}

export function acronym(value: string): string {
  return normalizeSearchQuery(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
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
      rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, previous + cost)
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
  const candidates = [normalizedName, ...normalizedName.split(/[^a-z0-9]+/)].filter(
    (part) => part.length >= 3
  )
  for (const candidate of candidates) {
    const prefix = candidate.slice(0, Math.min(candidate.length, normalizedQuery.length + 1))
    if (levenshtein(prefix, normalizedQuery) <= maxDistance) return 600
  }
  return 0
}

export function hasWordPrefix(text: string, query: string): boolean {
  const normalized = normalizeSearchQuery(text)
  const q = normalizeSearchQuery(query)
  if (!q) return true
  if (normalized === q) return true
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(q)}(?=$|[^a-z0-9])`, 'i')
  return re.test(normalized)
}

function scoreTerm(field: string, term: string, allowFuzzy: boolean): number {
  if (field === term) return 1000
  if (field.startsWith(term)) return 850
  if (field.split(/[^a-z0-9]+/).some((part) => part.startsWith(term))) return 760
  if (acronym(field).startsWith(term)) return 700
  if (field.includes(term)) return 360
  return allowFuzzy ? fuzzyNameScore(field, term) : 0
}

export function scoreSearchFields(
  fields: Array<{ value: string | undefined; weight?: number }>,
  value: string | ParsedCommandCenterQuery,
  options: { allowFuzzy?: boolean } = {}
): { score: number; matchReasons: string[] } {
  const query = typeof value === 'string' ? parseCommandCenterQuery(value) : value
  const normalizedFields = fields
    .map((field) => ({ value: normalizeSearchQuery(field.value ?? ''), weight: field.weight ?? 1 }))
    .filter((field) => field.value)
  if (!query.normalizedText && query.phrases.length === 0) return { score: 0, matchReasons: [] }
  if (query.excluded.some((term) => normalizedFields.some((field) => field.value.includes(term)))) {
    return { score: 0, matchReasons: [] }
  }

  let total = 0
  const reasons: string[] = []
  for (const phrase of query.phrases) {
    const best = Math.max(
      0,
      ...normalizedFields.map((field) =>
        field.value === phrase ? 1100 * field.weight : field.value.includes(phrase) ? 700 * field.weight : 0
      )
    )
    if (best === 0) return { score: 0, matchReasons: [] }
    total += best
    reasons.push('phrase')
  }
  for (const term of query.terms) {
    const best = Math.max(
      0,
      ...normalizedFields.map(
        (field) => scoreTerm(field.value, term, options.allowFuzzy !== false) * field.weight
      )
    )
    if (best === 0) return { score: 0, matchReasons: [] }
    total += best
    reasons.push(best >= 1000 ? 'exact' : best >= 760 ? 'prefix' : best >= 600 ? 'fuzzy' : 'contains')
  }
  const divisor = Math.max(1, query.terms.length + query.phrases.length)
  return { score: Math.round(total / divisor), matchReasons: Array.from(new Set(reasons)) }
}

export function scoreAppSearch(name: string, aliases: string[], query: string): number {
  return scoreSearchFields(
    [{ value: name, weight: 1 }, ...aliases.map((value) => ({ value, weight: 0.72 }))],
    query
  ).score
}

export function scoreWindowSearch(title: string, processName: string, query: string): number {
  const parsed = parseCommandCenterQuery(query)
  if (parsed.terms.length !== 1 || parsed.phrases.length > 0 || parsed.excluded.length > 0) {
    return scoreSearchFields(
      [{ value: processName }, { value: title, weight: 0.92 }],
      parsed,
      { allowFuzzy: false }
    ).score
  }
  const term = parsed.terms[0]
  const normalizedProcess = normalizeSearchQuery(processName)
  const normalizedTitle = normalizeSearchQuery(title)
  if (normalizedProcess === term || normalizedProcess.startsWith(term)) return 900
  if (normalizedTitle === term || normalizedTitle.startsWith(term)) return 820
  if (hasWordPrefix(normalizedProcess, term)) return 480
  if (hasWordPrefix(normalizedTitle, term)) return 560
  for (const word of `${normalizedProcess} ${normalizedTitle}`.split(/[^a-z0-9]+/)) {
    if (word.length >= 3 && Math.abs(word.length - term.length) <= 2 && levenshtein(word, term) <= 2) {
      return 600
    }
  }
  return 0
}

export function scoreGenericSearch(fields: string[], query: string): number {
  return scoreSearchFields(
    fields.map((value, index) => ({ value, weight: index === 0 ? 1 : 0.75 })),
    query
  ).score
}
