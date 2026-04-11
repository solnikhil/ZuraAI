import React, { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  fetchPerplexityModels,
  mapPerplexityModelToConfiguredModel,
  searchPerplexityModels,
  type PerplexityCatalogModel,
} from '../../../services/perplexityModels'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import { getCapabilitiesFromModel, CAPABILITY_BADGES } from '../../../utils/modelUtils'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [models, setModels] = useState<PerplexityCatalogModel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModels = () => {
    if (!apiKey?.trim()) {
      setError('Add a Perplexity API key before loading the catalog.')
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
  }

  useEffect(() => {
    if (open && models.length === 0) {
      loadModels()
    }
  }, [open, apiKey, models.length])

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models
    return searchPerplexityModels(models, searchQuery)
  }, [models, searchQuery])

  const handleAddModel = (apiModel: PerplexityCatalogModel) => {
    onAddModel(mapPerplexityModelToConfiguredModel(apiModel))
    onOpenChange(false)
    setSearchQuery('')
  }

  const isModelAdded = (modelId: string) => existingModelCodes.includes(modelId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card p-0 sm:max-w-[900px] max-h-[85vh] flex flex-col">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Add Model from Perplexity Catalog</DialogTitle>
          <DialogDescription>
            Search and add official Sonar models for Perplexity&apos;s chat-completions API.
            Agent API-only models are excluded from this catalog.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 border-b border-border">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Perplexity models by name, ID, or description..."
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
              <Button variant="outline" size="sm" onClick={loadModels}>
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
                    const configuredModel = mapPerplexityModelToConfiguredModel(model)
                    const capabilities = getCapabilitiesFromModel(configuredModel)
                    const isAdded = isModelAdded(model.id)

                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-foreground truncate">
                              {model.displayName}
                            </span>
                            {isAdded && (
                              <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary shrink-0">
                                Added
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mb-2">
                            {model.id}
                          </div>
                          {model.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {model.description}
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
