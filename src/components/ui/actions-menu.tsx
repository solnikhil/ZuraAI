import { useMemo, useState, type ReactNode } from 'react'
import { Check, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ActionsMenuItem = {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
  /** Shows a trailing check when true (current selection). */
  checked?: boolean
  destructive?: boolean
  onSelect?: () => void
}

export type ActionsMenuGroup = {
  id: string
  label?: string
  items: ActionsMenuItem[]
}

export type ActionsMenuProps = {
  trigger: ReactNode
  groups: ActionsMenuGroup[]
  /** Optional search box filters items by label/description. */
  filterable?: boolean
  filterPlaceholder?: string
  emptyLabel?: string
  /** Extra content above groups (e.g. Add button row). */
  header?: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  contentClassName?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}

/**
 * Shared app actions dropdown — uses the unanimous `zura-menu-*` surface/item
 * system so every picker (settings, titlebar, GitHub Workspace, etc.) looks the same.
 */
export function ActionsMenu({
  trigger,
  groups,
  filterable = false,
  filterPlaceholder = 'Filter',
  emptyLabel = 'No matching actions',
  header,
  side = 'top',
  align = 'start',
  sideOffset = 6,
  contentClassName,
  open,
  onOpenChange,
  disabled,
}: ActionsMenuProps) {
  const [filter, setFilter] = useState('')

  const visibleGroups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const hay = `${item.label} ${item.description ?? ''}`.toLowerCase()
          return hay.includes(q)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [filter, groups])

  const hasItems = visibleGroups.some((group) => group.items.length > 0)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) setFilter('')
        onOpenChange?.(next)
      }}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'zura-menu-surface zura-menu-surface--compact w-[min(320px,78vw)] max-h-[min(420px,58vh)] p-1.5',
          contentClassName
        )}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {(filterable || header) && (
          <div
            className="zura-actions-menu__toolbar"
            // Prevent Radix from treating toolbar keys as menu navigation.
            onKeyDown={(event) => event.stopPropagation()}
          >
            {filterable && (
              <div className="zura-actions-menu__filter">
                <Search size={12} aria-hidden="true" />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={filterPlaceholder}
                  aria-label={filterPlaceholder}
                  autoFocus={filterable}
                />
              </div>
            )}
            {header ? <div className="zura-actions-menu__header-slot">{header}</div> : null}
          </div>
        )}

        {!hasItems ? (
          <div className="zura-actions-menu__empty">{emptyLabel}</div>
        ) : (
          visibleGroups.map((group, groupIndex) => (
            <div key={group.id}>
              {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuGroup>
                {group.label ? <DropdownMenuLabel>{group.label}</DropdownMenuLabel> : null}
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    disabled={item.disabled}
                    variant={item.destructive ? 'destructive' : 'default'}
                    className={cn(
                      'zura-menu-item--compact zura-actions-menu__item',
                      item.description && 'zura-actions-menu__item--stacked'
                    )}
                    onSelect={(event) => {
                      // Allow async work after close without focus thrash.
                      event.preventDefault()
                      onOpenChange?.(false)
                      item.onSelect?.()
                    }}
                  >
                    {item.icon ? (
                      <span className="zura-actions-menu__icon" aria-hidden="true">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="zura-actions-menu__text">
                      <span className="zura-actions-menu__label">{item.label}</span>
                      {item.description ? (
                        <span className="zura-actions-menu__description">{item.description}</span>
                      ) : null}
                    </span>
                    {item.checked ? (
                      <Check size={14} className="zura-actions-menu__check" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
