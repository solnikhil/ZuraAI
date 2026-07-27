import { scoreAppSearch } from '../../src/tools/search'
import type { AppIndexEntry, RankedAppIndexEntry } from './types'

export function scoreApp(appEntry: AppIndexEntry, query: string, now = Date.now()): number {
  const normalizedQuery = query.trim().toLowerCase()
  const recentAt = Math.max(appEntry.lastLaunchedAt ?? 0, appEntry.lastUsedAt ?? 0)
  const ageHours = recentAt > 0 ? (now - recentAt) / 3_600_000 : Number.POSITIVE_INFINITY
  const recencyScore =
    recentAt <= 0
      ? 0
      : ageHours <= 1
        ? 450
        : ageHours <= 24
          ? 320
          : ageHours <= 24 * 7
            ? 200
            : ageHours <= 24 * 30
              ? 100
              : 40
  const frequencyScore =
    Math.min((appEntry.launchCount ?? 0) * 80, 1200) + Math.min((appEntry.usageCount ?? 0) * 2, 400)
  if (!normalizedQuery) return frequencyScore + recencyScore
  let score = scoreAppSearch(appEntry.name, appEntry.aliases, normalizedQuery)
  if (score === 0) return 0
  score += Math.min(recencyScore / 20, 40)
  score += Math.min(frequencyScore / 20, 40)
  return score
}

export function rankApps(
  apps: readonly AppIndexEntry[],
  query: string,
  limit: number,
  now = Date.now()
): RankedAppIndexEntry[] {
  return apps
    .map((entry) => ({ ...entry, rank: scoreApp(entry, query, now) }))
    .filter((entry) => !query.trim() || entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
}
