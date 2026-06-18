import React from 'react'
import { AlertCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CatalogLoadingView(): React.ReactElement {
  return (
    <div className="space-y-2 px-6 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2.5"
        >
          <div className="size-2 shrink-0 rounded-full bg-muted/40 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-muted/40 animate-pulse" />
            <div className="h-2.5 w-1/2 rounded bg-muted/30 animate-pulse" />
          </div>
          <div className="h-7 w-16 rounded bg-muted/40 animate-pulse" />
        </div>
      ))}
      <div className="pt-2 text-center text-xs text-muted-foreground">Loading models…</div>
    </div>
  )
}

interface CatalogErrorViewProps {
  message: string
  onRetry: () => void
}

export function CatalogErrorView({ message, onRetry }: CatalogErrorViewProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <AlertCircle size={28} className="text-destructive/70" />
      <div className="max-w-sm text-sm text-destructive">{message}</div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

interface CatalogEmptyViewProps {
  query: string
  hasFilters: boolean
  onClearFilters: () => void
}

export function CatalogEmptyView({
  query,
  hasFilters,
  onClearFilters,
}: CatalogEmptyViewProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <Search size={28} className="text-muted-foreground/40" />
      <div className="text-sm text-muted-foreground">
        {query ? (
          <>
            No models found matching <span className="text-foreground">&quot;{query}&quot;</span>
          </>
        ) : hasFilters ? (
          'No models match the active filters.'
        ) : (
          'No models available.'
        )}
      </div>
      {(query || hasFilters) && (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
