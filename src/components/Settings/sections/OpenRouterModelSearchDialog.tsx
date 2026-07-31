/**
 * OpenRouter Model Search Dialog
 * Thin wrapper over the generic ModelCatalogDialog.
 */

import React from 'react'
import {
  fetchOpenRouterModels,
  mapOpenRouterModelToConfiguredModel,
  searchOpenRouterModels,
  type OpenRouterModel,
} from '../../../services/openrouterModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { ModelCatalogDialog, type ModelCatalogConfig } from './ModelCatalogDialog'

interface OpenRouterModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

const config: ModelCatalogConfig<OpenRouterModel> = {
  title: 'Add Model from OpenRouter Catalog',
  description:
    'Search and add models from OpenRouter. Capabilities are automatically detected from the API.',
  searchPlaceholder: 'Search models by name, ID, or description...',
  fetchModels: fetchOpenRouterModels,
  searchModels: searchOpenRouterModels,
  mapModel: mapOpenRouterModelToConfiguredModel,
  getModelKey: (model) => model.id,
  getPrimaryLabel: (model) => model.name,
  getDescription: (model) => model.description,
  defaultLimit: 50,
  searchLimit: 100,
  showCloseButton: false,
}

export function OpenRouterModelSearchDialog(
  props: OpenRouterModelSearchDialogProps
): React.ReactElement {
  return <ModelCatalogDialog {...props} config={config} />
}
