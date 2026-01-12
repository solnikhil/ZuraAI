export type CommandBarAction =
  | { type: 'open_dashboard_view'; view: 'chat' | 'settings' }
  | { type: 'toggle_sidebar_hidden' }
  | { type: 'toggle_sidebar_collapsed' }
  | { type: 'new_chat' }
  | { type: 'export_chat'; format: 'markdown' | 'text' }
  | { type: 'run_tool'; toolName: string; args: Record<string, unknown> }

export interface CommandBarSuggestion {
  id: string
  title: string
  subtitle?: string
  keywords?: string[]
  action: CommandBarAction
  score: number
}

export interface CommandBarSuggestionContext {
  toolsEnabled: boolean
  webSearchEnabled: boolean
  hasCurrentSession: boolean
}

const COMMAND_STOPWORDS = new Set(['go', 'goto', 'to', 'open', 'show', 'navigate'])

export function normalizeCommandQuery(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return ''

  const tokens = normalized
    .split(' ')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => !COMMAND_STOPWORDS.has(t))

  return tokens.join(' ')
}

function scoreMatch(query: string, candidate: string): number | null {
  const normalizedQuery = normalizeCommandQuery(query)
  if (!normalizedQuery) return 0

  const normalizedCandidate = candidate.trim().toLowerCase()
  if (!normalizedCandidate) return null

  if (normalizedCandidate === normalizedQuery) return 140
  if (normalizedCandidate.startsWith(normalizedQuery)) return 130

  const index = normalizedCandidate.indexOf(normalizedQuery)
  if (index !== -1) {
    return 110 - Math.min(index, 80)
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 1) {
    // If the condensed query is a single token, still allow token matching.
    const tokenIndex = normalizedCandidate.indexOf(tokens[0])
    return tokenIndex === -1 ? null : 95 - Math.min(tokenIndex, 70)
  }

  let matchedTokens = 0
  let scoreSum = 0

  for (const token of tokens) {
    const tokenIndex = normalizedCandidate.indexOf(token)
    if (tokenIndex === -1) continue
    matchedTokens++
    scoreSum += 70 - Math.min(tokenIndex, 70)
  }

  if (matchedTokens === 0) return null
  if (matchedTokens === tokens.length) return 60 + scoreSum / tokens.length
  return 40 + scoreSum / matchedTokens
}

function scoreSuggestion(query: string, suggestion: Omit<CommandBarSuggestion, 'score'>): number | null {
  const candidates: string[] = [suggestion.title]
  if (suggestion.subtitle) candidates.push(suggestion.subtitle)
  if (suggestion.keywords && suggestion.keywords.length > 0) {
    candidates.push(...suggestion.keywords)
  }

  let best: number | null = null
  for (const candidate of candidates) {
    const score = scoreMatch(query, candidate)
    if (score === null) continue
    if (best === null || score > best) {
      best = score
    }
  }
  return best
}

export function normalizeUrlCandidate(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed)
      if (!parsed.hostname || parsed.hostname === 'localhost') return null
      return parsed.toString()
    }

    if (/\s/.test(trimmed)) return null
    if (!trimmed.includes('.')) return null
    if (trimmed.startsWith('.') || trimmed.endsWith('.')) return null

    const parsed = new URL(`https://${trimmed}`)
    if (!parsed.hostname || parsed.hostname === 'localhost') return null
    return parsed.toString()
  } catch {
    return null
  }
}

// Kept for future actions; currently not exposed in the command bar.
export function looksLikeMathExpression(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false

  if (!/[0-9]/.test(trimmed)) return false
  if (!/[+\-*/^()]/.test(trimmed)) return false

  if (/[^0-9+\-*/^().,\sA-Za-z]/.test(trimmed)) return false

  return true
}

