import React, { useState } from 'react'
import { CatalogFilterBar } from './CatalogFilterBar'
import { CatalogFooter } from './CatalogFooter'
import { CatalogLoadingView, CatalogErrorView, CatalogEmptyView } from './CatalogStateViews'
import { GroupedCatalogList } from './GroupedCatalogList'
import { useCatalogFilters } from './useCatalogFilters'
import type { CatalogFilters, CatalogItem } from './catalogTypes'
import { DEFAULT_CATALOG_FILTERS } from './catalogTypes'

interface CatalogDialogBodyProps<T> {
  providerKey: string
  items: CatalogItem<T>[]
  addedIds: Set<string>
  loading: boolean
  error: string | null
  onAdd: (item: CatalogItem<T>) => void
  onRetry: () => void
  onDone: () => void
  group?: boolean
  visibleLimit?: number
  visibleLimitStep?: number
  searchPlaceholder?: string
}

export function CatalogDialogBody<T>({
  providerKey,
  items,
  addedIds,
  loading,
  error,
  onAdd,
  onRetry,
  onDone,
  group = false,
  visibleLimit,
  visibleLimitStep,
  searchPlaceholder,
}: CatalogDialogBodyProps<T>): React.ReactElement {
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS)
  const [limit, setLimit] = useState(visibleLimit)
  const effectiveLimit = visibleLimit != null ? (limit ?? visibleLimit) : undefined

  const { visible, totalCount, availableCaps, limited } = useCatalogFilters<T>(
    items,
    addedIds,
    filters,
    effectiveLimit
  )

  const handleFiltersChange = (next: Partial<CatalogFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }))
  }

  const handleClearFilters = () => {
    setFilters(DEFAULT_CATALOG_FILTERS)
  }

  const hasFilters =
    filters.query.trim().length > 0 || filters.caps.length > 0 || !filters.hideAdded

  return (
    <>
      <CatalogFilterBar
        filters={filters}
        availableCaps={availableCaps}
        onFiltersChange={handleFiltersChange}
        searchPlaceholder={searchPlaceholder}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading ? (
          <CatalogLoadingView />
        ) : error ? (
          <CatalogErrorView message={error} onRetry={onRetry} />
        ) : visible.length === 0 ? (
          <CatalogEmptyView
            query={filters.query}
            hasFilters={hasFilters}
            onClearFilters={handleClearFilters}
          />
        ) : (
          <GroupedCatalogList
            items={visible}
            providerKey={providerKey}
            addedIds={addedIds}
            group={group}
            onAdd={onAdd}
          />
        )}
      </div>
      <CatalogFooter
        showing={visible.length}
        total={totalCount}
        limited={limited}
        onLoadMore={
          limited && visibleLimitStep
            ? () => setLimit((prev) => (prev ?? visibleLimit ?? 0) + (visibleLimitStep ?? 0))
            : undefined
        }
        onDone={onDone}
      />
    </>
  )
}
