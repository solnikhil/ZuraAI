import React, { useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMcp } from '@/mcp/McpContext'
import { formatPromptForComposer, formatResourceForComposer, stringifyPromptContent } from '@/mcp/content'
import type { McpPromptResult, McpResourceReadResult, McpRuntimePrompt, McpRuntimeResource } from '@/mcp/types'

type McpLibraryMode = 'resources' | 'prompts'

interface McpLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: McpLibraryMode
  serverId?: string
  onInsertText?: (text: string) => void
}

export function McpLibraryDialog({
  open,
  onOpenChange,
  initialMode = 'resources',
  serverId,
  onInsertText,
}: McpLibraryDialogProps): React.ReactElement {
  const { getPrompt, prompts, readResource, resources } = useMcp()
  const { showToast } = useToast()

  const [mode, setMode] = useState<McpLibraryMode>(initialMode)
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null)
  const [selectedPromptKey, setSelectedPromptKey] = useState<string | null>(null)
  const [resourcePreview, setResourcePreview] = useState<McpResourceReadResult | null>(null)
  const [promptPreview, setPromptPreview] = useState<McpPromptResult | null>(null)
  const [promptArgs, setPromptArgs] = useState<Record<string, string>>({})
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setError(null)
    }
  }, [initialMode, open])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-5">
          <DialogTitle>MCP Library</DialogTitle>
          <DialogDescription>
            Browse trusted MCP resources and prompts. These stay user-visible only and insert into the composer draft instead of bypassing your system prompt controls.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3">
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

        <div className="grid min-h-[520px] gap-0 md:grid-cols-[300px_minmax(0,1fr)]">
          <ScrollArea className="border-r border-border/60">
            <div className="space-y-2 p-4">
              {(mode === 'resources' ? visibleResources : visiblePrompts).length === 0 ? (
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
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selected ? 'border-primary/40 bg-primary/8' : 'border-border/70 bg-card/40 hover:bg-accent/40'}`}
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
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selected ? 'border-primary/40 bg-primary/8' : 'border-border/70 bg-card/40 hover:bg-accent/40'}`}
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

          <div className="flex min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-5">
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
