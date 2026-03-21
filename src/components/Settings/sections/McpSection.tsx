import React, { useMemo, useState } from 'react'
import {
  Cable,
  Cloud,
  HardDrive,
  KeyRound,
  Loader2,
  PencilLine,
  Plus,
  RefreshCcw,
  Server,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import { useToast } from '@/components/shared'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useMcp } from '@/mcp/McpContext'
import {
  createDraftConfigValue,
  formatTransportLabel,
  isDraftServerEqualToLiveServer,
  validateDraftServer,
  type McpDraftConfigValue,
  type McpDraftServer,
} from '@/mcp/draft'
import type { McpServerStatus } from '@/mcp/types'

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
    pendingApprovals,
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

  return (
    <div className="settings-section-layout settings-section-layout--wide">
      <div className="page-header">
        <h2 className="page-title">MCP Servers</h2>
        <div className="page-subtitle">
          Configure Model Context Protocol servers, keep secrets in main-process storage, and control which connected servers are trusted enough to expose tools into chat.
        </div>
      </div>

      <Card className="settings-section-card border-border/70 bg-card/70 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{draftServers.length} configured</Badge>
              <Badge variant="outline">{connectedServerCount} connected</Badge>
              <Badge variant="outline">{tools.length} discovered tools</Badge>
              <Badge variant={hasDraftChanges ? 'default' : 'outline'}>
                {hasDraftChanges ? 'Unsaved changes' : 'Saved'}
              </Badge>
              {pendingApprovals.length > 0 && (
                <Badge variant="destructive">{pendingApprovals.length} approvals pending</Badge>
              )}
            </div>

            <div className="max-w-3xl text-sm text-muted-foreground">
              Stdio servers can launch local processes. Remote profiles keep URLs, headers, and auth tokens ready for later transport hardening. Secret values never go into renderer `localStorage`.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Server
            </Button>
          </div>
        </div>
      </Card>

      {!isSupported && (
        <Card className="settings-section-card border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          MCP configuration is only available through the Electron preload bridge.
        </Card>
      )}

      {error && (
        <Card className="settings-section-card border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </Card>
      )}

      {hasDraftChanges && (
        <Card className="settings-section-card border-sky-500/20 bg-sky-500/8 p-4 text-sm text-sky-100">
          MCP changes join the standard Settings save bar. Connect and disconnect actions are paused until you save or discard this draft.
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {isLoading ? (
          <Card className="settings-section-card border-border/70 bg-card/70 p-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading MCP servers...
            </div>
          </Card>
        ) : draftServers.length === 0 ? (
          <Card className="settings-section-card border-dashed border-border/70 bg-card/60 p-6 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Server className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="space-y-2">
                <div className="font-medium text-foreground">No MCP servers configured yet.</div>
                <div>Add a stdio or remote profile to discover tools and monitor connection state from Settings.</div>
              </div>
            </div>
          </Card>
        ) : (
          draftServers.map((server) => {
            const runtimeState = getRuntimeState(server.id)
            const toolCount = runtimeState?.tools.length ?? liveServersById.get(server.id)?.lastKnownTools?.length ?? 0
            const liveServer = liveServersById.get(server.id)
            const isDraftOnly = !liveServer
            const isDirty = !liveServer || !isDraftServerEqualToLiveServer(server, liveServer)
            const isBusy = serverActionState[server.id] && serverActionState[server.id] !== 'idle'
            const status = runtimeState?.status ?? 'disconnected'

            return (
              <Card key={server.id} className="settings-section-card border-border/70 bg-card/70 p-5">
                <div className="flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{server.name || 'Untitled MCP Server'}</h3>
                        <Badge variant="outline">{formatTransportLabel(server.transport)}</Badge>
                        <Badge variant={server.enabled ? 'secondary' : 'outline'}>
                          {server.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        {isDraftOnly && <Badge variant="default">New</Badge>}
                        {isDirty && !isDraftOnly && <Badge variant="default">Edited</Badge>}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {server.transport === 'stdio'
                          ? server.command || 'No command configured yet.'
                          : server.url || 'No remote URL configured yet.'}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(server)}>
                        <PencilLine className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(server)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={status} />
                    <Badge variant="outline">{toolCount} tools</Badge>
                    <Badge variant={server.trustState === 'trusted' ? 'secondary' : 'outline'}>
                      {server.trustState === 'trusted' ? 'Trusted' : 'Untrusted'}
                    </Badge>
                    {server.autoConnect && <Badge variant="outline">Auto-connect</Badge>}
                    {server.requireApproval && (
                      <Badge variant="outline">
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Approval required
                      </Badge>
                    )}
                    {server.authToken && <Badge variant="outline">Auth token configured</Badge>}
                    {server.headers.length > 0 && <Badge variant="outline">{server.headers.length} headers</Badge>}
                    {server.env.length > 0 && <Badge variant="outline">{server.env.length} env vars</Badge>}
                  </div>

                  {runtimeState?.error && (
                    <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {runtimeState.error}
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="text-xs text-muted-foreground">
                      {status === 'connected'
                        ? `Connected${runtimeState?.lastConnectionTime ? ` ${formatRelativeTimestamp(runtimeState.lastConnectionTime)}` : ''}`
                        : runtimeState?.lastConnectionError
                          ? `Last error: ${runtimeState.lastConnectionError}`
                          : 'Not connected yet.'}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleConnectToggle(server)}
                      disabled={isBusy || hasDraftChanges || isDraftOnly || !server.enabled || !isSupported}
                    >
                      {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cable className="mr-2 h-4 w-4" />}
                      {status === 'connected' ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{dialogServer && liveServersById.has(dialogServer.id) ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
            <DialogDescription>
              Configure transport details, headers, environment variables, and secure secrets. Secret values are stored in Electron main-process secure storage on save.
            </DialogDescription>
          </DialogHeader>

          {dialogServer && (
            <div className="space-y-6">
              {dialogErrors.length > 0 && (
                <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <TriangleAlert className="h-4 w-4" />
                    Fix these fields before continuing
                  </div>
                  <ul className="space-y-1 pl-5">
                    {dialogErrors.map((message) => (
                      <li key={message} className="list-disc">{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="mcp-server-name">Server name</FieldLabel>
                    <Input
                      id="mcp-server-name"
                      value={dialogServer.name}
                      onChange={(event) => setDialogServer({ ...dialogServer, name: event.target.value })}
                      placeholder="Filesystem"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="mcp-server-transport">Transport</FieldLabel>
                    <Select
                      value={dialogServer.transport}
                      onValueChange={(value) =>
                        setDialogServer({
                          ...dialogServer,
                          transport: value as McpDraftServer['transport'],
                        })
                      }
                    >
                      <SelectTrigger id="mcp-server-transport">
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

                <div className="grid gap-4 md:grid-cols-2">
                  <ToggleField
                    label="Enabled"
                    description="Disabled servers stay in storage but their tools are excluded from active runtime exposure."
                    checked={dialogServer.enabled}
                    onCheckedChange={(checked) => setDialogServer({ ...dialogServer, enabled: checked })}
                  />
                  <ToggleField
                    label="Auto-connect"
                    description="Attempt a connection during startup once the server is enabled and saved."
                    checked={dialogServer.autoConnect}
                    onCheckedChange={(checked) => setDialogServer({ ...dialogServer, autoConnect: checked })}
                  />
                </div>

                <Field>
                  <FieldLabel htmlFor="mcp-server-trust-state">Trust level</FieldLabel>
                  <Select
                    value={dialogServer.trustState}
                    onValueChange={(value) =>
                      setDialogServer({
                        ...dialogServer,
                        trustState: value as McpDraftServer['trustState'],
                      })
                    }
                  >
                    <SelectTrigger id="mcp-server-trust-state">
                      <SelectValue placeholder="Select trust level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="untrusted">Untrusted</SelectItem>
                      <SelectItem value="trusted">Trusted</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    Untrusted servers can stay configured and even connected, but their tools stay hidden from models until you explicitly trust them.
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <Separator />

              {dialogServer.transport === 'stdio' ? (
                <FieldGroup>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <HardDrive className="h-4 w-4" />
                    Local stdio process
                  </div>

                  <Field>
                    <FieldLabel htmlFor="mcp-server-command">Command</FieldLabel>
                    <Input
                      id="mcp-server-command"
                      value={dialogServer.command}
                      onChange={(event) => setDialogServer({ ...dialogServer, command: event.target.value })}
                      placeholder="npx"
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="mcp-server-args">Arguments</FieldLabel>
                    <Textarea
                      id="mcp-server-args"
                      value={dialogServer.argsText}
                      onChange={(event) => setDialogServer({ ...dialogServer, argsText: event.target.value })}
                      placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Projects'}
                      className="min-h-28"
                    />
                    <FieldDescription>Use one argument per line so quoting stays explicit.</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="mcp-server-cwd">Working directory</FieldLabel>
                    <Input
                      id="mcp-server-cwd"
                      value={dialogServer.cwd}
                      onChange={(event) => setDialogServer({ ...dialogServer, cwd: event.target.value })}
                      placeholder="C:\\Projects"
                    />
                  </Field>
                </FieldGroup>
              ) : (
                <FieldGroup>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Cloud className="h-4 w-4" />
                    Remote endpoint profile
                  </div>

                  <Field>
                    <FieldLabel htmlFor="mcp-server-url">URL</FieldLabel>
                    <Input
                      id="mcp-server-url"
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
                    description="Send additional request headers. Use secret rows for API tokens or session identifiers."
                    entries={dialogServer.headers}
                    kind="header"
                    onChange={(nextEntries) => setDialogServer({ ...dialogServer, headers: nextEntries })}
                  />
                </FieldGroup>
              )}

              <Separator />

              <ConfigValueEditor
                title="Environment variables"
                description="Environment variables are available to local stdio servers when Electron launches the process."
                entries={dialogServer.env}
                kind="env"
                onChange={(nextEntries) => setDialogServer({ ...dialogServer, env: nextEntries })}
              />

              <Separator />

              <FieldGroup>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <KeyRound className="h-4 w-4" />
                  Connection timing and approvals
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <NumberInputField
                    id="mcp-startup-timeout"
                    label="Startup timeout (ms)"
                    value={dialogServer.startupTimeoutMs}
                    onChange={(value) => setDialogServer({ ...dialogServer, startupTimeoutMs: value })}
                    placeholder="10000"
                  />
                  <NumberInputField
                    id="mcp-tool-timeout"
                    label="Tool timeout (ms)"
                    value={dialogServer.toolTimeoutMs}
                    onChange={(value) => setDialogServer({ ...dialogServer, toolTimeoutMs: value })}
                    placeholder="10000"
                  />
                  <NumberInputField
                    id="mcp-reconnect-attempts"
                    label="Reconnect attempts"
                    value={dialogServer.reconnectAttempts}
                    onChange={(value) => setDialogServer({ ...dialogServer, reconnectAttempts: value })}
                    placeholder="0"
                  />
                  <NumberInputField
                    id="mcp-reconnect-delay"
                    label="Reconnect delay (ms)"
                    value={dialogServer.reconnectDelayMs}
                    onChange={(value) => setDialogServer({ ...dialogServer, reconnectDelayMs: value })}
                    placeholder="1000"
                  />
                </div>

                <ToggleField
                  label="Require approval"
                  description="Trusted servers can expose tools to models, but each tool call pauses for approval here unless you turn this off for the server."
                  checked={dialogServer.requireApproval}
                  onCheckedChange={(checked) => setDialogServer({ ...dialogServer, requireApproval: checked })}
                />
              </FieldGroup>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button type="button" onClick={saveDialogServer}>Apply Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget != null} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCP server</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleteTarget?.name || 'this server'} from the current draft. Save changes to delete it from disk and clear any stored secrets tied to that profile.
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
    <Card className="border-border/70 bg-background/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{props.label}</div>
          <div className="text-sm text-muted-foreground">{props.description}</div>
        </div>
        <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} aria-label={props.label} />
      </div>
    </Card>
  )
}

function NumberInputField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}): React.ReactElement {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
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
    <Card className="border-border/70 bg-background/60 p-4">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">Auth token</div>
          <div className="text-sm text-muted-foreground">
            Store a bearer token separately from generic headers. Secret tokens stay masked in the renderer and are written to main-process secure storage on save.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
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
            <SelectTrigger>
              <SelectValue placeholder="Value type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plaintext">Plaintext</SelectItem>
              <SelectItem value="secret">Secret</SelectItem>
            </SelectContent>
          </Select>

          <div className="space-y-2">
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
              placeholder={entry.valueSource === 'secret' && entry.secretStored ? 'Stored securely - type to replace' : 'Bearer token'}
            />

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {entry.valueSource === 'secret' && entry.secretStored && !entry.clearSecret && (
                <Badge variant="secondary">Stored securely</Badge>
              )}
              {entry.valueSource === 'secret' && entry.secretStored && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => props.onChange({ ...entry, clearSecret: !entry.clearSecret, secretValue: '' })}
                >
                  {entry.clearSecret ? 'Keep stored token' : 'Clear stored token'}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => props.onChange(null)}>
                Remove token
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
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
    <Card className="border-border/70 bg-background/60 p-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{props.title}</div>
            <div className="text-sm text-muted-foreground">{props.description}</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Add {props.kind === 'env' ? 'variable' : 'header'}
          </Button>
        </div>

        {props.entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            No {props.kind === 'env' ? 'environment variables' : 'additional headers'} yet.
          </div>
        ) : (
          <div className="space-y-3">
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
    </Card>
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
    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_170px_minmax(0,1fr)_auto] xl:items-start">
        <Input
          value={props.entry.name}
          onChange={(event) => props.onChange({ ...props.entry, name: event.target.value })}
          placeholder={namePlaceholder}
          aria-label={`${props.kind} name`}
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
          <SelectTrigger aria-label={`${props.kind} value type`}>
            <SelectValue placeholder="Value type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plaintext">Plaintext</SelectItem>
            <SelectItem value="secret">Secret</SelectItem>
          </SelectContent>
        </Select>

        <div className="space-y-2">
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
            placeholder={props.entry.valueSource === 'secret' && props.entry.secretStored ? 'Stored securely - type to replace' : 'Value'}
            aria-label={`${props.kind} value`}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {props.entry.valueSource === 'secret' && props.entry.secretStored && !props.entry.clearSecret && (
              <Badge variant="secondary">Stored securely</Badge>
            )}
            {props.entry.valueSource === 'secret' && props.entry.secretStored && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.onChange({ ...props.entry, clearSecret: !props.entry.clearSecret, secretValue: '' })}
              >
                {props.entry.clearSecret ? 'Keep stored secret' : 'Clear stored secret'}
              </Button>
            )}
          </div>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={props.onRemove}>
          <Trash2 className="mr-2 h-4 w-4" />
          Remove
        </Button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: McpServerStatus }): React.ReactElement {
  if (status === 'connected') {
    return <Badge variant="secondary">Connected</Badge>
  }

  if (status === 'connecting') {
    return (
      <Badge variant="outline">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Connecting
      </Badge>
    )
  }

  if (status === 'error') {
    return <Badge variant="destructive">Error</Badge>
  }

  return <Badge variant="outline">Disconnected</Badge>
}

function cloneDraftServer(server: McpDraftServer): McpDraftServer {
  return {
    ...server,
    env: server.env.map((entry) => ({ ...entry })),
    headers: server.headers.map((entry) => ({ ...entry })),
    authToken: server.authToken ? { ...server.authToken } : null,
  }
}

function formatRelativeTimestamp(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return ''
  }

  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) {
    return 'just now'
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export default McpSection
