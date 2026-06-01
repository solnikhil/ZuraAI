import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import type { Memory } from '@/electron/types'

const MAX_CONTENT_LENGTH = 1000

interface DraftRow {
  /** Memory id when editing an existing entry, null when adding a new one. */
  id: string | null
  content: string
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function MemorySection(): React.ReactElement {
  const [memories, setMemories] = useState<Memory[]>([])
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

  return (
    <div className="settings-section-layout">
      <div className="page-header">
        <h2 className="page-title">Memory</h2>
        <div className="page-subtitle">
          ZuraAI can remember short facts about you (preferences, projects, name, etc.) and apply them to future
          chats — similar to ChatGPT's saved memories. Memories are stored locally and never leave your device.
        </div>
      </div>

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
