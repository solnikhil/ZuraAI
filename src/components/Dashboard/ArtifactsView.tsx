import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileTerminal,
  FileText,
  LoaderCircle,
  MessageSquare,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { useAppShell } from '@/contexts/AppShellContext'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import { ARTIFACT_KINDS, type ArtifactDocument, type ArtifactKind } from '@/artifacts/artifactTypes'
import { getCurrentArtifactVersion } from '@/artifacts/artifactStore'
import { getExternalOpenLabel, openArtifactInExternalApp } from '@/artifacts/openArtifactExternally'
import type { ChatSessionMetadata } from '@/chat/types'
import ArtifactPreview from './artifacts/ArtifactPreview'
import {
  buildArtifactLibrary,
  filterAndSortArtifacts,
  type ArtifactFilter,
  type ArtifactLibraryEntry,
  type ArtifactSort,
} from './artifacts/artifactLibraryModel'
import './ArtifactsView.css'

type DetailTab = 'preview' | 'source' | 'history'

function formatArtifactKind(kind: ArtifactKind): string {
  if (kind === 'html' || kind === 'json' || kind === 'svg') return kind.toUpperCase()
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function formatRelativeDate(value: number): string {
  const date = new Date(value)
  const elapsed = Date.now() - value
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

function formatFullDate(value: number): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getArtifactIcon(kind: ArtifactKind, size = 16): React.ReactElement {
  const props = { size, strokeWidth: 1.8 }
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
    default:
      return <File {...props} />
  }
}

function artifactExcerpt(entry: ArtifactLibraryEntry): string {
  // Structured/markup kinds look noisy as raw source in the library list.
  if (
    entry.kind === 'html' ||
    entry.kind === 'svg' ||
    entry.kind === 'json' ||
    entry.kind === 'code'
  ) {
    return formatArtifactKind(entry.kind)
  }

  const content = entry.document ? getCurrentArtifactVersion(entry.document)?.content : ''
  if (!content) return formatArtifactKind(entry.kind)
  return content
    .replace(/[#_*`>~|{}[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96)
}

export default function ArtifactsView(): React.ReactElement {
  const {
    sessions,
    loadFullSession,
    switchSession,
    renameArtifact,
    restoreArtifact,
    deleteArtifact,
  } = useChatHistory()
  const { setDashboardView } = useAppShell()
  const [metadata, setMetadata] = useState<ChatSessionMetadata[]>([])
  const [metadataState, setMetadataState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [resolvedDocuments, setResolvedDocuments] = useState<Map<string, ArtifactDocument>>(
    new Map()
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileLibraryVisible, setMobileLibraryVisible] = useState(false)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<ArtifactFilter>('all')
  const [sort, setSort] = useState<ArtifactSort>('updated')
  const [detailTab, setDetailTab] = useState<DetailTab>('preview')
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null)
  const [openingKey, setOpeningKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

  const loadMetadata = useCallback(() => {
    if (!window.ipcRenderer) {
      setMetadataState('ready')
      return
    }
    setMetadataState('loading')
    void window.ipcRenderer
      .invoke('chat-store:get-metadata')
      .then((value: ChatSessionMetadata[]) => {
        setMetadata(value || [])
        setMetadataState('ready')
      })
      .catch(() => setMetadataState('error'))
  }, [])

  useEffect(() => {
    loadMetadata()
    if (!window.ipcRenderer) return
    return window.ipcRenderer.on('chat-store:changed', loadMetadata)
  }, [loadMetadata])

  const items = useMemo(
    () => buildArtifactLibrary(sessions, metadata, resolvedDocuments),
    [metadata, resolvedDocuments, sessions]
  )

  const filteredItems = useMemo(
    () => filterAndSortArtifacts(items, { filter: activeFilter, query, sort }),
    [activeFilter, items, query, sort]
  )

  const counts = useMemo(() => {
    const next = new Map<ArtifactKind, number>()
    for (const item of items) next.set(item.kind, (next.get(item.kind) ?? 0) + 1)
    return next
  }, [items])

  const selectedEntry = useMemo(
    () => items.find((entry) => entry.key === selectedKey) ?? null,
    [items, selectedKey]
  )
  const selectedDocument = selectedEntry?.document ?? null
  const viewedVersion = selectedDocument
    ? (selectedDocument.versions.find((version) => version.id === viewedVersionId) ??
      getCurrentArtifactVersion(selectedDocument))
    : null

  const resolveEntry = useCallback(
    async (entry: ArtifactLibraryEntry) => {
      if (entry.document) return entry.document
      setLoadingKey(entry.key)
      setLoadErrorKey(null)
      try {
        const session = await loadFullSession(entry.sessionId)
        const document = session?.artifacts?.find((artifact) => artifact.id === entry.id) ?? null
        if (!document) throw new Error('Artifact content is unavailable.')
        setResolvedDocuments((current) => new Map(current).set(entry.key, document))
        return document
      } catch (error) {
        setLoadErrorKey(entry.key)
        toast.error(error instanceof Error ? error.message : 'Could not load this artifact.')
        return null
      } finally {
        setLoadingKey((current) => (current === entry.key ? null : current))
      }
    },
    [loadFullSession]
  )

  const selectEntry = useCallback(
    (entry: ArtifactLibraryEntry) => {
      setSelectedKey(entry.key)
      setMobileLibraryVisible(false)
      setDetailTab('preview')
      setRenaming(false)
      void resolveEntry(entry)
    },
    [resolveEntry]
  )

  useEffect(() => {
    if (filteredItems.length === 0) {
      if (selectedKey && !items.some((entry) => entry.key === selectedKey)) setSelectedKey(null)
      return
    }
    if (!selectedKey || !filteredItems.some((entry) => entry.key === selectedKey)) {
      const firstEntry = filteredItems[0]
      setSelectedKey(firstEntry.key)
      setDetailTab('preview')
      setRenaming(false)
      void resolveEntry(firstEntry)
    }
  }, [filteredItems, items, resolveEntry, selectedKey])

  useEffect(() => {
    if (!selectedDocument) return
    setViewedVersionId(selectedDocument.currentVersionId)
    setTitleDraft(selectedDocument.title)
  }, [selectedDocument?.id, selectedDocument?.currentVersionId, selectedDocument?.title])

  const handleCopy = async () => {
    if (!viewedVersion) return
    try {
      await navigator.clipboard.writeText(viewedVersion.content)
      setCopied(true)
      toast.success('Artifact copied')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('Could not copy the artifact.')
    }
  }

  const handleOpenExternal = async () => {
    if (!selectedEntry) return
    setOpeningKey(selectedEntry.key)
    try {
      const result = await openArtifactInExternalApp(
        selectedEntry.sessionId,
        selectedEntry.id,
        sessions
      )
      if (!result.ok) toast.error(result.error || 'Could not open the artifact.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the artifact.')
    } finally {
      setOpeningKey(null)
    }
  }

  const handleRename = () => {
    if (!selectedEntry || !titleDraft.trim()) return
    renameArtifact(selectedEntry.sessionId, selectedEntry.id, titleDraft)
    if (selectedDocument) {
      setResolvedDocuments((current) =>
        new Map(current).set(selectedEntry.key, {
          ...selectedDocument,
          title: titleDraft.trim(),
          updatedAt: Date.now(),
        })
      )
    }
    setRenaming(false)
    toast.success('Artifact renamed')
  }

  const handleRestore = (versionId: string) => {
    if (!selectedEntry || !selectedDocument) return
    restoreArtifact(selectedEntry.sessionId, selectedEntry.id, versionId)
    setResolvedDocuments((current) =>
      new Map(current).set(selectedEntry.key, {
        ...selectedDocument,
        currentVersionId: versionId,
        updatedAt: Date.now(),
      })
    )
    setViewedVersionId(versionId)
    toast.success('Version restored')
  }

  const handleDelete = () => {
    if (!selectedEntry) return
    deleteArtifact(selectedEntry.sessionId, selectedEntry.id)
    setResolvedDocuments((current) => {
      const next = new Map(current)
      next.delete(selectedEntry.key)
      return next
    })
    setSelectedKey(null)
    setDeleteOpen(false)
    toast.success('Artifact deleted')
  }

  const openSourceChat = () => {
    if (!selectedEntry) return
    switchSession(selectedEntry.sessionId)
    setDashboardView('chat')
  }

  const isInitialLoading = metadataState === 'loading' && items.length === 0
  const hasSearchOrFilter = Boolean(query.trim()) || activeFilter !== 'all'

  return (
    <section
      className={`artifacts-view ${selectedEntry && !mobileLibraryVisible ? 'artifacts-view--detail-open' : ''}`}
      aria-labelledby="artifacts-title"
    >
      <header className="artifacts-view__page-header">
        <div>
          <div className="artifacts-view__eyebrow">Workspace</div>
          <h2 id="artifacts-title">Artifacts</h2>
          <p>Preview, revisit, and reuse everything Zura has made with you.</p>
        </div>
        <div className="artifacts-view__total">
          <strong>{items.length}</strong>
          <span>saved</span>
        </div>
      </header>

      <div className="artifacts-view__workspace">
        <aside className="artifacts-view__library" aria-label="Artifact library">
          <div className="artifacts-view__library-tools">
            <label className="artifacts-view__search">
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search artifacts or chats"
                aria-label="Search artifacts"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
            <select
              className="artifacts-view__sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as ArtifactSort)}
              aria-label="Sort artifacts"
            >
              <option value="updated">Recently updated</option>
              <option value="name">Name</option>
              <option value="type">Type</option>
            </select>
          </div>

          <div className="artifacts-view__filters" aria-label="Filter artifacts">
            <button
              type="button"
              data-active={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
            >
              All <span>{items.length}</span>
            </button>
            {ARTIFACT_KINDS.filter((kind) => (counts.get(kind) ?? 0) > 0).map((kind) => (
              <button
                key={kind}
                type="button"
                data-active={activeFilter === kind}
                onClick={() => setActiveFilter(kind)}
              >
                {formatArtifactKind(kind)} <span>{counts.get(kind)}</span>
              </button>
            ))}
          </div>

          <div
            className="artifacts-view__library-list"
            aria-live="polite"
            aria-busy={isInitialLoading}
          >
            {isInitialLoading ? (
              <div className="artifacts-view__state">
                <LoaderCircle className="artifacts-view__spinner" size={19} />
                <strong>Gathering your artifacts</strong>
                <span>Looking across saved chats…</span>
              </div>
            ) : metadataState === 'error' && items.length === 0 ? (
              <div className="artifacts-view__state">
                <FileText size={19} />
                <strong>Couldn’t load the library</strong>
                <span>Your artifacts are still safe in their chats.</span>
                <Button variant="outline" size="sm" onClick={loadMetadata}>
                  Try again
                </Button>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="artifacts-view__state">
                <Search size={19} />
                <strong>{hasSearchOrFilter ? 'Nothing matches' : 'No artifacts yet'}</strong>
                <span>
                  {hasSearchOrFilter
                    ? 'Try a different search or file type.'
                    : 'Ask Zura to create a plan, code file, diagram, or prototype.'}
                </span>
                {hasSearchOrFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setActiveFilter('all')
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              filteredItems.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="artifacts-view__library-item"
                  data-kind={entry.kind}
                  data-selected={selectedKey === entry.key}
                  onClick={() => selectEntry(entry)}
                  aria-pressed={selectedKey === entry.key}
                >
                  <span className="artifacts-view__item-icon">
                    {getArtifactIcon(entry.kind, 17)}
                  </span>
                  <span className="artifacts-view__item-copy">
                    <strong>{entry.title}</strong>
                    <span className="artifacts-view__item-meta">
                      <span className="artifacts-view__item-kind">
                        {formatArtifactKind(entry.kind)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="artifacts-view__item-session">{entry.sessionTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeDate(entry.updatedAt)}</span>
                    </span>
                    {entry.kind === 'markdown' || entry.kind === 'text' ? (
                      <span className="artifacts-view__item-excerpt">{artifactExcerpt(entry)}</span>
                    ) : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="artifacts-view__detail" aria-label="Artifact detail">
          {!selectedEntry ? (
            <div className="artifacts-view__detail-empty">
              <div className="artifacts-view__detail-mark">
                <FileText size={25} />
              </div>
              <strong>Select an artifact</strong>
              <span>Its preview, source, and version history will appear here.</span>
            </div>
          ) : (
            <>
              <header className="artifacts-view__detail-header">
                <button
                  type="button"
                  className="artifacts-view__mobile-back"
                  onClick={() => setMobileLibraryVisible(true)}
                >
                  <ArrowLeft size={16} /> Library
                </button>
                <div className="artifacts-view__title-row">
                  <span className="artifacts-view__detail-icon" data-kind={selectedEntry.kind}>
                    {getArtifactIcon(selectedEntry.kind, 20)}
                  </span>
                  <div className="artifacts-view__detail-title">
                    {renaming ? (
                      <div className="artifacts-view__rename">
                        <input
                          autoFocus
                          value={titleDraft}
                          onChange={(event) => setTitleDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleRename()
                            if (event.key === 'Escape') setRenaming(false)
                          }}
                          aria-label="Artifact title"
                        />
                        <Button size="icon-sm" onClick={handleRename} aria-label="Save title">
                          <Check size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setRenaming(false)}
                          aria-label="Cancel rename"
                        >
                          <X size={15} />
                        </Button>
                      </div>
                    ) : (
                      <div className="artifacts-view__title-display">
                        <h3>{selectedEntry.title}</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setTitleDraft(selectedEntry.title)
                            setRenaming(true)
                          }}
                          aria-label="Rename artifact"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="artifacts-view__source-chat"
                      onClick={openSourceChat}
                    >
                      <MessageSquare size={12} /> {selectedEntry.sessionTitle}
                    </button>
                  </div>
                </div>
                <div className="artifacts-view__actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopy()}
                    disabled={!viewedVersion}
                  >
                    {copied ? <Check /> : <Copy />}
                    <span>Copy</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleOpenExternal()}
                    disabled={openingKey === selectedEntry.key}
                  >
                    {openingKey === selectedEntry.key ? (
                      <LoaderCircle className="artifacts-view__spinner" />
                    ) : (
                      <ExternalLink />
                    )}
                    <span>
                      {getExternalOpenLabel(selectedEntry.kind).replace(
                        'Open in default ',
                        'Open in '
                      )}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteOpen(true)}
                    aria-label="Delete artifact"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="artifacts-view__facts">
                  <span>{formatArtifactKind(selectedEntry.kind)}</span>
                  {selectedEntry.language && <span>{selectedEntry.language}</span>}
                  <span>
                    {selectedEntry.versionCount} version
                    {selectedEntry.versionCount === 1 ? '' : 's'}
                  </span>
                  <span>Updated {formatRelativeDate(selectedEntry.updatedAt)}</span>
                </div>
              </header>

              <div
                className="artifacts-view__detail-tabs"
                role="tablist"
                aria-label="Artifact views"
              >
                {(['preview', 'source', 'history'] as DetailTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === tab}
                    onClick={() => setDetailTab(tab)}
                  >
                    {tab === 'history'
                      ? `History ${selectedEntry.versionCount}`
                      : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div
                className="artifacts-view__canvas"
                data-kind={selectedEntry.kind}
                aria-busy={loadingKey === selectedEntry.key}
              >
                {loadingKey === selectedEntry.key ? (
                  <div className="artifacts-view__detail-state">
                    <LoaderCircle className="artifacts-view__spinner" size={22} />
                    <strong>Loading artifact</strong>
                    <span>Fetching the full version from its chat…</span>
                  </div>
                ) : loadErrorKey === selectedEntry.key ? (
                  <div className="artifacts-view__detail-state">
                    <FileText size={22} />
                    <strong>Preview unavailable</strong>
                    <span>The artifact summary loaded, but its content did not.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void resolveEntry(selectedEntry)}
                    >
                      Try again
                    </Button>
                  </div>
                ) : !selectedDocument || !viewedVersion ? (
                  <div className="artifacts-view__detail-state">
                    <FileText size={22} />
                    <strong>No content to preview</strong>
                  </div>
                ) : detailTab === 'history' ? (
                  <div className="artifacts-view__history">
                    <div className="artifacts-view__history-intro">
                      <Clock3 size={17} />
                      <div>
                        <strong>Version history</strong>
                        <span>Inspect an earlier version or make it current again.</span>
                      </div>
                    </div>
                    {selectedDocument.versions
                      .slice()
                      .reverse()
                      .map((version, reverseIndex) => {
                        const isCurrent = version.id === selectedDocument.currentVersionId
                        const number = selectedDocument.versions.length - reverseIndex
                        return (
                          <div
                            className="artifacts-view__version"
                            key={version.id}
                            data-current={isCurrent}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setViewedVersionId(version.id)
                                setDetailTab('preview')
                              }}
                            >
                              <span className="artifacts-view__version-number">v{number}</span>
                              <span className="artifacts-view__version-copy">
                                <strong>
                                  {version.changeSummary ||
                                    (number === 1 ? 'Initial version' : 'Artifact updated')}
                                </strong>
                                <span>{formatFullDate(version.createdAt)}</span>
                              </span>
                              {isCurrent && (
                                <span className="artifacts-view__current-badge">Current</span>
                              )}
                            </button>
                            {!isCurrent && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestore(version.id)}
                              >
                                <RotateCcw size={13} /> Restore
                              </Button>
                            )}
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <ArtifactPreview
                    kind={selectedDocument.kind}
                    language={selectedDocument.language}
                    content={viewedVersion.content}
                    mode={detailTab}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this artifact?</AlertDialogTitle>
            <AlertDialogDescription>
              “{selectedEntry?.title}” and all of its versions will be removed from the source chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
