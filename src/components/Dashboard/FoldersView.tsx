import { useEffect, useMemo, useState } from 'react'
import { useAppShell } from '../../contexts/AppShellContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import type { ChatSession } from '../../chat/types'
import { Button } from '@/components/ui/button'
import { FileText, FolderOpen, Plus } from '../icons'
import FolderMemoryPanel from './FolderMemoryPanel'
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

function memoryModeLabel(memoryMode: 'default' | 'folder-only' | undefined): string {
  return memoryMode === 'folder-only' ? 'Folder-only' : 'Default memory'
}

/**
 * Folders_View: full-page dashboard surface for browsing folders and
 * inspecting a selected folder's chats/memory (Requirement 6).
 *
 * The memory-management region renders `FolderMemoryPanel`, which owns all
 * scope-aware reads/writes for the selected folder's memories through
 * `window.memory` (Requirements 3, 4). Memory-mode changes flow through
 * `setFolderMemoryMode` from `ChatHistoryContext`, which persists via
 * `chat-store:save-index` and re-renders both this view and the sidebar
 * Projects section from the same folder state (Requirement 5, 8).
 */
export default function FoldersView() {
  const { selectedFolderId, setSelectedFolderId, setDashboardView } = useAppShell()
  const { folders, sessions, createFolder, createSession, switchSession, setFolderMemoryMode } =
    useChatHistory()
  const [createOpen, setCreateOpen] = useState(false)

  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) => a.order - b.order || a.createdAt - b.createdAt || a.name.localeCompare(b.name)
      ),
    [folders]
  )

  const selectedFolder =
    sortedFolders.find((folder) => folder.id === selectedFolderId) ?? sortedFolders[0] ?? null

  // Keep a folder selected once folders exist, without overriding an explicit
  // selection made elsewhere (e.g. opened from the Sidebar_Projects_Section).
  useEffect(() => {
    if (!selectedFolderId && sortedFolders[0]) {
      setSelectedFolderId(sortedFolders[0].id)
    }
  }, [selectedFolderId, sortedFolders, setSelectedFolderId])

  const sessionsByFolder = useMemo(() => {
    const map = new Map<string, ChatSession[]>()
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

  const selectedSessions = selectedFolder ? (sessionsByFolder.get(selectedFolder.id) ?? []) : []

  const handleCreateFolder = (name: string, memoryMode?: 'default' | 'folder-only') => {
    const folderId = createFolder(name, memoryMode)
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

  const selectFolder = (folderId: string) => {
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
                const active = selectedFolder?.id === folder.id
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
                        {memoryModeLabel(folder.memoryMode)}
                      </p>
                    </div>
                    <div className="folders-view__project-actions">
                      <button type="button" onClick={() => selectFolder(folder.id)}>
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

            <aside className="folders-view__detail-panel" aria-label="Folder details">
              {selectedFolder ? (
                <>
                  <div className="folders-view__detail-header">
                    <div>
                      <span>Manage</span>
                      <h3>{selectedFolder.name}</h3>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => startChatInFolder(selectedFolder.id)}
                    >
                      <Plus size={15} />
                      New chat
                    </Button>
                  </div>

                  <FolderMemoryPanel
                    folder={selectedFolder}
                    onModeChange={(mode) => setFolderMemoryMode(selectedFolder.id, mode)}
                  />

                  <section className="folders-view__detail-section">
                    <div className="folders-view__detail-section-title">
                      <FileText size={15} />
                      <span>Chats</span>
                      <small>{selectedSessions.length}</small>
                    </div>
                    {selectedSessions.length > 0 ? (
                      <div className="folders-view__detail-chats">
                        {selectedSessions.map((session) => (
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
