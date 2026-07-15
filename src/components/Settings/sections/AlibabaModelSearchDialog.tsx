import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchAlibabaModels,
  mapAlibabaModelToConfiguredModel,
  type AlibabaCatalogModel,
} from '../../../services/alibabaModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface AlibabaModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  existingModelCodes?: string[]
}

export function AlibabaModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  existingModelCodes = [],
}: AlibabaModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<AlibabaCatalogModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchAlibabaModels()
      .then((fetchedModels) => {
        setModels(fetchedModels)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to fetch models')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (open) {
      loadModels()
    }
  }, [open, loadModels])

  const items = useMemo<CatalogItem<AlibabaCatalogModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapAlibabaModelToConfiguredModel(model)
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

  const handleAdd = (item: CatalogItem<AlibabaCatalogModel>) => {
    const configured = mapAlibabaModelToConfiguredModel(item.model)
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
          provider="alibaba"
          title="Add Model from Alibaba Catalog"
          description="Search a curated set of documented Qwen models. You can also add an exact model ID manually when a regional model is not listed."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="alibaba"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          searchPlaceholder="Search Alibaba models by name, ID, or description..."
        />
      </DialogContent>
    </Dialog>
  )
}
