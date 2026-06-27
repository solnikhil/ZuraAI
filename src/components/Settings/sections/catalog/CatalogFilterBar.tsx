import React from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { CAPABILITY_BADGE_STYLES } from '@/utils/modelUtils'
import { WithTooltip } from '@/components/ui/WithTooltip'
import type { CatalogFilters, CatalogSortKey } from './catalogTypes'

interface CatalogFilterBarProps {
  filters: CatalogFilters
  availableCaps: string[]
  onFiltersChange: (next: Partial<CatalogFilters>) => void
  searchPlaceholder?: string
}

const SORT_LABELS: Record<CatalogSortKey, string> = {
  relevance: 'Relevance',
  az: 'Name A–Z',
  za: 'Name Z–A',
  capabilities: 'Most capable',
}

export function CatalogFilterBar({
  filters,
  availableCaps,
  onFiltersChange,
  searchPlaceholder = 'Search models by name, ID, or description...',
}: CatalogFilterBarProps): React.ReactElement {
  const toggleCap = (cap: string) => {
    const next = filters.caps.includes(cap)
      ? filters.caps.filter((c) => c !== cap)
      : [...filters.caps, cap]
    onFiltersChange({ caps: next })
  }

  return (
    <div className="border-b border-border px-6 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={filters.query}
              onChange={(e) => onFiltersChange({ query: e.target.value })}
              placeholder={searchPlaceholder}
              className="h-8 border-border bg-secondary pl-9 pr-9"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const row = document.querySelector<HTMLDivElement>('[data-catalog-row="true"]')
                  row?.focus()
                }
              }}
            />
            {filters.query && (
              <button
                type="button"
                onClick={() => onFiltersChange({ query: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Select
            value={filters.sort}
            onValueChange={(value) => onFiltersChange({ sort: value as CatalogSortKey })}
          >
            <SelectTrigger className="h-8 w-[150px] shrink-0" aria-label="Sort models">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-menu-surface">
              {(Object.keys(SORT_LABELS) as CatalogSortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={filters.hideAdded}
              onCheckedChange={(checked) => onFiltersChange({ hideAdded: checked })}
              aria-label="Hide already added models"
            />
            <span className="hidden sm:inline">Hide added</span>
          </label>
        </div>

        {availableCaps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {availableCaps.map((capKey) => {
              const config = CAPABILITY_BADGE_STYLES[capKey]
              if (!config) return null
              const Icon = config.icon
              const active = filters.caps.includes(capKey)
              return (
                <WithTooltip key={capKey} tooltip={config.tooltip}>
                  <button
                    type="button"
                    onClick={() => toggleCap(capKey)}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all"
                    style={
                      active
                        ? {
                            background: config.gradient,
                            color: '#ffffff',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                          }
                        : {
                            background: 'var(--theme-surface-active)',
                            color: 'var(--theme-text-muted)',
                            border: '1px solid var(--theme-border)',
                          }
                    }
                    aria-pressed={active}
                  >
                    <Icon size={12} />
                    <span>{config.label}</span>
                  </button>
                </WithTooltip>
              )
            })}
            {filters.caps.length > 0 && (
              <button
                type="button"
                onClick={() => onFiltersChange({ caps: [] })}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
