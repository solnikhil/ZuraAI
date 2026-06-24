import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, FileText, Trash2, X } from 'lucide-react'
import LazyMarkdown from '../LazyMarkdown'
import MermaidDiagram from '../MermaidDiagram'
import { Button } from '@/components/ui/button'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { useAppShell } from '@/contexts/AppShellContext'
import {
  getArtifactExtension,
  getCurrentArtifactVersion,
  renameArtifactDocument,
  restoreArtifactVersion,
} from '@/artifacts/artifactStore'
import type { ArtifactDocument, ArtifactKind } from '@/artifacts/artifactTypes'
import type { ChatSession } from '@/chat/types'
import { downloadFile } from '@/utils/chatExport'
import './ArtifactsView.css'

type ArtifactFilter = 'all' | ArtifactKind | 'current'

interface ArtifactListItem {
  sessionId: string
  sessionTitle: string
  artifact: ArtifactDocument
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString()
}

function mimeForArtifact(artifact: ArtifactDocument): string {
  if (artifact.kind === 'html') return 'text/html'
  if (artifact.kind === 'json') return 'application/json'
  if (artifact.kind === 'svg') return 'image/svg+xml'
  if (artifact.kind === 'markdown') return 'text/markdown'
  return 'text/plain'
}

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'artifact'
}

