import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchNvidiaModels,
  mapNvidiaModelToConfiguredModel,
  type NvidiaModel,
} from '../../../services/nvidiaModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { resolveApiKeyFromSecureStorage } from '../../../utils/secureApiKeys'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface NvidiaModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

export function NvidiaModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: NvidiaModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<NvidiaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(async () => {
    const resolvedApiKey = await resolveApiKeyFromSecureStorage('nvidiaApiKey', apiKey ?? '')

    if (!resolvedApiKey.trim()) {
      setError('Add an NVIDIA API key before loading the catalog.')
      setModels([])
      return
    }

    setLoading(true)
    setError(null)
    fetchNvidiaModels(resolvedApiKey)
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

  const items = useMemo<CatalogItem<NvidiaModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapNvidiaModelToConfiguredModel(model)
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

  const handleAdd = (item: CatalogItem<NvidiaModel>) => {
    const configured = mapNvidiaModelToConfiguredModel(item.model)
    onAddModel(configured)
    toast.success(`Added ${configured.displayName}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="provider-catalog-dialog p-0" showCloseButton={false} overlayClassName="catalog-modal-backdrop">
        <CatalogHeader
          provider="nvidia"
          title="Add Model from NVIDIA NIM Catalog"
          description="Browse NVIDIA NIM chat models from the OpenAI-compatible catalog."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="nvidia"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          searchPlaceholder="Search NVIDIA models by name or ID..."
        />
      </DialogContent>
    </Dialog>
  )
}
