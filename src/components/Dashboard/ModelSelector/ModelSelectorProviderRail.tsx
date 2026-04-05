import React, { memo } from 'react'
import { Star } from 'lucide-react'
import { ProviderLogo } from '@/components/shared'
import type { GroupedModels } from './types'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  { key: 'openrouter', title: 'OpenRouter' },
  { key: 'perplexity', title: 'Perplexity' },
  { key: 'groq', title: 'Groq' },
  { key: 'fireworks', title: 'Fireworks' },
  { key: 'alibaba', title: 'Alibaba Cloud' },
  { key: 'ollama', title: 'Ollama' },
] as const

interface ModelSelectorProviderRailProps {
  activeTabKey: string
  groupedModels: GroupedModels
  onTabSelect: (key: string) => void
}

export const ModelSelectorProviderRail = memo(function ModelSelectorProviderRail({
  activeTabKey,
  groupedModels,
  onTabSelect,
}: ModelSelectorProviderRailProps): React.ReactElement {
  const getModelCount = (providerKey: string): number => {
    return groupedModels[providerKey as keyof GroupedModels]?.length || 0
  }

  return (
    <div
      data-sidebar
      className="relative z-10 flex h-full flex-col overflow-y-auto bg-transparent"
    >
      <ProviderRailItem
        isActive={activeTabKey === 'favorites'}
        onClick={() => onTabSelect('favorites')}
        icon={<Star size={18} fill="currentColor" />}
        ariaLabel="Favorites"
      />

      {PROVIDERS.filter((provider) => getModelCount(provider.key) > 0).map((provider) => (
        <ProviderRailItem
          key={provider.key}
          isActive={activeTabKey === provider.key}
          onClick={() => onTabSelect(provider.key)}
          icon={<ProviderLogo provider={provider.key} size={20} />}
          ariaLabel={provider.title}
        />
      ))}
    </div>
  )
})

interface ProviderRailItemProps {
  isActive: boolean
  onClick: () => void
  icon: React.ReactNode
  ariaLabel: string
}

const ProviderRailItem = memo(function ProviderRailItem({
  isActive,
  onClick,
  icon,
  ariaLabel,
}: ProviderRailItemProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      className={cn(
        'theme-hover-surface relative flex w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-3.5 text-sm font-medium transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      data-active={isActive ? 'true' : undefined}
    >
      {icon}
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r bg-primary" />}
    </button>
  )
})

export default ModelSelectorProviderRail
