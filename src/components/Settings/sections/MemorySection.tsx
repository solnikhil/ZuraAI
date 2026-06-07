import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Settings as SettingsIcon, Sparkles, Trash2, User, Zap } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

const MAX_CONTENT_LENGTH = 1000

interface DraftRow {
  /** Memory id when editing an existing entry, null when adding a new one. */
  id: string | null
  content: string
}

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [bgMemoriesOpen, setBgMemoriesOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.memory) {
      setMemories([])
      setLoading(false)
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
      setError(null)
    } catch (err) {
      console.error('Failed to load memories:', err)
      setError(err instanceof Error ? err.message : 'Failed to load memories.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (typeof window === 'undefined' || !window.memory) return
    return window.memory.onChanged(() => {
      void refresh()
    })
  }, [refresh])

  const handleStartAdd = () => setDraft({ id: null, content: '' })
  const handleStartEdit = (memory: Memory) => setDraft({ id: memory.id, content: memory.content })
  const handleCancelDraft = () => setDraft(null)

  const handleSubmitDraft = async () => {
    if (!draft) return
    const trimmed = draft.content.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      if (draft.id) {
        await window.memory.update(draft.id, { content: trimmed })
      } else {
        await window.memory.add({ content: trimmed, source: 'user' })
      }
      setDraft(null)
      await refresh()
    } catch (err) {
      console.error('Failed to save memory:', err)
      setError(err instanceof Error ? err.message : 'Failed to save memory.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.memory.delete(id)
      await refresh()
    } catch (err) {
      console.error('Failed to delete memory:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete memory.')
    }
  }

  const handleClearAll = async () => {
    setConfirmClear(false)
    try {
      await window.memory.clear()
      await refresh()
    } catch (err) {
      console.error('Failed to clear memories:', err)
      setError(err instanceof Error ? err.message : 'Failed to clear memories.')
    }
  }

  const totalCount = memories.length
  const remainingChars = useMemo(() => MAX_CONTENT_LENGTH - (draft?.content.length ?? 0), [draft])
  const tooLong = (draft?.content.length ?? 0) > MAX_CONTENT_LENGTH

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
                                className="w-[220px] rounded-[14px] p-0.5"
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
          </Card>
        </>
      )}

      <h3 className="appearance-group-heading">Saved Background Memories</h3>
      <Card className="settings-list-card">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Background extracted memories</h3>
            <div className="settings-list-row__description">
              {totalCount === 0
                ? 'No background memories yet. Enable Background Active Memory to start extracting facts.'
                : `${totalCount} ${totalCount === 1 ? 'memory' : 'memories'} extracted from conversations.`}
            </div>
          </div>
          <div className="settings-list-row__control">
            <Dialog open={bgMemoriesOpen} onOpenChange={setBgMemoriesOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={totalCount === 0}
                >
                  <Sparkles size={14} /> View all
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Saved Background Memories</DialogTitle>
                  <DialogDescription>
                    Facts automatically extracted from your conversations to personalize future chats.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  {memories.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No background memories yet.
                    </div>
                  )}
                  {memories.map((memory) => (
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

      <h3 className="appearance-group-heading">Saved Memories</h3>
      <Card className="settings-list-card memory-settings-card" aria-label="Saved memories">
        <div className="settings-list-row memory-settings-card__header">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Saved memories</h3>
            <div className="settings-list-row__description">
              {totalCount === 0
                ? 'Add durable facts here or let the assistant save things you mention in chat.'
                : `${totalCount} ${totalCount === 1 ? 'memory' : 'memories'} stored locally.`}
            </div>
          </div>
          <div className="settings-list-row__control memory-list-section__actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={totalCount === 0}
            >
              <Trash2 size={14} /> Clear all
            </Button>
            <Button size="sm" onClick={handleStartAdd} disabled={Boolean(draft)}>
              <Plus size={14} /> Add memory
            </Button>
          </div>
        </div>

        {error && (
          <div className="settings-list-row settings-list-row--stacked">
            <div className="memory-error" role="alert">
              {error}
            </div>
          </div>
        )}

        {draft && draft.id === null && (
          <div className="settings-list-row settings-list-row--stacked">
            <DraftEditor
              value={draft.content}
              placeholder="e.g. I prefer TypeScript and live in Bangalore."
              disabled={submitting}
              tooLong={tooLong}
              remaining={remainingChars}
              onChange={(content) => setDraft({ id: null, content })}
              onSubmit={handleSubmitDraft}
              onCancel={handleCancelDraft}
              submitLabel="Save"
            />
          </div>
        )}

        {loading ? (
          <div className="settings-list-row settings-list-row--stacked">
            <div className="memory-empty">Loading…</div>
          </div>
        ) : memories.length === 0 && !draft ? (
          <div className="settings-list-row settings-list-row--stacked">
            <div className="memory-empty">
              <p>No memories yet.</p>
              <p className="memory-empty__hint">
                Tip: in chat, say things like “remember that I prefer dark mode” and the assistant
                can save it for you when AI management is enabled.
              </p>
            </div>
          </div>
        ) : (
          <ul className="memory-list" role="list">
            {memories.map((memory) =>
              draft?.id === memory.id ? (
                <li
                  key={memory.id}
                  className="settings-list-row settings-list-row--stacked memory-card memory-card--editing"
                >
                  <DraftEditor
                    value={draft.content}
                    placeholder="Update memory…"
                    disabled={submitting}
                    tooLong={tooLong}
                    remaining={remainingChars}
                    onChange={(content) => setDraft({ id: memory.id, content })}
                    onSubmit={handleSubmitDraft}
                    onCancel={handleCancelDraft}
                    submitLabel="Update"
                  />
                </li>
              ) : (
                <li key={memory.id} className="settings-list-row memory-card">
                  <div className="settings-list-row__meta memory-card__meta">
                    <div className="memory-card__top">
                      <span className={`memory-card__chip memory-card__chip--${memory.source}`}>
                        {memory.source === 'model' ? <Sparkles size={12} /> : <User size={12} />}
                        {memory.source === 'model' ? 'AI' : 'You'}
                      </span>
                      <span className="memory-card__footer">
                        Updated {formatTimestamp(memory.updatedAt)}
                      </span>
                    </div>
                    <p className="memory-card__content">{memory.content}</p>
                  </div>
                  <div className="settings-list-row__control">
                    <div className="memory-card__actions">
                      <button
                        type="button"
                        className="memory-card__action"
                        onClick={() => handleStartEdit(memory)}
                        aria-label="Edit memory"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="memory-card__action memory-card__action--danger"
                        onClick={() => handleDelete(memory.id)}
                        aria-label="Delete memory"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </Card>

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

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all memories?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every saved memory. The assistant will not have access to
              anything you’ve previously asked it to remember.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll}>Delete all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface DraftEditorProps {
  value: string
  placeholder: string
  disabled: boolean
  tooLong: boolean
  remaining: number
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
}

function DraftEditor({
  value,
  placeholder,
  disabled,
  tooLong,
  remaining,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: DraftEditorProps): React.ReactElement {
  return (
    <div className="memory-draft">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        autoFocus
      />
      <div className="memory-draft__footer">
        <span
          className={`memory-draft__counter ${tooLong ? 'memory-draft__counter--invalid' : ''}`}
          aria-live="polite"
        >
          {remaining} characters remaining
        </span>
        <div className="memory-draft__actions">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={disabled || !value.trim() || tooLong}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default MemorySection
