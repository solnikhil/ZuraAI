/**
 * Settings module barrel export
 * 
 * @module Settings
 * Requirements: 6.1
 */

// Main Settings container
export { default as Settings, default } from './Settings'

// Extracted components
export { CustomModelSelect } from './CustomModelSelect'
export type { CustomModelSelectProps, ModelOption } from './CustomModelSelect'

export { ActivityGraph } from './ActivityGraph'
export type { ActivityGraphProps, ActivityData } from './ActivityGraph'

export { ApiKeyManager } from './ApiKeyManager'
export type { ApiKeyManagerProps } from './ApiKeyManager'

// Section components
export { UsageSection } from './sections/UsageSection'
export { ModelSection } from './sections/ModelSection'
export { ApiKeysSection } from './sections/ApiKeysSection'
export { AppearanceSection } from './sections/AppearanceSection'
export { CommandBarSection } from './sections/CommandBarSection'

