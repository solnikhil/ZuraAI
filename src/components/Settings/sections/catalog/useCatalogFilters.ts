import { useMemo } from 'react'
import type { CatalogFilters, CatalogItem, CatalogSortKey } from './catalogTypes'
import { CAPABILITY_CHIP_ORDER } from './catalogTypes'

export interface CatalogFilterResult<T> {
  visible: CatalogItem<T>[]
  totalCount: number
  availableCaps: string[]
  beforeLimit: number
  limited: boolean
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').toLowerCase()
}

function relevanceScore(item: CatalogItem, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const id = normalizeText(item.id)
  const name = normalizeText(item.displayName)
  const desc = normalizeText(item.description)
  const haystacks = [
    { text: name, weight: 3 },
    { text: id, weight: 2 },
    { text: desc, weight: 1 },
  ]
  let best = -1
  for (const { text, weight } of haystacks) {
    if (!text) continue
    if (text === q) return 1000 * weight
    if (text.startsWith(q)) best = Math.max(best, 500 * weight)
    else if (new RegExp(`\\b${escapeRegex(q)}`).test(text)) best = Math.max(best, 250 * weight)
    else if (text.includes(q)) best = Math.max(best, 100 * weight)
  }
  if (best < 0) return -1
  return best + Math.min(item.capabilities.length, 6)
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sortItems<T>(
  items: CatalogItem<T>[],
  sort: CatalogSortKey,
  query: string
): CatalogItem<T>[] {
  if (sort === 'az') {
    return [...items].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }
  if (sort === 'za') {
    return [...items].sort((a, b) => b.displayName.localeCompare(a.displayName))
  }
  if (sort === 'capabilities') {
    return [...items].sort(
      (a, b) =>
        b.capabilities.length - a.capabilities.length || a.displayName.localeCompare(b.displayName)
    )
  }
  const q = query.trim()
  if (!q) return items
  return [...items].sort((a, b) => {
    const sa = relevanceScore(a, q)
    const sb = relevanceScore(b, q)
    if (sb !== sa) return sb - sa
    return a.displayName.localeCompare(b.displayName)
  })
}

function matchesQuery(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    normalizeText(item.id).includes(q) ||
    normalizeText(item.displayName).includes(q) ||
    normalizeText(item.description).includes(q)
  )
}

function matchesCaps(item: CatalogItem, caps: string[]): boolean {
  if (caps.length === 0) return true
  return caps.every((cap) => item.capabilities.includes(cap))
}

export function useCatalogFilters<T>(
  items: CatalogItem<T>[],
  addedIds: Set<string>,
  filters: CatalogFilters,
  visibleLimit?: number
): CatalogFilterResult<T> {
  return useMemo(() => {
    const availableCaps = CAPABILITY_CHIP_ORDER.filter((cap) =>
      items.some((item) => item.capabilities.includes(cap))
    )

    const filtered = items.filter(
      (item) =>
        matchesQuery(item, filters.query) &&
        matchesCaps(item, filters.caps) &&
        (!filters.hideAdded || !addedIds.has(item.id))
    )

    const sorted = sortItems(filtered, filters.sort, filters.query)
    const beforeLimit = sorted.length
    const limited = visibleLimit != null && beforeLimit > visibleLimit
    const visible = limited ? sorted.slice(0, visibleLimit) : sorted

    return {
      visible,
      totalCount: items.length,
      availableCaps,
      beforeLimit,
      limited,
    }
  }, [items, addedIds, filters, visibleLimit])
}
