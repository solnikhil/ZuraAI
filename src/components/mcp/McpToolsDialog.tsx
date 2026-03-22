import React, { useMemo, useState } from 'react'
import { Search, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { McpToolManifest } from '@/mcp/types'

interface McpToolsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverName: string
  discoveredTools: McpToolManifest[]
  blockedTools: Set<string>
  allowedTools: Set<string>
  onSave: (blockedTools: string[]) => void
}

export function McpToolsDialog({
  open,
  onOpenChange,
  serverName,
  discoveredTools,
  blockedTools,
  allowedTools,
  onSave,
}: McpToolsDialogProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [localBlocked, setLocalBlocked] = useState<Set<string>>(() => new Set(blockedTools))

  const hasAllowlist = allowedTools.size > 0

  const { enabledTools, disabledTools, filteredEnabled, filteredDisabled } = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase().trim()

    const enabled: McpToolManifest[] = []
    const disabled: McpToolManifest[] = []

    for (const tool of discoveredTools) {
      const nameLower = tool.name.toLowerCase()
      const isBlocked = localBlocked.has(nameLower)
      const isAllowedByList = hasAllowlist ? allowedTools.has(nameLower) : true

      if (isBlocked || !isAllowedByList) {
        disabled.push(tool)
      } else {
        enabled.push(tool)
      }
    }

    const filterByQuery = (tools: McpToolManifest[]): McpToolManifest[] => {
      if (!lowerQuery) return tools
      return tools.filter((tool) => {
        const nameMatch = tool.name.toLowerCase().includes(lowerQuery)
        const descMatch = tool.description?.toLowerCase().includes(lowerQuery)
        return nameMatch || descMatch
      })
    }

    return {
      enabledTools: enabled,
      disabledTools: disabled,
      filteredEnabled: filterByQuery(enabled),
      filteredDisabled: filterByQuery(disabled),
    }
  }, [discoveredTools, localBlocked, allowedTools, hasAllowlist, searchQuery])

  const handleToggle = (toolName: string, enable: boolean) => {
    setLocalBlocked((prev) => {
      const next = new Set(prev)
      const nameLower = toolName.toLowerCase()
      if (enable) {
        next.delete(nameLower)
      } else {
        next.add(nameLower)
      }
      return next
    })
  }

  const handleEnableAll = () => {
    setLocalBlocked(new Set())
  }

  const handleDisableAll = () => {
    setLocalBlocked(new Set(discoveredTools.map((t) => t.name.toLowerCase())))
  }

  const handleSave = () => {
    onSave(Array.from(localBlocked))
    onOpenChange(false)
  }

  const handleClose = () => {
    setLocalBlocked(new Set(blockedTools))
    setSearchQuery('')
    onOpenChange(false)
  }

  const hasChanges = !setsEqual(localBlocked, blockedTools)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (isOpen ? undefined : handleClose())}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Manage Tools - {serverName}
          </DialogTitle>
          <DialogDescription>
            Tools are enabled by default. Toggle off to disable specific tools from this server.
          </DialogDescription>
        </DialogHeader>

        <div className="mcp-tools-dialog-body">
          <div className="mcp-tools-search">
            <Search className="mcp-tools-search-icon" />
            <Input
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mcp-tools-search-input"
            />
            <div className="mcp-tools-quick-actions">
              <Button variant="ghost" size="sm" onClick={handleEnableAll} disabled={localBlocked.size === 0}>
                Enable All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisableAll} disabled={localBlocked.size === discoveredTools.length}>
                Disable All
              </Button>
            </div>
          </div>

          {hasAllowlist && (
            <div className="mcp-tools-allowlist-notice">
              This server has an allowlist configured. Only allowed tools will be visible to models.
            </div>
          )}

          <div className="mcp-tools-list-container">
            {filteredEnabled.length > 0 && (
              <div className="mcp-tools-group">
                <div className="mcp-tools-group-header">
                  <span className="mcp-tools-group-title">Enabled</span>
                  <span className="mcp-tools-group-count">{enabledTools.length}</span>
                </div>
                <div className="mcp-tools-group-items">
                  {filteredEnabled.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      enabled={true}
                      onToggle={(enable) => handleToggle(tool.name, enable)}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredDisabled.length > 0 && (
              <div className="mcp-tools-group">
                <div className="mcp-tools-group-header">
                  <span className="mcp-tools-group-title">Disabled</span>
                  <span className="mcp-tools-group-count">{disabledTools.length}</span>
                </div>
                <div className="mcp-tools-group-items">
                  {filteredDisabled.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      tool={tool}
                      enabled={false}
                      onToggle={(enable) => handleToggle(tool.name, enable)}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredEnabled.length === 0 && filteredDisabled.length === 0 && (
              <div className="mcp-tools-empty">
                {searchQuery ? 'No tools match your search.' : 'No tools discovered for this server.'}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ToolRowProps {
  tool: McpToolManifest
  enabled: boolean
  onToggle: (enable: boolean) => void
}

function ToolRow({ tool, enabled, onToggle }: ToolRowProps): React.ReactElement {
  const description = tool.description?.trim() ?? ''
  const truncatedDesc = description.length > 80 ? `${description.slice(0, 80)}...` : description

  return (
    <div className="mcp-tool-row">
      <div className="mcp-tool-info">
        <span className="mcp-tool-name">{tool.name}</span>
        {truncatedDesc && <span className="mcp-tool-desc">{truncatedDesc}</span>}
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} aria-label={`Toggle ${tool.name}`} />
    </div>
  )
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) {
    if (!b.has(item)) return false
  }
  return true
}

export default McpToolsDialog