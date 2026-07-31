/**
 * DeepSeek Model Search Dialog
 * Thin wrapper over the generic ModelCatalogDialog.
 */

import React from 'react'
import {
  fetchDeepSeekModels,
  mapDeepSeekModelToConfiguredModel,
  searchDeepSeekModels,
  fetchDeepSeekBalance,
  type DeepSeekModel,
} from '../../../services/deepseek'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { ModelCatalogDialog, type ModelCatalogConfig } from './ModelCatalogDialog'

interface DeepseekModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

const config: ModelCatalogConfig<DeepSeekModel> = {
  title: 'Add Model from DeepSeek Catalog',
  description:
    'Browse and add DeepSeek models. The catalog is refreshed whenever you open this dialog.',
  searchPlaceholder: 'Search DeepSeek models by name or ID...',
  fetchModels: fetchDeepSeekModels,
  searchModels: searchDeepSeekModels,
  mapModel: mapDeepSeekModelToConfiguredModel,
  getModelKey: (model) => model.id,
  getPrimaryLabel: (_model, configured) => configured.displayName,
  requireApiKey: true,
  missingApiKeyMessage: 'Add a DeepSeek API key before loading the catalog.',
  secureStorageKey: 'deepseekApiKey',
  showRefresh: true,
  reloadEveryOpen: true,
  fetchBanner: async (apiKey) => {
    const balance = await fetchDeepSeekBalance(apiKey)
    if (!balance) return null
    return balance.balance_infos.map((info, i) => (
      <span key={i} className="mr-3">
        Balance: {info.total_balance} {info.currency}
      </span>
    ))
  },
}

export function DeepseekModelSearchDialog(
  props: DeepseekModelSearchDialogProps
): React.ReactElement {
  return <ModelCatalogDialog {...props} config={config} />
}
