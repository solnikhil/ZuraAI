import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Settings as SettingsIcon, Sparkles, Zap } from 'lucide-react'

import { ProviderLogo } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { Memory } from '@/electron/types'
import type { Settings } from '@/contexts/SettingsContext'
import { getAvailableTitleModelOptions, getProviderDefinition } from '@/providers'
import { isMemoryAutoManageEnabled, withMemoryAutoManage, type SkillsSettings } from '@/skills'

export interface MemorySectionProps {
  /** Skills map (for the auto-management sub-toggle). Optional in standalone use. */
  skills?: SkillsSettings
  /** Full settings (for the Memory model selector). Optional in standalone use. */
  settings?: Settings
  /** Persist settings changes (auto-management toggle, memory model). */
  onChange?: (changes: { skills?: SkillsSettings; memoryModel?: string }) => void
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function MemorySection({
  skills,
  settings,
  onChange,
}: MemorySectionProps = {}): React.ReactElement {
  const [memories, setMemories] = useState<Memory[]>([])
  const [summaries, setSummaries] = useState<import('@/electron/types').ConversationSummary[]>([])
  const [bgMemoriesOpen, setBgMemoriesOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.memory) {
      setMemories([])
      return
    }
    try {
      const next = await window.memory.list({ type: 'global' })
      setMemories(next)
      if (window.memory.summaries) {
        try {
          setSummaries(await window.memory.summaries.list())
        } catch {
          // Summaries are best-effort; ignore failures here.
        }
      }
    } catch (err) {
      console.error('Failed to load memories:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (typeof window === 'undefined' || !window.memory) return
    return window.memory.onChanged(() => {
      void refresh()
    })
  }, [refresh])

  const backgroundMemories = memories.filter((m) => m.origin === 'background')
  const bgTotalCount = backgroundMemories.length

  const memoryModelOptions = useMemo(() => {
    if (!settings) return [] as Array<{ value: string; label: string; provider: string }>
    const options: Array<{ value: string; label: string; provider: string }> =
      getAvailableTitleModelOptions(settings).map((option) => ({
        value: option.id,
        label: option.displayName,
        provider: option.provider,
      }))
    // Preserve a previously-selected model even if it's no longer in the list.
    if (settings.memoryModel && !options.some((option) => option.value === settings.memoryModel)) {
      options.push({
        value: settings.memoryModel,
        label: settings.memoryModel,
        provider: '' as string,
      })
    }
    return options
  }, [settings])

  const selectedMemoryModel = memoryModelOptions.find((o) => o.value === settings?.memoryModel)

  const memoryProviders = useMemo(() => {
    const seen = new Set<string>()
    const providers: Array<{ id: string; label: string }> = []
    for (const option of memoryModelOptions) {
      if (option.provider && !seen.has(option.provider)) {
        seen.add(option.provider)
        providers.push({ id: option.provider, label: getProviderDefinition(option.provider).label })
      }
    }
    return providers
  }, [memoryModelOptions])

  const selectedProvider = selectedMemoryModel?.provider || memoryProviders[0]?.id || ''

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Memory</h2>
        <div className="page-subtitle">
          Manage saved facts the assistant uses to personalize chats.
        </div>
      </div>

      {onChange && (
        <>
          <h3 className="appearance-group-heading">Background Memory</h3>
          <Card className="settings-list-card">
            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">
                  Background Active Memory
                </h3>
                <div className="settings-list-row__description">
                  Automatically learns and recalls facts from your conversations to personalize future
                  chats.
                </div>
              </div>
              <div className="settings-list-row__control">
                <Switch
                  checked={isMemoryAutoManageEnabled(skills)}
                  onCheckedChange={(checked) =>
                    onChange({ skills: withMemoryAutoManage(skills, checked) })
                  }
                  aria-label="Let the assistant manage memory automatically"
                />
              </div>
            </div>

            {settings && (
              <div className="settings-list-row">
                <div className="settings-list-row__meta">
                  <h3 className="settings-list-row__label">Memory model</h3>
                  <div className="settings-list-row__description">
                    Choose a fast, inexpensive model for background memory extraction.
                  </div>
                </div>
                <div className="settings-list-row__control">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-[13px] text-[var(--theme-text-primary)] transition-colors hover:bg-[var(--theme-surface-hover)]"
                        aria-label="Background memory model"
                      >
                        {selectedMemoryModel ? (
                          <span className="inline-flex items-center gap-2">
                            <ProviderLogo provider={selectedProvider} size={14} />
                            <span className="truncate">{selectedMemoryModel.label}</span>
                          </span>
                        ) : (
                          <span>Use current chat model</span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[205px] rounded-[14px] p-0.5"
                    >
                      <DropdownMenuItem
                        onClick={() => onChange({ memoryModel: '' })}
                        className="h-8 rounded-[12px] px-1.5 text-[12px]"
                      >
                        <Zap className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                        <span>Use current chat model</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="mx-0 my-px h-px" />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="h-8 rounded-[12px] px-1.5 text-[12px]">
                          <SettingsIcon className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                          <span>Use separate model</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={8}
                          collisionPadding={12}
                          className="w-[220px] rounded-[14px] p-0.5"
                        >
                          {memoryProviders.map((provider) => (
                            <DropdownMenuSub key={provider.id}>
                              <DropdownMenuSubTrigger className="h-8 rounded-[12px] px-1.5 text-[12px]">
                                <ProviderLogo provider={provider.id} size={14} />
                                <span>{provider.label}</span>
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent
                                sideOffset={8}
                                collisionPadding={12}
                                className="w-[220px] max-h-[60vh] overflow-y-auto rounded-[14px] p-0.5"
                              >
                                {memoryModelOptions
                                  .filter((o) => o.provider === provider.id)
                                  .map((option) => (
                                    <DropdownMenuItem
                                      key={option.value}
                                      onClick={() => onChange({ memoryModel: option.value })}
                                      className="h-8 rounded-[12px] px-1.5 text-[12px]"
                                    >
                                      <ProviderLogo provider={option.provider} size={14} />
                                      <span>{option.label}</span>
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}

            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Saved background memories</h3>
                <div className="settings-list-row__description">
                  {bgTotalCount === 0
                    ? 'No background memories yet. Enable Background Active Memory to start extracting facts.'
                    : `${bgTotalCount} ${bgTotalCount === 1 ? 'memory' : 'memories'} extracted from conversations.`}
                </div>
              </div>
              <div className="settings-list-row__control">
                <Dialog open={bgMemoriesOpen} onOpenChange={setBgMemoriesOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={bgTotalCount === 0}
                    >
                      <Sparkles size={14} /> View all
                    </Button>
                  </DialogTrigger>
                  <DialogContent
                    className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto"
                    overlayClassName="backdrop-blur-none"
                  >
                    <DialogHeader>
                      <DialogTitle>Saved Background Memories</DialogTitle>
                      <DialogDescription>
                        Facts automatically extracted from your conversations to personalize future chats.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-4">
                      {backgroundMemories.length === 0 && (
                        <div className="text-center text-muted-foreground py-8">
                          No background memories yet.
                        </div>
                      )}
                      {backgroundMemories.map((memory) => (
                        <div
                          key={memory.id}
                          className="flex items-start gap-3 p-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)]"
                        >
                          <span className="inline-flex items-center justify-center shrink-0 w-6 h-6 rounded-full bg-[var(--theme-accent-muted)] text-[var(--theme-accent)]">
                            <Sparkles size={12} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--theme-text-primary)]">
                              {memory.content}
                            </p>
                            <p className="text-xs text-[var(--theme-text-tertiary)] mt-1">
                              Updated {formatTimestamp(memory.updatedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setBgMemoriesOpen(false)}>
                        Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

          </Card>
        </>
      )}

      <h3 className="appearance-group-heading">Recent Activity</h3>
      <Card className="settings-list-card memory-settings-card" aria-label="Recent activity">
        <div className="settings-list-row memory-settings-card__header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Recent activity</h3>
            <div className="settings-list-row__description">
              {summaries.length === 0
                ? 'Short summaries of your recent chats appear here as the assistant distills them.'
                : 'Brief, dated summaries of your recent chats, used to keep continuity across conversations.'}
            </div>
          </div>
        </div>

        {summaries.length === 0 ? (
          <div className="settings-list-row settings-list-row--stacked">
            <div className="memory-empty">
              <p>No recent activity yet.</p>
            </div>
          </div>
        ) : (
          <ul className="memory-list" role="list">
            {summaries.map((item) => (
              <li key={item.sessionId} className="settings-list-row memory-card">
                <div className="settings-list-row__meta memory-card__meta">
                  <p className="memory-card__content">{item.summary}</p>
                  <div className="memory-card__footer">{formatTimestamp(item.updatedAt)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export default MemorySection
