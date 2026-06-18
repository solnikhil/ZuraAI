import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchPerplexityModels,
  mapPerplexityModelToConfiguredModel,
  type PerplexityCatalogModel,
} from '../../../services/perplexityModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface PerplexityModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

export function PerplexityModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: PerplexityModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<PerplexityCatalogModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(() => {
    if (!apiKey?.trim()) {
      setError('Add a Perplexity API key before loading the catalog.')
      setModels([])
      return
    }

    setLoading(true)
    setError(null)
    fetchPerplexityModels(apiKey)
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

  const items = useMemo<CatalogItem<PerplexityCatalogModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapPerplexityModelToConfiguredModel(model)
        return {
          id: model.id,
          displayName: configured.displayName,
          description: model.description,
          capabilities: getCapabilitiesFromModel(configured),
          model,
        }
      }),
    [models]
  )

  const addedIds = useMemo(() => new Set(existingModelCodes), [existingModelCodes])

  const handleAdd = (item: CatalogItem<PerplexityCatalogModel>) => {
    const configured = mapPerplexityModelToConfiguredModel(item.model)
    onAddModel(configured)
    toast.success(`Added ${configured.displayName}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-[900px] max-h-[85vh] flex flex-col" showCloseButton={false} overlayClassName="catalog-modal-backdrop">
        <CatalogHeader
          provider="perplexity"
          title="Add Model from Perplexity Catalog"
          description="Search and add official Sonar models for Perplexity's chat-completions API. Agent API-only models are excluded from this catalog."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="perplexity"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          searchPlaceholder="Search Perplexity models by name, ID, or description..."
        />
      </DialogContent>
    </Dialog>
  )
}
