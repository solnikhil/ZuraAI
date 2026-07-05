import { useEffect, useMemo, useState } from 'react'
import { useAppShell } from '../../contexts/AppShellContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import type { Memory } from '../../electron/types'
import { Button } from '@/components/ui/button'
import { Brain, FileText, FolderOpen, Plus } from '../icons'
import FolderNameDialog from './Sidebar/FolderNameDialog'
import './FoldersView.css'

function formatRelativeDate(value: number): string {
  const delta = Date.now() - value
  if (delta < 60_000) return 'just now'
  if (delta < 60 * 60_000) return `${Math.max(1, Math.round(delta / 60_000))}m`
  if (delta < 24 * 60 * 60_000) return `${Math.round(delta / (60 * 60_000))}h`
  if (delta < 7 * 24 * 60 * 60_000) return `${Math.round(delta / (24 * 60 * 60_000))}d`
  return new Date(value).toLocaleDateString()
}

export default function FoldersView() {
  const { selectedFolderId, setSelectedFolderId, setDashboardView } = useAppShell()
  const { folders, sessions, createFolder, createSession, switchSession } = useChatHistory()
  const [createOpen, setCreateOpen] = useState(false)
  const [managedFolderId, setManagedFolderId] = useState<string | null>(selectedFolderId)
  const [projectMemories, setProjectMemories] = useState<Memory[]>([])
  const [isLoadingMemories, setIsLoadingMemories] = useState(false)

  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) => a.order - b.order || a.createdAt - b.createdAt || a.name.localeCompare(b.name)
      ),
    [folders]
  )

  const managedFolder =
    sortedFolders.find((folder) => folder.id === managedFolderId) ?? sortedFolders[0] ?? null

  useEffect(() => {
    if (!managedFolderId && sortedFolders[0]) {
      setManagedFolderId(sortedFolders[0].id)
    }
  }, [managedFolderId, sortedFolders])

  const sessionsByFolder = useMemo(() => {
    const map = new Map<string, typeof sessions>()
    for (const folder of sortedFolders) {
      map.set(
        folder.id,
        sessions
          .filter((session) => session.folderId === folder.id)
          .sort((a, b) => b.updatedAt - a.updatedAt)
      )
    }
    return map
  }, [sessions, sortedFolders])

  const managedSessions = managedFolder ? (sessionsByFolder.get(managedFolder.id) ?? []) : []

  useEffect(() => {
    let cancelled = false
    if (!managedFolder || !window.memory?.list) {
      setProjectMemories([])
      return
    }

    setIsLoadingMemories(true)
    window.memory
      .list({ type: 'project', projectId: managedFolder.id })
      .then((memories) => {
        if (cancelled) return
        setProjectMemories(
          memories
            .filter((memory) => memory.status === 'active')
            .sort((a, b) => b.updatedAt - a.updatedAt)
        )
      })
      .catch(() => {
        if (!cancelled) setProjectMemories([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMemories(false)
      })

    return () => {
      cancelled = true
    }
  }, [managedFolder])

  const handleCreateFolder = (name: string, memoryMode?: 'default' | 'folder-only') => {
    const folderId = createFolder(name, memoryMode)
    setManagedFolderId(folderId)
    setSelectedFolderId(folderId)
    setDashboardView('folders')
  }

  const startChatInFolder = (folderId: string) => {
    createSession(undefined, folderId)
    setSelectedFolderId(folderId)
    setDashboardView('chat')
  }

  const openChat = (sessionId: string) => {
    switchSession(sessionId)
    setDashboardView('chat')
  }

  const manageFolder = (folderId: string) => {
    setManagedFolderId(folderId)
    setSelectedFolderId(folderId)
  }

  return (
    <section className="folders-view" aria-labelledby="folders-title">
      <main className="folders-view__workspace">
        <header className="folders-view__header">
          <div>
            <p className="folders-view__eyebrow">Projects</p>
            <h2 id="folders-title">Folders</h2>
          </div>
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            New folder
          </Button>
        </header>

        {sortedFolders.length > 0 ? (
          <div className="folders-view__layout">
            <div className="folders-view__project-grid" aria-label="Project folders">
              {sortedFolders.map((folder) => {
                const folderSessions = sessionsByFolder.get(folder.id) ?? []
                const active = managedFolder?.id === folder.id
                const memoryModeLabel =
                  folder.memoryMode === 'folder-only' ? 'Folder-only' : 'Default memory'
                return (
                  <article
                    key={folder.id}
                    className={`folders-view__project-card ${active ? 'folders-view__project-card--active' : ''}`}
                  >
                    <div className="folders-view__project-icon" aria-hidden="true">
                      <FolderOpen size={20} />
                    </div>
                    <div className="folders-view__project-body">
                      <h3>{folder.name}</h3>
                      <p>
                        {folderSessions.length} chat{folderSessions.length === 1 ? '' : 's'} /{' '}
                        {memoryModeLabel}
                      </p>
                    </div>
                    <div className="folders-view__project-actions">
                      <button type="button" onClick={() => manageFolder(folder.id)}>
                        Manage
                      </button>
                      <button type="button" onClick={() => startChatInFolder(folder.id)}>
                        New chat
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            <aside className="folders-view__manage-panel" aria-label="Project details">
              {managedFolder ? (
                <>
                  <div className="folders-view__manage-header">
                    <div>
                      <span>Manage</span>
                      <h3>{managedFolder.name}</h3>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => startChatInFolder(managedFolder.id)}
                    >
                      <Plus size={15} />
                      New chat
                    </Button>
                  </div>

                  <section className="folders-view__manage-section">
                    <div className="folders-view__manage-section-title">
                      <Brain size={15} />
                      <span>Saved memory</span>
                      <small>{isLoadingMemories ? '...' : projectMemories.length}</small>
                    </div>
                    {projectMemories.length > 0 ? (
                      <div className="folders-view__memory-list">
                        {projectMemories.slice(0, 8).map((memory) => (
                          <article key={memory.id} className="folders-view__memory-item">
                            <p>{memory.content}</p>
                            <small>{formatRelativeDate(memory.updatedAt)}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="folders-view__muted">
                        {isLoadingMemories
                          ? 'Loading memory...'
                          : 'No saved memories for this project yet.'}
                      </p>
                    )}
                  </section>

                  <section className="folders-view__manage-section">
                    <div className="folders-view__manage-section-title">
                      <FileText size={15} />
                      <span>Chats</span>
                      <small>{managedSessions.length}</small>
                    </div>
                    {managedSessions.length > 0 ? (
                      <div className="folders-view__managed-chats">
                        {managedSessions.map((session) => (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => openChat(session.id)}
                          >
                            <span>{session.title}</span>
                            <small>{formatRelativeDate(session.updatedAt)}</small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="folders-view__muted">No chats are attached to this project.</p>
                    )}
                  </section>
                </>
              ) : null}
            </aside>
          </div>
        ) : (
          <div className="folders-view__first-run">
            <FolderOpen size={26} />
            <h2>Create your first folder</h2>
            <p>Folders group chats and project memory into one workspace.</p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={15} />
              New folder
            </Button>
          </div>
        )}
      </main>

      <FolderNameDialog
        open={createOpen}
        mode="create"
        onOpenChange={setCreateOpen}
        onConfirm={handleCreateFolder}
      />
    </section>
  )
}