function buildBaseSuggestions(ctx: CommandBarSuggestionContext): Array<Omit<CommandBarSuggestion, 'score'>> {
  const suggestions: Array<Omit<CommandBarSuggestion, 'score'>> = [
    {
      id: 'go-chat',
      title: 'Go to Chat',
      subtitle: 'Open the dashboard chat view',
      keywords: ['dashboard', 'home', 'conversation'],
      action: { type: 'open_dashboard_view', view: 'chat' }
    },
    {
      id: 'go-settings',
      title: 'Go to Settings',
      subtitle: 'Open the dashboard settings view',
      keywords: ['preferences', 'config', 'api keys'],
      action: { type: 'open_dashboard_view', view: 'settings' }
    },
    {
      id: 'new-chat',
      title: 'New Chat',
      subtitle: 'Start a fresh conversation',
      keywords: ['new', 'conversation', 'session'],
      action: { type: 'new_chat' }
    },
    {
      id: 'toggle-sidebar-hidden',
      title: 'Toggle Sidebar',
      subtitle: 'Show or hide the sidebar',
      keywords: ['sidebar', 'layout', 'panel'],
      action: { type: 'toggle_sidebar_hidden' }
    },
    {
      id: 'toggle-sidebar-collapsed',
      title: 'Toggle Sidebar Collapse',
      subtitle: 'Collapse or expand the sidebar',
      keywords: ['sidebar', 'layout', 'panel'],
      action: { type: 'toggle_sidebar_collapsed' }
    }
  ]

  if (ctx.hasCurrentSession) {
    suggestions.push(
      {
        id: 'export-chat-markdown',
        title: 'Export Chat (Markdown)',
        subtitle: 'Download the current chat as .md',
        keywords: ['export', 'download', 'markdown', 'md'],
        action: { type: 'export_chat', format: 'markdown' }
      },
      {
        id: 'export-chat-text',
        title: 'Export Chat (Text)',
        subtitle: 'Download the current chat as .txt',
        keywords: ['export', 'download', 'text', 'txt'],
        action: { type: 'export_chat', format: 'text' }
      }
    )
  }


  return suggestions
}

export function getCommandBarSuggestions(
  rawQuery: string,
  ctx: CommandBarSuggestionContext,
  limit: number = 7
): CommandBarSuggestion[] {
  const trimmed = rawQuery.trim()
  const commandsOnly = trimmed.startsWith('>')
  const query = commandsOnly ? trimmed.slice(1).trim() : trimmed
  const commandQuery = normalizeCommandQuery(query)

  const results: CommandBarSuggestion[] = []
  const base = buildBaseSuggestions(ctx)

  // Quick actions (only when not in commands-only mode)
  if (!commandsOnly && query) {
    // Quick web search action
    if (ctx.toolsEnabled && ctx.webSearchEnabled && query.trim().length >= 3) {
      results.push({
        id: 'quick-web-search',
        title: `Web Search: ${query}`,
        subtitle: 'Search the web and add results to chat',
        keywords: ['search', 'web', 'tavily'],
        action: { type: 'run_tool', toolName: 'web_search', args: { query } },
        score: 40 + Math.min(query.trim().length, 20)
      })
    }
  }

  // Base suggestions (filter on query if provided)
  for (let index = 0; index < base.length; index++) {
    const suggestion = base[index]

    if (!commandQuery) {
      results.push({
        ...suggestion,
        score: 100 - index
      })
      continue
    }

    const score = scoreSuggestion(commandQuery, suggestion)
    if (score === null) continue

    results.push({
      ...suggestion,
      score
    })
  }

  // De-duplicate by id (first wins)
  const deduped = new Map<string, CommandBarSuggestion>()
  for (const item of results) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item)
    }
  }

  // Small intent boosts for navigation phrases (e.g., "goto settings").
  if (commandQuery) {
    const normalized = commandQuery

    for (const item of deduped.values()) {
      if (item.id === 'go-settings' && /\bsetting(s)?\b/.test(normalized)) {
        item.score += 60
      }
      if (item.id === 'go-chat' && /\b(chat|conversation|messages)\b/.test(normalized)) {
        item.score += 45
      }
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.title.localeCompare(b.title)
    })
    .slice(0, Math.max(1, limit))
}
