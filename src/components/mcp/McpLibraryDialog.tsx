import React, { useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  fetchMcpCatalogue,
  isCatalogueEntryAdded,
  type McpCatalogueEntry,
} from '@/mcp/catalogue'
import { useMcp } from '@/mcp/McpContext'
import { formatPromptForComposer, formatResourceForComposer, stringifyPromptContent } from '@/mcp/content'
import type { McpPromptResult, McpResourceReadResult, McpRuntimePrompt, McpRuntimeResource } from '@/mcp/types'

type McpLibraryMode = 'catalogue' | 'resources' | 'prompts'

interface McpLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: McpLibraryMode
  serverId?: string
  onInsertText?: (text: string) => void
  showCatalogue?: boolean
}

export function McpLibraryDialog({
  open,
  onOpenChange,
  initialMode = 'resources',
  serverId,
  onInsertText,
  showCatalogue = false,
}: McpLibraryDialogProps): React.ReactElement {
  const { draftServers, getPrompt, prompts, readResource, resources, upsertDraftServer } = useMcp()
  const { showToast } = useToast()

  const [mode, setMode] = useState<McpLibraryMode>(initialMode)
  const [catalogueEntries, setCatalogueEntries] = useState<McpCatalogueEntry[]>([])
  const [catalogueQuery, setCatalogueQuery] = useState('')
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string | null>(null)
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [catalogueLoaded, setCatalogueLoaded] = useState(false)
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null)
  const [selectedPromptKey, setSelectedPromptKey] = useState<string | null>(null)
  const [resourcePreview, setResourcePreview] = useState<McpResourceReadResult | null>(null)
  const [promptPreview, setPromptPreview] = useState<McpPromptResult | null>(null)
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const catalogueAvailable = showCatalogue || initialMode === 'catalogue'

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setSelectedCatalogueId(null)
      setCatalogueQuery('')
      setSelectedResourceKey(null)
      setSelectedPromptKey(null)
      setResourcePreview(null)
      setPromptPreview(null)
      setPromptArgs({})
      setLoadingKey(null)
      setError(null)
    }
  }, [initialMode, open, serverId])

  useEffect(() => {
    setLoadingKey(null)
    setError(null)
  }, [mode])

  useEffect(() => {
    if (!catalogueAvailable || !open || mode !== 'catalogue' || catalogueLoaded) {
      return
    }

    let cancelled = false
    setCatalogueLoading(true)
    setCatalogueError(null)
    fetchMcpCatalogue()
      .then((entries) => {
        if (cancelled) return
        setCatalogueEntries(entries)
        setCatalogueLoaded(true)
        setSelectedCatalogueId(entries[0]?.id ?? null)
      })
      .catch((loadError) => {
        if (cancelled) return
        setCatalogueError(toErrorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogueLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [catalogueAvailable, catalogueLoaded, mode, open])

  const visibleResources = useMemo(
    () => resources.filter((resource) => !serverId || resource.serverId === serverId),
    [resources, serverId]
  )
  const visiblePrompts = useMemo(
    () => prompts.filter((prompt) => !serverId || prompt.serverId === serverId),
    [prompts, serverId]
  )

  const selectedResource = useMemo(
    () => visibleResources.find((resource) => getResourceKey(resource) === selectedResourceKey) ?? null,
    [selectedResourceKey, visibleResources]
  )
  const selectedPrompt = useMemo(
    () => visiblePrompts.find((prompt) => getPromptKey(prompt) === selectedPromptKey) ?? null,
    [selectedPromptKey, visiblePrompts]
  )
  const filteredCatalogueEntries = useMemo(() => {
    const query = catalogueQuery.trim().toLowerCase()
    if (!query) return catalogueEntries

    return catalogueEntries.filter((entry) =>
      [
        entry.name,
        entry.title,
        entry.description,
        entry.version,
        entry.repositoryUrl,
        entry.publisher,
        entry.sourceLabel,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    )
  }, [catalogueEntries, catalogueQuery])
  const selectedCatalogueEntry = useMemo(
    () => filteredCatalogueEntries.find((entry) => entry.id === selectedCatalogueId) ?? filteredCatalogueEntries[0] ?? null,
    [filteredCatalogueEntries, selectedCatalogueId]
  )

  useEffect(() => {
    if (!selectedPrompt) {
      setPromptArgs({})
      return
    }

    const nextArgs: Record<string, string> = {}
    for (const argument of selectedPrompt.manifest.arguments ?? []) {
      nextArgs[argument.name] = promptArgs[argument.name] ?? ''
    }
    setPromptArgs(nextArgs)
  }, [selectedPromptKey])

  const handlePreviewResource = async (resource: McpRuntimeResource) => {
    const key = getResourceKey(resource)
    setSelectedResourceKey(key)
    setResourcePreview(null)
    setError(null)
    setLoadingKey(key)

    try {
      const result = await readResource(resource.serverId, resource.manifest.uri)
      setResourcePreview(result)
    } catch (previewError) {
      setError(toErrorMessage(previewError))
    } finally {
      setLoadingKey(null)
    }
  }

  const handlePreviewPrompt = async (prompt: McpRuntimePrompt) => {
    const key = getPromptKey(prompt)
    setSelectedPromptKey(key)
    setPromptPreview(null)
    setError(null)
    setLoadingKey(key)

    try {
      const args = Object.fromEntries(
        Object.entries(promptArgs).filter(([, value]) => value.trim().length > 0)
      )
      const result = await getPrompt(prompt.serverId, prompt.manifest.name, args)
      setPromptPreview(result)
    } catch (previewError) {
      setError(toErrorMessage(previewError))
    } finally {
      setLoadingKey(null)
    }
  }

  const insertResourceIntoComposer = () => {
    if (!selectedResource || !resourcePreview || !onInsertText) {
      return
    }

    const formatted = formatResourceForComposer(
      selectedResource.serverName,
      selectedResource.manifest.uri,
      resourcePreview
    )
    if (!formatted) {
      showToast('This resource does not expose text content that can be inserted into the composer.', 'warning')
      return
    }

    onInsertText(formatted)
    showToast(`Inserted ${selectedResource.manifest.title || selectedResource.manifest.uri} into the composer.`, 'success')
    onOpenChange(false)
  }

  const insertPromptIntoComposer = () => {
    if (!selectedPrompt || !promptPreview || !onInsertText) {
      return
    }

    onInsertText(
      formatPromptForComposer(selectedPrompt.serverName, selectedPrompt.manifest.name, promptPreview)
    )
    showToast(`Inserted ${selectedPrompt.manifest.title || selectedPrompt.manifest.name} into the composer.`, 'success')
    onOpenChange(false)
  }

  const addCatalogueDraft = (entry: McpCatalogueEntry) => {
    if (!entry.supported || !entry.draft) return
    if (isCatalogueEntryAdded(entry, draftServers)) return

    upsertDraftServer(entry.draft)
    showToast(`Added ${entry.title || entry.name} as a draft. Review and save to install.`, 'success')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[min(1120px,calc(100vw_-_48px))] max-w-none overflow-hidden border border-border/80 bg-card p-0 shadow-2xl ring-1 ring-white/10 sm:max-w-none">
        <DialogHeader className="border-b border-border/70 bg-secondary/20 px-6 py-5">
          <DialogTitle className="text-xl">MCP Library</DialogTitle>
          <DialogDescription className="max-w-3xl">
            Browse curated MCP servers, or inspect trusted resources and prompts from connected servers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/20 px-6 py-3">
          {catalogueAvailable && (
            <Button
              type="button"
              size="sm"
              variant={mode === 'catalogue' ? 'default' : 'outline'}
              onClick={() => setMode('catalogue')}
            >
              Catalogue
              <Badge variant="secondary" className="ml-2">{catalogueEntries.length}</Badge>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={mode === 'resources' ? 'default' : 'outline'}
            onClick={() => setMode('resources')}
          >
            Resources
            <Badge variant="secondary" className="ml-2">{visibleResources.length}</Badge>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'prompts' ? 'default' : 'outline'}
            onClick={() => setMode('prompts')}
          >
            Prompts
            <Badge variant="secondary" className="ml-2">{visiblePrompts.length}</Badge>
          </Button>
        </div>

        <div className="grid h-[min(680px,calc(100vh_-_220px))] min-h-[520px] gap-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--theme-surface)_94%,var(--theme-background)),var(--theme-surface))] md:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
          <ScrollArea className="min-h-0 border-r border-border/60 bg-background/20">
            <div className="space-y-3 p-4">
              {mode === 'catalogue' ? (
                <>
                  <Input
                    className="border-border/80 bg-background/35 shadow-xs"
                    value={catalogueQuery}
                    onChange={(event) => {
                      setCatalogueQuery(event.target.value)
                      setSelectedCatalogueId(null)
                    }}
                    placeholder="Search MCP servers..."
                    aria-label="Search MCP catalogue"
                  />
                  {catalogueLoading && catalogueEntries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
                      Loading MCP catalogue...
                    </div>
                  ) : catalogueError ? (
                    <div className="space-y-3 rounded-xl border border-destructive/40 bg-card/40 p-4 text-sm">
                      <div className="text-destructive">{catalogueError}</div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCatalogueLoaded(false)
                          setCatalogueError(null)
                        }}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : filteredCatalogueEntries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
                      No catalogue entries match your search.
                    </div>
                  ) : (
                    filteredCatalogueEntries.map((entry) => {
                      const selected = selectedCatalogueEntry?.id === entry.id
                      const added = isCatalogueEntryAdded(entry, draftServers)
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setSelectedCatalogueId(entry.id)}
                          className={libraryItemClassName(selected)}
                        >
                          {selected && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary/70" />}
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-foreground">
                              {entry.title || entry.name}
                            </span>
                            {added && <Badge className="ml-auto" variant="secondary">Added</Badge>}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{entry.name}</div>
                          {entry.description && (
                            <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                              {entry.description}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Badge variant="outline">{entry.sourceLabel}</Badge>
                            {entry.version && <Badge variant="outline">v{entry.version}</Badge>}
                            {entry.publisher && <Badge variant="outline">{entry.publisher}</Badge>}
                            {entry.secretRequirements.length > 0 && (
                              <Badge variant="outline">Auth required</Badge>
                            )}
                            {!entry.supported && <Badge variant="destructive">Unsupported</Badge>}
                          </div>
                        </button>
                      )
                    })
                  )}
                </>
              ) : (mode === 'resources' ? visibleResources : visiblePrompts).length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-card/40 p-4 text-sm text-muted-foreground">
                  No {mode} are currently exposed. Servers must be enabled, connected, and trusted before this library surfaces them.
                </div>
              ) : mode === 'resources' ? (
                visibleResources.map((resource) => {
                  const key = getResourceKey(resource)
                  const selected = key === selectedResourceKey
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void handlePreviewResource(resource)}
                      className={libraryItemClassName(selected)}
                    >
                      {selected && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary/70" />}
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {resource.manifest.title || resource.manifest.name || resource.manifest.uri}
                        </span>
                        <Badge variant="outline" className="ml-auto">
                          {resource.serverName}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{resource.manifest.uri}</div>
                      {resource.manifest.description && (
                        <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {resource.manifest.description}
                        </div>
                      )}
                    </button>
                  )
                })
              ) : (
                visiblePrompts.map((prompt) => {
                  const key = getPromptKey(prompt)
                  const selected = key === selectedPromptKey
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedPromptKey(key)
                        setPromptPreview(null)
                        setError(null)
                      }}
                      className={libraryItemClassName(selected)}
                    >
                      {selected && <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary/70" />}
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {prompt.manifest.title || prompt.manifest.name}
                        </span>
                        <Badge variant="outline" className="ml-auto">
                          {prompt.serverName}
                        </Badge>
                      </div>
                      {prompt.manifest.description && (
                        <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {prompt.manifest.description}
                        </div>
                      )}
                      {(prompt.manifest.arguments?.length ?? 0) > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {(prompt.manifest.arguments ?? []).length} argument{(prompt.manifest.arguments ?? []).length === 1 ? '' : 's'}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>

          <div className="flex min-h-0 min-w-0 flex-col bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-surface)_96%,white)_0%,var(--theme-surface)_52%,color-mix(in_srgb,var(--theme-background)_82%,var(--theme-surface))_100%)]">
            <div className="flex-1 overflow-y-auto px-7 py-6">
              {mode === 'catalogue' ? (
                selectedCatalogueEntry ? (
                  <CatalogueEntryDetails
                    entry={selectedCatalogueEntry}
                    added={isCatalogueEntryAdded(selectedCatalogueEntry, draftServers)}
                    onAddDraft={() => addCatalogueDraft(selectedCatalogueEntry)}
                  />
                ) : (
                  <EmptyState label="Select an MCP server to review install details." />
                )
              ) : mode === 'resources' ? (
                selectedResource ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-lg font-semibold text-foreground">
                        {selectedResource.manifest.title || selectedResource.manifest.name || selectedResource.manifest.uri}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {selectedResource.manifest.uri}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">{selectedResource.serverName}</Badge>
                      <Badge variant="outline">User visible</Badge>
                      <Badge variant="outline">Explicit action required</Badge>
                      {selectedResource.manifest.mimeType && (
                        <Badge variant="outline">{selectedResource.manifest.mimeType}</Badge>
                      )}
                    </div>
                    {selectedResource.manifest.description && (
                      <div className="text-sm text-muted-foreground">
                        {selectedResource.manifest.description}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={() => void handlePreviewResource(selectedResource)}
                        disabled={loadingKey === selectedResourceKey}
                      >
                        {loadingKey === selectedResourceKey ? 'Loading...' : 'Read Resource'}
                      </Button>
                      {onInsertText && resourcePreview && (
                        <Button type="button" variant="outline" onClick={insertResourceIntoComposer}>
                          Insert into composer
                        </Button>
                      )}
                    </div>
                    {error && <div className="text-sm text-destructive">{error}</div>}
                    {resourcePreview && (
                      <pre className="max-h-[340px] overflow-auto rounded-xl border border-border/70 bg-card/50 p-4 text-sm text-foreground">
                        {renderResourcePreview(resourcePreview)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <EmptyState label="Select a resource to preview its contents." />
                )
              ) : selectedPrompt ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-lg font-semibold text-foreground">
                      {selectedPrompt.manifest.title || selectedPrompt.manifest.name}
                    </div>
                    {selectedPrompt.manifest.description && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {selectedPrompt.manifest.description}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">{selectedPrompt.serverName}</Badge>
                    <Badge variant="outline">User visible</Badge>
                    <Badge variant="outline">Composer insertion only</Badge>
                  </div>
                  {(selectedPrompt.manifest.arguments?.length ?? 0) > 0 && (
                    <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-4">
                      <div className="text-sm font-medium text-foreground">Prompt arguments</div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {(selectedPrompt.manifest.arguments ?? []).map((argument) => (
                          <label key={argument.name} className="space-y-1 text-sm">
                            <span className="text-foreground">
                              {argument.title || argument.name}
                              {argument.required ? ' *' : ''}
                            </span>
                            <Input
                              value={promptArgs[argument.name] ?? ''}
                              onChange={(event) =>
                                setPromptArgs((current) => ({
                                  ...current,
                                  [argument.name]: event.target.value,
                                }))
                              }
                              placeholder={argument.description || argument.name}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void handlePreviewPrompt(selectedPrompt)}
                      disabled={loadingKey === selectedPromptKey}
                    >
                      {loadingKey === selectedPromptKey ? 'Loading...' : 'Preview Prompt'}
                    </Button>
                    {onInsertText && promptPreview && (
                      <Button type="button" variant="outline" onClick={insertPromptIntoComposer}>
                        Insert into composer
                      </Button>
                    )}
                  </div>
                  {error && <div className="text-sm text-destructive">{error}</div>}
                  {promptPreview && (
                    <div className="space-y-3">
                      {promptPreview.description && (
                        <div className="text-sm text-muted-foreground">{promptPreview.description}</div>
                      )}
                      {promptPreview.messages.map((message, index) => (
                        <div key={`${message.role}-${index}`} className="rounded-xl border border-border/70 bg-card/50 p-4">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {message.role}
                          </div>
                          <pre className="overflow-auto whitespace-pre-wrap text-sm text-foreground">
                            {stringifyPromptContent(message.content)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState label="Select a prompt to preview its rendered messages." />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CatalogueEntryDetails({
  added,
  entry,
  onAddDraft,
}: {
  added: boolean
  entry: McpCatalogueEntry
  onAddDraft: () => void
}): React.ReactElement {
  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-2xl border border-border/70 bg-background/25 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight text-foreground">{entry.title || entry.name}</div>
            <div className="mt-1 break-all text-sm text-muted-foreground">{entry.name}</div>
          </div>
          {entry.supported ? (
            <Badge variant="outline" className="bg-background/40">Draft install</Badge>
          ) : (
            <Badge variant="destructive">Unsupported</Badge>
          )}
        </div>

        {entry.description && (
          <div className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{entry.description}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{entry.sourceLabel}</Badge>
        {entry.version && <Badge variant="outline">v{entry.version}</Badge>}
        {entry.publisher && <Badge variant="outline">{entry.publisher}</Badge>}
        {entry.repositoryUrl && <Badge variant="outline">Repository</Badge>}
        {entry.secretRequirements.length > 0 && <Badge variant="outline">Auth required</Badge>}
      </div>

      {entry.repositoryUrl && (
        <a
          className="block max-w-2xl break-all rounded-lg border border-primary/20 bg-primary/8 px-3 py-2 text-sm text-primary underline-offset-4 hover:underline"
          href={entry.repositoryUrl}
          target="_blank"
          rel="noreferrer"
        >
          {entry.repositoryUrl}
        </a>
      )}

      <div className="max-w-2xl rounded-xl border border-border/70 bg-background/25 p-4 text-sm shadow-sm">
        <div className="font-medium text-foreground">Install behavior</div>
        <div className="mt-2 leading-6 text-muted-foreground">
          Catalogue entries are added as disabled, untrusted drafts. Review the server settings, fill any required secrets, save changes, then connect manually.
        </div>
      </div>

      {entry.secretRequirements.length > 0 && (
        <div className="max-w-2xl rounded-xl border border-border/70 bg-background/25 p-4 text-sm shadow-sm">
          <div className="font-medium text-foreground">Required setup</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {entry.secretRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>
      )}

      {!entry.supported && (
        <div className="max-w-2xl rounded-xl border border-destructive/40 bg-destructive/8 p-4 text-sm text-destructive shadow-sm">
          {entry.unsupportedReason || 'This MCP registry entry cannot be installed by ZuraAI yet.'}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onAddDraft}
          disabled={!entry.supported || added}
        >
          {added ? 'Added' : 'Add draft'}
        </Button>
      </div>
    </div>
  )
}

function libraryItemClassName(selected: boolean): string {
  return cn(
    'relative w-full rounded-xl border px-3 py-3 text-left shadow-sm transition-[background-color,border-color,box-shadow,transform]',
    'hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
    selected
      ? 'border-primary/55 bg-primary/12 shadow-[0_10px_28px_rgba(0,0,0,0.18)]'
      : 'border-border/70 bg-background/28 hover:border-border hover:bg-background/40'
  )
}

function EmptyState({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/30 p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function renderResourcePreview(result: McpResourceReadResult): string {
  return result.contents
    .map((item) => {
      if (item.text) {
        return `${item.uri}\n\n${item.text}`
      }

      return `${item.uri}\n\nBinary content (${item.mimeType || 'unknown mime type'}) cannot be inserted into the composer automatically.`
    })
    .join('\n\n---\n\n')
}

function getResourceKey(resource: McpRuntimeResource): string {
  return `${resource.serverId}::${resource.manifest.uri}`
}

function getPromptKey(prompt: McpRuntimePrompt): string {
  return `${prompt.serverId}::${prompt.manifest.name}`
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default McpLibraryDialog
