import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'
import { ChevronDown, Cpu } from 'lucide-react'
import { useSettings } from '../../../contexts/SettingsContext'
import { useModelSelector } from './useModelSelector'
import { useResponsiveModelSelector } from './useResponsiveModelSelector'
import { ModelSelectorDropdown } from './ModelSelectorDropdown'
import { ModelIcon } from './ModelIcon'
import { getModelAttributes } from '../../../utils/modelUtils'
import {
  maybeAnimate,
  motionDuration,
  motionDurations,
  motionEasing,
  useMotionPreferences,
} from '@/lib/motion'
import { cn } from '@/lib/utils'
import './ModelSelector.css'

export interface ModelSelectorProps {
  minimal?: boolean
  popoverAlign?: 'start' | 'center' | 'end'
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  backgroundColor: 'rgba(0, 0, 0, 0.42)',
}

const liveRegionStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

export default function ModelSelector({
  minimal,
  popoverAlign: _popoverAlign = 'start',
}: ModelSelectorProps): React.ReactElement {
  const { settings } = useSettings()
  const {
    state,
    searchInputRef,
    currentModels,
    groupedModels,
    currentModel,
    currentName,
    setSearchQuery,
    setViewMode,
    setSelectedProvider,
    setFocusedIndex,
    setIsOpen,
    toggleFavorite,
    handleSelect,
  } = useModelSelector()

  const modelSelector = settings.modelSelector || {
    dropdownWidth: 'default',
    showDescriptions: true,
    showSearch: true,
  }

  const { compactMode, effectiveDropdownWidth, effectiveDropdownHeight, triggerLabelMaxWidth } =
    useResponsiveModelSelector(modelSelector.dropdownWidth || 'default', minimal)
  const { animationsEnabled } = useMotionPreferences()
  const estimatedRowHeight =
    compactMode === 'tight' ? 48 : compactMode === 'compact' ? 56 : modelSelector.showDescriptions === false ? 58 : 62
  const searchHeight = modelSelector.showSearch === false ? 0 : compactMode === 'tight' ? 58 : 66
  const contentChromeHeight = compactMode === 'tight' ? 84 : 92
  const stableVisibleRowCount = 7
  const emptyStateHeight = currentModels.length === 0 ? 176 : 0
  const modelContentHeight = currentModels.length === 0
    ? 8 + searchHeight + contentChromeHeight + emptyStateHeight
    : 8 + searchHeight + contentChromeHeight + stableVisibleRowCount * estimatedRowHeight
  const dropdownHeight = Math.max(360, Math.min(effectiveDropdownHeight, modelContentHeight))

  return (
    <DialogPrimitive.Root open={state.isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Trigger asChild>
        <motion.button
          aria-haspopup="dialog"
          aria-expanded={state.isOpen}
          title={`${currentName} - ${settings.modelProvider || 'auto'}`}
          whileHover={!minimal ? maybeAnimate(animationsEnabled, { scale: 1.01 }) : undefined}
          whileTap={maybeAnimate(animationsEnabled, minimal ? { scale: 0.995 } : { scale: 0.99 })}
          transition={{
            duration: motionDuration(animationsEnabled, motionDurations.micro),
            ease: motionEasing.standard,
          }}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5',
            minimal
              ? 'theme-control-btn rounded-[10px] px-2.5 py-1 text-[var(--theme-text-secondary)]'
              : 'border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] text-[var(--theme-text-secondary)] transition-[background-color,border-color,color,box-shadow] duration-150 hover:bg-[var(--theme-surface-hover)] hover:border-[var(--theme-border-hover)] hover:text-[var(--theme-text-primary)] hover:shadow-[var(--theme-shadow-sm)]',
            minimal && state.isOpen && 'is-active',
            minimal && compactMode !== 'none' && 'px-2 py-1'
          )}
        >
          {!minimal &&
            (currentModel ? (
              <ModelIcon
                model={currentModel}
                icon={getModelAttributes(currentModel).icon}
                color={getModelAttributes(currentModel).color}
                size={16}
              />
            ) : (
              <Cpu size={14} />
            ))}
          <span
            className={cn('truncate font-medium', minimal ? 'text-[0.95rem]' : 'text-xs')}
            style={{
              maxWidth: triggerLabelMaxWidth,
              minWidth: minimal ? 0 : '80px',
            }}
          >
            {currentName}
          </span>
          {!(minimal && compactMode === 'tight') && (
            <motion.div
              animate={{ rotate: state.isOpen ? 180 : 0 }}
              transition={{
                duration: motionDuration(animationsEnabled, motionDurations.fast),
                ease: motionEasing.standard,
              }}
            >
              <ChevronDown size={12} className="opacity-50" />
            </motion.div>
          )}
        </motion.button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={overlayStyle}
          data-state={state.isOpen ? 'open' : 'closed'}
        />
        <DialogPrimitive.Content
          aria-label="Model picker"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="theme-menu-surface fixed left-1/2 top-[15%] z-[9999] flex w-full -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--theme-border)] outline-none shadow-[0_20px_60px_rgba(0,0,0,0.38),0_8px_24px_rgba(0,0,0,0.18)]"
          style={{
            maxWidth: `${effectiveDropdownWidth}px`,
            width: 'calc(100vw - 56px)',
            height: `${dropdownHeight}px`,
            maxHeight: 'calc(100vh - 56px)',
          }}
        >
          <DialogPrimitive.Title style={liveRegionStyle}>Model picker</DialogPrimitive.Title>
          <DialogPrimitive.Description style={liveRegionStyle}>
            Search and choose an active model
          </DialogPrimitive.Description>

          <ModelSelectorDropdown
            searchInputRef={searchInputRef}
            searchQuery={state.searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={state.viewMode}
            onViewModeChange={setViewMode}
            selectedProvider={state.selectedProvider}
            onProviderSelect={setSelectedProvider}
            currentModels={currentModels}
            groupedModels={groupedModels}
            selectedModelCode={settings.aiModel}
            selectedModelProvider={settings.modelProvider}
            favoriteModels={settings.favoriteModels || []}
            onModelSelect={handleSelect}
            onToggleFavorite={toggleFavorite}
            compactMode={compactMode}
            focusedIndex={state.focusedIndex}
            onFocusedIndexChange={setFocusedIndex}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
