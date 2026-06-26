import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchOpencodeModels,
  mapOpencodeModelToConfiguredModel,
  type OpencodeModel,
} from '../../../services/opencode'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { resolveApiKeyFromSecureStorage } from '../../../utils/secureApiKeys'
import { toast } from 'sonner'
import { CatalogDialogBody, CatalogHeader, type CatalogItem } from './catalog'

interface OpencodeModelSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
}

export function OpencodeModelSearchDialog({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
}: OpencodeModelSearchDialogProps): React.ReactElement {
  const [models, setModels] = useState<OpencodeModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = useCallback(async () => {
    const resolvedApiKey = await resolveApiKeyFromSecureStorage('opencodeGoApiKey', apiKey ?? '')

    if (!resolvedApiKey.trim()) {
      setError('Add an OpenCode Go API key before loading the catalog.')
      setModels([])
      return
    }

    setLoading(true)
    setError(null)
    fetchOpencodeModels(resolvedApiKey)
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

  const items = useMemo<CatalogItem<OpencodeModel>[]>(
    () =>
      models.map((model) => {
        const configured = mapOpencodeModelToConfiguredModel(model)
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

  const handleAdd = (item: CatalogItem<OpencodeModel>) => {
    const configured = mapOpencodeModelToConfiguredModel(item.model)
    onAddModel(configured)
    toast.success(`Added ${configured.displayName}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-[900px] max-h-[85vh] flex flex-col" showCloseButton={false} overlayClassName="catalog-modal-backdrop">
        <CatalogHeader
          provider="opencode"
          title="Add Model from OpenCode Go Catalog"
          description="Browse and add OpenCode Go models. The catalog is refreshed whenever you open this dialog."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
        />
        <CatalogDialogBody
          providerKey="opencode"
          items={items}
          addedIds={addedIds}
          loading={loading}
          error={error}
          onAdd={handleAdd}
          onRetry={loadModels}
          onDone={() => onOpenChange(false)}
          searchPlaceholder="Search OpenCode Go models by name or ID..."
        />
      </DialogContent>
    </Dialog>
  )
}