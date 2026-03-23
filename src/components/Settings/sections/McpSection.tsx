import React, { useMemo, useState } from 'react'
import {
  Cable,
  Cloud,
  HardDrive,
  KeyRound,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCcw,
  Server,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'

import { useToast } from '@/components/shared'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import McpLibraryDialog from '@/components/mcp/McpLibraryDialog'
import McpToolsDialog from '@/components/mcp/McpToolsDialog'
import { useMcp } from '@/mcp/McpContext'
import {
  createDraftConfigValue,
  isDraftServerEqualToLiveServer,
  validateDraftServer,
  type McpDraftConfigValue,
  type McpDraftServer,
} from '@/mcp/draft'

export function McpSection(): React.ReactElement {
  const {
    connectServer,
    createDraftServer,
    disconnectServer,
    draftServers,
    error,
    getRuntimeState,
    hasDraftChanges,
    isLoading,
    isRefreshing,
    isSupported,
    refresh,
    removeDraftServer,
    runtimeStates,
    servers,
    tools,
    upsertDraftServer,
  } = useMcp()
  const { showToast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogServer, setDialogServer] = useState<McpDraftServer | null>(null)
  const [dialogErrors, setDialogErrors] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<McpDraftServer | null>(null)
  const [serverActionState, setServerActionState] = useState<Record<string, 'connecting' | 'disconnecting' | 'idle'>>({})
  const [libraryMode, setLibraryMode] = useState<'resources' | 'prompts' | null>(null)
  const [libraryServerId, setLibraryServerId] = useState<string | undefined>(undefined)
  const [toolsDialogServer, setToolsDialogServer] = useState<McpDraftServer | null>(null)

  const liveServersById = useMemo(
    () => new Map(servers.map((server) => [server.id, server])),
    [servers]
  )

  const connectedServerCount = runtimeStates.filter((state) => state.status === 'connected').length

  const openCreateDialog = () => {
    setDialogErrors([])
    setDialogServer(createDraftServer())
    setDialogOpen(true)
  }

  const openEditDialog = (server: McpDraftServer) => {
    setDialogErrors([])
    setDialogServer(cloneDraftServer(server))
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setDialogServer(null)
    setDialogErrors([])
  }

  const saveDialogServer = () => {
    if (!dialogServer) {
      return
    }

    const nextErrors = validateDraftServer(dialogServer)
    if (nextErrors.length > 0) {
      setDialogErrors(nextErrors)
      return
    }

    upsertDraftServer(dialogServer)
    closeDialog()
  }

  const handleConnectToggle = async (server: McpDraftServer) => {
    if (hasDraftChanges) {
      showToast('Save or discard MCP changes before connecting a server.', 'warning')
      return
    }

    const runtimeState = getRuntimeState(server.id)
    const nextAction = runtimeState?.status === 'connected' ? 'disconnecting' : 'connecting'
    setServerActionState((current) => ({ ...current, [server.id]: nextAction }))

    try {
      if (runtimeState?.status === 'connected') {
        await disconnectServer(server.id)
        showToast(`Disconnected ${server.name}.`, 'success')
      } else {
        await connectServer(server.id)
        showToast(`Connected ${server.name}.`, 'success')
      }
    } catch (actionError) {
      showToast(toErrorMessage(actionError), 'error')
    } finally {
      setServerActionState((current) => ({ ...current, [server.id]: 'idle' }))
    }
  }

  const handleSaveToolChanges = (serverId: string, blockedTools: string[]) => {
    const server = draftServers.find((s) => s.id === serverId)
    if (!server) return

    upsertDraftServer({
      ...server,
      toolBlocklistText: blockedTools.join('\n'),
    })
  }

  const openToolsDialog = (server: McpDraftServer) => {
    setToolsDialogServer(server)
  }

  const closeToolsDialog = () => {
    setToolsDialogServer(null)
  }

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">MCP Servers</h2>
        <div className="page-subtitle">
          Configure Model Context Protocol servers. Connected and trusted servers can expose tools to the chat.
        </div>
      </div>

      <Card className="settings-section-card p-0">
        <div className="mcp-header-row">
          <div className="mcp-stats">
            <span className="mcp-stat">
              <span className="mcp-stat-value">{draftServers.length}</span>
              <span className="mcp-stat-label">configured</span>
            </span>
            <span className="mcp-stat">
              <span className="mcp-stat-value">{connectedServerCount}</span>
              <span className="mcp-stat-label">connected</span>
            </span>
            <span className="mcp-stat">
              <span className="mcp-stat-value">{tools.length}</span>
              <span className="mcp-stat-label">tools</span>
            </span>
          </div>
          <div className="mcp-header-actions">
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLibraryServerId(undefined)
                setLibraryMode('resources')
              }}
            >
              Browse Library
            </Button>
            <Button type="button" size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </div>
        </div>

        {!isSupported && (
          <div className="mcp-warning-row">
            <TriangleAlert className="mcp-warning-icon" />
            <span>MCP requires the desktop app. It's not available in web browsers.</span>
          </div>
        )}

        {error && (
          <div className="mcp-error-row">
            <span>{error}</span>
          </div>
        )}

        {hasDraftChanges && (
          <div className="mcp-info-row">
            <span>You have unsaved changes. Save them to connect or disconnect servers.</span>
          </div>
        )}

        <div className="mcp-server-list">
          {isLoading ? (
            <div className="mcp-loading-row">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading servers...</span>
            </div>
          ) : draftServers.length === 0 ? (
            <div className="mcp-empty-row">
              <Server className="mcp-empty-icon" />
              <div className="mcp-empty-content">
                <div className="mcp-empty-title">No servers added yet</div>
                <div className="mcp-empty-desc">Add a local or remote MCP server to extend ZuraAI with custom tools.</div>
              </div>
            </div>
          ) : (
            draftServers.map((server) => {
              const runtimeState = getRuntimeState(server.id)
              const toolCount = runtimeState?.tools.length ?? liveServersById.get(server.id)?.lastKnownTools?.length ?? 0
              const resourceCount = runtimeState?.resources.length ?? liveServersById.get(server.id)?.lastKnownResources?.length ?? 0
              const promptCount = runtimeState?.prompts.length ?? liveServersById.get(server.id)?.lastKnownPrompts?.length ?? 0
              const liveServer = liveServersById.get(server.id)
              const isDraftOnly = !liveServer
              const isDirty = !liveServer || !isDraftServerEqualToLiveServer(server, liveServer)
              const isBusy = serverActionState[server.id] && serverActionState[server.id] !== 'idle'
              const status = runtimeState?.status ?? 'disconnected'

              const discoveredTools = runtimeState?.tools ?? liveServer?.lastKnownTools ?? []
              const blockedToolsSet = new Set(
                (server.toolBlocklistText ?? '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean))
              const allowedToolsSet = new Set(
                (server.toolAllowlistText ?? '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean))
              const hasAllowlist = allowedToolsSet.size > 0

              const activeToolCount = discoveredTools.filter((tool) => {
                const nameLower = tool.name.toLowerCase()
                if (blockedToolsSet.has(nameLower)) return false
                if (hasAllowlist && !allowedToolsSet.has(nameLower)) return false
                return true
              }).length

              const canManageTools = status === 'connected' && discoveredTools.length > 0 && !hasDraftChanges && !isDraftOnly

              return (
                <div key={server.id} className="mcp-server-row">
                  <div className="mcp-server-main">
                    <div className="mcp-server-icon">
                      {server.transport === 'stdio' ? <HardDrive size={18} /> : <Cloud size={18} />}
                    </div>
                    <div className="mcp-server-content">
                      <div className="mcp-server-title-row">
                        <div className="mcp-server-title-group">
                          <h3 className="mcp-server-title">{server.name || 'Untitled Server'}</h3>
                          <div className="mcp-server-badges">
                            <span className={`mcp-status-badge mcp-status-badge--${status}`}>
                              {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : status === 'error' ? 'Error' : 'Disconnected'}
                            </span>
                            {server.trustState === 'trusted' && (
                              <span className="mcp-trust-badge">Trusted</span>
                            )}
                            {!server.enabled && (
                              <span className="mcp-disabled-badge">Disabled</span>
                            )}
                            {isDraftOnly && <span className="mcp-new-badge">New</span>}
                            {isDirty && !isDraftOnly && <span className="mcp-edited-badge">Edited</span>}
                          </div>
                        </div>
                        <div className="mcp-server-controls">
                          <div className="mcp-server-stats">
                            <span className="mcp-server-stat">
                              <span className="mcp-server-stat-label">Tools</span>
                              <span className="mcp-server-stat-active">{activeToolCount}</span>
                              <span className="mcp-server-stat-total"> / {toolCount} tools</span>
                            </span>
                            <span className="mcp-server-stat">
                              <span className="mcp-server-stat-label">Resources</span>
                              <span className="mcp-server-stat-value">{resourceCount}</span>
                            </span>
                            <span className="mcp-server-stat">
                              <span className="mcp-server-stat-label">Prompts</span>
                              <span className="mcp-server-stat-value">{promptCount}</span>
                            </span>
                          </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="mcp-server-menu-trigger"
                              aria-label={`Open actions for ${server.name || 'Untitled Server'}`}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            sideOffset={8}
                            className="mcp-server-menu-content w-48 rounded-lg border border-border/80 bg-popover p-1"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={!canManageTools}
                              onSelect={() => openToolsDialog(server)}
                            >
                              <Wrench className="h-4 w-4" />
                              Manage Tools
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={isBusy || hasDraftChanges || isDraftOnly || !server.enabled || !isSupported}
                              onSelect={() => {
                                void handleConnectToggle(server)
                              }}
                            >
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cable className="h-4 w-4" />}
                              {status === 'connected' ? 'Disconnect' : 'Connect'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onSelect={() => openEditDialog(server)}
                            >
                              <PencilLine className="h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer"
                              variant="destructive"
                              onSelect={() => setDeleteTarget(server)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </div>
                      {runtimeState?.error && (
                        <div className="mcp-server-error">{runtimeState.error}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <McpLibraryDialog
        open={libraryMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLibraryMode(null)
            setLibraryServerId(undefined)
          }
        }}
        initialMode={libraryMode ?? 'resources'}
        serverId={libraryServerId}
      />

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogServer && liveServersById.has(dialogServer.id) ? 'Edit Server' : 'Add Server'}</DialogTitle>
            <DialogDescription>
              Configure how ZuraAI connects to this MCP server. Secrets are stored securely and never saved to config files.
            </DialogDescription>
          </DialogHeader>

          {dialogServer && (
            <div className="mcp-dialog-body">
              {dialogErrors.length > 0 && (
                <div className="mcp-dialog-errors">
                  <div className="mcp-dialog-errors-header">
                    <TriangleAlert className="h-4 w-4" />
                    <span>Fix these fields before continuing</span>
                  </div>
                  <ul>
                    {dialogErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <FieldGroup>
                <div className="mcp-dialog-row">
                  <Field className="mcp-dialog-field">
                    <FieldLabel>Server name</FieldLabel>
                    <Input
                      value={dialogServer.name}
                      onChange={(event) => setDialogServer({ ...dialogServer, name: event.target.value })}
                      placeholder="Filesystem"
                    />
                  </Field>

                  <Field className="mcp-dialog-field">
                    <FieldLabel>Transport</FieldLabel>
                    <Select
                      value={dialogServer.transport}
                      onValueChange={(value) =>
                        setDialogServer({
                          ...dialogServer,
                          transport: value as McpDraftServer['transport'],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select transport" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stdio">Stdio</SelectItem>
                        <SelectItem value="sse">SSE</SelectItem>
                        <SelectItem value="websocket">WebSocket</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

<div className="mcp-dialog-row">
                    <ToggleField
                     label="Enable this server"
                     description="When off, the server won't connect and its tools won't appear in chat."
                     checked={dialogServer.enabled}
                     onCheckedChange={(checked) => setDialogServer({ ...dialogServer, enabled: checked })}
                   />
                   <ToggleField
                     label="Connect on startup"
                     description="Automatically connect when ZuraAI launches."
                     checked={dialogServer.autoConnect}
                     onCheckedChange={(checked) => setDialogServer({ ...dialogServer, autoConnect: checked })}
                   />
                 </div>

                <Field>
                  <FieldLabel>Trust level</FieldLabel>
                  <Select
                    value={dialogServer.trustState}
                    onValueChange={(value) =>
                      setDialogServer({
                        ...dialogServer,
                        trustState: value as McpDraftServer['trustState'],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select trust level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="untrusted">Untrusted</SelectItem>
                      <SelectItem value="trusted">Trusted</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Untrusted servers can connect but their tools stay hidden from the model until approved.
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <Separator />

              {dialogServer.transport === 'stdio' ? (
                <FieldGroup>
                  <div className="mcp-dialog-section-header">
                    <HardDrive className="h-4 w-4" />
                    <span>Local stdio process</span>
                  </div>

                  <Field>
                    <FieldLabel>Command</FieldLabel>
                    <Input
                      value={dialogServer.command}
                      onChange={(event) => setDialogServer({ ...dialogServer, command: event.target.value })}
                      placeholder="npx"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Arguments</FieldLabel>
                    <Textarea
                      value={dialogServer.argsText}
                      onChange={(event) => setDialogServer({ ...dialogServer, argsText: event.target.value })}
                      placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Projects'}
                      className="min-h-24"
                    />
                    <FieldDescription>One argument per line.</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>Working directory</FieldLabel>
                    <Input
                      value={dialogServer.cwd}
                      onChange={(event) => setDialogServer({ ...dialogServer, cwd: event.target.value })}
                      placeholder="C:\\Projects"
                    />
                  </Field>
                </FieldGroup>
              ) : (
                <FieldGroup>
                  <div className="mcp-dialog-section-header">
                    <Cloud className="h-4 w-4" />
                    <span>Remote endpoint</span>
                  </div>

                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={dialogServer.url}
                      onChange={(event) => setDialogServer({ ...dialogServer, url: event.target.value })}
                      placeholder={dialogServer.transport === 'sse' ? 'https://example.com/mcp' : 'wss://example.com/mcp'}
                    />
                  </Field>

                  <SecretTokenEditor
                    value={dialogServer.authToken}
                    onChange={(nextValue) => setDialogServer({ ...dialogServer, authToken: nextValue })}
                  />

                  <ConfigValueEditor
                    title="Headers"
                    description="Additional request headers."
                    entries={dialogServer.headers}
                    kind="header"
                    onChange={(nextEntries) => setDialogServer({ ...dialogServer, headers: nextEntries })}
                  />
                </FieldGroup>
              )}

              <Separator />

              <ConfigValueEditor
                title="Environment variables"
                description="Pass environment variables to the local server process (like API keys or config paths)."
                entries={dialogServer.env}
                kind="env"
                onChange={(nextEntries) => setDialogServer({ ...dialogServer, env: nextEntries })}
              />

              <Separator />

              <FieldGroup>
                <div className="mcp-dialog-section-header">
                  <KeyRound className="h-4 w-4" />
                  <span>Connection settings</span>
                </div>

                <div className="mcp-dialog-row mcp-dialog-row--4">
                  <NumberInputField
                    label="Startup timeout (ms)"
                    value={dialogServer.startupTimeoutMs}
                    onChange={(value) => setDialogServer({ ...dialogServer, startupTimeoutMs: value })}
                    placeholder="10000"
                  />
                  <NumberInputField
                    label="Tool timeout (ms)"
                    value={dialogServer.toolTimeoutMs}
                    onChange={(value) => setDialogServer({ ...dialogServer, toolTimeoutMs: value })}
                    placeholder="30000"
                  />
                  <NumberInputField
                    label="Reconnect attempts"
                    value={dialogServer.reconnectAttempts}
                    onChange={(value) => setDialogServer({ ...dialogServer, reconnectAttempts: value })}
                    placeholder="3"
                  />
                  <NumberInputField
                    label="Reconnect delay (ms)"
                    value={dialogServer.reconnectDelayMs}
                    onChange={(value) => setDialogServer({ ...dialogServer, reconnectDelayMs: value })}
                    placeholder="1000"
                  />
                </div>

<ToggleField
                   label="Ask before running tools"
                   description="Show a confirmation dialog each time this server wants to run a tool."
                   checked={dialogServer.requireApproval}
                   onCheckedChange={(checked) => setDialogServer({ ...dialogServer, requireApproval: checked })}
                 />
              </FieldGroup>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button type="button" onClick={saveDialogServer}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name || 'thisserver'}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the server from your configuration. Any active connections will be closed. Save your changes to apply the deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  removeDraftServer(deleteTarget.id)
                }
                setDeleteTarget(null)
              }}
            >
              Delete server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toolsDialogServer && (() => {
        const runtimeState = getRuntimeState(toolsDialogServer.id)
        const discoveredTools = runtimeState?.tools ?? liveServersById.get(toolsDialogServer.id)?.lastKnownTools ?? []
        const blockedToolsSet = new Set(
          (toolsDialogServer.toolBlocklistText ?? '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean))
        const allowedToolsSet = new Set(
          (toolsDialogServer.toolAllowlistText ?? '').split('\n').map(s => s.trim().toLowerCase()).filter(Boolean))

        return (
          <McpToolsDialog
            open={true}
            onOpenChange={(open) => { if (!open) closeToolsDialog()}}
            serverName={toolsDialogServer.name || 'Untitled Server'}
            discoveredTools={discoveredTools}
            blockedTools={blockedToolsSet}
            allowedTools={allowedToolsSet}
            onSave={(blocked) => {
              handleSaveToolChanges(toolsDialogServer.id, blocked)
              closeToolsDialog()
            }}
          />
        )
      })()}
    </div>
  )
}

function ToggleField(props: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.ReactElement {
  return (
    <div className="mcp-toggle-card">
      <div className="mcp-toggle-content">
        <div className="mcp-toggle-label">{props.label}</div>
        <div className="mcp-toggle-desc">{props.description}</div>
      </div>
      <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} aria-label={props.label} />
    </div>
  )
}

function NumberInputField(props: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}): React.ReactElement {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Input
        inputMode="numeric"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
      />
    </Field>
  )
}

function SecretTokenEditor(props: {
  value: McpDraftConfigValue | null
  onChange: (value: McpDraftConfigValue | null) => void
}): React.ReactElement {
  const entry = props.value ?? createDraftConfigValue('token', { name: 'Authorization' })

  return (
    <div className="mcp-secret-editor">
      <div className="mcp-secret-header">
        <div className="mcp-secret-title">Auth token</div>
        <div className="mcp-secret-desc">
          Bearer token stored separately from headers. Secrets stay masked in renderer.
        </div>
      </div>

      <div className="mcp-secret-row">
        <Select
          value={entry.valueSource}
          onValueChange={(value) =>
            props.onChange({
              ...entry,
              valueSource: value as McpDraftConfigValue['valueSource'],
              clearSecret: value === 'plaintext' ? false : entry.clearSecret,
            })
          }
        >
          <SelectTrigger className="mcp-secret-type">
            <SelectValue placeholder="Value type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plaintext">Plaintext</SelectItem>
            <SelectItem value="secret">Secret</SelectItem>
          </SelectContent>
        </Select>

        <div className="mcp-secret-input-wrap">
          <Input
            type={entry.valueSource === 'secret' ? 'password' : 'text'}
            value={entry.valueSource === 'secret' ? entry.secretValue : entry.value}
            onChange={(event) =>
              props.onChange({
                ...entry,
                value: entry.valueSource === 'plaintext' ? event.target.value : '',
                secretValue: entry.valueSource === 'secret' ? event.target.value : '',
                clearSecret: false,
              })
            }
            placeholder={entry.valueSource === 'secret' && entry.secretStored ? 'Stored - type to replace' : 'Bearer token'}
          />
          <div className="mcp-secret-meta">
            {entry.valueSource === 'secret' && entry.secretStored && !entry.clearSecret && (
              <span className="mcp-stored-badge">Stored</span>
            )}
            {entry.valueSource === 'secret' && entry.secretStored && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.onChange({ ...entry, clearSecret: !entry.clearSecret, secretValue: '' })}
              >
                {entry.clearSecret ? 'Keep' : 'Clear'}
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => props.onChange(null)}>
              Remove
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfigValueEditor(props: {
  title: string
  description: string
  entries: McpDraftConfigValue[]
  kind: 'env' | 'header'
  onChange: (entries: McpDraftConfigValue[]) => void
}): React.ReactElement {
  const addEntry = () => props.onChange([...props.entries, createDraftConfigValue(props.kind)])

  return (
    <div className="mcp-config-editor">
      <div className="mcp-config-header">
        <div className="mcp-config-title">{props.title}</div>
        <div className="mcp-config-desc">{props.description}</div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addEntry}>
        <Plus className="mr-2 h-4 w-4" />
        Add {props.kind === 'env' ? 'variable' : 'header'}
      </Button>

      {props.entries.length === 0 ? (
        <div className="mcp-config-empty">
          No {props.kind === 'env' ? 'environment variables' : 'headers'} yet.
        </div>
      ) : (
        <div className="mcp-config-entries">
          {props.entries.map((entry) => (
            <ConfigValueRow
              key={entry.id}
              entry={entry}
              kind={props.kind}
              onChange={(nextEntry) =>
                props.onChange(props.entries.map((currentEntry) => (currentEntry.id === nextEntry.id ? nextEntry : currentEntry)))
              }
              onRemove={() => props.onChange(props.entries.filter((currentEntry) => currentEntry.id !== entry.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ConfigValueRow(props: {
  entry: McpDraftConfigValue
  kind: 'env' | 'header'
  onChange: (entry: McpDraftConfigValue) => void
  onRemove: () => void
}): React.ReactElement {
  const namePlaceholder = props.kind === 'env' ? 'API_KEY' : 'X-Api-Key'
  const value = props.entry.valueSource === 'secret' ? props.entry.secretValue : props.entry.value

  return (
    <div className="mcp-config-row">
      <Input
        value={props.entry.name}
        onChange={(event) => props.onChange({ ...props.entry, name: event.target.value })}
        placeholder={namePlaceholder}
        className="mcp-config-name"
      />

      <Select
        value={props.entry.valueSource}
        onValueChange={(valueSource) =>
          props.onChange({
            ...props.entry,
            valueSource: valueSource as McpDraftConfigValue['valueSource'],
            clearSecret: false,
            value: valueSource === 'plaintext' ? props.entry.value : '',
            secretValue: valueSource === 'secret' ? props.entry.secretValue : '',
          })
        }
      >
        <SelectTrigger className="mcp-config-type">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="plaintext">Plaintext</SelectItem>
          <SelectItem value="secret">Secret</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type={props.entry.valueSource === 'secret' ? 'password' : 'text'}
        value={value}
        onChange={(event) =>
          props.onChange({
            ...props.entry,
            value: props.entry.valueSource === 'plaintext' ? event.target.value : '',
            secretValue: props.entry.valueSource === 'secret' ? event.target.value : '',
            clearSecret: false,
          })
        }
        placeholder={props.entry.valueSource === 'secret' && props.entry.secretStored ? 'Stored - type to replace' : 'Value'}
        className="mcp-config-value"
      />

      <Button type="button" variant="ghost" size="sm" onClick={props.onRemove}>
        <Trash2 size={14} />
      </Button>
    </div>
  )
}

function cloneDraftServer(server: McpDraftServer): McpDraftServer {
  return {
    ...server,
    env: server.env.map((entry) => ({ ...entry })),
    headers: server.headers.map((entry) => ({ ...entry })),
    authToken: server.authToken ? { ...server.authToken } : null,
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export default McpSection
