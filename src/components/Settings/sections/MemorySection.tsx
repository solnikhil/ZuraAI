import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2, User } from 'lucide-react'

import { ProviderLogo } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
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
import type { Memory } from '@/electron/types'
import type { Settings } from '@/contexts/SettingsContext'
import { getAvailableTitleModelOptions, getProviderDefinition } from '@/providers'
import {
  isMemoryAutoManageEnabled,
  withMemoryAutoManage,
  type SkillsSettings,
} from '@/skills'

const MAX_CONTENT_LENGTH = 1000

/** Sentinel Select value meaning "follow the active chat model" (persisted as ''). */
const FOLLOW_ACTIVE_MODEL = '__follow_active_chat_model__'

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
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function MemorySection({ skills, settings, onChange }: MemorySectionProps = {}): React.ReactElement {
  const [memories, setMemories] = useState<Memory[]>([])
  const [summaries, setSummaries] = useState<import('@/electron/types').ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

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
    const options: Array<{ value: string; label: string; provider: string }> = getAvailableTitleModelOptions(settings).map((option) => ({
      value: option.id,
      label: `${getProviderDefinition(option.provider).label} - ${option.displayName}`,
      provider: option.provider,
    }))
    // Preserve a previously-selected model even if it's no longer in the list.
    if (settings.memoryModel && !options.some((option) => option.value === settings.memoryModel)) {
      options.push({ value: settings.memoryModel, label: settings.memoryModel, provider: '' as string })
    }
    return options
  }, [settings])

  const selectedMemoryModel = memoryModelOptions.find(
    (o) => o.value === settings?.memoryModel
  )

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Memory</h2>
        <div className="page-subtitle">Manage saved facts the assistant uses to personalize chats.</div>
      </div>

      {onChange && (
        <label className="memory-automanage-toggle" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={isMemoryAutoManageEnabled(skills)}
            onChange={(event) =>
              onChange({ skills: withMemoryAutoManage(skills, event.target.checked) })
            }
            style={{ marginTop: 3 }}
          />
          <span>
            <strong>Let the assistant manage memory automatically</strong>
            <span style={{ display: 'block', opacity: 0.7, fontSize: 13 }}>
              When on, the assistant can save, update, and search memories during chats and quietly
              distill durable facts from finished conversations. When off, memories you add here still
              personalize replies, but the assistant won&apos;t write or extract anything on its own.
            </span>
          </span>
        </label>
      )}

      {settings && onChange && (
        <section className="memory-list-section" aria-label="Memory model" style={{ marginBottom: 16 }}>
          <header className="memory-list-section__header">
            <div>
              <h3>Memory model</h3>
              <p>
                Model used for background memory extraction (distilling durable facts and recent-activity
                summaries from finished chats). Choose a fast, inexpensive model — it runs after every turn.
                Leave it on “current chat model” to use whichever model you’re chatting with.
              </p>
            </div>
            <div className="memory-list-section__actions">
              <Select
                value={settings.memoryModel || FOLLOW_ACTIVE_MODEL}
                onValueChange={(value) =>
                  onChange({ memoryModel: value === FOLLOW_ACTIVE_MODEL ? '' : value })
                }
              >
                <SelectTrigger
                  className="setting-input-scira min-w-[200px] justify-between gap-3"
                  aria-label="Background memory extraction model"
                >
                  {selectedMemoryModel ? (
                    <span className="inline-flex items-center gap-2">
                      <ProviderLogo provider={selectedMemoryModel.provider} size={16} />
                      <span className="truncate">{selectedMemoryModel.label}</span>
                    </span>
                  ) : (
                    <span>Use current chat model</span>
                  )}
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value={FOLLOW_ACTIVE_MODEL}>Use current chat model</SelectItem>
                  {memoryModelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} textValue={option.label}>
                      <span className="inline-flex items-center gap-2">
                        <ProviderLogo provider={option.provider} size={16} />
                        <span>{option.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </header>
        </section>
      )}

      <section className="memory-list-section" aria-label="Saved memories">
        <header className="memory-list-section__header">
          <div>
            <h3>Saved memories</h3>
            <p>
              {totalCount === 0
                ? 'No memories yet. Add one or let the assistant save things you mention in chat.'
                : `${totalCount} ${totalCount === 1 ? 'memory' : 'memories'} stored locally.`}
            </p>
          </div>
          <div className="memory-list-section__actions">
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
        </header>

        {error && (
          <div className="memory-error" role="alert">
            {error}
          </div>
        )}

        {draft && draft.id === null && (
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
        )}

        {loading ? (
          <div className="memory-empty">Loading…</div>
        ) : memories.length === 0 && !draft ? (
          <div className="memory-empty">
            <p>No memories yet.</p>
            <p className="memory-empty__hint">
              Tip: in chat, say things like “remember that I prefer dark mode” and the assistant can save it
              for you (when AI management is enabled).
            </p>
          </div>
        ) : (
          <ul className="memory-grid" role="list">
            {memories.map((memory) =>
              draft?.id === memory.id ? (
                <li key={memory.id} className="memory-card memory-card--full">
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
                <li key={memory.id} className="memory-card">
                  <div className="memory-card__top">
                    <span className={`memory-card__chip memory-card__chip--${memory.source}`}>
                      {memory.source === 'model' ? <Sparkles size={12} /> : <User size={12} />}
                      {memory.source === 'model' ? 'AI' : 'You'}
                    </span>
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
                  <p className="memory-card__content">{memory.content}</p>
                  <div className="memory-card__footer">Updated {formatTimestamp(memory.updatedAt)}</div>
                </li>
              )
            )}
          </ul>
        )}
      </section>

      <section className="memory-list-section" aria-label="Recent activity">
        <header className="memory-list-section__header">
          <div>
            <h3>Recent activity</h3>
            <p>
              {summaries.length === 0
                ? 'Short summaries of your recent chats appear here as the assistant distills them.'
                : 'Brief, dated summaries of your recent chats — used to keep continuity across conversations.'}
            </p>
          </div>
        </header>

        {summaries.length === 0 ? (
          <div className="memory-empty">
            <p>No recent activity yet.</p>
          </div>
        ) : (
          <ul className="memory-grid" role="list">
            {summaries.map((item) => (
              <li key={item.sessionId} className="memory-card">
                <p className="memory-card__content">{item.summary}</p>
                <div className="memory-card__footer">{formatTimestamp(item.updatedAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all memories?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every saved memory. The assistant will not have access to anything you’ve
              previously asked it to remember.
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
