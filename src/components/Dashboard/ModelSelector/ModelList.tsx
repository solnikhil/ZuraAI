/**
 * Animated list used by the model picker popover.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Star, Search, Info } from 'lucide-react'
import {
  getModelAttributes,
  getCapabilitiesForModelPicker,
  getProviderTitle,
  getModelDescription,
  CAPABILITY_BADGES,
} from '../../../utils/modelUtils'
import { removeEmojis } from '../../../utils/textUtils'
import type { ModelWithProvider } from './types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { WithTooltip } from '@/components/ui/WithTooltip'
import { maybeAnimate, motionSpring, useMotionPreferences } from '@/lib/motion'
import { ModelIcon } from './ModelIcon'

/**
 * Props for ModelList component
 */
export interface ModelListProps {
  /** Models to display */
  models: ModelWithProvider[]
  /** Currently selected model code */
  selectedModelCode: string
  /** Currently selected model provider */
  selectedModelProvider: string
  /** Favorite model codes */
  favoriteModels: string[]
  /** Handler for model selection */
  onModelSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  /** Handler for toggling favorites */
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}

const LEGACY_CAPABILITY_LABELS: Record<string, string> = {
  vision: 'Vision',
  code: 'Functions',
  toolCall: 'Tool Calling',
  deepThinking: 'Deep Thinking',
  webSearch: 'Web Search',
  imageGen: 'Image Gen',
  videoRec: 'Video',
}

/**
 * Animation variants for staggered list
 */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 400,
      damping: 30,
    },
  },
}

/**
 * ModelList component
 * Renders a list of models with selection and favorite functionality
 */
export function ModelList({
  models,
  selectedModelCode,
  selectedModelProvider,
  favoriteModels,
  onModelSelect,
  onToggleFavorite,
}: ModelListProps): React.ReactElement {
  const { animationsEnabled } = useMotionPreferences()

  if (models.length === 0) {
    return (
      <div className="py-6 px-4 text-center text-muted-foreground">
        <Search size={20} className="opacity-30 mx-auto mb-2" />
        <div className="text-sm">No models found</div>
      </div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial={animationsEnabled ? 'hidden' : false}
      animate={animationsEnabled ? 'show' : undefined}
      className="flex flex-col gap-1"
    >
      {models.map((model) => {
        const isActive =
          selectedModelCode === model.code && selectedModelProvider === model.provider
        return (
          <motion.div key={`${model.provider}-${model.code}`} variants={itemVariants}>
            <ModelItem
              model={model}
              isActive={isActive}
              isFavorite={favoriteModels.includes(model.code)}
              animationsEnabled={animationsEnabled}
              onSelect={onModelSelect}
              onToggleFavorite={onToggleFavorite}
            />
          </motion.div>
        )
      })}
    </motion.div>
  )
}

/**
 * Props for ModelItem component
 */
interface ModelItemProps {
  model: ModelWithProvider
  isActive: boolean
  isFavorite: boolean
  animationsEnabled: boolean
  onSelect: (model: ModelWithProvider, e?: React.MouseEvent) => void
  onToggleFavorite: (modelCode: string, e: React.MouseEvent) => void
}
function ModelItem({
  model,
  isActive,
  isFavorite,
  animationsEnabled,
  onSelect,
  onToggleFavorite,
}: ModelItemProps): React.ReactElement {
  const { color, badge } = getModelAttributes(model)
  const capabilities = getCapabilitiesForModelPicker(model)
  const description = getModelDescription(model)
  const providerTitle = getProviderTitle(model.provider)
  const capabilityChips = capabilities.map((capKey) => {
    const badgeConfig = CAPABILITY_BADGES[capKey]
    const label = badgeConfig?.label ?? LEGACY_CAPABILITY_LABELS[capKey] ?? capKey
    return (
      <span key={capKey} className="model-info-chip">
        {label}
      </span>
    )
  })

  return (
    <motion.div
      onClick={(e) => onSelect(model, e)}
      onMouseDown={(e) => e.stopPropagation()}
      whileHover={maybeAnimate(animationsEnabled, { x: 2 })}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
        transition-colors min-w-0
        ${isActive ? 'bg-primary/10' : 'hover:bg-muted/50'}
      `}
    >
      <div
        className="w-8 h-8 shrink-0 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${color}20, transparent)` }}
      >
        <ModelIcon model={model} icon={getModelAttributes(model).icon} color={color} size={22} />
      </div>

      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold text-foreground">
            {removeEmojis(model.displayName)}
          </span>

          <motion.button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(model.code, e)
            }}
            whileHover={maybeAnimate(animationsEnabled, { scale: 1.1 })}
            whileTap={maybeAnimate(animationsEnabled, { scale: 0.92 })}
            animate={animationsEnabled && isFavorite ? { scale: [1, 1.3, 1] } : {}}
            transition={motionSpring.snappy}
            className="p-0.5 shrink-0 transition-opacity"
            style={{
              color: isFavorite ? 'var(--theme-favorite)' : 'var(--theme-text-muted)',
              opacity: isFavorite ? 1 : 0.4,
            }}
          >
            <Star size={12} fill={isFavorite ? 'var(--theme-favorite)' : 'none'} />
          </motion.button>

          {badge && <div className="shrink-0">{badge}</div>}
        </div>

        <span className="text-xs text-muted-foreground truncate opacity-70">{description}</span>
      </div>

      <div className="flex shrink-0 self-start items-start gap-1 pt-0.5">
        {capabilities.map((capKey) => {
          const badgeConfig = CAPABILITY_BADGES[capKey]
          if (!badgeConfig) return null
          const Icon = badgeConfig.icon
          return (
            <WithTooltip key={capKey} tooltip={badgeConfig.label}>
              <div className="p-1 rounded opacity-60 hover:opacity-80 transition-opacity">
                <Icon size={14} className="text-muted-foreground" />
              </div>
            </WithTooltip>
          )
        })}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Model information"
              className="model-info-btn p-1 rounded transition-all opacity-55 hover:opacity-85"
              onClick={(e) => e.stopPropagation()}
            >
              <Info size={14} className="text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8} className="rounded-lg model-info-tooltip">
            <div className="model-info-tooltip__title">Model info</div>
            <div className="model-info-tooltip__name">{removeEmojis(model.displayName)}</div>
            <div className="model-info-tooltip__description">{description}</div>
            <div className="model-info-tooltip__meta">
              {providerTitle} · {model.code}
            </div>
            {capabilities.length > 0 && (
              <div className="model-info-tooltip__chips">{capabilityChips}</div>
            )}
          </TooltipContent>
        </Tooltip>

        {isActive && (
          <motion.div
            layoutId="active-model-indicator-list"
            className="h-2 w-2 rounded-full bg-primary"
            initial={false}
            transition={motionSpring.gentle}
          />
        )}
      </div>
    </motion.div>
  )
}

export default ModelList
