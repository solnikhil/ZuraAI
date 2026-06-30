import type { ProviderId } from '../providers/providerTypes'

export type ProviderKey = ProviderId

export type CommandBarAction =
  | { type: 'open_dashboard_view'; view: 'chat' | 'settings' }
  | {
      type: 'open_settings_section'
      section: string
      provider?: ProviderKey
      manageMode?: 'providers' | 'search-apis'
      commandPaletteTab?: boolean
      extension?: import('../components/Settings/sections/extensionCatalog').CatalogExtensionId
      extensionPanel?: 'notifications'
    }
  | { type: 'toggle_sidebar_hidden' }
  | { type: 'toggle_sidebar_collapsed' }
  | { type: 'new_chat' }
  | { type: 'copy_chat_debug_id' }
  | { type: 'open_chat_debug_panel' }
  | { type: 'export_chat'; format: 'markdown' | 'text' }
  | { type: 'send_chat_message'; content: string }
  | { type: 'toggle_memory_monitor' }

export interface CommandBarSuggestion {
  id: string
  title: string
  subtitle?: string
  keywords?: string[]
  action: CommandBarAction
  score: number
}

export interface CommandBarSuggestionContext {
  hasCurrentSession: boolean
  isDev?: boolean
  memoryMonitorVisible?: boolean
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
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !COMMAND_STOPWORDS.has(t))

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
  // Filter out very short tokens (less than 4 chars) to avoid false matches like "com" in domains
  const meaningfulTokens = tokens.filter((t) => t.length >= 4)

  if (meaningfulTokens.length === 0) return null

  if (meaningfulTokens.length === 1) {
    // If the condensed query is a single token, still allow token matching.
    const tokenIndex = normalizedCandidate.indexOf(meaningfulTokens[0])
    return tokenIndex === -1 ? null : 95 - Math.min(tokenIndex, 70)
  }

  let matchedTokens = 0
  let scoreSum = 0

  for (const token of meaningfulTokens) {
    const tokenIndex = normalizedCandidate.indexOf(token)
    if (tokenIndex === -1) continue
    matchedTokens++
    scoreSum += 70 - Math.min(tokenIndex, 70)
  }

  if (matchedTokens === 0) return null
  if (matchedTokens === meaningfulTokens.length) return 60 + scoreSum / meaningfulTokens.length
  return 40 + scoreSum / matchedTokens
}

