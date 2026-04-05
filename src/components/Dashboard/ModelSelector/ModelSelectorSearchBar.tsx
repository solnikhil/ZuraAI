import React from 'react'
import { CommandInput } from '@/components/ui/command'
import { cn } from '@/lib/utils'

interface ModelSelectorSearchBarProps {
  compact: boolean
  tight: boolean
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function ModelSelectorSearchBar({
  compact,
  tight,
  searchQuery,
  onSearchChange,
}: ModelSelectorSearchBarProps): React.ReactElement {
  return (
    <div className={cn('shrink-0', tight ? 'px-2 py-1.5' : 'px-3 py-2')}>
      <CommandInput
        placeholder="Search models, providers..."
        value={searchQuery}
        onValueChange={onSearchChange}
        className={compact ? 'h-9 text-sm' : 'h-10'}
      />
    </div>
  )
}

export default ModelSelectorSearchBar
