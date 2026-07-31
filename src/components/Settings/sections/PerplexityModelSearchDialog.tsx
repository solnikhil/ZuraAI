/**
 * Perplexity Model Search Dialog
 * Thin wrapper over the generic ModelCatalogDialog.
 */

import React from 'react'
import {
  fetchPerplexityModels,
  mapPerplexityModelToConfiguredModel,
  searchPerplexityModels,
  type PerplexityCatalogModel,
} from '../../../services/perplexityModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { ModelCatalogDialog, type ModelCatalogConfig } from './ModelCatalogDialog'

interface PerplexityModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

const config: ModelCatalogConfig<PerplexityCatalogModel> = {
  title: 'Add Model from Perplexity Catalog',
  description:
    "Search and add official Sonar models for Perplexity's chat-completions API. Agent API-only models are excluded from this catalog.",
  searchPlaceholder: 'Search Perplexity models by name, ID, or description...',
  fetchModels: fetchPerplexityModels,
  searchModels: searchPerplexityModels,
  mapModel: mapPerplexityModelToConfiguredModel,
  getModelKey: (model) => model.id,
  getPrimaryLabel: (model) => model.displayName,
  getDescription: (model) => model.description,
  requireApiKey: true,
  missingApiKeyMessage: 'Add a Perplexity API key before loading the catalog.',
}

export function PerplexityModelSearchDialog(
  props: PerplexityModelSearchDialogProps
): React.ReactElement {
  return <ModelCatalogDialog {...props} config={config} />
}
