import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

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
      <DialogContent className="max-h-[88vh] w-[min(1120px,calc(100vw_-_48px))] max-w-none gap-0 overflow-hidden bg-[#1f1f1f] p-0 text-foreground sm:max-w-none">
        <DialogHeader className="bg-[#1f1f1f] px-6 py-5">
          <DialogTitle className="text-xl">MCP Library</DialogTitle>
          <DialogDescription className="max-w-3xl">
            Browse curated MCP servers, or inspect trusted resources and prompts from connected servers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 bg-[#1f1f1f] px-6 py-4 md:grid-cols-[minmax(0,1fr)_360px] md:items-center">
          <div className="flex flex-wrap items-center gap-2">
            {catalogueAvailable && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={libraryTabClassName(mode === 'catalogue')}
                onClick={() => setMode('catalogue')}
              >
                Catalogue
                <Badge variant="secondary" className="ml-2">{catalogueEntries.length}</Badge>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={libraryTabClassName(mode === 'resources')}
              onClick={() => setMode('resources')}
            >
              Resources
              <Badge variant="secondary" className="ml-2">{visibleResources.length}</Badge>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={libraryTabClassName(mode === 'prompts')}
              onClick={() => setMode('prompts')}
            >
              Prompts
              <Badge variant="secondary" className="ml-2">{visiblePrompts.length}</Badge>
            </Button>
          </div>
          {mode === 'catalogue' && (
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 w-full rounded-xl border-0 bg-[#252525] pl-10 text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-white/10"
                value={catalogueQuery}
                onChange={(event) => setCatalogueQuery(event.target.value)}
                placeholder="Search MCP servers..."
                aria-label="Search MCP catalogue"
              />
            </div>
          )}
        </div>

        {mode === 'catalogue' ? (
          <CatalogueGrid
            entries={filteredCatalogueEntries}
            draftServers={draftServers}
            loading={catalogueLoading && catalogueEntries.length === 0}
            error={catalogueError}
            onRetry={() => {
              setCatalogueLoaded(false)
              setCatalogueError(null)
            }}
            onAddDraft={addCatalogueDraft}
          />
        ) : (
          <div className="grid h-[min(680px,calc(100vh_-_220px))] min-h-[520px] gap-0 bg-[#1f1f1f] md:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
            <ScrollArea className="min-h-0 bg-[#1f1f1f]">
              <div className="space-y-3 p-4">
                {(mode === 'resources' ? visibleResources : visiblePrompts).length === 0 ? (
                <div className="rounded-xl bg-[#1f1f1f] p-4 text-sm text-muted-foreground">
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

            <div className="flex min-h-0 min-w-0 flex-col bg-[#1f1f1f] p-5">
              <div className="flex-1 overflow-y-auto rounded-3xl bg-[#1f1f1f] px-7 py-6">
                {mode === 'resources' ? (
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
                        variant="ghost"
                        className={libraryNeutralButtonClassName(false)}
                        onClick={() => void handlePreviewResource(selectedResource)}
                        disabled={loadingKey === selectedResourceKey}
                      >
                        {loadingKey === selectedResourceKey ? 'Loading...' : 'Read Resource'}
                      </Button>
                      {onInsertText && resourcePreview && (
                        <Button type="button" variant="ghost" className={libraryNeutralButtonClassName(false)} onClick={insertResourceIntoComposer}>
                          Insert into composer
                        </Button>
                      )}
                    </div>
                    {error && <div className="text-sm text-destructive">{error}</div>}
                    {resourcePreview && (
                      <pre className="max-h-[340px] overflow-auto rounded-xl bg-[#1f1f1f] p-4 text-sm text-foreground">
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
                    <div className="space-y-3 rounded-xl bg-[#1f1f1f] p-4">
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
                      variant="ghost"
                      className={libraryNeutralButtonClassName(false)}
                      onClick={() => void handlePreviewPrompt(selectedPrompt)}
                      disabled={loadingKey === selectedPromptKey}
                    >
                      {loadingKey === selectedPromptKey ? 'Loading...' : 'Preview Prompt'}
                    </Button>
                    {onInsertText && promptPreview && (
                      <Button type="button" variant="ghost" className={libraryNeutralButtonClassName(false)} onClick={insertPromptIntoComposer}>
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
                        <div key={`${message.role}-${index}`} className="rounded-xl bg-[#1f1f1f] p-4">
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
        )}
      </DialogContent>
    </Dialog>
  )
}

function CatalogueGrid({
  draftServers,
  entries,
  error,
  loading,
  onAddDraft,
  onRetry,
}: {
  draftServers: ReturnType<typeof useMcp>['draftServers']
  entries: McpCatalogueEntry[]
  error: string | null
  loading: boolean
  onAddDraft: (entry: McpCatalogueEntry) => void
  onRetry: () => void
}): React.ReactElement {
  return (
    <div className="h-[min(680px,calc(100vh_-_220px))] min-h-[520px] bg-[#1f1f1f]">
      <ScrollArea className="h-full">
        <div className="space-y-4 px-5 pb-5 pt-0">
          {loading ? (
            <div className="rounded-2xl bg-[#1f1f1f] p-6 text-sm text-muted-foreground">
              Loading MCP catalogue...
            </div>
          ) : error ? (
            <div className="space-y-3 rounded-2xl bg-[#1f1f1f] p-6 text-sm">
              <div className="text-destructive">{error}</div>
              <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-2xl bg-[#1f1f1f] p-6 text-sm text-muted-foreground">
              No catalogue entries match your search.
            </div>
          ) : (
            <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <CatalogueCard
                  key={entry.id}
                  added={isCatalogueEntryAdded(entry, draftServers)}
                  entry={entry}
                  onAddDraft={() => onAddDraft(entry)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function CatalogueCard({
  added,
  entry,
  onAddDraft,
}: {
  added: boolean
  entry: McpCatalogueEntry
  onAddDraft: () => void
}): React.ReactElement {
  return (
    <article className="flex min-h-[336px] flex-col rounded-2xl bg-[#1f1f1f] p-4 shadow-none">
      <div className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">{entry.title || entry.name}</h3>
          <div className="mt-1 truncate text-xs text-muted-foreground">{entry.name}</div>
        </div>
        {added && <Badge variant="secondary" className="mt-0.5">Added</Badge>}
      </div>

      <p className="mt-3 min-h-[72px] text-sm leading-6 text-muted-foreground">
        <span className="line-clamp-3">{entry.description || 'No description provided.'}</span>
      </p>

      <div className="mt-4 flex min-h-[52px] content-start flex-wrap gap-1.5 text-xs">
        <Badge variant="secondary">{entry.sourceLabel}</Badge>
        {entry.version && <Badge variant="secondary">v{entry.version}</Badge>}
        {entry.publisher && <Badge variant="secondary">{entry.publisher}</Badge>}
        {entry.secretRequirements.length > 0 && <Badge variant="secondary">Auth required</Badge>}
        {!entry.supported && <Badge variant="destructive">Unsupported</Badge>}
      </div>

      <details className="group mt-4 rounded-xl bg-[#1f1f1f]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/35">
          <span className="inline-flex w-full items-center justify-between gap-3">
            Details
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="space-y-3 px-4 py-4 text-sm">
          {entry.repositoryUrl && (
            <a
              className="block break-all rounded-lg bg-[#1f1f1f] px-3 py-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href={entry.repositoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              {entry.repositoryUrl}
            </a>
          )}

          <div className="rounded-lg bg-[#1f1f1f] p-3">
            <div className="font-medium text-foreground">Install behavior</div>
            <div className="mt-2 leading-6 text-muted-foreground">
              Catalogue entries are added as disabled, untrusted drafts. Review the server settings, fill any required secrets, save changes, then connect manually.
            </div>
          </div>

          {entry.secretRequirements.length > 0 && (
            <div className="rounded-lg bg-[#1f1f1f] p-3">
              <div className="font-medium text-foreground">Required setup</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {entry.secretRequirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>
          )}

          {!entry.supported && (
            <div className="rounded-lg bg-[#1f1f1f] p-3 text-destructive">
              {entry.unsupportedReason || 'This MCP catalogue entry cannot be installed by ZuraAI yet.'}
            </div>
          )}
        </div>
      </details>

      <div className="mt-auto pt-4">
        <Button
          type="button"
          onClick={onAddDraft}
          disabled={!entry.supported || added}
          variant="ghost"
          className={cn('w-full', added ? libraryNeutralButtonClassName(true) : libraryNeutralButtonClassName(false))}
        >
          {added ? 'Added' : 'Add draft'}
        </Button>
      </div>
    </article>
  )
}

function libraryItemClassName(selected: boolean): string {
  return cn(
    'w-full rounded-xl px-3 py-3 text-left transition-[background-color,box-shadow]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
    selected
      ? 'bg-[#1f1f1f]'
      : 'bg-[#1f1f1f]'
  )
}

function libraryTabClassName(active: boolean): string {
  return cn(
    'text-muted-foreground hover:bg-[#2a2a2a] hover:text-foreground',
    active && 'bg-[#2a2a2a] text-foreground hover:bg-[#2a2a2a]'
  )
}

function libraryNeutralButtonClassName(disabled: boolean): string {
  return cn(
    'bg-[#2a2a2a] text-foreground hover:bg-[#303030]',
    disabled && 'bg-[#252525] text-muted-foreground hover:bg-[#252525]'
  )
}

function EmptyState({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl bg-[#1f1f1f] p-8 text-center text-sm text-muted-foreground">
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
