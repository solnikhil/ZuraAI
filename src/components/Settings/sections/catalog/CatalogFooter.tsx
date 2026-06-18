import React from 'react'
import { Button } from '@/components/ui/button'

interface CatalogFooterProps {
  showing: number
  total: number
  limited: boolean
  onLoadMore?: () => void
  onDone: () => void
}

export function CatalogFooter({
  showing,
  total,
  limited,
  onLoadMore,
  onDone,
}: CatalogFooterProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
      <div className="min-w-0 text-xs text-muted-foreground">
        {total === 0 ? (
          <span>No models</span>
        ) : (
          <span>
            Showing {showing} of {total} models
            {limited && onLoadMore && (
              <>
                {' — '}
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Load more
                </button>
              </>
            )}
          </span>
        )}
      </div>
      <Button variant="default" size="sm" onClick={onDone} className="shrink-0">
        Done
      </Button>
    </div>
  )
}
