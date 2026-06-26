import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  Copy,
  Download,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileTerminal,
  FileText,
  Trash2,
  X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import LazyMarkdown from '../LazyMarkdown'
import MermaidDiagram from '../MermaidDiagram'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipIconButton } from '@/components/ui/TooltipIconButton'
import { motionSpring } from '@/lib/motion'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { useAppShell } from '@/contexts/AppShellContext'
import {
  getArtifactExtension,
  getCurrentArtifactVersion,
  renameArtifactDocument,
  restoreArtifactVersion,
} from '@/artifacts/artifactStore'
import { getExternalOpenLabel, openArtifactInExternalApp } from '@/artifacts/openArtifactExternally'
import type { ArtifactDocument, ArtifactKind, ArtifactSummary } from '@/artifacts/artifactTypes'
import type { ChatSession, ChatSessionMetadata } from '@/chat/types'
import { downloadFile } from '@/utils/chatExport'
import './ArtifactsView.css'

type ArtifactFilter = 'all' | ArtifactKind

interface ArtifactListItem {
  sessionId: string
  sessionTitle: string
  artifact: ArtifactDocument
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString()
}

function formatArtifactKind(kind: ArtifactKind): string {
  if (kind === 'html') return 'HTML'
  if (kind === 'json') return 'JSON'
  if (kind === 'svg') return 'SVG'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function formatRelativeDate(value: number): string {
  const date = new Date(value)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const isThisYear = date.getFullYear() === now.getFullYear()
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  if (isToday) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`
  if (isThisYear) {
    const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${monthDay}, ${time}`
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getArtifactIcon(kind: ArtifactKind): React.ReactElement {
  const props = { size: 16, strokeWidth: 1.9 }
  switch (kind) {
    case 'html':
      return <FileCode2 {...props} />
    case 'svg':
      return <FileImage {...props} />
    case 'markdown':
      return <FileText {...props} />
    case 'json':
      return <FileJson {...props} />
    case 'code':
      return <FileTerminal {...props} />
    case 'mermaid':
      return <FileText {...props} />
    case 'text':
    default:
      return <File {...props} />
  }
}

function mimeForArtifact(artifact: ArtifactDocument): string {
  if (artifact.kind === 'html') return 'text/html'
  if (artifact.kind === 'json') return 'application/json'
  if (artifact.kind === 'svg') return 'image/svg+xml'
  if (artifact.kind === 'markdown') return 'text/markdown'
  return 'text/plain'
}

function sanitizeFilename(value: string): string {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'artifact'
  )
}

export default function ArtifactsView(): React.ReactElement {
  const { sessions, switchSession, renameArtifact, restoreArtifact, deleteArtifact } =
    useChatHistory()
  const { setDashboardView } = useAppShell()
  const [sessionMetadata, setSessionMetadata] = useState<ChatSessionMetadata[]>([])
  const [activeFilter, setActiveFilter] = useState<ArtifactFilter>('all')
  const [selected, setSelected] = useState<{ sessionId: string; artifactId: string } | null>(null)
  const [loadedFullArtifact, setLoadedFullArtifact] = useState<ArtifactDocument | null>(null)
  const [openingArtifactKey, setOpeningArtifactKey] = useState<string | null>(null)

  // Load lightweight metadata (with artifactSummaries) + listen for changes so we see artifacts
  // from other chats + react to saves (including our own debounced ones).
  useEffect(() => {
    if (!window.ipcRenderer) return
    let cancelled = false

    const loadMetadata = () => {
      void window
        .ipcRenderer!.invoke('chat-store:get-metadata')
        .then((meta: ChatSessionMetadata[]) => {
          if (!cancelled) setSessionMetadata(meta || [])
        })
        .catch(() => {
          if (!cancelled) setSessionMetadata([])
        })
    }

    loadMetadata()

    const handleChanged = () => {
      loadMetadata()
    }

    window.ipcRenderer.on('chat-store:changed', handleChanged)

    return () => {
      cancelled = true
      window.ipcRenderer?.off('chat-store:changed', handleChanged)
    }
  }, [sessions])

  // When selection changes, try to resolve a *full* ArtifactDocument (with real versions + content)
  // 1. Prefer live data from ChatHistoryContext (instant after artifact_create)
  // 2. Fall back to fetching the specific session from disk
  useEffect(() => {
    if (!selected) {
      setLoadedFullArtifact(null)
      return
    }

    // Prefer live full document (current chat or recently loaded sessions have the real thing)
    const liveSession = sessions.find((s) => s.id === selected.sessionId)
    const liveArtifact = liveSession?.artifacts?.find((a) => a.id === selected.artifactId)
    if (liveArtifact) {
      setLoadedFullArtifact(liveArtifact)
      return
    }

    // Otherwise load the specific session (only when user actually opens an artifact)
    if (window.ipcRenderer) {
      void window.ipcRenderer
        .invoke('chat-store:get-session', selected.sessionId)
        .then((fullSession: ChatSession | null) => {
          if (!fullSession) {
            setLoadedFullArtifact(null)
            return
          }
          const found =
            (fullSession.artifacts || []).find((a) => a.id === selected.artifactId) || null
          setLoadedFullArtifact(found)
        })
        .catch(() => setLoadedFullArtifact(null))
    } else {
      setLoadedFullArtifact(null)
    }
  }, [selected, sessions])

  // Build display list:
  // - Use FULL documents from live sessions in context (these are immediately up-to-date after create/update)
  // - Supplement with lightweight ArtifactSummary entries from metadata for other chats
  // - Prefer live full docs over stale metadata summaries
  const items = useMemo<ArtifactListItem[]>(() => {
    const liveById = new Map(sessions.map((s) => [s.id, s] as const))

    // Full documents from whatever the context currently holds (current chat + any loaded ones)
    // Also turn carried artifactSummaries (for lightweight sessions) into stubs so old ones show
    const liveItems: ArtifactListItem[] = sessions.flatMap((session) => {
      if (session.artifacts && session.artifacts.length > 0) {
        return session.artifacts.map((artifact) => ({
          sessionId: session.id,
          sessionTitle: session.title,
          artifact,
        }))
      }
      // lightweight carried summaries
      const sums = session.artifactSummaries
      if (sums && sums.length) {
        return sums.map((summary) => {
          const stubVersions = Array.from(
            { length: Math.max(1, summary.versionCount) },
            (_, i) => ({
              id: i === 0 ? summary.currentVersionId : `v${i}`,
              content: '',
              createdAt: summary.updatedAt,
            })
          )
          const stub: ArtifactDocument = {
            id: summary.id,
            title: summary.title,
            kind: summary.kind,
            language: summary.language,
            createdAt: summary.updatedAt,
            updatedAt: summary.updatedAt,
            currentVersionId: summary.currentVersionId,
            versions: stubVersions,
          }
          return { sessionId: session.id, sessionTitle: session.title, artifact: stub }
        })
      }
      return []
    })

    // Lightweight entries from the persisted index (for chats we haven't loaded fully)
    const metaItems: ArtifactListItem[] = sessionMetadata.flatMap((meta) => {
      const live = liveById.get(meta.id)
      // If this session is already represented in live (full artifacts or carried summaries), skip
      const liveHasArtifacts =
        live && ((live.artifacts?.length ?? 0) > 0 || (live.artifactSummaries?.length ?? 0) > 0)
      if (liveHasArtifacts) return []

      const summaries: ArtifactSummary[] = meta.artifactSummaries || []
      return summaries.map((summary) => {
        // Synthesize a minimal ArtifactDocument shape sufficient for list rendering.
        // Real content + accurate version list will come from loadedFullArtifact when selected.
        const stubVersions = Array.from({ length: Math.max(1, summary.versionCount) }, (_, i) => ({
          id: i === 0 ? summary.currentVersionId : `v${i}`,
          content: '',
          createdAt: summary.updatedAt,
        }))

        const stub: ArtifactDocument = {
          id: summary.id,
          title: summary.title,
          kind: summary.kind,
          language: summary.language,
          createdAt: summary.updatedAt,
          updatedAt: summary.updatedAt,
          currentVersionId: summary.currentVersionId,
          versions: stubVersions,
        }

        return {
          sessionId: meta.id,
          sessionTitle: meta.title,
          artifact: stub,
        }
      })
    })

    const combined = [...liveItems, ...metaItems]

    // Dedupe (sessionId + artifactId), live wins because it comes first
    const seen = new Set<string>()
    const deduped = combined.filter((item) => {
      const key = `${item.sessionId}:${item.artifact.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return deduped.sort((a, b) => b.artifact.updatedAt - a.artifact.updatedAt)
  }, [sessions, sessionMetadata])

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items
    return items.filter((item) => item.artifact.kind === activeFilter)
  }, [activeFilter, items])

  // selectedItem is used for list row identification + basic title/kind in header.
  // For actual content + real version history we prefer the freshly loaded full artifact.
  const selectedItem = selected
    ? (items.find(
        (item) => item.sessionId === selected.sessionId && item.artifact.id === selected.artifactId
      ) ?? null)
    : null

  const effectiveArtifact = loadedFullArtifact || selectedItem?.artifact || null
  const selectedVersion = effectiveArtifact ? getCurrentArtifactVersion(effectiveArtifact) : null

  const filters: Array<{ id: ArtifactFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: items.length },
    {
      id: 'markdown',
      label: 'Markdown',
      count: items.filter((item) => item.artifact.kind === 'markdown').length,
    },
    {
      id: 'code',
      label: 'Code',
      count: items.filter((item) => item.artifact.kind === 'code').length,
    },
    {
      id: 'html',
      label: 'HTML',
      count: items.filter((item) => item.artifact.kind === 'html').length,
    },
    {
      id: 'json',
      label: 'JSON',
      count: items.filter((item) => item.artifact.kind === 'json').length,
    },
    {
      id: 'mermaid',
      label: 'Mermaid',
      count: items.filter((item) => item.artifact.kind === 'mermaid').length,
    },
    { id: 'svg', label: 'SVG', count: items.filter((item) => item.artifact.kind === 'svg').length },
    {
      id: 'text',
      label: 'Text',
      count: items.filter((item) => item.artifact.kind === 'text').length,
    },
  ]

  const copySelected = async () => {
    if (!selectedVersion) return
    await navigator.clipboard?.writeText(selectedVersion.content)
  }

  const downloadSelected = () => {
    const art = effectiveArtifact || selectedItem?.artifact
    if (!art || !selectedVersion) return
    const filename = `${sanitizeFilename(art.title)}.${getArtifactExtension(art)}`
    downloadFile(selectedVersion.content, filename, mimeForArtifact(art))
  }

  const openExternally = async (item: ArtifactListItem) => {
    const key = `${item.sessionId}:${item.artifact.id}`
    setOpeningArtifactKey(key)
    try {
      await openArtifactInExternalApp(item.sessionId, item.artifact.id, sessions)
    } finally {
      setOpeningArtifactKey((current) => (current === key ? null : current))
    }
  }

  // Helper for mutations on artifacts that may live only in metadata summaries.
  // Strategy:
  // - If we have a full live artifact in context, prefer the proper context action (it will update state + schedule saves).
  // - Otherwise load the session, apply the change locally, and save directly (for historical artifacts).
  const updateArtifactInSourceSession = (
    sessionId: string,
    artifactId: string,
    updater: (artifact: ArtifactDocument) => ArtifactDocument | null
  ) => {
    // Fast path: live session already has the full artifact → use context actions
    const live = sessions.find((s) => s.id === sessionId)
    const liveArt = live?.artifacts?.find((a) => a.id === artifactId)
    if (live && liveArt) {
      // The context methods already do the right thing (normalize, persist, index update)
      // We just call the matching high-level action from the caller.
      return
    }

    // Slow path: fetch the real session from disk, mutate, persist
    if (!window.ipcRenderer) return

    void (async () => {
      try {
        const full: ChatSession | null = await window.ipcRenderer.invoke(
          'chat-store:get-session',
          sessionId
        )
        if (!full) return

        const currentArts = full.artifacts || []
        const nextArts = currentArts
          .map((artifact) => (artifact.id === artifactId ? updater(artifact) : artifact))
          .filter((a): a is ArtifactDocument => Boolean(a))

        const nextSession: ChatSession = {
          ...full,
          artifacts: nextArts,
          updatedAt: Date.now(),
        }

        await window.ipcRenderer.invoke('chat-store:save-session', nextSession)

        // Refresh metadata for the gallery list
        const freshMeta: ChatSessionMetadata[] =
          await window.ipcRenderer.invoke('chat-store:get-metadata')
        setSessionMetadata(freshMeta || [])

        // If this artifact is currently selected in the drawer, re-load the fresh full document
        if (selected && selected.sessionId === sessionId && selected.artifactId === artifactId) {
          const refreshed: ChatSession | null = await window.ipcRenderer.invoke(
            'chat-store:get-session',
            sessionId
          )
          const freshArt = refreshed?.artifacts?.find((a) => a.id === artifactId) || null
          setLoadedFullArtifact(freshArt)
        }
      } catch (e) {
        console.error('Failed to update artifact via direct session save', e)
      }
    })()
  }

  const renameSelected = () => {
    if (!selectedItem) return
    const title = window.prompt('Rename artifact', selectedItem.artifact.title)
    if (!title) return

    const liveSession = sessions.find((s) => s.id === selectedItem.sessionId)
    const liveArt = liveSession?.artifacts?.find((a) => a.id === selectedItem.artifact.id)

    if (liveArt) {
      // Live full document exists → go through context (handles state + persistence)
      renameArtifact(selectedItem.sessionId, selectedItem.artifact.id, title)
    } else {
      updateArtifactInSourceSession(selectedItem.sessionId, selectedItem.artifact.id, (artifact) =>
        renameArtifactDocument(artifact, title)
      )
    }
  }

  const restoreSelectedVersion = (versionId: string) => {
    if (!selectedItem) return

    const liveSession = sessions.find((s) => s.id === selectedItem.sessionId)
    const liveArt = liveSession?.artifacts?.find((a) => a.id === selectedItem.artifact.id)

    if (liveArt) {
      restoreArtifact(selectedItem.sessionId, selectedItem.artifact.id, versionId)
    } else {
      updateArtifactInSourceSession(selectedItem.sessionId, selectedItem.artifact.id, (artifact) =>
        restoreArtifactVersion(artifact, versionId)
      )
    }
  }

  const deleteSelected = () => {
    if (!selectedItem) return

    const liveSession = sessions.find((s) => s.id === selectedItem.sessionId)
    const liveArt = liveSession?.artifacts?.find((a) => a.id === selectedItem.artifact.id)

    if (liveArt) {
      deleteArtifact(selectedItem.sessionId, selectedItem.artifact.id)
    } else {
      updateArtifactInSourceSession(selectedItem.sessionId, selectedItem.artifact.id, () => null)
    }
    setSelected(null)
    setLoadedFullArtifact(null)
  }

  const renderPreview = () => {
    if (!effectiveArtifact || !selectedVersion) return null
    const artifact = effectiveArtifact
    if (artifact.kind === 'markdown') return <LazyMarkdown content={selectedVersion.content} />
    if (artifact.kind === 'mermaid') return <MermaidDiagram code={selectedVersion.content} />
    if (artifact.kind === 'html') {
      return <iframe title={artifact.title} sandbox="" srcDoc={selectedVersion.content} />
    }
    if (artifact.kind === 'svg') {
      return <iframe title={artifact.title} sandbox="" srcDoc={selectedVersion.content} />
    }
    const language = artifact.kind === 'json' ? 'json' : artifact.language || artifact.kind
    return (
      <pre>
        <code>
          {language ? `// ${language}\n` : ''}
          {selectedVersion.content}
        </code>
      </pre>
    )
  }

  return (
    <section className="artifacts-view" aria-labelledby="artifacts-title">
      <div
        className={`artifacts-view__stage ${selectedItem ? 'artifacts-view__stage--drawer-open' : ''}`}
      >
        <main className="artifacts-view__panel">
          <header className="artifacts-view__panel-header">
            <div>
              <h2 id="artifacts-title">Artifacts</h2>
              <p>Assistant-created documents, code, diagrams, and previews from your chats.</p>
            </div>
          </header>

          <Tabs
            value={activeFilter}
            onValueChange={(value) => setActiveFilter(value as ArtifactFilter)}
            className="artifacts-view__tabs"
          >
            <TabsList variant="line" className="artifacts-view__tabs-list">
              {filters.map((filter) => (
                <TabsTrigger
                  key={filter.id}
                  value={filter.id}
                  className="artifacts-view__tabs-trigger"
                >
                  <span>{filter.label}</span>
                  <span className="artifacts-view__tabs-count">{filter.count}</span>
                  {activeFilter === filter.id && (
                    <motion.div
                      layoutId="artifacts-active-tab-indicator"
                      className="artifacts-view__tabs-indicator"
                      initial={false}
                      transition={motionSpring.bouncy}
                    />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {filteredItems.length === 0 ? (
            <div className="artifacts-view__empty-state">
              <FileText size={18} />
              <strong>No artifacts yet</strong>
              <span>
                Ask the assistant to create a document, code file, SVG, or Mermaid diagram.
              </span>
            </div>
          ) : (
            <div className="artifacts-view__rows">
              {filteredItems.map((item, index) => {
                const itemKey = `${item.sessionId}:${item.artifact.id}`
                const isOpening = openingArtifactKey === itemKey
                const externalOpenLabel = getExternalOpenLabel(item.artifact.kind)

                return (
                  <div
                    key={itemKey}
                    data-kind={item.artifact.kind}
                    className={`artifacts-view__row-card ${selectedItem?.sessionId === item.sessionId && selectedItem.artifact.id === item.artifact.id ? 'artifacts-view__row-card--active' : ''}`}
                  >
                    <button
                      type="button"
                      className="artifacts-view__row"
                      aria-label={`Preview ${item.artifact.title}`}
                      onClick={() =>
                        setSelected({ sessionId: item.sessionId, artifactId: item.artifact.id })
                      }
                    >
                      <div className="artifacts-view__row-main">
                        <div className="artifacts-view__row-header">
                          <span className="artifacts-view__type-icon" aria-hidden="true">
                            {getArtifactIcon(item.artifact.kind)}
                          </span>
                          <h4>{item.artifact.title}</h4>
                          <span className="artifacts-view__row-index" aria-hidden="true">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <div className="artifacts-view__row-body">
                          <div className="artifacts-view__badge-row">
                            <span className="artifacts-view__type-badge">
                              {formatArtifactKind(item.artifact.kind)}
                            </span>
                            {item.artifact.language && (
                              <span className="artifacts-view__status-badge">
                                {item.artifact.language}
                              </span>
                            )}
                            <span className="artifacts-view__version-badge">
                              {item.artifact.versions.length} version
                              {item.artifact.versions.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="artifacts-view__row-meta">
                            <span>Updated {formatRelativeDate(item.artifact.updatedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                    <TooltipIconButton
                      tooltip={externalOpenLabel}
                      className={`artifacts-view__open-chevron ${isOpening ? 'artifacts-view__open-chevron--opening' : ''}`}
                      aria-label={`${externalOpenLabel}: ${item.artifact.title}`}
                      disabled={isOpening}
                      onClick={(event) => {
                        event.stopPropagation()
                        void openExternally(item)
                      }}
                    >
                      <ChevronRight size={18} strokeWidth={1.8} />
                    </TooltipIconButton>
                  </div>
                )
              })}
            </div>
          )}
        </main>

        {selectedItem && effectiveArtifact && selectedVersion && (
          <>
            <div className="artifacts-view__drawer-divider" aria-hidden="true" />
            <aside
              className="artifacts-view__drawer"
              aria-label={`Artifact details for ${effectiveArtifact.title}`}
            >
              <div className="artifacts-view__drawer-header">
                <div>
                  <span>{formatArtifactKind(effectiveArtifact.kind)}</span>
                  <h3>{effectiveArtifact.title}</h3>
                  <div className="artifacts-view__drawer-meta">
                    <span>{selectedItem.sessionTitle}</span>
                    <span>Updated {formatDate(effectiveArtifact.updatedAt)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="artifacts-view__icon-button"
                  onClick={() => setSelected(null)}
                  aria-label="Close artifact details"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="artifacts-view__drawer-actions">
                <Button size="sm" variant="secondary" onClick={() => void copySelected()}>
                  <Copy size={14} /> Copy
                </Button>
                <Button size="sm" variant="secondary" onClick={downloadSelected}>
                  <Download size={14} /> Download
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    openingArtifactKey === `${selectedItem.sessionId}:${selectedItem.artifact.id}`
                  }
                  onClick={() => void openExternally(selectedItem)}
                >
                  <ChevronRight size={14} /> Open externally
                </Button>
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
                <Button size="sm" variant="secondary" onClick={renameSelected}>
                  Rename
                </Button>
                <Button size="sm" variant="destructive" onClick={deleteSelected}>
                  <Trash2 size={14} /> Delete
                </Button>
              </div>

              <div className="artifacts-view__preview">{renderPreview()}</div>

              <div className="artifacts-view__versions">
                {effectiveArtifact.versions
                  .slice()
                  .reverse()
                  .map((version) => (
                    <div key={version.id} className="artifacts-view__version">
                      <span>
                        {version.id === effectiveArtifact.currentVersionId ? 'Current' : 'Version'}{' '}
                        / {formatDate(version.createdAt)}
                      </span>
                      {version.id !== effectiveArtifact.currentVersionId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => restoreSelectedVersion(version.id)}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </aside>
          </>
        )}
      </div>
    </section>
  )
}
