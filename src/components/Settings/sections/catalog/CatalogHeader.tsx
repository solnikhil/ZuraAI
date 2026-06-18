import React from 'react'
import { Loader2, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProviderLogo } from '@/components/shared'

interface CatalogHeaderProps {
  provider: string
  title: string
  description: string
  loading: boolean
  onRefresh: () => void
  showRefresh: boolean
  extra?: React.ReactNode
}

export function CatalogHeader({
  provider,
  title,
  description,
  loading,
  onRefresh,
  showRefresh,
  extra,
}: CatalogHeaderProps): React.ReactElement {
  return (
    <div className="border-b border-border px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 shrink-0">
            <ProviderLogo provider={provider} size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {showRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-2 shrink-0"
            aria-label="Refresh catalog"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            Refresh
          </Button>
        )}
      </div>
      {extra}
    </div>
  )
}
