import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../shared/Toast'
import type { Folder } from '../../chat/types'
import type { Memory } from '../../electron/types'
import { folderMemoryScope } from '../../utils/memoryScope'
import { Brain, Check, Edit2, Globe, Plus, Trash2, X } from '../icons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import './FolderMemoryPanel.css'

export interface FolderMemoryPanelProps {
  folder: Folder
  onModeChange: (mode: Folder['memoryMode']) => void
}

interface ClassifiedMemory {
  memory: Memory
  isGlobal: boolean
}

function formatRelativeTime(value: number): string {
  const delta = Date.now() - value
  if (delta < 60_000) return 'just now'
  if (delta < 60 * 60_000) return `${Math.max(1, Math.round(delta / 60_000))}m`
  if (delta < 24 * 60 * 60_000) return `${Math.round(delta / (60 * 60_000))}h`
  if (delta < 7 * 24 * 60 * 60_000) return `${Math.round(delta / (24 * 60 * 60_000))}d`
  return new Date(value).toLocaleDateString()
}

/**
 * Displays and manages a folder's in-scope memories.
 *
 * Reads flow entirely through `window.memory.list(folderMemoryScope(folder))`
 * (Requirement 10.1). The read scope's `includeGlobal` already mirrors the
 * folder's `memoryMode`, so `folder-only` folders receive project-only
 * results from the bridge; the classification below still defensively
 * excludes any global entry rather than assuming the bridge filtered
 * correctly.
 *
 * Add/edit/delete are scoped to Project_Memory only (Requirement 4.5). Any
 * attempted edit/delete on a Global_Memory entry (shown in `default` mode)
 * short-circuits before any `window.memory` call and surfaces a toast
 * instead (Requirement 4.6).
 */
const GLOBAL_MEMORY_READONLY_MESSAGE =
  'This memory is global and can only be managed in Settings \u2192 Memory.'

