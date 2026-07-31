/**
 * Fireworks Model Search Dialog
 * Thin wrapper over the generic ModelCatalogDialog.
 */

import React from 'react'
import {
  fetchFireworksModels,
  mapFireworksModelToConfiguredModel,
  searchFireworksModels,
  type FireworksModel,
} from '../../../services/fireworksModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { ModelCatalogDialog, type ModelCatalogConfig } from './ModelCatalogDialog'

interface FireworksModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

const config: ModelCatalogConfig<FireworksModel> = {
  title: 'Add Model from Fireworks Catalog',
  description:
    'Search and add serverless Fireworks models. Capabilities are mapped automatically when the catalog exposes them.',
  searchPlaceholder: 'Search Fireworks models by name or description...',
  fetchModels: fetchFireworksModels,
  searchModels: searchFireworksModels,
  mapModel: mapFireworksModelToConfiguredModel,
  getModelKey: (model) => model.name,
  getPrimaryLabel: (model) => model.displayName || model.name,
  getDescription: (model) => model.description,
  requireApiKey: true,
  missingApiKeyMessage: 'Add a Fireworks API key before loading the catalog.',
}

export function FireworksModelSearchDialog(
  props: FireworksModelSearchDialogProps
): React.ReactElement {
  return <ModelCatalogDialog {...props} config={config} />
}