function scoreSuggestion(
  query: string,
  suggestion: Omit<CommandBarSuggestion, 'score'>
): number | null {
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

// Kept for future actions; currently not exposed in the command palette.
export function looksLikeMathExpression(input: string): boolean {
  const trimmed = input.trim()
  if (!trimmed) return false

  if (!/[0-9]/.test(trimmed)) return false
  if (!/[+\-*/^()]/.test(trimmed)) return false

  if (/[^0-9+\-*/^().,\sA-Za-z]/.test(trimmed)) return false

  return true
}

function buildBaseSuggestions(
  ctx: CommandBarSuggestionContext
): Array<Omit<CommandBarSuggestion, 'score'>> {
  const suggestions: Array<Omit<CommandBarSuggestion, 'score'>> = [
    {
      id: 'go-chat',
      title: 'Go to Chat',
      subtitle: 'Dashboard',
      keywords: ['dashboard', 'home', 'conversation'],
      action: { type: 'open_dashboard_view', view: 'chat' },
    },
    {
      id: 'go-settings',
      title: 'Go to Settings',
      subtitle: 'Providers & configuration',
      keywords: ['providers', 'config', 'api keys', 'models'],
      action: { type: 'open_dashboard_view', view: 'settings' },
    },
    {
      id: 'go-settings-usage',
      title: 'Usage Settings',
      subtitle: 'Statistics & token tracking',
      keywords: ['usage', 'stats', 'statistics', 'tokens', 'activity'],
      action: { type: 'open_settings_section', section: 'usage' },
    },
    {
      id: 'go-settings-providers',
      title: 'Providers Settings',
      subtitle: 'Models, API keys, and search APIs',
      keywords: ['providers', 'models', 'api', 'keys', 'llm'],
      action: { type: 'open_settings_section', section: 'providers' },
    },
    {
      id: 'go-settings-extensions',
      title: 'Extensions Settings',
      subtitle: 'Built-in extensions, artifacts, and modes',
      keywords: ['extensions', 'skills', 'artifacts', 'web research', 'research mode', 'capabilities'],
      action: { type: 'open_settings_section', section: 'extensions' },
    },
    {
      id: 'go-settings-openrouter',
      title: 'OpenRouter Settings',
      subtitle: 'API keys & models',
      keywords: ['openrouter', 'api', 'models'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'openrouter' },
    },
    {
      id: 'go-settings-groq',
      title: 'Groq Settings',
      subtitle: 'Ultra-low-latency models',
      keywords: ['groq'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'groq' },
    },
    {
      id: 'go-settings-perplexity',
      title: 'Perplexity Settings',
      subtitle: 'Research-focused models',
      keywords: ['perplexity'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'perplexity' },
    },
    {
      id: 'go-settings-ollama',
      title: 'Ollama Settings',
      subtitle: 'Local models',
      keywords: ['ollama', 'local'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'ollama' },
    },
    {
      id: 'go-settings-alibaba',
      title: 'Alibaba Cloud Settings',
      subtitle: 'Qwen models via DashScope',
      keywords: ['alibaba', 'qwen', 'dashscope', 'tongyi'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'alibaba' },
    },
    {
      id: 'go-settings-fireworks',
      title: 'Fireworks Settings',
      subtitle: 'Serverless and routed models',
      keywords: ['fireworks', 'serverless', 'kimi', 'deepseek'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'fireworks' },
    },
    {
      id: 'go-settings-nvidia',
      title: 'NVIDIA NIM Settings',
      subtitle: 'NVIDIA-hosted NIM models',
      keywords: ['nvidia', 'nim', 'minimax', 'm3'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'nvidia' },
    },
    {
      id: 'go-settings-opencode',
      title: 'OpenCode Go Settings',
      subtitle: 'Low-cost curated coding models',
      keywords: ['opencode', 'opencode go', 'go subscription', 'glm', 'kimi', 'minimax'],
      action: { type: 'open_settings_section', section: 'providers', provider: 'opencode' },
    },
    {
      id: 'go-settings-search-apis',
      title: 'Service APIs Settings',
      subtitle: 'Tavily & web search',
      keywords: ['tavily', 'search api', 'web search', 'tools', 'service apis'],
      action: { type: 'open_settings_section', section: 'providers', manageMode: 'search-apis' },
    },
    {
      id: 'go-settings-themes',
      title: 'Theme Settings',
      subtitle: 'Appearance & themes',
      keywords: ['theme', 'themes', 'appearance', 'colors', 'style'],
      action: { type: 'open_settings_section', section: 'themes' },
    },
    {
      id: 'go-settings-systemprompt',
      title: 'System Prompt Settings',
      subtitle: 'Load and edit assistant instructions',
      keywords: ['system', 'prompt', 'instructions', 'persona', 'behavior'],
      action: { type: 'open_settings_section', section: 'systemprompt' },
    },
    {
      id: 'go-settings-commandbar',
      title: 'Command Palette Settings',
      subtitle: 'Customize floating command palette',
      keywords: ['command', 'bar', 'commandbar', 'shortcut', 'palette', 'floating'],
      action: { type: 'open_settings_section', section: 'themes', commandPaletteTab: true },
    },
    {
      id: 'toggle-memory-monitor',
      title: ctx.memoryMonitorVisible ? 'Hide Memory Monitor' : 'Show Memory Monitor',
      subtitle: 'Toggle FPS and renderer heap stats',
      keywords: [
        'show memory',
        'hide memory',
        'memory',
        'fps',
        'performance',
        'monitor',
        'diagnostics',
        'heap',
      ],
      action: { type: 'toggle_memory_monitor' },
    },
    {
      id: 'new-chat',
      title: 'New Chat',
      subtitle: 'Start fresh',
      keywords: ['new', 'conversation', 'session'],
      action: { type: 'new_chat' },
    },
    {
      id: 'toggle-sidebar-hidden',
      title: 'Toggle Sidebar',
      subtitle: 'Show or hide',
      keywords: ['sidebar', 'layout', 'panel'],
      action: { type: 'toggle_sidebar_hidden' },
    },
    {
      id: 'toggle-sidebar-collapsed',
      title: 'Toggle Sidebar Collapse',
      subtitle: 'Expand or collapse',
      keywords: ['sidebar', 'layout', 'panel'],
      action: { type: 'toggle_sidebar_collapsed' },
    },
  ]

  if (ctx.hasCurrentSession) {
    suggestions.push(
      ...(ctx.isDev
        ? [
            {
              id: 'copy-chat-debug-id',
              title: 'Copy Chat Debug ID',
              subtitle: 'Copy current session id for local diagnostics',
              keywords: ['chat-id', 'chat id', 'session id', 'debug id', 'copy chat id'],
              action: { type: 'copy_chat_debug_id' as const },
            },
            {
              id: 'open-chat-debug-panel',
              title: 'Show Chat Debug Logs',
              subtitle: 'View raw events for the current chat',
              keywords: [
                'debug',
                'logs',
                'diagnostics',
                'tool',
                'tools',
                'errors',
                'events',
                'panel',
                'inspector',
                'chat debug logs',
              ],
              action: { type: 'open_chat_debug_panel' as const },
            },
          ]
        : []),
      {
        id: 'export-chat-markdown',
        title: 'Export Chat (Markdown)',
        subtitle: 'Download as .md',
        keywords: ['export', 'download', 'markdown', 'md'],
        action: { type: 'export_chat', format: 'markdown' },
      },
      {
        id: 'export-chat-text',
        title: 'Export Chat (Text)',
        subtitle: 'Download as .txt',
        keywords: ['export', 'download', 'text', 'txt'],
        action: { type: 'export_chat', format: 'text' },
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

  // Base suggestions (filter on query if provided)
  for (let index = 0; index < base.length; index++) {
    const suggestion = base[index]

    if (!commandQuery) {
      results.push({
        ...suggestion,
        score: 100 - index,
      })
      continue
    }

    const score = scoreSuggestion(commandQuery, suggestion)
    if (score === null) continue

    results.push({
      ...suggestion,
      score,
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
      // Boost settings sections when query matches their keywords with word boundaries
      if (item.id.startsWith('go-settings-')) {
        const section = item.id.replace('go-settings-', '')
        const sectionKeywords = item.keywords || []
        const queryLower = normalized.toLowerCase()

        // Check if query contains the section name as a distinct word
        const hasSectionMatch = new RegExp(`\\b${section}\\b`, 'i').test(queryLower)

        // Check if query contains any keyword as a distinct word
        const hasKeywordMatch = sectionKeywords.some((kw) => {
          const kwPattern = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
          return kwPattern.test(queryLower)
        })

        if (hasSectionMatch || hasKeywordMatch) {
          item.score += 70
        }
      }
    }
  }

  const sorted = Array.from(deduped.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.title.localeCompare(b.title)
    })
    .slice(0, Math.max(1, limit))

  // If there's a non-empty query and no command scored above the confidence threshold,
  // append a "Send as chat message" suggestion so the user can quick-send from the palette.
  const SEND_SUGGESTION_THRESHOLD = 100
  if (query.length > 0 && !commandsOnly) {
    const topScore = sorted.length > 0 ? sorted[0].score : 0
    if (topScore < SEND_SUGGESTION_THRESHOLD) {
      sorted.push({
        id: 'quick-send-message',
        title: 'Send as chat message',
        subtitle: query,
        action: { type: 'send_chat_message', content: query },
        score: -1,
      })
    }
  }

  return sorted
}
