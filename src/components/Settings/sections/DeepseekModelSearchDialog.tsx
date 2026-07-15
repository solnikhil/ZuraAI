import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchDeepSeekModels,
  mapDeepSeekModelToConfiguredModel,
  type DeepSeekModel,
} from '../../../services/deepseek'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface DeepseekModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

export function DeepseekModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: DeepseekModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<DeepSeekModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchDeepSeekModels(apiKey ?? '')
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

  const items = useMemo<CatalogItem<DeepSeekModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapDeepSeekModelToConfiguredModel(model)
        return {
          id: model.id,
          displayName: configured.displayName,
          capabilities: getCapabilitiesFromModel(configured),
          model,
        }
      }),
    [models]
  )

  const addedIds = useMemo(() => new Set(existingModelCodes), [existingModelCodes])

  const handleAdd = (item: CatalogItem<DeepSeekModel>) => {
    const configured = mapDeepSeekModelToConfiguredModel(item.model)
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
          provider="deepseek"
          title="Add Model from DeepSeek Catalog"
          description="Browse and add DeepSeek models. The catalog is refreshed whenever you open this dialog."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="deepseek"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          searchPlaceholder="Search DeepSeek models by name or ID..."
        />
      </DialogContent>
    </Dialog>
  )
}
