/**
 * ModelSelector barrel export
 * 
 * @module ModelSelector
 * Requirements: 6.1
 */

// Main component
export { default as ModelSelector } from './ModelSelector'
export { default } from './ModelSelector'

// Sub-components
export { ModelSelectorDropdown } from './ModelSelectorDropdown'
export { ModelList } from './ModelList'
export { ModelGroupRenderer } from './ModelGroupRenderer'
export { ModelIcon } from './ModelIcon'

// Hook
export { useModelSelector } from './useModelSelector'
export type { UseModelSelectorReturn, ModelSelectorState } from './useModelSelector'

// Types
export type { ModelWithProvider, ViewMode, ProviderConfig } from './types'
