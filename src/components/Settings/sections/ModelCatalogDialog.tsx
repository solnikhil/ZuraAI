/**
 * Generic model-catalog search dialog.
 *
 * Backs every provider's "Add model from catalog" dialog (OpenRouter, DeepSeek,
 * Alibaba, Fireworks, Perplexity). Provider-specific behavior is expressed
 * through a `ModelCatalogConfig` rather than a copy of this component.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCcw, Search, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { CAPABILITY_BADGES, getCapabilitiesFromModel } from '../../../utils/modelUtils'
import type { SecureStorageKey } from '../../../utils/secureApiKeys'

/**
 * Provider-specific configuration for {@link ModelCatalogDialog}.
 * `TModel` is the raw catalog model type returned by the provider service.
 */
export interface ModelCatalogConfig<TModel> {
  /** Dialog title, e.g. "Add Model from OpenRouter Catalog". */
  title: string
  /** Dialog description shown under the title. */
  description: React.ReactNode
  /** Search input placeholder. */
  searchPlaceholder: string
  /** Fetch the full catalog for the given (resolved) API key. */
  fetchModels: (apiKey: string) => Promise<TModel[]>
  /** Filter the catalog for a search query. */
  searchModels: (models: TModel[], query: string) => TModel[]
  /** Map a raw catalog model into a ConfiguredModel. */
  mapModel: (model: TModel) => ConfiguredModel
  /** Unique key/code for a model (used for React key, "added" checks, secondary label). */
  getModelKey: (model: TModel) => string
  /** Primary display label for a model row. */
  getPrimaryLabel: (model: TModel, configured: ConfiguredModel) => string
  /** Optional per-model description line. */
  getDescription?: (model: TModel) => string | undefined
  /** Require a non-empty API key before loading (default: false). */
  requireApiKey?: boolean
  /** Error message shown when `requireApiKey` and no key is present. */
  missingApiKeyMessage?: string
  /** Secure-storage key to resolve the API key from before loading. */
  secureStorageKey?: SecureStorageKey
  /** Limit applied to the unsearched catalog view (no limit when undefined). */
  defaultLimit?: number
  /** Limit applied to searched results (no limit when undefined). */
  searchLimit?: number
  /** Show the dialog close button (default: true). */
  showCloseButton?: boolean
  /** Show a manual "Refresh" button in the header (default: false). */
  showRefresh?: boolean
  /** Reload the catalog every time the dialog opens (default: only when empty). */
  reloadEveryOpen?: boolean
  /** Optional side data (e.g. account balance) fetched alongside the catalog. */
  fetchBanner?: (apiKey: string) => Promise<React.ReactNode | null>
}

interface ModelCatalogDialogProps<TModel> {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddModel: (model: ConfiguredModel) => void
  apiKey?: string
  existingModelCodes?: string[]
  config: ModelCatalogConfig<TModel>
}

export function ModelCatalogDialog<TModel>({
  open,
  onOpenChange,
  onAddModel,
  apiKey,
  existingModelCodes = [],
  config,
}: ModelCatalogDialogProps<TModel>): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [models, setModels] = useState<TModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<React.ReactNode | null>(null)

  const loadModels = useCallback(async () => {
    let resolvedApiKey = apiKey ?? ''
    if (config.secureStorageKey) {
      const { resolveApiKeyFromSecureStorage } = await import('../../../utils/secureApiKeys')
      resolvedApiKey = await resolveApiKeyFromSecureStorage(config.secureStorageKey, apiKey ?? '')
    }

    if (config.requireApiKey && !resolvedApiKey.trim()) {
      setError(config.missingApiKeyMessage ?? 'Add an API key before loading the catalog.')
      return
    }

    setLoading(true)
    setError(null)
    config
      .fetchModels(resolvedApiKey)
      .then((fetchedModels) => {
        setModels(fetchedModels)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to fetch models')
        setLoading(false)
      })

    if (config.fetchBanner) {
      config
        .fetchBanner(resolvedApiKey)
        .then((node) => setBanner(node))
        .catch(() => setBanner(null))
    }
  }, [apiKey, config])

  useEffect(() => {
    if (!open) return
    if (config.reloadEveryOpen || models.length === 0) {
      void loadModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiKey, loadModels])

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return config.defaultLimit ? models.slice(0, config.defaultLimit) : models
    }
    const results = config.searchModels(models, searchQuery)
    return config.searchLimit ? results.slice(0, config.searchLimit) : results
  }, [models, searchQuery, config])

  const handleAddModel = (apiModel: TModel) => {
    onAddModel(config.mapModel(apiModel))
    onOpenChange(false)
    setSearchQuery('')
  }

  const isModelAdded = (modelKey: string) => existingModelCodes.includes(modelKey)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 sm:max-w-[900px] max-h-[85vh] flex flex-col"
        showCloseButton={config.showCloseButton ?? true}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          {config.showRefresh ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle>{config.title}</DialogTitle>
                <DialogDescription>{config.description}</DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadModels()}
                disabled={loading}
                className="gap-2 shrink-0"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                Refresh
              </Button>
            </div>
          ) : (
            <>
              <DialogTitle>{config.title}</DialogTitle>
              <DialogDescription>{config.description}</DialogDescription>
            </>
          )}
        </DialogHeader>

        {banner && (
          <div className="px-6 py-2 border-b border-border text-xs text-muted-foreground">
            {banner}
          </div>
        )}

        <div className="px-6 py-4 border-b border-border">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={config.searchPlaceholder}
              className="pl-9 border-border bg-secondary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
              <span className="ml-3 text-sm text-muted-foreground">Loading models...</span>
            </div>
          )}

          {error && (
            <div className="py-8 text-center">
              <div className="text-sm text-destructive mb-2">{error}</div>
              <Button variant="outline" size="sm" onClick={() => void loadModels()}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && (
            <>
              {filteredModels.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Search size={32} className="mx-auto mb-3 opacity-30" />
                  <div className="text-sm">No models found matching &quot;{searchQuery}&quot;</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredModels.map((model) => {
                    const configuredModel = config.mapModel(model)
                    const capabilities = getCapabilitiesFromModel(configuredModel)
                    const modelKey = config.getModelKey(model)
                    const isAdded = isModelAdded(modelKey)
                    const description = config.getDescription?.(model)

                    return (
                      <div
                        key={modelKey}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-foreground truncate">
                              {config.getPrimaryLabel(model, configuredModel)}
                            </span>
                            {isAdded && (
                              <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                                Added
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mb-2">
                            {modelKey}
                          </div>
                          {description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {description}
                            </div>
                          )}
                          {capabilities.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {capabilities.map((capKey) => {
                                const badgeConfig = CAPABILITY_BADGES[capKey]
                                if (!badgeConfig) return null
                                const Icon = badgeConfig.icon
                                return (
                                  <div
                                    key={capKey}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted/60 text-muted-foreground"
                                    title={badgeConfig.label}
                                  >
                                    <Icon size={12} />
                                    <span>{badgeConfig.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        <Button
                          variant={isAdded ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => handleAddModel(model)}
                          disabled={isAdded}
                          className="ml-4 shrink-0"
                        >
                          {isAdded ? (
                            <>
                              <X size={14} className="mr-1" />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus size={14} className="mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
