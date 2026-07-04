import type { CommandBarAction, CommandBarSuggestion } from './suggestions'

export interface CommandBarHistoryEntry {
  suggestionId: string
  title: string
  subtitle?: string
  input: string
  action: CommandBarAction
  lastUsedAt: number
}

export const HISTORY_KEY = 'zura-commandbar-history-v1'
export const HISTORY_MAX = 10

export function loadCommandBarHistory(): CommandBarHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return (parsed as unknown[])
      .filter(
        (entry): entry is Record<string, unknown> => entry != null && typeof entry === 'object'
      )
      .filter((entry) => typeof entry.suggestionId === 'string')
      .filter((entry) => typeof entry.title === 'string')
      .filter((entry) => entry.action != null && typeof entry.action === 'object')
      .map((entry) => ({
        suggestionId: entry.suggestionId as string,
        title: entry.title as string,
        subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
        input: typeof entry.input === 'string' ? entry.input : '',
        action: entry.action as CommandBarAction,
        lastUsedAt: typeof entry.lastUsedAt === 'number' ? entry.lastUsedAt : Date.now(),
      }))
      .slice(0, HISTORY_MAX)
  } catch {
    return []
  }
}

export function saveCommandBarHistory(entries: CommandBarHistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)))
  } catch {
    // Ignore storage failures (quota exceeded, private browsing, etc.)
  }
}

export function recordCommandHistory(
  entries: CommandBarHistoryEntry[],
  suggestion: CommandBarSuggestion,
  input: string
): CommandBarHistoryEntry[] {
  const trimmed = input.trim()
  const entry: CommandBarHistoryEntry = {
    suggestionId: suggestion.id,
    title: suggestion.title,
    subtitle: suggestion.subtitle,
    input: trimmed || suggestion.title,
    action: suggestion.action,
    lastUsedAt: Date.now(),
  }

  // Deduplication: remove existing entry with same suggestionId, then prepend
  const filtered = entries.filter((item) => item.suggestionId !== entry.suggestionId)
  const next = [entry, ...filtered].slice(0, HISTORY_MAX)
  saveCommandBarHistory(next)
  return next
}
