import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

import { useToast } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { fetchMcpCatalogue, isCatalogueEntryAdded, type McpCatalogueEntry } from '@/mcp/catalogue'
import { useMcp } from '@/mcp/McpContext'
import {
  formatPromptForComposer,
  formatResourceForComposer,
  stringifyPromptContent,
} from '@/mcp/content'
import type { McpDraftConfigValue, McpDraftServer } from '@/mcp/draft'
import type {
  McpPromptResult,
  McpResourceReadResult,
  McpRuntimePrompt,
  McpRuntimeResource,
} from '@/mcp/types'

import './McpLibraryDialog.css'

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
  const { addServer, draftServers, getPrompt, prompts, readResource, resources } = useMcp()
  const { showToast } = useToast()

  const [mode, setMode] = useState<McpLibraryMode>(initialMode)
  const [catalogueEntries, setCatalogueEntries] = useState<McpCatalogueEntry[]>([])
  const [catalogueQuery, setCatalogueQuery] = useState('')
  const [catalogueLoading, setCatalogueLoading] = useState(false)
  const [catalogueLoaded, setCatalogueLoaded] = useState(false)
  const [catalogueError, setCatalogueError] = useState<string | null>(null)
  const [addingCatalogueEntryId, setAddingCatalogueEntryId] = useState<string | null>(null)
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
    () =>
      visibleResources.find((resource) => getResourceKey(resource) === selectedResourceKey) ?? null,
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
      showToast(
        'This resource does not expose text content that can be inserted into the composer.',
        'warning'
      )
      return
    }

    onInsertText(formatted)
    showToast(
      `Inserted ${selectedResource.manifest.title || selectedResource.manifest.uri} into the composer.`,
      'success'
    )
    onOpenChange(false)
  }

  const insertPromptIntoComposer = () => {
    if (!selectedPrompt || !promptPreview || !onInsertText) {
      return
    }

    onInsertText(
      formatPromptForComposer(
        selectedPrompt.serverName,
        selectedPrompt.manifest.name,
        promptPreview
      )
    )
    showToast(
      `Inserted ${selectedPrompt.manifest.title || selectedPrompt.manifest.name} into the composer.`,
      'success'
    )
    onOpenChange(false)
  }

  const addCatalogueServer = async (entry: McpCatalogueEntry, draft: McpDraftServer) => {
    if (!entry.supported) return
    if (isCatalogueEntryAdded(entry, draftServers)) return

    setAddingCatalogueEntryId(entry.id)
    try {
      await addServer(draft)
      showToast(`Added ${entry.title || entry.name} to MCP servers.`, 'success')
    } catch (addError) {
      showToast(toErrorMessage(addError), 'error')
    } finally {
      setAddingCatalogueEntryId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mcp-library-dialog max-h-[88vh] w-full max-w-none overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="mcp-library-header">
          <DialogTitle className="mcp-library-title">MCP Library</DialogTitle>
          <DialogDescription className="mcp-library-description">
            Browse curated MCP servers, or inspect trusted resources and prompts from connected
            servers.
          </DialogDescription>
        </DialogHeader>

        <div className="mcp-library-toolbar">
          <div className="mcp-library-tabs" role="tablist" aria-label="MCP library views">
            {catalogueAvailable && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'catalogue'}
                className={cn('mcp-library-tab', mode === 'catalogue' && 'mcp-library-tab--active')}
                onClick={() => setMode('catalogue')}
              >
                Catalogue
                <span className="mcp-library-tab-count">{catalogueEntries.length}</span>
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'resources'}
              className={cn('mcp-library-tab', mode === 'resources' && 'mcp-library-tab--active')}
              onClick={() => setMode('resources')}
            >
              Resources
              <span className="mcp-library-tab-count">{visibleResources.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'prompts'}
              className={cn('mcp-library-tab', mode === 'prompts' && 'mcp-library-tab--active')}
              onClick={() => setMode('prompts')}
            >
              Prompts
              <span className="mcp-library-tab-count">{visiblePrompts.length}</span>
            </button>
          </div>
          {mode === 'catalogue' && (
            <div className="mcp-library-search">
              <Search className="mcp-library-search-icon" />
              <Input
                className="mcp-library-search-input"
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
            addingEntryId={addingCatalogueEntryId}
            error={catalogueError}
            onRetry={() => {
              setCatalogueLoaded(false)
              setCatalogueError(null)
            }}
            onAddServer={(entry, draft) => void addCatalogueServer(entry, draft)}
          />
        ) : (
          <div className="mcp-library-split">
            <ScrollArea className="mcp-library-list min-h-0">
              <div className="mcp-library-list-inner">
                {(mode === 'resources' ? visibleResources : visiblePrompts).length === 0 ? (
                  <div className="mcp-library-state">
                    No {mode} are currently exposed. Servers must be enabled, connected, and trusted
                    before this library surfaces them.
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
                        className={cn(
                          'mcp-library-list-item',
                          selected && 'mcp-library-list-item--selected'
                        )}
                      >
                        <div className="mcp-library-list-item-title">
                          <span className="truncate">
                            {resource.manifest.title ||
                              resource.manifest.name ||
                              resource.manifest.uri}
                          </span>
                          <span className="mcp-library-list-item-server">
                            {resource.serverName}
                          </span>
                        </div>
                        <div className="mcp-library-list-item-uri">{resource.manifest.uri}</div>
                        {resource.manifest.description && (
                          <div className="mcp-library-list-item-desc">
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
                        className={cn(
                          'mcp-library-list-item',
                          selected && 'mcp-library-list-item--selected'
                        )}
                      >
                        <div className="mcp-library-list-item-title">
                          <span className="truncate">
                            {prompt.manifest.title || prompt.manifest.name}
                          </span>
                          <span className="mcp-library-list-item-server">{prompt.serverName}</span>
                        </div>
                        {prompt.manifest.description && (
                          <div className="mcp-library-list-item-desc">
                            {prompt.manifest.description}
                          </div>
                        )}
                        {(prompt.manifest.arguments?.length ?? 0) > 0 && (
                          <div className="mcp-library-list-item-uri">
                            {(prompt.manifest.arguments ?? []).length} argument
                            {(prompt.manifest.arguments ?? []).length === 1 ? '' : 's'}
                          </div>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            <div className="mcp-library-preview">
              <div className="mcp-library-preview-scroll">
                {mode === 'resources' ? (
                  selectedResource ? (
                    <div>
                      <div className="mcp-library-preview-title">
                        {selectedResource.manifest.title ||
                          selectedResource.manifest.name ||
                          selectedResource.manifest.uri}
                      </div>
                      <div className="mcp-library-preview-subtitle">
                        {selectedResource.manifest.uri}
                      </div>
                      <div className="mcp-library-preview-tags">
                        <span className="mcp-library-preview-tag">
                          {selectedResource.serverName}
                        </span>
                        <span className="mcp-library-preview-tag">User visible</span>
                        <span className="mcp-library-preview-tag">Explicit action required</span>
                        {selectedResource.manifest.mimeType && (
                          <span className="mcp-library-preview-tag">
                            {selectedResource.manifest.mimeType}
                          </span>
                        )}
                      </div>
                      {selectedResource.manifest.description && (
                        <div className="mcp-library-preview-desc">
                          {selectedResource.manifest.description}
                        </div>
                      )}
                      <div className="mcp-library-preview-actions">
                        <Button
                          type="button"
                          variant="ghost"
                          className="mcp-library-preview-action"
                          onClick={() => void handlePreviewResource(selectedResource)}
                          disabled={loadingKey === selectedResourceKey}
                        >
                          {loadingKey === selectedResourceKey ? 'Loading...' : 'Read Resource'}
                        </Button>
                        {onInsertText && resourcePreview && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="mcp-library-preview-action"
                            onClick={insertResourceIntoComposer}
                          >
                            Insert into composer
                          </Button>
                        )}
                      </div>
                      {error && <div className="mcp-library-state-error">{error}</div>}
                      {resourcePreview && (
                        <pre className="mcp-library-preview-pre">
                          {renderResourcePreview(resourcePreview)}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <EmptyState label="Select a resource to preview its contents." />
                  )
                ) : selectedPrompt ? (
                  <div>
                    <div className="mcp-library-preview-title">
                      {selectedPrompt.manifest.title || selectedPrompt.manifest.name}
                    </div>
                    {selectedPrompt.manifest.description && (
                      <div className="mcp-library-preview-desc">
                        {selectedPrompt.manifest.description}
                      </div>
                    )}
                    <div className="mcp-library-preview-tags">
                      <span className="mcp-library-preview-tag">{selectedPrompt.serverName}</span>
                      <span className="mcp-library-preview-tag">User visible</span>
                      <span className="mcp-library-preview-tag">Composer insertion only</span>
                    </div>
                    {(selectedPrompt.manifest.arguments?.length ?? 0) > 0 && (
                      <div className="mcp-library-prompt-args">
                        <div className="mcp-library-prompt-args-title">Prompt arguments</div>
                        <div className="mcp-library-prompt-args-grid">
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
                    <div className="mcp-library-preview-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        className="mcp-library-preview-action"
                        onClick={() => void handlePreviewPrompt(selectedPrompt)}
                        disabled={loadingKey === selectedPromptKey}
                      >
                        {loadingKey === selectedPromptKey ? 'Loading...' : 'Preview Prompt'}
                      </Button>
                      {onInsertText && promptPreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="mcp-library-preview-action"
                          onClick={insertPromptIntoComposer}
                        >
                          Insert into composer
                        </Button>
                      )}
                    </div>
                    {error && <div className="mcp-library-state-error">{error}</div>}
                    {promptPreview && (
                      <div>
                        {promptPreview.description && (
                          <div className="mcp-library-preview-desc">
                            {promptPreview.description}
                          </div>
                        )}
                        {promptPreview.messages.map((message, index) => (
                          <div
                            key={`${message.role}-${index}`}
                            className="mcp-library-prompt-message"
                          >
                            <div className="mcp-library-prompt-message-role">{message.role}</div>
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
  addingEntryId,
  error,
  loading,
  onAddServer,
  onRetry,
}: {
  draftServers: ReturnType<typeof useMcp>['draftServers']
  entries: McpCatalogueEntry[]
  addingEntryId: string | null
  error: string | null
  loading: boolean
  onAddServer: (entry: McpCatalogueEntry, draft: McpDraftServer) => void
  onRetry: () => void
}): React.ReactElement {
  return (
    <div className="mcp-library-catalogue">
      <ScrollArea className="h-full">
        <div className="mcp-library-catalogue-inner">
          {loading ? (
            <div className="mcp-library-state">Loading MCP catalogue...</div>
          ) : error ? (
            <div className="mcp-library-state mcp-library-state--error">
              <div className="mcp-library-state-error">{error}</div>
              <Button type="button" size="sm" variant="ghost" className="mt-3" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div className="mcp-library-state">No catalogue entries match your search.</div>
          ) : (
            <div className="mcp-library-catalogue-grid">
              {entries.map((entry) => (
                <CatalogueCard
                  key={entry.id}
                  added={isCatalogueEntryAdded(entry, draftServers)}
                  adding={addingEntryId === entry.id}
                  entry={entry}
                  onAddServer={(draft) => onAddServer(entry, draft)}
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
  adding,
  entry,
  onAddServer,
}: {
  added: boolean
  adding: boolean
  entry: McpCatalogueEntry
  onAddServer: (draft: McpDraftServer) => void
}): React.ReactElement {
  const [setupOpen, setSetupOpen] = useState(false)
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const secretFields = useMemo(() => getDraftSecretFields(entry.draft), [entry.draft])
  const needsSecretSetup = secretFields.length > 0
  const metaItems = [
    entry.sourceLabel,
    entry.version ? `v${entry.version}` : null,
    entry.publisher,
    entry.secretRequirements.length > 0 ? 'Auth required' : null,
  ].filter(Boolean) as string[]

  const handleAddClick = () => {
    if (!entry.draft) return
    if (needsSecretSetup) {
      setSetupOpen(true)
      return
    }
    onAddServer(entry.draft)
  }

  const handleSecretSubmit = () => {
    if (!entry.draft) return
    const missingField = secretFields.find((field) => !secretValues[field.key]?.trim())
    if (missingField) {
      setSetupOpen(true)
      return
    }
    onAddServer(applyDraftSecretValues(entry.draft, secretValues))
  }

  return (
    <article
      className={cn(
        'mcp-library-card',
        added && 'mcp-library-card--added',
        setupOpen && 'mcp-library-card--setup-open'
      )}
    >
      <div className="mcp-library-card-header">
        <div className="min-w-0">
          <h3 className="mcp-library-card-title">{entry.title || entry.name}</h3>
          <div className="mcp-library-card-slug">{entry.name}</div>
        </div>
        {added ? (
          <span className="mcp-library-card-status">Added</span>
        ) : !entry.supported ? (
          <span className="mcp-library-card-status mcp-library-card-status--unsupported">
            Unsupported
          </span>
        ) : null}
      </div>

      <p className="mcp-library-card-description">
        {entry.description || 'No description provided.'}
      </p>

      {metaItems.length > 0 && (
        <div className="mcp-library-card-meta">
          {metaItems.map((item) => (
            <span key={item} className="mcp-library-card-meta-item">
              {item}
            </span>
          ))}
        </div>
      )}

      <div className="mcp-library-card-actions">
        <CatalogueDetailsDropdown entry={entry} />
        <Button
          type="button"
          onClick={handleAddClick}
          disabled={!entry.supported || added || adding}
          variant="ghost"
          className={cn(
            'mcp-library-card-action',
            added ? 'mcp-library-card-action--done' : 'mcp-library-card-action--primary'
          )}
        >
          {added ? 'Added' : adding ? 'Adding...' : 'Add'}
        </Button>
      </div>
      {setupOpen && !added && needsSecretSetup && (
        <div className="mcp-library-card-setup">
          <div className="mcp-library-card-setup-header">
            <div className="mcp-library-card-setup-title">Add {entry.title || entry.name}</div>
            <div className="mcp-library-card-setup-desc">
              Enter required keys to store this MCP server securely.
            </div>
          </div>
          <div className="mcp-library-card-setup-fields">
            {secretFields.map((field) => (
              <label key={field.key} className="mcp-library-card-setup-field">
                <span>{field.label}</span>
                <Input
                  type="password"
                  value={secretValues[field.key] ?? ''}
                  onChange={(event) =>
                    setSecretValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  aria-label={field.label}
                />
              </label>
            ))}
          </div>
          <div className="mcp-library-card-setup-actions">
            <Button
              type="button"
              variant="ghost"
              className="mcp-library-card-setup-cancel"
              onClick={() => setSetupOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="mcp-library-card-setup-submit"
              disabled={adding || secretFields.some((field) => !secretValues[field.key]?.trim())}
              onClick={handleSecretSubmit}
            >
              {adding ? 'Adding...' : 'Add server'}
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

interface CatalogueSecretField {
  key: string
  label: string
  placeholder: string
}

function getDraftSecretFields(draft: McpDraftServer | undefined): CatalogueSecretField[] {
  if (!draft) return []
  const fields: CatalogueSecretField[] = []

  if (isMissingSecretValue(draft.authToken)) {
    fields.push({
      key: 'authToken',
      label: 'Authorization token',
      placeholder: 'Paste token',
    })
  }

  for (const entry of draft.env) {
    if (!isMissingSecretValue(entry)) continue
    fields.push({
      key: `env:${entry.name}`,
      label: entry.name,
      placeholder: `Paste ${entry.name}`,
    })
  }

  for (const entry of draft.headers) {
    if (!isMissingSecretValue(entry)) continue
    fields.push({
      key: `header:${entry.name}`,
      label: entry.name,
      placeholder: `Paste ${entry.name}`,
    })
  }

  return fields
}

function isMissingSecretValue(entry: McpDraftConfigValue | null): boolean {
  return Boolean(
    entry &&
    entry.valueSource === 'secret' &&
    !entry.secretStored &&
    entry.secretValue.trim().length === 0
  )
}

function applyDraftSecretValues(
  draft: McpDraftServer,
  values: Record<string, string>
): McpDraftServer {
  return {
    ...draft,
    authToken: fillSecretValue(draft.authToken, values.authToken),
    env: draft.env.map((entry) => fillSecretValue(entry, values[`env:${entry.name}`])),
    headers: draft.headers.map((entry) => fillSecretValue(entry, values[`header:${entry.name}`])),
  }
}

function fillSecretValue<T extends McpDraftConfigValue | null>(
  entry: T,
  value: string | undefined
): T {
  if (!entry || entry.valueSource !== 'secret' || !value?.trim()) {
    return entry
  }
  return {
    ...entry,
    secretValue: value.trim(),
  }
}

function CatalogueDetailsDropdown({ entry }: { entry: McpCatalogueEntry }): React.ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'mcp-library-card-details-trigger',
            open && 'mcp-library-card-details-trigger--open'
          )}
          aria-expanded={open}
        >
          Details
          <ChevronDown className="mcp-library-card-details-chevron" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="mcp-library-details-popover"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="mcp-library-details-popover-header">
          <div className="mcp-library-details-popover-title">{entry.title || entry.name}</div>
          <div className="mcp-library-details-popover-subtitle">Server details</div>
        </div>
        <div className="mcp-library-details-popover-body">
          {entry.repositoryUrl && (
            <a
              className="mcp-library-card-details-link"
              href={entry.repositoryUrl}
              target="_blank"
              rel="noreferrer"
            >
              {entry.repositoryUrl}
            </a>
          )}

          <div className="mcp-library-card-details-block">
            <div className="mcp-library-card-details-label">Install behavior</div>
            <div className="mcp-library-card-details-text">
              Catalogue entries are added as enabled, untrusted servers. Connect manually, then
              trust only servers whose tools you want exposed to chat.
            </div>
          </div>

          {entry.secretRequirements.length > 0 && (
            <div className="mcp-library-card-details-block">
              <div className="mcp-library-card-details-label">Required setup</div>
              <ul className="mcp-library-card-details-text list-disc space-y-1 pl-5">
                {entry.secretRequirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </div>
          )}

          {!entry.supported && (
            <div className="mcp-library-card-details-block mcp-library-card-details-error">
              {entry.unsupportedReason ||
                'This MCP catalogue entry cannot be installed by ZuraAI yet.'}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function EmptyState({ label }: { label: string }): React.ReactElement {
  return <div className="mcp-library-empty mcp-library-empty--centered">{label}</div>
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
