import { motion } from 'framer-motion'
import { PopoverContent } from '@/components/ui/popover'
import { ModelSelectorDropdown, type ModelSelectorDropdownProps } from './ModelSelectorDropdown'

export interface ModelSelectorContentProps extends ModelSelectorDropdownProps {
  popoverAlign: 'start' | 'center' | 'end'
  effectiveDropdownWidth: number
  effectiveDropdownHeight: number
}

/**
 * The popover surface for the model selector.
 *
 * Extracted from ModelSelector.tsx so the trigger button and the dropdown
 * surface live in separate files. Behavior is identical: it renders the sized
 * PopoverContent, the entrance animation wrapper, and the dropdown itself.
 */
export function ModelSelectorContent({
  popoverAlign,
  effectiveDropdownWidth,
  effectiveDropdownHeight,
  ...dropdownProps
}: ModelSelectorContentProps) {
  return (
    <PopoverContent
      className="theme-menu-surface model-selector-popover overflow-hidden p-0"
      align={popoverAlign}
      collisionPadding={12}
      style={{
        width: `min(${effectiveDropdownWidth}px, max(320px, calc(var(--radix-popover-content-available-width) - 8px)))`,
        maxWidth: 'calc(100vw - 24px)',
        height: `min(${effectiveDropdownHeight}px, max(160px, calc(var(--radix-popover-content-available-height) - 8px)))`,
        maxHeight: 'calc(100vh - 24px)',
      }}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onFocusOutside={(e) => e.preventDefault()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{
          duration: 0.2,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="h-full"
      >
        <ModelSelectorDropdown {...dropdownProps} />
      </motion.div>
    </PopoverContent>
  )
}
