import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchFireworksModels,
  mapFireworksModelToConfiguredModel,
  type FireworksModel,
} from '../../../services/fireworksModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface FireworksModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

export function FireworksModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: FireworksModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<FireworksModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(() => {
    if (!apiKey?.trim()) {
      setError('Add a Fireworks API key before loading the catalog.')
      setModels([])
      return
    }

    setLoading(true)
    setError(null)
    fetchFireworksModels(apiKey)
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

  const items = useMemo<CatalogItem<FireworksModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapFireworksModelToConfiguredModel(model)
        return {
          id: model.name,
          displayName: configured.displayName,
          description: model.description,
          capabilities: getCapabilitiesFromModel(configured),
          model,
        }
      }),
    [models]
  )

  const addedIds = useMemo(() => new Set(existingModelCodes), [existingModelCodes])

  const handleAdd = (item: CatalogItem<FireworksModel>) => {
    const configured = mapFireworksModelToConfiguredModel(item.model)
    onAddModel(configured)
    toast.success(`Added ${configured.displayName}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="provider-catalog-dialog p-0" showCloseButton={false} overlayClassName="catalog-modal-backdrop">
        <CatalogHeader
          provider="fireworks"
          title="Add Model from Fireworks Catalog"
          description="Search and add serverless Fireworks models. Capabilities are mapped automatically when the catalog exposes them."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="fireworks"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          searchPlaceholder="Search Fireworks models by name or description..."
        />
      </DialogContent>
    </Dialog>
  )
}
