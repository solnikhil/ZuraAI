/**
 * OpenRouter Model Search Dialog
 * Search and add models from OpenRouter API catalog with auto-mapped capabilities
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchOpenRouterModels,
  mapOpenRouterModelToConfiguredModel,
  type OpenRouterModel,
} from '../../../services/openrouterModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface OpenRouterModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

const VISIBLE_LIMIT = 100
const VISIBLE_LIMIT_STEP = 100

export function OpenRouterModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: OpenRouterModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchOpenRouterModels(apiKey)
      .then((fetchedModels) => {
        setModels(fetchedModels)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to fetch models')
        setLoading(false)
      })
  }, [apiKey])

  useEffect(() => {
    if (open && models.length === 0) {
      loadModels()
    }
  }, [open, loadModels, models.length])

  const items = useMemo<CatalogItem<OpenRouterModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapOpenRouterModelToConfiguredModel(model)
        const vendor = model.id.includes('/') ? model.id.split('/')[0] : undefined
        return {
          id: model.id,
          displayName: configured.displayName,
          description: model.description,
          capabilities: getCapabilitiesFromModel(configured),
          vendor,
          model,
        }
      }),
    [models]
  )

  const addedIds = useMemo(() => new Set(existingModelCodes), [existingModelCodes])

  const handleAdd = (item: CatalogItem<OpenRouterModel>) => {
    const configured = mapOpenRouterModelToConfiguredModel(item.model)
    onAddModel(configured)
    toast.success(`Added ${configured.displayName}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="provider-catalog-dialog p-0"
        showCloseButton={false}
        overlayClassName="catalog-modal-backdrop"
      >
        <CatalogHeader
          provider="openrouter"
          title="Add Model from OpenRouter Catalog"
          description="Search and add models from OpenRouter. Capabilities are automatically detected from the API."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="openrouter"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          group
          visibleLimit={VISIBLE_LIMIT}
          visibleLimitStep={VISIBLE_LIMIT_STEP}
          searchPlaceholder="Search models by name, ID, or description..."
        />
      </DialogContent>
    </Dialog>
  )
}
