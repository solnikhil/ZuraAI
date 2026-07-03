import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileTerminal,
  FileText,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipIconButton } from '@/components/ui/TooltipIconButton'
import { motionSpring } from '@/lib/motion'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { getExternalOpenLabel, openArtifactInExternalApp } from '@/artifacts/openArtifactExternally'
import type { ArtifactDocument, ArtifactKind, ArtifactSummary } from '@/artifacts/artifactTypes'
import type { ChatSessionMetadata } from '@/chat/types'
import './ArtifactsView.css'

type ArtifactFilter = 'all' | ArtifactKind

interface ArtifactListItem {
  sessionId: string
  sessionTitle: string
  artifact: ArtifactDocument
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

export default function ArtifactsView(): React.ReactElement {
  const { sessions } = useChatHistory()
  const [sessionMetadata, setSessionMetadata] = useState<ChatSessionMetadata[]>([])
  const [activeFilter, setActiveFilter] = useState<ArtifactFilter>('all')
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
        // Real content resolves on demand when the artifact is opened externally.
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

  const openExternally = async (item: ArtifactListItem) => {
    const key = `${item.sessionId}:${item.artifact.id}`
    setOpeningArtifactKey(key)
    try {
      await openArtifactInExternalApp(item.sessionId, item.artifact.id, sessions)
    } finally {
      setOpeningArtifactKey((current) => (current === key ? null : current))
    }
  }

  return (
    <section className="artifacts-view" aria-labelledby="artifacts-title">
      <div className="artifacts-view__stage">
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
                    className="artifacts-view__row-card"
                  >
                    <button
                      type="button"
                      className="artifacts-view__row"
                      aria-label={`${externalOpenLabel}: ${item.artifact.title}`}
                      disabled={isOpening}
                      onClick={() => void openExternally(item)}
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
      </div>
    </section>
  )
}