export default function ArtifactsView(): React.ReactElement {
  const {
    sessions,
    currentSessionId,
    switchSession,
    renameArtifact,
    restoreArtifact,
    deleteArtifact,
  } = useChatHistory()
  const { setDashboardView } = useAppShell()
  const [storedSessions, setStoredSessions] = useState<ChatSession[] | null>(null)
  const [activeFilter, setActiveFilter] = useState<ArtifactFilter>('all')
  const [selected, setSelected] = useState<{ sessionId: string; artifactId: string } | null>(null)

  useEffect(() => {
    if (!window.ipcRenderer) return
    let cancelled = false
    void window.ipcRenderer
      .invoke('chat-store:get-all')
      .then((nextSessions: ChatSession[]) => {
        if (!cancelled) setStoredSessions(nextSessions)
      })
      .catch(() => {
        if (!cancelled) setStoredSessions(null)
      })
    return () => {
      cancelled = true
    }
  }, [sessions])

  const artifactSessions = storedSessions ?? sessions
  const items = useMemo<ArtifactListItem[]>(() => {
    return artifactSessions.flatMap((session) =>
      (session.artifacts || []).map((artifact) => ({
        sessionId: session.id,
        sessionTitle: session.title,
        artifact,
      }))
    ).sort((a, b) => b.artifact.updatedAt - a.artifact.updatedAt)
  }, [artifactSessions])

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items
    if (activeFilter === 'current') return items.filter((item) => item.sessionId === currentSessionId)
    return items.filter((item) => item.artifact.kind === activeFilter)
  }, [activeFilter, currentSessionId, items])

  const selectedItem = selected
    ? items.find((item) => item.sessionId === selected.sessionId && item.artifact.id === selected.artifactId) ?? null
    : null
  const selectedVersion = selectedItem ? getCurrentArtifactVersion(selectedItem.artifact) : null

  const filters: Array<{ id: ArtifactFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'current', label: 'Current chat', count: items.filter((item) => item.sessionId === currentSessionId).length },
    { id: 'markdown', label: 'Markdown', count: items.filter((item) => item.artifact.kind === 'markdown').length },
    { id: 'code', label: 'Code', count: items.filter((item) => item.artifact.kind === 'code').length },
    { id: 'html', label: 'HTML', count: items.filter((item) => item.artifact.kind === 'html').length },
    { id: 'json', label: 'JSON', count: items.filter((item) => item.artifact.kind === 'json').length },
  ]

  const copySelected = async () => {
    if (!selectedVersion) return
    await navigator.clipboard?.writeText(selectedVersion.content)
  }

  const downloadSelected = () => {
    if (!selectedItem || !selectedVersion) return
    const filename = `${sanitizeFilename(selectedItem.artifact.title)}.${getArtifactExtension(selectedItem.artifact)}`
    downloadFile(selectedVersion.content, filename, mimeForArtifact(selectedItem.artifact))
  }

  const updateArtifactInSourceSession = (
    sessionId: string,
    artifactId: string,
    updater: (artifact: ArtifactDocument) => ArtifactDocument | null
  ) => {
    const sourceSessions = storedSessions ?? sessions
    const sourceSession = sourceSessions.find((session) => session.id === sessionId)
    if (!sourceSession) return

    const nextArtifacts = (sourceSession.artifacts || [])
      .map((artifact) => (artifact.id === artifactId ? updater(artifact) : artifact))
      .filter((artifact): artifact is ArtifactDocument => Boolean(artifact))
    const nextSession: ChatSession = {
      ...sourceSession,
      artifacts: nextArtifacts,
      updatedAt: Date.now(),
    }

    setStoredSessions((prev) => {
      const base = prev ?? sessions
      return base.map((session) => (session.id === sessionId ? nextSession : session))
    })

    if (window.ipcRenderer) {
      void window.ipcRenderer.invoke('chat-store:save-session', nextSession)
      return
    }

    const isLoadedInContext = sessions.some((session) => session.id === sessionId && (session.artifacts || []).length > 0)
    if (!isLoadedInContext) return
    const currentArtifact = nextArtifacts.find((artifact) => artifact.id === artifactId)
    if (!currentArtifact) {
      deleteArtifact(sessionId, artifactId)
    }
  }

  const renameSelected = () => {
    if (!selectedItem) return
    const title = window.prompt('Rename artifact', selectedItem.artifact.title)
    if (!title) return
    if (window.ipcRenderer || storedSessions) {
      updateArtifactInSourceSession(selectedItem.sessionId, selectedItem.artifact.id, (artifact) =>
        renameArtifactDocument(artifact, title)
      )
      return
    }
    renameArtifact(selectedItem.sessionId, selectedItem.artifact.id, title)
  }

  const restoreSelectedVersion = (versionId: string) => {
    if (!selectedItem) return
    if (window.ipcRenderer || storedSessions) {
      updateArtifactInSourceSession(selectedItem.sessionId, selectedItem.artifact.id, (artifact) =>
        restoreArtifactVersion(artifact, versionId)
      )
      return
    }
    restoreArtifact(selectedItem.sessionId, selectedItem.artifact.id, versionId)
  }

  const deleteSelected = () => {
    if (!selectedItem) return
    if (window.ipcRenderer || storedSessions) {
      updateArtifactInSourceSession(selectedItem.sessionId, selectedItem.artifact.id, () => null)
    } else {
      deleteArtifact(selectedItem.sessionId, selectedItem.artifact.id)
    }
    setSelected(null)
  }

  const renderPreview = () => {
    if (!selectedItem || !selectedVersion) return null
    const { artifact } = selectedItem
    if (artifact.kind === 'markdown') return <LazyMarkdown content={selectedVersion.content} />
    if (artifact.kind === 'mermaid') return <MermaidDiagram code={selectedVersion.content} />
    if (artifact.kind === 'html') {
      return <iframe title={artifact.title} sandbox="" srcDoc={selectedVersion.content} />
    }
    if (artifact.kind === 'svg') {
      return <iframe title={artifact.title} sandbox="" srcDoc={selectedVersion.content} />
    }
    const language = artifact.kind === 'json' ? 'json' : artifact.language || artifact.kind
    return <pre><code>{language ? `// ${language}\n` : ''}{selectedVersion.content}</code></pre>
  }

  return (
    <section className="artifacts-view" aria-labelledby="artifacts-title">
      <div className={`artifacts-view__stage ${selectedItem ? 'artifacts-view__stage--drawer-open' : ''}`}>
        <main className="artifacts-view__panel">
          <header className="artifacts-view__panel-header">
            <div>
              <h2 id="artifacts-title">Artifacts</h2>
              <p>Assistant-created documents, code, diagrams, and previews from your chats.</p>
            </div>
          </header>

          <div className="artifacts-view__filters" role="tablist" aria-label="Artifact filters">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`artifacts-view__filter ${activeFilter === filter.id ? 'artifacts-view__filter--active' : ''}`}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label} {filter.count}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="artifacts-view__empty">
              <div>
                <FileText size={22} />
                <p>No artifacts yet. Ask the assistant to create a document, code file, SVG, or Mermaid diagram.</p>
              </div>
            </div>
          ) : (
            <div className="artifacts-view__rows">
              {filteredItems.map((item) => (
                <button
                  key={`${item.sessionId}:${item.artifact.id}`}
                  type="button"
                  className="artifacts-view__row"
                  onClick={() => setSelected({ sessionId: item.sessionId, artifactId: item.artifact.id })}
                >
                  <div>
                    <h4>{item.artifact.title}</h4>
                    <div className="artifacts-view__row-meta">
                      <span>{item.artifact.kind}</span>
                      {item.artifact.language && <span>{item.artifact.language}</span>}
                      <span>{item.artifact.versions.length} version{item.artifact.versions.length === 1 ? '' : 's'}</span>
                      <span>{item.sessionTitle}</span>
                    </div>
                  </div>
                  <span>{formatDate(item.artifact.updatedAt)}</span>
                </button>
              ))}
            </div>
          )}
        </main>

        {selectedItem && selectedVersion && (
          <aside className="artifacts-view__drawer" aria-label={`Artifact details for ${selectedItem.artifact.title}`}>
            <div className="artifacts-view__drawer-header">
              <div>
                <span>{selectedItem.artifact.kind}</span>
                <h3>{selectedItem.artifact.title}</h3>
                <div className="artifacts-view__drawer-meta">
                  <span>{selectedItem.sessionTitle}</span>
                  <span>Updated {formatDate(selectedItem.artifact.updatedAt)}</span>
                </div>
              </div>
              <button type="button" className="reminders-view__icon-button" onClick={() => setSelected(null)} aria-label="Close artifact details">
                <X size={15} />
              </button>
            </div>

            <div className="artifacts-view__drawer-actions">
              <Button size="sm" variant="secondary" onClick={() => void copySelected()}><Copy size={14} /> Copy</Button>
              <Button size="sm" variant="secondary" onClick={downloadSelected}><Download size={14} /> Download</Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  switchSession(selectedItem.sessionId)
                  setDashboardView('chat')
                }}
              >
                Open chat
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={renameSelected}
              >
                Rename
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={deleteSelected}
              >
                <Trash2 size={14} /> Delete
              </Button>
            </div>

            <div className="artifacts-view__preview">
              {renderPreview()}
            </div>

            <div className="artifacts-view__versions">
              {selectedItem.artifact.versions.slice().reverse().map((version) => (
                <div key={version.id} className="artifacts-view__version">
                  <span>{version.id === selectedItem.artifact.currentVersionId ? 'Current' : 'Version'} · {formatDate(version.createdAt)}</span>
                  {version.id !== selectedItem.artifact.currentVersionId && (
                    <Button size="sm" variant="ghost" onClick={() => restoreSelectedVersion(version.id)}>
                      Restore
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}
