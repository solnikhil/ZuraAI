import React from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WithTooltip } from '@/components/ui/WithTooltip'
import { CAPABILITY_BADGE_STYLES, getProviderColor } from '@/utils/modelUtils'
import type { CatalogItem } from './catalogTypes'

interface ModelCatalogRowProps {
  item: CatalogItem
  index: number
  focused: boolean
  isAdded: boolean
  providerKey: string
  onAdd: (item: CatalogItem) => void
  onFocus: (index: number) => void
}

export const ModelCatalogRow = React.forwardRef<HTMLDivElement, ModelCatalogRowProps>(
  function ModelCatalogRow(
    { item, index, focused, isAdded, providerKey, onAdd, onFocus }: ModelCatalogRowProps,
    ref
  ): React.ReactElement {
    const accent = getProviderColor(providerKey)
    return (
      <div
        ref={ref}
        data-catalog-row="true"
        role="option"
        aria-selected={isAdded}
        tabIndex={focused ? 0 : -1}
        onFocus={() => onFocus(index)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (!isAdded) onAdd(item)
          }
        }}
        className="group flex items-center justify-between gap-3 rounded-lg border border-transparent bg-secondary/40 px-3 py-2.5 outline-none transition-colors hover:border-border hover:bg-secondary/70 focus-visible:border-[var(--theme-accent)] focus-visible:bg-secondary/80"
        style={
          focused
            ? { borderColor: 'var(--theme-accent)', background: 'var(--theme-surface-active)' }
            : undefined
        }
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: accent, opacity: isAdded ? 0.4 : 1 }}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <WithTooltip tooltip={item.displayName}>
                <span className="truncate text-sm font-medium text-foreground">
                  {item.displayName}
                </span>
              </WithTooltip>
              {isAdded && (
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
                  <Check size={10} />
                  Added
                </span>
              )}
            </div>
            <WithTooltip tooltip={item.id}>
              <div className="truncate font-mono text-[11px] text-muted-foreground">{item.id}</div>
            </WithTooltip>
            {item.description && (
              <WithTooltip tooltip={item.description}>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {item.description}
                </div>
              </WithTooltip>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {item.capabilities.length > 0 && (
            <div className="hidden items-center gap-1 md:flex">
              {item.capabilities.map((capKey) => {
                const config = CAPABILITY_BADGE_STYLES[capKey]
                if (!config) return null
                const Icon = config.icon
                return (
                  <Tooltip key={capKey}>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex size-5 items-center justify-center rounded"
                        style={{ background: config.gradient, color: config.iconColor }}
                      >
                        <Icon size={11} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{config.tooltip}</TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          )}
          <Button
            variant={isAdded ? 'outline' : 'default'}
            size="sm"
            onClick={() => onAdd(item)}
            disabled={isAdded}
            className="shrink-0"
          >
            {isAdded ? (
              <>
                <Check size={14} className="mr-1" />
                Added
              </>
            ) : (
              <>
                <Plus size={14} className="mr-1" />
                Add
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }
)
