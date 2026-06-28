import { useMemo, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { useAppShell } from '../../contexts/AppShellContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Brain, FileText, FolderOpen, Plus } from '../icons'
import FolderNameDialog from './Sidebar/FolderNameDialog'
import './FoldersView.css'

type FolderTab = 'chats' | 'context'

function formatRelativeDate(value: number): string {
  const delta = Date.now() - value
  if (delta < 60_000) return 'just now'
  if (delta < 60 * 60_000) return `${Math.max(1, Math.round(delta / 60_000))} min ago`
  if (delta < 24 * 60 * 60_000) return `${Math.round(delta / (60 * 60_000))} hr ago`
  if (delta < 7 * 24 * 60 * 60_000) return `${Math.round(delta / (24 * 60 * 60_000))} days ago`
  return new Date(value).toLocaleDateString()
}

export default function FoldersView() {
  const { selectedFolderId, setSelectedFolderId, setDashboardView } = useAppShell()
  const {
    folders,
    sessions,
    createFolder,
    createSession,
    switchSession,
  } = useChatHistory()
  const [createOpen, setCreateOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<FolderTab>('chats')

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.name.localeCompare(b.name)),
    [folders]
  )
  const selectedFolder = sortedFolders.find((folder) => folder.id === selectedFolderId) ?? sortedFolders[0] ?? null
  const folderSessions = useMemo(
    () =>
      selectedFolder
        ? sessions
            .filter((session) => session.folderId === selectedFolder.id)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        : [],
    [selectedFolder, sessions]
  )

  const handleCreateFolder = (name: string, memoryMode?: 'default' | 'folder-only') => {
    const folderId = createFolder(name, memoryMode)
    setSelectedFolderId(folderId)
    setDashboardView('folders')
  }

  const startChatInFolder = () => {
    if (!selectedFolder) return
    createSession(undefined, selectedFolder.id)
    setDashboardView('chat')
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    startChatInFolder()
  }

  const openChat = (sessionId: string) => {
    switchSession(sessionId)
    setDashboardView('chat')
  }

  const chatCount = folderSessions.length
  const memoryModeLabel = selectedFolder?.memoryMode === 'folder-only' ? 'Folder-only memory' : 'Default memory'

  return (
    <section className="folders-view" aria-labelledby="folders-title">
      <aside className="folders-view__rail" aria-label="Folders">
        <div className="folders-view__rail-header">
          <span>Folders</span>
          <button type="button" onClick={() => setCreateOpen(true)} aria-label="New folder">
            <Plus size={15} />
          </button>
        </div>
        <div className="folders-view__rail-list">
          {sortedFolders.map((folder) => {
            const count = sessions.filter((session) => session.folderId === folder.id).length
            const active = folder.id === selectedFolder?.id
            return (
              <button
                key={folder.id}
                type="button"
                className={`folders-view__rail-item ${active ? 'folders-view__rail-item--active' : ''}`}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <FolderOpen size={15} />
                <span>{folder.name}</span>
                <small>{count}</small>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="folders-view__panel">
        {selectedFolder ? (
          <>
            <header className="folders-view__hero">
              <div className="folders-view__hero-title">
                <FolderOpen size={30} />
                <div>
                  <h2 id="folders-title">{selectedFolder.name}</h2>
                  <p>{chatCount === 0 ? 'No chats yet' : `${chatCount} chat${chatCount === 1 ? '' : 's'} in this folder`}</p>
                </div>
              </div>
              <div className="folders-view__hero-actions">
                <Badge variant="outline" className="folders-view__memory-badge">
                  <Brain size={13} />
                  {memoryModeLabel}
                </Badge>
                <Button type="button" size="sm" onClick={startChatInFolder}>
                  <Plus size={15} />
                  New chat
                </Button>
              </div>
            </header>

            <div
              className="folders-view__composer-entry"
              role="button"
              tabIndex={0}
              onClick={startChatInFolder}
              onKeyDown={handleComposerKeyDown}
            >
              <Plus size={18} />
              <span>New chat in {selectedFolder.name}</span>
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FolderTab)} className="folders-view__tabs">
              <TabsList variant="line" className="folders-view__tabs-list">
                {[
                  { id: 'chats' as const, label: 'Chats', count: chatCount },
                  { id: 'context' as const, label: 'Context', count: selectedFolder.memoryMode === 'folder-only' ? 1 : 2 },
                ].map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="folders-view__tabs-trigger">
                    <span>{tab.label}</span>
                    <span className="folders-view__tabs-count">{tab.count}</span>
                    {activeTab === tab.id && (
                      <motion.div layoutId="folders-active-tab" className="folders-view__tabs-indicator" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {activeTab === 'chats' ? (
              folderSessions.length === 0 ? (
                <div className="folders-view__empty">
                  <FolderOpen size={20} />
                  <strong>No chats yet</strong>
                  <span>Chats in {selectedFolder.name} will live here.</span>
                  <Button type="button" size="sm" onClick={startChatInFolder}>
                    <Plus size={15} />
                    Start a folder chat
                  </Button>
                </div>
              ) : (
                <div className="folders-view__rows">
                  {folderSessions.map((session, index) => (
                    <button key={session.id} type="button" className="folders-view__row" onClick={() => openChat(session.id)}>
                      <span className="folders-view__row-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="folders-view__row-main">
                        <strong>{session.title}</strong>
                        <small>{session.messageCount ?? session.messages.length} messages / updated {formatRelativeDate(session.updatedAt)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="folders-view__context">
                <article>
                  <Brain size={18} />
                  <div>
                    <strong>{memoryModeLabel}</strong>
                    <span>
                      {selectedFolder.memoryMode === 'folder-only'
                        ? 'Chats in this folder use only memories saved from this folder.'
                        : 'Chats in this folder can use global memories and memories saved from this folder.'}
                    </span>
                  </div>
                </article>
                <article>
                  <FileText size={18} />
                  <div>
                    <strong>Folder sources</strong>
                    <span>Sources and files can be added here when the source library ships.</span>
                  </div>
                </article>
              </div>
            )}
          </>
        ) : (
          <div className="folders-view__first-run">
            <FolderOpen size={26} />
            <h2 id="folders-title">Create your first folder</h2>
            <p>Folders group chats and let you choose how memory works for that workspace.</p>
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