export default function FolderMemoryPanel({ folder, onModeChange }: FolderMemoryPanelProps) {
  const { showToast } = useToast()
  const [memories, setMemories] = useState<Memory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const [newMemoryText, setNewMemoryText] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const memoryBridgeAvailable = typeof window !== 'undefined' && Boolean(window.memory?.list)
  const isFolderOnly = folder.memoryMode === 'folder-only'
  const folderId = folder.id
  const folderMemoryMode = folder.memoryMode

  const loadMemories = useCallback(() => {
    if (typeof window === 'undefined' || !window.memory?.list) {
      setMemories([])
      setHasLoadedOnce(true)
      return
    }

    setIsLoading(true)
    window.memory
      .list(folderMemoryScope({ id: folderId, memoryMode: folderMemoryMode }))
      .then((next) => {
        setMemories(
          next
            .filter((memory) => memory.status === 'active')
            .sort((a, b) => b.updatedAt - a.updatedAt)
        )
      })
      .catch(() => {
        // Keep the previously displayed list unchanged on a read failure.
        showToast('Failed to load this folder\u2019s memories.', 'error')
      })
      .finally(() => {
        setIsLoading(false)
        setHasLoadedOnce(true)
      })
  }, [folderId, folderMemoryMode, showToast])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  useEffect(() => {
    if (!memoryBridgeAvailable || !window.memory) return
    return window.memory.onChanged(() => {
      loadMemories()
    })
  }, [memoryBridgeAvailable, loadMemories])

  const classified = useMemo<ClassifiedMemory[]>(() => {
    return memories
      .filter((memory) => {
        if (memory.scope.type === 'project') return memory.scope.projectId === folder.id
        if (memory.scope.type === 'global') return !isFolderOnly
        return false
      })
      .map((memory) => ({ memory, isGlobal: memory.scope.type === 'global' }))
  }, [memories, folder.id, isFolderOnly])

  const count = classified.length
  const emptyCopy = isFolderOnly ? 'No folder memories yet.' : 'No folder or global memories yet.'

  const handleAddMemory = useCallback(async () => {
    const content = newMemoryText.trim()
    if (!content || !memoryBridgeAvailable || !window.memory) return

    setIsAdding(true)
    try {
      await window.memory.add({
        content,
        source: 'user',
        scope: { type: 'project', projectId: folderId },
      })
      setNewMemoryText('')
      loadMemories()
    } catch {
      showToast('Failed to add this memory. Please try again.', 'error')
    } finally {
      setIsAdding(false)
    }
  }, [newMemoryText, memoryBridgeAvailable, folderId, loadMemories, showToast])

  const beginEdit = useCallback(
    (memory: ClassifiedMemory) => {
      if (memory.isGlobal) {
        showToast(GLOBAL_MEMORY_READONLY_MESSAGE, 'error')
        return
      }
      setEditingId(memory.memory.id)
      setEditingText(memory.memory.content)
    },
    [showToast]
  )

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingText('')
  }, [])

  const handleSaveEdit = useCallback(
    async (memory: ClassifiedMemory) => {
      if (memory.isGlobal) {
        showToast(GLOBAL_MEMORY_READONLY_MESSAGE, 'error')
        cancelEdit()
        return
      }
      const content = editingText.trim()
      if (!content || !memoryBridgeAvailable || !window.memory) return

      setIsSavingEdit(true)
      try {
        await window.memory.update(memory.memory.id, { content })
        setEditingId(null)
        setEditingText('')
        loadMemories()
      } catch {
        showToast('Failed to update this memory. Please try again.', 'error')
      } finally {
        setIsSavingEdit(false)
      }
    },
    [editingText, memoryBridgeAvailable, loadMemories, showToast, cancelEdit]
  )

  const requestDelete = useCallback(
    (memory: ClassifiedMemory) => {
      if (memory.isGlobal) {
        showToast(GLOBAL_MEMORY_READONLY_MESSAGE, 'error')
        return
      }
      setPendingDeleteId(memory.memory.id)
    },
    [showToast]
  )

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null)
  }, [])

  const confirmDelete = useCallback(
    async (memory: ClassifiedMemory) => {
      if (memory.isGlobal) {
        showToast(GLOBAL_MEMORY_READONLY_MESSAGE, 'error')
        setPendingDeleteId(null)
        return
      }
      if (!memoryBridgeAvailable || !window.memory) return

      setDeletingId(memory.memory.id)
      try {
        await window.memory.delete(memory.memory.id)
        setPendingDeleteId(null)
        loadMemories()
      } catch {
        showToast('Failed to delete this memory. Please try again.', 'error')
      } finally {
        setDeletingId(null)
      }
    },
    [memoryBridgeAvailable, loadMemories, showToast]
  )

  const currentMode: NonNullable<Folder['memoryMode']> = isFolderOnly ? 'folder-only' : 'default'

  const handleModeChange = useCallback(
    (value: string) => {
      if (value !== 'default' && value !== 'folder-only') return
      onModeChange(value)
    },
    [onModeChange]
  )

  return (
    <section className="folder-memory-panel" aria-label={`${folder.name} memory`}>
      <header className="folder-memory-panel__header">
        <div className="folder-memory-panel__heading">
          <Brain size={15} />
          <span>Folder memory</span>
        </div>
        <small className="folder-memory-panel__count">{count}</small>
      </header>

      <Select value={currentMode} onValueChange={handleModeChange}>
        <SelectTrigger
          className="folder-memory-panel__mode-trigger"
          aria-label="Folder memory mode"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default (folder + global)</SelectItem>
          <SelectItem value="folder-only">Folder-only</SelectItem>
        </SelectContent>
      </Select>

      {memoryBridgeAvailable && (
        <form
          className="folder-memory-panel__add"
          onSubmit={(event) => {
            event.preventDefault()
            void handleAddMemory()
          }}
        >
          <input
            type="text"
            className="folder-memory-panel__add-input"
            placeholder="Add a memory for this folder..."
            value={newMemoryText}
            onChange={(event) => setNewMemoryText(event.target.value)}
            disabled={isAdding}
            aria-label="New folder memory"
          />
          <button
            type="submit"
            className="folder-memory-panel__add-button"
            disabled={isAdding || !newMemoryText.trim()}
            aria-label="Add memory"
          >
            <Plus size={14} />
          </button>
        </form>
      )}

      {!memoryBridgeAvailable ? (
        <p className="folder-memory-panel__muted">Memory is unavailable in this environment.</p>
      ) : isLoading && !hasLoadedOnce ? (
        <p className="folder-memory-panel__muted">Loading...</p>
      ) : count === 0 ? (
        <p className="folder-memory-panel__muted">{emptyCopy}</p>
      ) : (
        <ul className="folder-memory-panel__list">
          {classified.map((entry) => {
            const { memory, isGlobal } = entry
            const isEditing = editingId === memory.id
            const isPendingDelete = pendingDeleteId === memory.id
            const isSaving = isSavingEdit && isEditing
            const isDeleting = deletingId === memory.id

            return (
              <li key={memory.id} className="folder-memory-panel__item">
                <div className="folder-memory-panel__item-top">
                  {isGlobal ? (
                    <span className="folder-memory-panel__badge">
                      <Globe size={11} />
                      Global
                    </span>
                  ) : null}
                  <span className="folder-memory-panel__date">
                    {formatRelativeTime(memory.updatedAt)}
                  </span>
                  {!isGlobal && !isEditing && !isPendingDelete ? (
                    <div className="folder-memory-panel__item-actions">
                      <button
                        type="button"
                        className="folder-memory-panel__icon-button"
                        onClick={() => beginEdit(entry)}
                        aria-label="Edit memory"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        className="folder-memory-panel__icon-button"
                        onClick={() => requestDelete(entry)}
                        aria-label="Delete memory"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="folder-memory-panel__edit">
                    <textarea
                      className="folder-memory-panel__edit-input"
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      disabled={isSaving}
                      aria-label="Edit memory content"
                      autoFocus
                    />
                    <div className="folder-memory-panel__edit-actions">
                      <button
                        type="button"
                        className="folder-memory-panel__icon-button"
                        onClick={() => void handleSaveEdit(entry)}
                        disabled={isSaving || !editingText.trim()}
                        aria-label="Save memory"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        className="folder-memory-panel__icon-button"
                        onClick={cancelEdit}
                        disabled={isSaving}
                        aria-label="Cancel edit"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="folder-memory-panel__content">{memory.content}</p>
                )}

                {isPendingDelete ? (
                  <div className="folder-memory-panel__confirm-delete">
                    <span>Delete this memory?</span>
                    <button
                      type="button"
                      className="folder-memory-panel__confirm-delete-button"
                      onClick={() => void confirmDelete(entry)}
                      disabled={isDeleting}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="folder-memory-panel__confirm-cancel-button"
                      onClick={cancelDelete}
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
