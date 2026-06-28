import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  Clock,
  Database,
  FolderOpen,
  Link2,
  Search,
  Settings as SettingsIcon,
  Trash2,
  Zap,
} from 'lucide-react'

import { ProviderLogo } from '@/components/shared'
import { Card } from '@/components/ui/card'
import { TooltipIconButton } from '@/components/ui/TooltipIconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import type { ConversationSummary, Memory, MemoryCategory } from '@/electron/types'
import { useAppShell } from '@/contexts/AppShellContext'
import { useChatHistory } from '@/contexts/ChatHistoryContext'
import type { Settings } from '@/contexts/SettingsContext'
import { getAvailableTitleModelOptions, getProviderDefinition } from '@/providers'
import { isMemoryAutoManageEnabled, withMemoryAutoManage, type SkillsSettings } from '@/skills'
import { needsMemoryReview } from '@/utils/memoryReview'

export interface MemorySectionProps {
  /** Skills map (for the auto-management sub-toggle). Optional in standalone use. */
  skills?: SkillsSettings
  /** Full settings (for the Memory model selector). Optional in standalone use. */
  settings?: Settings
  /** Persist settings changes (auto-management toggle, memory model). */
  onChange?: (changes: { skills?: SkillsSettings; memoryModel?: string }) => void
  /** Hide the top-level page header when rendered inside an extension detail page. */
  embedded?: boolean
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

type BackgroundViewerItem =
  | {
      kind: 'memory'
      id: string
      content: string
      updatedAt: number
      category: MemoryCategory
      scope: Memory['scope']
      folderName?: string
      sessionId?: string
      needsReview: boolean
    }
  | {
      kind: 'summary'
      id: string
      content: string
      updatedAt: number
      sessionId: string
      needsReview: boolean
    }

type MemoryLibraryFilter =
  | 'all'
  | 'memory'
  | 'summary'
  | 'project_scope'
  | MemoryCategory
  | 'needs_review'

const MEMORY_CATEGORY_FILTERS: Array<{ id: MemoryCategory; label: string }> = [
  { id: 'preference', label: 'Preferences' },
  { id: 'project', label: 'Projects' },
  { id: 'personal', label: 'Personal' },
  { id: 'workflow', label: 'Workflows' },
  { id: 'context', label: 'Context' },
]

function formatCategoryLabel(category: MemoryCategory): string {
  return MEMORY_CATEGORY_FILTERS.find((filter) => filter.id === category)?.label ?? 'Context'
}

export function MemorySection({
  skills,
  settings,
  onChange,
  embedded = false,
}: MemorySectionProps = {}): React.ReactElement {
  const [memories, setMemories] = useState<Memory[]>([])
  const [summaries, setSummaries] = useState<ConversationSummary[]>([])
  const [libraryFilter, setLibraryFilter] = useState<MemoryLibraryFilter>('all')
  const [librarySearch, setLibrarySearch] = useState('')
  const [deletingItemIds, setDeletingItemIds] = useState<Set<string>>(() => new Set())
  const { sessions, folders, switchSession } = useChatHistory()
  const { setDashboardView } = useAppShell()

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !window.memory) {
      setMemories([])
      return
    }
    try {
      const next = await window.memory.list()
      setMemories(next)
      if (window.memory.summaries) {
        try {
          setSummaries(await window.memory.summaries.list())
        } catch {
          // Summaries are best-effort; ignore failures here.
        }
      }
    } catch (err) {
      console.error('Failed to load memories:', err)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (typeof window === 'undefined' || !window.memory) return
    return window.memory.onChanged(() => {
      void refresh()
    })
  }, [refresh])

  const backgroundMemories = useMemo(
    () => memories.filter((memory) => memory.origin === 'background'),
    [memories]
  )
  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders]
  )
  const backgroundViewerItems = useMemo<BackgroundViewerItem[]>(
    () =>
      [
        ...backgroundMemories.map((memory) => ({
          kind: 'memory' as const,
          id: memory.id,
          content: memory.content,
          updatedAt: memory.updatedAt,
          category: memory.category,
          scope: memory.scope,
          folderName:
            memory.scope.type === 'project'
              ? (folderNameById.get(memory.scope.projectId) ?? 'Unknown folder')
              : undefined,
          sessionId: memory.sessionId,
          needsReview: needsMemoryReview(memory.content),
        })),
        ...summaries.map((summary) => ({
          kind: 'summary' as const,
          id: summary.sessionId,
          content: summary.summary,
          updatedAt: summary.updatedAt,
          sessionId: summary.sessionId,
          needsReview: needsMemoryReview(summary.summary),
        })),
      ].sort((a, b) => b.updatedAt - a.updatedAt),
    [backgroundMemories, folderNameById, summaries]
  )
  const bgTotalCount = backgroundViewerItems.length
  const summaryCount = summaries.length
  const factCount = backgroundMemories.length
  const projectScopedCount = backgroundMemories.filter(
    (memory) => memory.scope.type === 'project'
  ).length
  const needsReviewCount = backgroundViewerItems.filter((item) => item.needsReview).length
  const categoryCounts = useMemo(
    () =>
      MEMORY_CATEGORY_FILTERS.reduce(
        (counts, filter) => {
          counts[filter.id] = backgroundMemories.filter(
            (memory) => memory.category === filter.id
          ).length
          return counts
        },
        {} as Record<MemoryCategory, number>
      ),
    [backgroundMemories]
  )
  const availableSessionIds = useMemo(
    () => new Set(sessions.map((session) => session.id)),
    [sessions]
  )
  const searchedBackgroundViewerItems = useMemo(() => {
    const query = librarySearch.trim().toLowerCase()
    return backgroundViewerItems.filter((item) => {
      if (libraryFilter === 'memory' && item.kind !== 'memory') return false
      if (libraryFilter === 'summary' && item.kind !== 'summary') return false
      if (
        libraryFilter === 'project_scope' &&
        (item.kind !== 'memory' || item.scope.type !== 'project')
      ) {
        return false
      }
      if (libraryFilter === 'needs_review' && !item.needsReview) return false
      if (
        MEMORY_CATEGORY_FILTERS.some((filter) => filter.id === libraryFilter) &&
        (item.kind !== 'memory' || item.category !== libraryFilter)
      ) {
        return false
      }
      if (!query) return true
      return (
        item.content.toLowerCase().includes(query) ||
        (item.kind === 'memory' &&
          (formatCategoryLabel(item.category).toLowerCase().includes(query) ||
            (item.folderName?.toLowerCase().includes(query) ?? false) ||
            (item.scope.type === 'project' &&
              item.scope.projectId.toLowerCase().includes(query))))
      )
    })
  }, [backgroundViewerItems, libraryFilter, librarySearch])

  const memoryModelOptions = useMemo(() => {
    if (!settings) return [] as Array<{ value: string; label: string; provider: string }>
    const options: Array<{ value: string; label: string; provider: string }> =
      getAvailableTitleModelOptions(settings).map((option) => ({
        value: option.id,
        label: option.displayName,
        provider: option.provider,
      }))
    // Preserve a previously-selected model even if it's no longer in the list.
    if (settings.memoryModel && !options.some((option) => option.value === settings.memoryModel)) {
      options.push({
        value: settings.memoryModel,
        label: settings.memoryModel,
        provider: '' as string,
      })
    }
    return options
  }, [settings])

  const selectedMemoryModel = memoryModelOptions.find((o) => o.value === settings?.memoryModel)

  const memoryProviders = useMemo(() => {
    const seen = new Set<string>()
    const providers: Array<{ id: string; label: string }> = []
    for (const option of memoryModelOptions) {
      if (option.provider && !seen.has(option.provider)) {
        seen.add(option.provider)
        providers.push({ id: option.provider, label: getProviderDefinition(option.provider).label })
      }
    }
    return providers
  }, [memoryModelOptions])

  const selectedProvider = selectedMemoryModel?.provider || memoryProviders[0]?.id || ''

  const deleteLibraryItem = useCallback(
    async (item: BackgroundViewerItem) => {
      if (typeof window === 'undefined' || !window.memory) return
      const key = `${item.kind}:${item.id}`
      setDeletingItemIds((current) => new Set(current).add(key))
      try {
        if (item.kind === 'memory') {
          await window.memory.delete(item.id)
        } else {
          await window.memory.summaries?.delete(item.id)
        }
        await refresh()
      } catch (error) {
        console.error('Failed to delete memory library item:', error)
      } finally {
        setDeletingItemIds((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      }
    },
    [refresh]
  )

  const openSourceChat = useCallback(
    (sessionId: string) => {
      if (!availableSessionIds.has(sessionId)) return
      switchSession(sessionId)
      setDashboardView('chat')
    },
    [availableSessionIds, setDashboardView, switchSession]
  )

  return (
    <div className={embedded ? 'extension-detail__embedded-section' : 'settings-section-layout'}>
      {!embedded && (
        <div className="page-header">
          <h2 className="page-title">Memory</h2>
          <div className="page-subtitle">
            Manage saved facts the assistant uses to personalize chats.
          </div>
        </div>
      )}

      {onChange && (
        <>
          <h3 className="appearance-group-heading">Background Memory</h3>
          <Card className="settings-list-card">
            <div className="settings-list-row">
              <div className="settings-list-row__meta">
                <h3 className="settings-list-row__label">Background Active Memory</h3>
                <div className="settings-list-row__description">
                  Automatically learns and recalls facts from your conversations to personalize
                  future chats.
                </div>
              </div>
              <div className="settings-list-row__control">
                <Switch
                  checked={isMemoryAutoManageEnabled(skills)}
                  onCheckedChange={(checked) =>
                    onChange({ skills: withMemoryAutoManage(skills, checked) })
                  }
                  aria-label="Let the assistant manage memory automatically"
                />
              </div>
            </div>

            {settings && (
              <div className="settings-list-row">
                <div className="settings-list-row__meta">
                  <h3 className="settings-list-row__label">Memory model</h3>
                  <div className="settings-list-row__description">
                    Choose a fast, inexpensive model for background memory extraction.
                  </div>
                </div>
                <div className="settings-list-row__control">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="zura-menu-trigger inline-flex items-center gap-2 px-3 py-1.5 text-[13px]"
                        aria-label="Background memory model"
                      >
                        {selectedMemoryModel ? (
                          <span className="inline-flex items-center gap-2">
                            <ProviderLogo provider={selectedProvider} size={14} />
                            <span className="truncate">{selectedMemoryModel.label}</span>
                          </span>
                        ) : (
                          <span>Use current chat model</span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="settings-menu-surface zura-menu-surface--model w-[205px]">
                      <DropdownMenuItem
                        onClick={() => onChange({ memoryModel: '' })}
                        className="zura-menu-item--model"
                      >
                        <Zap className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                        <span>Use current chat model</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="zura-menu-sub-trigger--model">
                          <SettingsIcon className="h-3.5 w-3.5 text-[var(--theme-text-secondary)]" />
                          <span>Use separate model</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent
                          sideOffset={8}
                          collisionPadding={12}
                          className="settings-menu-surface zura-menu-surface--model w-[220px]"
                        >
                          {memoryProviders.map((provider) => (
                            <DropdownMenuSub key={provider.id}>
                              <DropdownMenuSubTrigger className="zura-menu-sub-trigger--model">
                                <ProviderLogo provider={provider.id} size={14} />
                                <span>{provider.label}</span>
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent
                                sideOffset={8}
                                collisionPadding={12}
                                className="settings-menu-surface zura-menu-surface--model w-[220px] max-h-[60vh] overflow-y-auto"
                              >
                                {memoryModelOptions
                                  .filter((o) => o.provider === provider.id)
                                  .map((option) => (
                                    <DropdownMenuItem
                                      key={option.value}
                                      onClick={() => onChange({ memoryModel: option.value })}
                                      className="zura-menu-item--model"
                                    >
                                      <ProviderLogo provider={option.provider} size={14} />
                                      <span>{option.label}</span>
                                    </DropdownMenuItem>
                                  ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </Card>

          <h3 className="appearance-group-heading memory-library-heading">Memory Library</h3>
          <Card className="settings-list-card memory-library-card">
            <section className="memory-library-panel" aria-label="Memory Library">
              <div className="memory-library-panel__header">
                <div>
                  <div className="memory-library-panel__title">Memory Library</div>
                  <div className="memory-library-panel__subtitle">
                    {bgTotalCount === 0
                      ? 'No saved facts or recent activity yet.'
                      : [
                          `${factCount} ${factCount === 1 ? 'fact' : 'facts'}`,
                          `${summaryCount} ${summaryCount === 1 ? 'activity item' : 'activity items'}`,
                          projectScopedCount > 0
                            ? `${projectScopedCount} project ${
                                projectScopedCount === 1 ? 'memory' : 'memories'
                              }`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </div>
                </div>
                <div
                  className="memory-library-panel__stats"
                  aria-label={`${bgTotalCount} memory items`}
                >
                  <Database size={14} />
                  <span>{bgTotalCount}</span>
                </div>
              </div>

              <div className="memory-library-panel__toolbar">
                <label className="memory-library-panel__search">
                  <Search size={13} aria-hidden="true" />
                  <span className="sr-only">Search memories</span>
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Search memories"
                  />
                </label>
                <div className="memory-library-panel__filter-stack">
                  <div
                    className="memory-library-panel__tabs"
                    role="tablist"
                    aria-label="Memory item filters"
                  >
                    {[
                      { id: 'all' as const, label: 'All', count: bgTotalCount },
                      { id: 'memory' as const, label: 'Facts', count: factCount },
                      { id: 'summary' as const, label: 'Activity', count: summaryCount },
                      {
                        id: 'project_scope' as const,
                        label: 'Project memory',
                        count: projectScopedCount,
                      },
                      {
                        id: 'needs_review' as const,
                        label: 'Needs review',
                        count: needsReviewCount,
                      },
                    ].map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        role="tab"
                        aria-selected={libraryFilter === filter.id}
                        className={libraryFilter === filter.id ? 'is-active' : undefined}
                        onClick={() => setLibraryFilter(filter.id)}
                      >
                        {filter.label} <b>{filter.count}</b>
                      </button>
                    ))}
                  </div>
                  {factCount > 0 && (
                    <div
                      className="memory-library-panel__category-tabs"
                      role="tablist"
                      aria-label="Memory category filters"
                    >
                      {MEMORY_CATEGORY_FILTERS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          role="tab"
                          aria-selected={libraryFilter === filter.id}
                          className={libraryFilter === filter.id ? 'is-active' : undefined}
                          onClick={() => setLibraryFilter(filter.id)}
                        >
                          {filter.label} <b>{categoryCounts[filter.id]}</b>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="memory-library-panel__list">
                {searchedBackgroundViewerItems.length === 0 ? (
                  <div className="memory-library-panel__empty">
                    <div className="memory-library-panel__empty-main">
                      <div className="memory-library-panel__empty-icon" aria-hidden="true">
                        <Brain size={18} />
                      </div>
                      <div>
                        <div className="memory-library-panel__empty-title">
                          {bgTotalCount === 0
                            ? 'No memories saved yet'
                            : 'Nothing matches this view'}
                        </div>
                        <p>
                          {bgTotalCount === 0
                            ? 'Durable preferences, projects, and workflows will appear here with source chats.'
                            : 'Try a broader filter or clear the search query.'}
                        </p>
                      </div>
                    </div>
                    {bgTotalCount === 0 && (
                      <div
                        className="memory-library-panel__empty-tags"
                        aria-label="Memory categories"
                      >
                        <span>Preferences</span>
                        <span>Projects</span>
                        <span>Workflows</span>
                      </div>
                    )}
                  </div>
                ) : (
                  searchedBackgroundViewerItems.map((item, index) => {
                    const isSummary = item.kind === 'summary'
                    const Icon = isSummary ? Clock : Brain
                    const itemKey = `${item.kind}:${item.id}`
                    const isDeleting = deletingItemIds.has(itemKey)
                    const sourceSessionId = item.sessionId
                    const hasSourceSession = sourceSessionId
                      ? availableSessionIds.has(sourceSessionId)
                      : false
                    return (
                      <article key={item.id} className="memory-library-panel__row">
                        <span className="memory-library-panel__number" aria-hidden="true">
                          {index + 1}
                        </span>
                        <div className="memory-library-panel__main">
                          <div className="memory-library-panel__row-top">
                            <span className="memory-library-panel__type">
                              <Icon size={12} />
                              {isSummary ? 'Recent activity' : 'Background fact'}
                            </span>
                            {!isSummary && (
                              <span className="memory-library-panel__badge">
                                {formatCategoryLabel(item.category)}
                              </span>
                            )}
                            {!isSummary && item.scope.type === 'project' && (
                              <span className="memory-library-panel__badge">
                                <FolderOpen size={11} />
                                {item.folderName}
                              </span>
                            )}
                            {item.needsReview && (
                              <span className="memory-library-panel__badge is-review">
                                <AlertTriangle size={11} />
                                Needs review
                              </span>
                            )}
                            <span className="memory-library-panel__date">
                              Updated {formatTimestamp(item.updatedAt)}
                            </span>
                          </div>
                          <p>{item.content}</p>
                        </div>
                        <div className="memory-library-panel__actions">
                          {sourceSessionId && (
                            <button
                              type="button"
                              className="memory-library-panel__source"
                              disabled={!hasSourceSession}
                              onClick={() => openSourceChat(sourceSessionId)}
                            >
                              <Link2 size={12} />
                              {hasSourceSession ? 'Open chat' : 'Source unavailable'}
                            </button>
                          )}
                          <TooltipIconButton
                            tooltip={`Delete ${isSummary ? 'recent activity' : 'background fact'}`}
                            className="memory-library-panel__delete"
                            disabled={isDeleting}
                            onClick={() => void deleteLibraryItem(item)}
                            aria-label={`Delete ${isSummary ? 'recent activity' : 'background fact'}`}
                          >
                            <Trash2 size={13} />
                          </TooltipIconButton>
                        </div>
                      </article>
                    )
                  })
                )}
              </div>
            </section>
          </Card>
        </>
      )}
    </div>
  )
}

export default MemorySection
