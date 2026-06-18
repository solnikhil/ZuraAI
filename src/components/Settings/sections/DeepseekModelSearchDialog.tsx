import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  fetchDeepSeekModels,
  fetchDeepSeekBalance,
  mapDeepSeekModelToConfiguredModel,
  type DeepSeekModel,
  type DeepSeekBalanceInfo,
} from '../../../services/deepseek'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel } from '@/utils/modelUtils'
import { resolveApiKeyFromSecureStorage } from '../../../utils/secureApiKeys'
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
  const [balance, setBalance] = useState<DeepSeekBalanceInfo | null>(null)

  const loadModels = useCallback(async () => {
    const resolvedApiKey = await resolveApiKeyFromSecureStorage('deepseekApiKey', apiKey ?? '')

    if (!resolvedApiKey.trim()) {
      setError('Add a DeepSeek API key before loading the catalog.')
      setModels([])
      return
    }

    setLoading(true)
    setError(null)
    fetchDeepSeekModels(resolvedApiKey)
      .then((fetchedModels) => {
        setModels(fetchedModels)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to fetch models')
        setLoading(false)
      })

    fetchDeepSeekBalance(resolvedApiKey)
      .then((balanceInfo) => {
        setBalance(balanceInfo)
      })
      .catch(() => {
        setBalance(null)
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

  const balanceBanner = balance ? (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {balance.balance_infos.map((info, i) => (
        <span key={i}>
          Balance: {info.total_balance} {info.currency}
        </span>
      ))}
    </div>
  ) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-[900px] max-h-[85vh] flex flex-col" showCloseButton={false} overlayClassName="catalog-modal-backdrop">
        <CatalogHeader
          provider="deepseek"
          title="Add Model from DeepSeek Catalog"
          description="Browse and add DeepSeek models. The catalog is refreshed whenever you open this dialog."
          loading={loading}
          onRefresh={loadModels}
          showRefresh
          extra={balanceBanner}
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
