/**
 * Alibaba Model Search Dialog
 * Thin wrapper over the generic ModelCatalogDialog.
 */

import React from 'react'
import {
  fetchAlibabaModels,
  mapAlibabaModelToConfiguredModel,
  searchAlibabaModels,
  type AlibabaCatalogModel,
} from '../../../services/alibabaModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { ModelCatalogDialog, type ModelCatalogConfig } from './ModelCatalogDialog'

interface AlibabaModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

const config: ModelCatalogConfig<AlibabaCatalogModel> = {
  title: 'Add Model from Alibaba Catalog',
  description:
    'Search and add official Qwen models from Alibaba Cloud Model Studio. The catalog is refreshed whenever you open this dialog, and you can refresh it manually here too.',
  searchPlaceholder: 'Search Alibaba models by name, ID, or description...',
  fetchModels: fetchAlibabaModels,
  searchModels: searchAlibabaModels,
  mapModel: mapAlibabaModelToConfiguredModel,
  getModelKey: (model) => model.id,
  getPrimaryLabel: (model) => model.displayName,
  getDescription: (model) => model.description,
  requireApiKey: true,
  missingApiKeyMessage: 'Add an Alibaba API key before loading the catalog.',
  showRefresh: true,
  reloadEveryOpen: true,
}

export function AlibabaModelSearchDialog(
  props: AlibabaModelSearchDialogProps
): React.ReactElement {
  return <ModelCatalogDialog {...props} config={config} />
}
