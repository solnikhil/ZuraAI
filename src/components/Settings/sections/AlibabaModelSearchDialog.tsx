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
  apiKey?: string
  existingModelCodes?: string[]
}

export function AlibabaModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: AlibabaModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<AlibabaCatalogModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(() => {
    if (!apiKey?.trim()) {
      setError('Add an Alibaba API key before loading the catalog.')
      setModels([])
      return
    }

    setLoading(true)
    setError(null)
    fetchAlibabaModels(apiKey)
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
          description="Search and add official Qwen models from Alibaba Cloud Model Studio. The catalog is refreshed whenever you open this dialog, and you can refresh it manually here too."
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
