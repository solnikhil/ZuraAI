import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Check,
  Clipboard,
  Command,
  Copy,
  CornerDownLeft,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  Link2,
  MessageSquare,
  Monitor,
  Puzzle,
  RefreshCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react'

import {
  parseCommandCenterQuery,
  queryAllowsSource,
  scoreAppSearch,
  scoreGenericSearch,
  scoreWindowSearch,
} from '../commandCenter/search'
import type { CommandCenterEmoji } from '../commandCenter/emojis'
import { CommandCenterSkeleton } from './commandCenter/CommandCenterSkeletons'
import type { GitHubCommitBarMeta } from './GitHubWorkspace'
import { ZuraCommitGlyph } from './icons/GitWorkspaceGlyphs'
import type {
  CommandCenterIndex,
  CommandCenterIndexItem,
  CommandCenterItemActionId,
  CommandCenterShownInfo,
} from '../electron/types'

type EmojiSearchFn = (query: string, limit?: number) => CommandCenterEmoji[]

/** First paint + each scroll page of emoji cells (9-col × ~8 rows). */
const EMOJI_PAGE_SIZE = 72

type CommandView =
  | 'root'
  | 'emojis'
  | 'chats'
  | 'layout'
  | 'settings'
  | 'store'
  | 'github'
  | 'extension'

const CommandCenterStore = lazy(() => import('./CommandCenterStore'))
const CommandCenterExtensionHost = lazy(() => import('./CommandCenterExtensionHost'))
const GitHubWorkspace = lazy(() => import('./GitHubWorkspace'))

type AppActionDef = {
  id: CommandCenterItemActionId
  label: string
  icon: React.ReactNode
  /** When false, the action is omitted for this item. */
  available: (item: Extract<CommandCenterIndexItem, { type: 'app' }>) => boolean
  /** Shown but not runnable (e.g. upcoming Favorites). */
  disabled?: boolean
}

const APP_ACTION_DEFS: AppActionDef[] = [
  {
    id: 'open',
    label: 'Open Application',
    icon: <ExternalLink size={15} />,
    available: () => true,
  },
  {
    id: 'focus-window',
    label: 'Focus Window',
    icon: <Monitor size={15} />,
    available: (item) => typeof item.existingWindow?.hwnd === 'number',
  },
  {
    id: 'show-in-folder',
    label: 'Show in File Explorer',
    icon: <FolderOpen size={15} />,
    available: (item) => Boolean(appPathCandidate(item)),
  },
  {
    id: 'reveal-shortcut',
    label: 'Reveal Shortcut',
    icon: <Link2 size={15} />,
    available: (item) => typeof item.shortcutPath === 'string' && Boolean(item.shortcutPath.trim()),
  },
  {
    id: 'add-to-favorite',
    label: 'Add to Favorites',
    icon: <Star size={15} />,
    available: () => true,
    // Favorites storage/ranking is not shipped yet — keep the row visible but disabled.
    disabled: true,
  },
  {
    id: 'copy-name',
    label: 'Copy Name',
    icon: <Copy size={15} />,
    available: () => true,
  },
  {
    id: 'copy-path',
    label: 'Copy Path',
    icon: <Clipboard size={15} />,
    available: (item) => Boolean(appPathCandidate(item)),
  },
  {
    id: 'copy-dir',
    label: 'Copy Directory Path',
    icon: <Clipboard size={15} />,
    available: (item) => Boolean(appPathCandidate(item)),
  },
  {
    id: 'copy-bundle-id',
    label: 'Copy Bundle Identifier',
    icon: <Clipboard size={15} />,
    available: (item) =>
      typeof item.appUserModelId === 'string' && Boolean(item.appUserModelId.trim()),
  },
  {
    id: 'force-quit',
    label: 'Force Quit',
    icon: <X size={15} />,
    available: (item) => typeof item.existingWindow?.processId === 'number',
  },
  {
    id: 'disable-application',
    label: 'Disable Application',
    icon: <X size={15} />,
    available: () => true,
  },
  {
    id: 'uninstall-application',
    label: 'Uninstall Application',
    icon: <Puzzle size={15} />,
    available: () => true,
  },
]

const FILE_ACTION_DEFS = [
  { id: 'open' as const, label: 'Open', icon: <ExternalLink size={15} /> },
  { id: 'show-in-folder' as const, label: 'Show in File Explorer', icon: <FolderOpen size={15} /> },
  { id: 'copy-path' as const, label: 'Copy Path', icon: <Clipboard size={15} /> },
  { id: 'copy-dir' as const, label: 'Copy Directory Path', icon: <Clipboard size={15} /> },
  { id: 'copy-name' as const, label: 'Copy Name', icon: <Copy size={15} /> },
]

function appPathCandidate(
  item: Extract<CommandCenterIndexItem, { type: 'app' }>
): string | undefined {
  for (const candidate of [item.targetPath, item.shortcutPath, item.appPath]) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return trimmed
  }
  return undefined
}

const EMPTY_INDEX: CommandCenterIndex = {
  bestMatches: [],
  workflows: [],
  apps: [],
  files: [],
  windows: [],
  actions: [],
  extensions: [],
  chats: [],
}

// Fixed group order for the results list (keeps section headers stable).
// Layout + Settings are Zura Extras nested sections (not top-level categories).
// Searching can still surface their child actions under Layout / Settings groups.
const ZURA_EXTRAS_GROUP = 'Zura Extras'
/** Empty-browse top strip: frequent/recent apps and actions. */
const SUGGESTIONS_GROUP = 'Suggestions'
/** Typed-search top strip: best lexical + personalized hits. */
const BEST_MATCHES_GROUP = 'Best Matches'
const FILES_GROUP = 'Files & Folders'
const LAYOUT_GROUP = 'Layout'
const SETTINGS_GROUP = 'Settings'
const GROUP_ORDER = [
  SUGGESTIONS_GROUP,
  BEST_MATCHES_GROUP,
  'Saved Workflows',
  'Extensions',
  'Apps',
  FILES_GROUP,
  LAYOUT_GROUP,
  SETTINGS_GROUP,
  ZURA_EXTRAS_GROUP,
] as const

// Max rows rendered per group. Apps is the group that can grow into the
// hundreds, so it is capped hardest; the rest are already small.
const DEFAULT_GROUP_LIMIT = 20
const GROUP_RESULT_LIMITS: Record<string, number> = {
  'Saved Workflows': 12,
  Apps: 40,
  [SUGGESTIONS_GROUP]: 4,
  [BEST_MATCHES_GROUP]: 5,
  [FILES_GROUP]: 40,
  [LAYOUT_GROUP]: 8,
  [SETTINGS_GROUP]: 16,
  [ZURA_EXTRAS_GROUP]: 16,
}
// Apps shown in the default browse view (before the user types a query).
const DEFAULT_BROWSE_APP_LIMIT = 8

/** Columns for the emoji-only picker grid (arrow keys move by this width). */
const EMOJI_GRID_COLUMNS = 9

function resultOptionId(itemId: string): string {
  return `command-center-option-${itemId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

const INTERACTIVE_EXTRA_ACTION_IDS = new Set<string>([
  'emoji-picker',
  'zura-ai-chats',
  'layout',
  'settings',
  'zura-store',
])

const HIDDEN_COMMAND_CENTER_ACTION_IDS = new Set<string>([
  'open-windows-copilot',
  'clipboard-to-chat',
  'focus-zuraai',
  'layout',
  'open-downloads',
  'settings',
  'system-status',
  'zura-ai-chats',
])

/** Window placement actions — browse via Zura Extras → Layout. */
const LAYOUT_CHILD_ACTION_IDS = new Set<string>(['snap-left', 'snap-right', 'maximize-window'])

function isSettingsChildActionId(actionId: string): boolean {
  return actionId.startsWith('settings-') && actionId !== 'settings'
}

/** Map fixed allowlisted actions into browse categories (not a flat Actions list). */
function groupForFixedAction(actionId: string): string {
  switch (actionId) {
    case 'snap-left':
    case 'snap-right':
    case 'maximize-window':
      // Only shown while searching (or inside the Layout nested view).
      return LAYOUT_GROUP
    case 'system-status':
    case 'open-downloads':
    case 'clipboard-to-chat':
    case 'focus-zuraai':
    case 'emoji-picker':
    case 'zura-ai-chats':
    case 'layout':
    case 'settings':
    case 'zura-store':
    case 'open-windows-copilot':
      // Convenience tools live under Zura Extras (no separate System/Files sections).
      return ZURA_EXTRAS_GROUP
    default:
      if (isSettingsChildActionId(actionId)) {
        // Nested Settings owns these on empty browse; search surfaces under Settings.
        return SETTINGS_GROUP
      }
      return ZURA_EXTRAS_GROUP
  }
}

function flattenIndex(
  index: CommandCenterIndex,
  options: {
    includeChats: boolean
    includeLayoutChildren: boolean
    includeSettingsChildren: boolean
    /** Empty browse → Suggestions; typed search → Best Matches. */
    topMatchesGroup: typeof SUGGESTIONS_GROUP | typeof BEST_MATCHES_GROUP
  }
): Array<{ group: string; item: CommandCenterIndexItem }> {
  // Older mocks / partial index payloads may omit newer fields.
  const bestMatches = (index.bestMatches ?? []).filter(
    (item) =>
      item.type !== 'window' &&
      !(item.type === 'action' && HIDDEN_COMMAND_CENTER_ACTION_IDS.has(item.actionId))
  )
  const workflows = index.workflows ?? []
  const apps = index.apps ?? []
  const files = index.files ?? []
  const actions = index.actions ?? []
  const extensions = index.extensions ?? []
  const chats = index.chats ?? []

  const bestIds = new Set(bestMatches.map((item) => item.id))
  const rows: Array<{ group: string; item: CommandCenterIndexItem }> = [
    ...bestMatches.map((item) => ({ group: options.topMatchesGroup, item })),
    ...workflows
      .filter((item) => !bestIds.has(item.id))
      .map((item) => ({ group: 'Saved Workflows', item })),
    ...extensions
      .filter((item) => !bestIds.has(item.id))
      .map((item) => ({ group: 'Extensions', item })),
    ...apps.filter((item) => !bestIds.has(item.id)).map((item) => ({ group: 'Apps', item })),
    ...files.filter((item) => !bestIds.has(item.id)).map((item) => ({ group: FILES_GROUP, item })),
  ]
  for (const item of actions) {
    if (item.type !== 'action') continue
    if (HIDDEN_COMMAND_CENTER_ACTION_IDS.has(item.actionId)) continue
    // Empty browse: hide individual snap/maximize rows — open via Layout section.
    if (LAYOUT_CHILD_ACTION_IDS.has(item.actionId) && !options.includeLayoutChildren) {
      continue
    }
    // Nested Layout section owns the child tools; don't list the entry inside itself.
    if (item.actionId === 'layout' && options.includeLayoutChildren) {
      continue
    }
    // Empty browse: hide individual Windows Settings pages — open via Settings section.
    if (isSettingsChildActionId(item.actionId) && !options.includeSettingsChildren) {
      continue
    }
    if (item.actionId === 'settings' && options.includeSettingsChildren) {
      continue
    }
    if (!bestIds.has(item.id)) rows.push({ group: groupForFixedAction(item.actionId), item })
  }
  if (options.includeChats) {
    // Matching chats can surface while searching; empty browse uses Zura AI Chats.
    rows.push(
      ...chats
        .filter((item) => !bestIds.has(item.id))
        .map((item) => ({ group: ZURA_EXTRAS_GROUP, item }))
    )
  }
  return rows
}

function lexicalSearchScore(item: CommandCenterIndexItem, trimmedQuery: string): number {
  const parsed = parseCommandCenterQuery(trimmedQuery)
  const source =
    item.type === 'action'
      ? item.actionId.startsWith('settings-')
        ? 'setting'
        : 'action'
      : item.type
  if (!queryAllowsSource(parsed, source)) return 0
  switch (item.type) {
    case 'app': {
      const appScore = scoreAppSearch(item.title, item.aliases, trimmedQuery)
      if (appScore === 0) return 0
      return appScore + Math.min(item.rank ?? 0, 10)
    }
    case 'window':
      return scoreWindowSearch(item.title, item.subtitle ?? '', trimmedQuery)
    case 'file':
    case 'folder':
      return scoreGenericSearch([item.title, ...item.aliases], trimmedQuery)
    case 'workflow':
    case 'action':
    case 'chat':
      return scoreGenericSearch([item.title, ...item.aliases, item.hint], trimmedQuery)
    default:
      return 0
  }
}

function searchScore(item: CommandCenterIndexItem, query: string): number {
  const trimmedQuery = query.trim()
  // Empty browse: prefer main score (rank + open-frequency learning), then app rank.
  if (!trimmedQuery) {
    if (typeof item.score === 'number') return item.score
    return item.type === 'app' && typeof item.rank === 'number' ? item.rank : 1
  }
  // Always require a lexical match. Empty-browse `item.score` is always > 0 for
  // frequently opened apps, so trusting it alone would flood search with
  // unrelated high-rank rows until main re-ranks for this query.
  const lexical = lexicalSearchScore(item, trimmedQuery)
  if (lexical <= 0) return 0
  // Query-ranked main scores are lexical + personalization (>= lexical). Prefer
  // them when present so open history can break ties among real matches.
  if (typeof item.score === 'number' && item.score >= lexical) return item.score
  return lexical
}

function matchesItem(item: CommandCenterIndexItem, query: string): boolean {
  if (!query.trim()) return true
  return searchScore(item, query) > 0
}

function iconForItem(item: CommandCenterIndexItem) {
  if (item.type === 'workflow') return <Sparkles size={22} />
  if (item.type === 'app' && item.iconDataUrl) {
    return (
      <img
        src={item.iconDataUrl}
        alt=""
        className="command-center-result__app-icon"
        draggable={false}
      />
    )
  }
  if (item.type === 'app') return <Monitor size={22} />
  if (item.type === 'window') return <Monitor size={22} />
  if (item.type === 'file') return <File size={22} />
  if (item.type === 'folder') return <Folder size={22} />
  if (item.type === 'chat') return <MessageSquare size={22} />
  if (item.type === 'extension') {
    return item.iconDataUrl ? <img src={item.iconDataUrl} alt="" /> : <Puzzle size={22} />
  }
  if (item.type === 'action') {
    switch (item.actionId) {
      case 'emoji-picker':
        return (
          <span
            aria-hidden="true"
            className="command-center-result__emoji-icon"
            style={{ fontSize: 22, lineHeight: 1 }}
          >
            😀
          </span>
        )
      case 'zura-ai-chats':
        return <MessageSquare size={22} />
      case 'layout':
      case 'snap-left':
      case 'snap-right':
      case 'maximize-window':
      case 'system-status':
        return <Monitor size={22} />
      case 'settings':
      case 'open-windows-copilot':
        return <Command size={22} />
      case 'clipboard-to-chat':
        return <Clipboard size={22} />
      case 'open-downloads':
        return <FolderOpen size={22} />
      case 'focus-zuraai':
        return <Sparkles size={22} />
      case 'zura-store':
        return <Puzzle size={22} />
      default:
        return <Command size={22} />
    }
  }
  return <Command size={22} />
}

/** Keep already-rendered app icons when a refresh temporarily omits them.
 *  Prevents Monitor-placeholder ↔ real-icon blinking during lazy extraction. */
function mergeAppIcons(
  previous: CommandCenterIndexItem[],
  next: CommandCenterIndexItem[]
): CommandCenterIndexItem[] {
  if (previous.length === 0) return next
  const prevById = new Map(previous.map((app) => [app.id, app]))
  return next.map((app) => {
    if (app.type !== 'app' || app.iconDataUrl) return app
    const prev = prevById.get(app.id)
    if (prev?.type === 'app' && prev.iconDataUrl && prev.iconKey && prev.iconKey === app.iconKey) {
      return { ...app, iconDataUrl: prev.iconDataUrl, iconPending: false }
    }
    return app
  })
}

function mergeCommandCenterIndex(
  previous: CommandCenterIndex,
  next: CommandCenterIndex
): CommandCenterIndex {
  return {
    ...next,
    apps: mergeAppIcons(previous.apps, next.apps),
  }
}

function mergeNativeSearchResults(
  current: CommandCenterIndex,
  files: CommandCenterIndexItem[],
  diagnostics: NonNullable<CommandCenterIndex['diagnostics']>['windowsSearch']
): CommandCenterIndex {
  const candidates = [
    ...current.workflows,
    ...current.apps,
    ...files,
    ...current.windows,
    ...current.actions,
    ...current.chats,
  ]
  return {
    ...current,
    files,
    bestMatches: candidates
      .filter((item) => (item.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.title.localeCompare(b.title))
      .slice(0, 5),
    diagnostics: { ...current.diagnostics, windowsSearch: diagnostics },
  }
}

export default function CommandCenterOverlay() {
  const [commandView, setCommandView] = useState<CommandView>('root')
  const [activeExtension, setActiveExtension] = useState<{
    extensionId: string
    commandId: string
  }>()
  const [githubSignedIn, setGitHubSignedIn] = useState(false)
  const [githubSummary, setGithubSummary] = useState('')
  const [githubCommitMeta, setGithubCommitMeta] = useState<GitHubCommitBarMeta>({
    hasRepository: false,
    selectedCount: 0,
    changeCount: 0,
    committing: false,
  })
  const githubCommitHandlerRef = useRef<(() => Promise<void>) | null>(null)
  const [input, setInput] = useState('')
  const [index, setIndex] = useState<CommandCenterIndex>(EMPTY_INDEX)
  const [browseApps, setBrowseApps] = useState<CommandCenterIndexItem[]>([])
  const [indexLoading, setIndexLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  // The first result is highlighted by default (both the default browse view
  // and while searching), so Enter always has a target without needing the
  // user to arrow into the list first.
  const [selectionVisible, setSelectionVisible] = useState(true)
  const [confirmingWorkflow, setConfirmingWorkflow] = useState<CommandCenterIndexItem | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsHighlight, setActionsHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const actionsRootRef = useRef<HTMLDivElement | null>(null)
  const actionsMenuRef = useRef<HTMLDivElement | null>(null)
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const indexRequestRef = useRef(0)
  const activeSearchQueryRef = useRef('')
  const selectionTouchedRef = useRef(false)
  const selectedItemIdRef = useRef<string | null>(null)
  const filteredRowCountRef = useRef(0)
  const pendingFirstRowPaintRef = useRef<CommandCenterShownInfo | null>(null)
  /** Timestamp of last hide(); null until the overlay has been dismissed once. */
  const lastHiddenAtRef = useRef<number | null>(null)
  /** Latest UI snapshot for soft-resume without stale closures. */
  const sessionSnapshotRef = useRef({
    commandView: 'root' as CommandView,
    input: '',
  })

  const isEmojiView = commandView === 'emojis'
  const isChatsView = commandView === 'chats'
  const isLayoutView = commandView === 'layout'
  const isSettingsView = commandView === 'settings'
  const isStoreView = commandView === 'store'
  const isGitHubView = commandView === 'github'
  const isExtensionView = commandView === 'extension'
  const isNestedCommandView =
    isEmojiView ||
    isChatsView ||
    isLayoutView ||
    isSettingsView ||
    isStoreView ||
    isGitHubView ||
    isExtensionView
  const searchSyntaxSuggestions = useMemo(() => {
    if (isNestedCommandView) return []
    const last = input.split(/\s+/).at(-1)?.toLowerCase() ?? ''
    const syntax = [
      'app:',
      'file:',
      'folder:',
      'setting:',
      'window:',
      'kind:',
      'ext:',
      'modified:',
      'size:',
    ]
    if (!last || (!last.includes(':') && last.length < 2)) return []
    if (last.includes(':') && !last.endsWith(':')) return []
    return syntax.filter((entry) => entry.startsWith(last)).slice(0, 5)
  }, [input, isNestedCommandView])

  // Lazy-loaded emoji catalog (dynamic import + deferred skin-tone build).
  const emojiSearchRef = useRef<EmojiSearchFn | null>(null)
  const emojiScrollRef = useRef<HTMLDivElement | null>(null)
  const [emojiCatalogReady, setEmojiCatalogReady] = useState(false)
  const [emojiResults, setEmojiResults] = useState<CommandCenterEmoji[]>([])
  // Progressive window: only mount this many cells (grow on scroll / keyboard).
  const [emojiVisibleCount, setEmojiVisibleCount] = useState(EMOJI_PAGE_SIZE)
  const selectedEmoji = isEmojiView ? emojiResults[selectedIndex] : undefined
  const visibleEmojiResults = useMemo(
    () => emojiResults.slice(0, Math.min(emojiVisibleCount, emojiResults.length)),
    [emojiResults, emojiVisibleCount]
  )

  useEffect(() => {
    if (!isEmojiView) return
    let cancelled = false
    const run = async () => {
      if (!emojiSearchRef.current) {
        const mod = await import('../commandCenter/emojis')
        if (cancelled) return
        emojiSearchRef.current = mod.searchCommandCenterEmojis
        setEmojiCatalogReady(true)
      }
      const search = emojiSearchRef.current
      if (!search) return
      const next = search(input)
      if (!cancelled) {
        setEmojiResults(next)
        setEmojiVisibleCount(EMOJI_PAGE_SIZE)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [input, isEmojiView])

  // Keyboard / selection past the window → expand the mounted page.
  useEffect(() => {
    if (!isEmojiView) return
    if (selectedIndex + EMOJI_GRID_COLUMNS >= emojiVisibleCount) {
      setEmojiVisibleCount((count) =>
        Math.min(emojiResults.length, Math.max(count, selectedIndex + EMOJI_PAGE_SIZE))
      )
    }
  }, [emojiResults.length, emojiVisibleCount, isEmojiView, selectedIndex])

  const handleEmojiScroll = useCallback(() => {
    const node = emojiScrollRef.current
    if (!node) return
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight
    if (remaining < 120) {
      setEmojiVisibleCount((count) => Math.min(emojiResults.length, count + EMOJI_PAGE_SIZE))
    }
  }, [emojiResults.length])

  const chatBrowseResults = useMemo(() => {
    const query = input.trim()
    const chats = index.chats.filter((item) => item.type === 'chat')
    if (!query) return chats
    return chats
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
  }, [index.chats, input])
  const selectedBrowseChat = isChatsView ? chatBrowseResults[selectedIndex] : undefined

  const layoutBrowseResults = useMemo(() => {
    const query = input.trim()
    const tools = index.actions.filter(
      (item) => item.type === 'action' && LAYOUT_CHILD_ACTION_IDS.has(item.actionId)
    )
    if (!query) return tools
    return tools
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
  }, [index.actions, input])
  const selectedLayoutTool = isLayoutView ? layoutBrowseResults[selectedIndex] : undefined

  const settingsBrowseResults = useMemo(() => {
    const query = input.trim()
    const tools = index.actions.filter(
      (item) => item.type === 'action' && isSettingsChildActionId(item.actionId)
    )
    if (!query) return tools
    return tools
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
  }, [index.actions, input])
  const selectedSettingsTool = isSettingsView ? settingsBrowseResults[selectedIndex] : undefined

  useEffect(() => {
    sessionSnapshotRef.current = {
      commandView,
      input,
    }
  }, [commandView, input])

  useEffect(() => {
    void window.commandCenter.setLayout('search')
  }, [])

  const searchIndex = useMemo(() => {
    const query = input.trim()
    if (!query) return index
    const appMatches = index.apps
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
    const cachedMatches = browseApps
      .filter((item) => matchesItem(item, query))
      .sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
    return { ...index, apps: appMatches.length > 0 ? appMatches : cachedMatches }
  }, [browseApps, index, input])

  // A command palette should never mount its entire app catalogue. We cap each
  // group (apps is the one that explodes) so only a bounded, ranked set of rows
  // is rendered, which keeps the overlay responsive over the acrylic backdrop.
  const groupedRows = useMemo(() => {
    const query = input.trim()
    const groups = new Map<string, CommandCenterIndexItem[]>()
    // Empty browse: hide individual chats / snap tools (open via nested sections).
    // Searching can still surface matching chat / layout rows.
    for (const { group, item } of flattenIndex(searchIndex, {
      includeChats: Boolean(query),
      includeLayoutChildren: Boolean(query),
      includeSettingsChildren: Boolean(query),
      topMatchesGroup: query ? BEST_MATCHES_GROUP : SUGGESTIONS_GROUP,
    })) {
      if (!matchesItem(item, query)) continue
      groups.set(group, [...(groups.get(group) ?? []), item])
    }
    return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => {
      const items = groups.get(group) ?? []
      // Always rank within the group: empty browse uses main score/rank so
      // frequent opens stay near the top of Apps as well as Suggestions.
      const ordered = [...items].sort(
        (a, b) => searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
      )
      // Keep the default (unsearched) Apps list short; expand it once searching.
      const limit =
        group === 'Apps' && !query
          ? DEFAULT_BROWSE_APP_LIMIT
          : (GROUP_RESULT_LIMITS[group] ?? DEFAULT_GROUP_LIMIT)
      return [group, ordered.slice(0, limit)] as const
    })
  }, [searchIndex, input])

  // Flat, ordered list that exactly mirrors what is rendered. This is the single
  // source of truth for keyboard navigation and selection.
  const filteredRows = useMemo(
    () => groupedRows.flatMap(([group, items]) => items.map((item) => ({ group, item }))),
    [groupedRows]
  )
  filteredRowCountRef.current = filteredRows.length

  useEffect(() => {
    const info = pendingFirstRowPaintRef.current
    if (!import.meta.env.DEV || !info || filteredRows.length === 0) return
    pendingFirstRowPaintRef.current = null
    requestAnimationFrame(() => {
      console.debug('[CommandCenter:perf]', {
        attemptId: info.attemptId,
        mark: 'first-result-row-paint',
        elapsedMs: Number((Date.now() - info.startedAt).toFixed(2)),
        resultCount: filteredRows.length,
      })
    })
  }, [filteredRows.length])

  // O(1) id -> row index lookup so each rendered row doesn't run an O(n) findIndex
  // (which made selection cost O(n^2) across the whole list on every render).
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>()
    filteredRows.forEach((row, index) => map.set(row.item.id, index))
    return map
  }, [filteredRows])

  const selectedItem = filteredRows[selectedIndex]?.item

  useEffect(() => {
    if (selectedItem) selectedItemIdRef.current = selectedItem.id
  }, [selectedItem])

  useEffect(() => {
    if (!selectionTouchedRef.current || !selectedItemIdRef.current) return
    const preservedIndex = filteredRows.findIndex(
      ({ item }) => item.id === selectedItemIdRef.current
    )
    if (preservedIndex >= 0 && preservedIndex !== selectedIndex) setSelectedIndex(preservedIndex)
  }, [filteredRows, selectedIndex])
  const openEmojiView = useCallback((initialQuery = '') => {
    setCommandView('emojis')
    setInput(initialQuery)
    setSelectedIndex(0)
    setSelectionVisible(true)
    setEmojiResults([])
    setEmojiVisibleCount(EMOJI_PAGE_SIZE)
    // Kick catalog load immediately on open (does not block paint of shell).
    void import('../commandCenter/emojis').then((mod) => {
      emojiSearchRef.current = mod.searchCommandCenterEmojis
      setEmojiCatalogReady(true)
      setEmojiResults(mod.searchCommandCenterEmojis(initialQuery))
      setEmojiVisibleCount(EMOJI_PAGE_SIZE)
    })
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const openChatsView = useCallback((initialQuery = '') => {
    setCommandView('chats')
    setInput(initialQuery)
    setSelectedIndex(0)
    setSelectionVisible(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const openLayoutView = useCallback((initialQuery = '') => {
    setCommandView('layout')
    setInput(initialQuery)
    setSelectedIndex(0)
    setSelectionVisible(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const openSettingsView = useCallback((initialQuery = '') => {
    setCommandView('settings')
    setInput(initialQuery)
    setSelectedIndex(0)
    setSelectionVisible(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const openStoreView = useCallback((initialQuery = '') => {
    setCommandView('store')
    setInput(initialQuery)
    setSelectedIndex(0)
    setSelectionVisible(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const openGitHubView = useCallback(() => {
    setCommandView('github')
    setInput('')
    setGithubSummary('')
    setGithubCommitMeta({
      hasRepository: false,
      selectedCount: 0,
      changeCount: 0,
      committing: false,
    })
    setSelectedIndex(0)
    setSelectionVisible(false)
  }, [])

  const openExtensionView = useCallback(
    (extensionId: string, commandId: string, hostCapability?: string) => {
      if (hostCapability === 'git-workspace') {
        openGitHubView()
        return
      }
      setActiveExtension({ extensionId, commandId })
      setCommandView('extension')
      setInput('')
      setSelectedIndex(0)
      setSelectionVisible(false)
    },
    [openGitHubView]
  )

  const showGitHubCommitBar = isGitHubView && githubSignedIn && githubCommitMeta.hasRepository
  // Only enable Commit when there is a summary and at least one *checked* file.
  const canGitHubCommit =
    showGitHubCommitBar &&
    !githubCommitMeta.committing &&
    githubSummary.trim().length > 0 &&
    githubCommitMeta.selectedCount > 0

  const githubCommitHint = (() => {
    if (!showGitHubCommitBar) return undefined
    if (githubCommitMeta.committing) return 'Creating commit…'
    if (githubCommitMeta.changeCount === 0) return 'No local changes to commit'
    if (githubCommitMeta.selectedCount === 0) return 'Check files in the list to include them'
    if (!githubSummary.trim()) return 'Type a summary, then press Enter or click Commit'
    const n = githubCommitMeta.selectedCount
    return `Commit ${n} file${n === 1 ? '' : 's'} · Enter`
  })()

  const githubCommitLabel = (() => {
    if (githubCommitMeta.committing) return 'Committing'
    const n = githubCommitMeta.selectedCount
    if (n <= 0) return 'Commit'
    return `Commit ${n}`
  })()

  const runGitHubCommit = () => {
    if (!canGitHubCommit) return
    void githubCommitHandlerRef.current?.()
  }

  const handleInputChange = useCallback(
    (value: string) => {
      if (!isNestedCommandView && value.startsWith(':')) {
        openEmojiView(value.slice(1))
        return
      }
      selectionTouchedRef.current = false
      selectedItemIdRef.current = null
      setInput(value)
    },
    [isNestedCommandView, openEmojiView]
  )

  const closeCommandView = useCallback(() => {
    setCommandView('root')
    setInput('')
    setSelectedIndex(0)
    setSelectionVisible(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const refreshIndex = useCallback(async (query = '', showLoading = false) => {
    const requestId = indexRequestRef.current + 1
    indexRequestRef.current = requestId
    const requestedQuery = query.trim()
    // Default false: reopen/search should not flash an empty loading state over
    // rows we already painted (stale-while-revalidate).
    if (showLoading) {
      setIndexLoading(true)
    }
    try {
      const nextIndex = await window.commandCenter.getIndex(query)
      if (requestId !== indexRequestRef.current) return
      if (requestedQuery !== activeSearchQueryRef.current) return
      if (!requestedQuery) {
        setBrowseApps((current) => mergeAppIcons(current, nextIndex.apps))
        setIndex((current) => mergeCommandCenterIndex(current, nextIndex))
      } else {
        setIndex((current) => mergeCommandCenterIndex(current, nextIndex))
        if (nextIndex.apps.length > 0) {
          setBrowseApps((current) => {
            const merged = new Map(current.map((app) => [app.id, app]))
            for (const app of mergeAppIcons(current, nextIndex.apps)) {
              merged.set(app.id, app)
            }
            return Array.from(merged.values())
          })
        }
      }
      setError(null)
      if (requestedQuery && typeof window.commandCenter.searchNativeIndex === 'function') {
        void window.commandCenter
          .searchNativeIndex(requestedQuery)
          .then((native) => {
            if (requestId !== indexRequestRef.current) return
            if (requestedQuery !== activeSearchQueryRef.current) return
            setIndex((current) =>
              mergeNativeSearchResults(current, native.files, native.diagnostics)
            )
          })
          .catch(() => undefined)
      }
    } catch (err) {
      if (requestId === indexRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Unable to load Command Center index.')
      }
    } finally {
      if (requestId === indexRequestRef.current) {
        setIndexLoading(false)
      }
    }
  }, [])

  const appIndexWarning =
    index.diagnostics?.apps && !index.diagnostics.apps.ok
      ? index.diagnostics.apps.error || 'App index is partially unavailable.'
      : null

  const resetOverlay = useCallback(() => {
    setCommandView('root')
    setInput('')
    activeSearchQueryRef.current = ''
    // Keep index/browseApps so a reopened overlay paints immediately while the
    // next getIndex refreshes in the background.
    setSelectedIndex(0)
    setSelectionVisible(true)
    setConfirmingWorkflow(null)
    setStatus(null)
    setError(null)
    setActionsOpen(false)
    setActionsHighlight(0)
    void refreshIndex('', false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [refreshIndex])

  const softResumeOverlay = useCallback(() => {
    // Keep commandView and input; only clear transient UI chrome.
    setConfirmingWorkflow(null)
    setActionsOpen(false)
    setActionsHighlight(0)
    setStatus(null)
    setError(null)
    const snapshot = sessionSnapshotRef.current
    if (snapshot.commandView === 'root') {
      void refreshIndex(snapshot.input.trim(), false)
    } else if (snapshot.commandView === 'chats') {
      // Keep chat catalogue warm when soft-resuming the chats browser.
      void refreshIndex('', false)
    }
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [refreshIndex])

  const handleOverlayShown = useCallback((info?: CommandCenterShownInfo) => {
    const lastHidden = lastHiddenAtRef.current
    const canResume = lastHidden !== null
    if (canResume) {
      softResumeOverlay()
    } else {
      resetOverlay()
    }
    if (import.meta.env.DEV && info) {
      pendingFirstRowPaintRef.current = info
      requestAnimationFrame(() => {
        const resultCount = filteredRowCountRef.current
        console.debug('[CommandCenter:perf]', {
          attemptId: info.attemptId,
          mark: 'first-visible-renderer-frame',
          elapsedMs: Number((Date.now() - info.startedAt).toFixed(2)),
          resultCount,
        })
        if (resultCount > 0 && pendingFirstRowPaintRef.current === info) {
          pendingFirstRowPaintRef.current = null
          console.debug('[CommandCenter:perf]', {
            attemptId: info.attemptId,
            mark: 'first-result-row-paint',
            elapsedMs: Number((Date.now() - info.startedAt).toFixed(2)),
            resultCount,
          })
        }
      })
    }
  }, [resetOverlay, softResumeOverlay])

  useEffect(() => {
    // First mount: establish a clean home screen + index.
    resetOverlay()
    const offShown = window.commandCenter.onShown(handleOverlayShown)
    const offHidden = window.commandCenter.onHidden?.(() => {
      lastHiddenAtRef.current = Date.now()
    })
    return () => {
      offShown()
      offHidden?.()
    }
  }, [handleOverlayShown, resetOverlay])

  useEffect(() => {
    activeSearchQueryRef.current = input.trim()
    if (isNestedCommandView) return undefined
    const query = input.trim()
    const delay = query ? 90 : 0
    const timer = window.setTimeout(() => {
      void refreshIndex(query, false)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [input, isNestedCommandView, refreshIndex])

  useEffect(() => {
    if (isNestedCommandView) return undefined
    // Only re-poll while main still has in-flight icon extraction. Failed or
    // permanently missing icons must not restart this loop (that caused blink).
    const needsIconRefresh = index.apps.some(
      (app) => app.type === 'app' && app.iconPending === true
    )
    if (!needsIconRefresh) return undefined
    const timer = window.setTimeout(() => {
      void refreshIndex(input.trim(), false)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [index.apps, input, isNestedCommandView, refreshIndex])

  useEffect(() => {
    // Reset to the first row whenever the query or view changes, and keep the
    // highlight visible so the top result is pre-selected.
    setSelectedIndex(0)
    selectionTouchedRef.current = false
    selectedItemIdRef.current = null
    setSelectionVisible(true)
    setActionsOpen(false)
    setActionsHighlight(0)
  }, [commandView, input])

  // Close the in-panel Actions popover on outside click (no Radix portal).
  useEffect(() => {
    if (!actionsOpen) return undefined
    const onPointerDown = (event: PointerEvent) => {
      const root = actionsRootRef.current
      if (!root) return
      if (event.target instanceof Node && !root.contains(event.target)) {
        setActionsOpen(false)
        setActionsHighlight(0)
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [actionsOpen])

  const hideOverlay = useCallback(() => {
    // Remember that this renderer has been shown so every later reopen restores
    // the last screen while the permanent warm window remains alive.
    lastHiddenAtRef.current = Date.now()
    void window.commandCenter.hide()
  }, [])

  const executeItem = useCallback(
    async (item: CommandCenterIndexItem) => {
      if (item.type === 'action' && item.actionId === 'emoji-picker') {
        openEmojiView()
        return
      }
      if (item.type === 'action' && item.actionId === 'zura-ai-chats') {
        openChatsView()
        return
      }
      if (item.type === 'action' && item.actionId === 'layout') {
        openLayoutView()
        return
      }
      if (item.type === 'action' && item.actionId === 'settings') {
        openSettingsView()
        return
      }
      if (item.type === 'action' && item.actionId === 'zura-store') {
        openStoreView()
        return
      }
      if (item.type === 'action' && item.actionId === 'github-workspace') {
        openGitHubView()
        return
      }
      if (item.type === 'workflow') {
        if (item.workflow.steps.some((step) => step.type === 'ai')) {
          setError('AI workflow steps are temporarily unavailable in Command Center.')
          return
        }
        setConfirmingWorkflow(item)
        return
      }
      setError(null)
      setStatus(null)
      const query = input.trim()
      const result = await window.commandCenter.executeIndexItem(item.id, query)
      if (!result.success) {
        setError(result.error || 'Command failed.')
        return
      }
      if (result.aiPrompt) {
        setError('AI actions are temporarily unavailable in Command Center.')
        return
      }
      if (result.extension) {
        openExtensionView(
          result.extension.extensionId,
          result.extension.commandId,
          result.extension.hostCapability
        )
        return
      }
      // Launching an app or focusing a window: dismiss instantly and skip the
      // post-action index rebuild (which spawns PowerShell to re-enumerate
      // windows). The overlay would blur-close anyway once focus moves.
      if (item.type === 'app' || item.type === 'window') {
        void window.commandCenter.hide()
        return
      }
      if (item.type !== 'chat') {
        setStatus(`${item.title} complete.`)
        void refreshIndex(query, false)
      }
    },
    [
      input,
      openChatsView,
      openEmojiView,
      openLayoutView,
      openSettingsView,
      openStoreView,
      openGitHubView,
      openExtensionView,
      refreshIndex,
    ]
  )

  const insertEmoji = useCallback(async (entry: CommandCenterEmoji) => {
    setError(null)
    const result = await window.commandCenter.insertEmoji(entry.emoji)
    if (!result.success) {
      setError(result.error || 'Unable to insert the emoji.')
    }
  }, [])

  const runItemAction = useCallback(
    async (item: CommandCenterIndexItem, actionId: CommandCenterItemActionId) => {
      if (item.type !== 'app' && item.type !== 'file' && item.type !== 'folder') return
      setActionsOpen(false)
      setActionsHighlight(0)
      setError(null)
      setStatus(null)
      const query = input.trim()
      const result = await window.commandCenter.executeItemAction(item.id, actionId, query)
      if (!result.success) {
        setError(result.error || 'Action failed.')
        return
      }
      if (result.dismiss) {
        void window.commandCenter.hide()
        return
      }
      if (result.status) {
        setStatus(result.status)
      }
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    [input]
  )

  const openActionsMenu = useCallback(() => {
    setActionsHighlight(0)
    setActionsOpen(true)
  }, [])

  const closeActionsMenu = useCallback(() => {
    setActionsOpen(false)
    setActionsHighlight(0)
    requestAnimationFrame(() => (actionsTriggerRef.current ?? inputRef.current)?.focus())
  }, [])

  const runConfirmedWorkflow = useCallback(async () => {
    if (!confirmingWorkflow || confirmingWorkflow.type !== 'workflow') return
    const workflow = confirmingWorkflow.workflow
    setConfirmingWorkflow(null)
    setError(null)
    setStatus(null)
    const result = await window.commandCenter.executeWorkflow(workflow.id)
    if (!result.success) {
      setError(result.error || 'Workflow failed.')
      return
    }
    if (result.aiPrompt) {
      setError('AI workflow steps are temporarily unavailable in Command Center.')
      return
    }
    setStatus(`${workflow.name} complete.`)
    void refreshIndex()
  }, [confirmingWorkflow, refreshIndex])

  const submit = useCallback(() => {
    if (isEmojiView) {
      if (selectedEmoji) void insertEmoji(selectedEmoji)
      return
    }
    if (isChatsView) {
      if (selectedBrowseChat) void executeItem(selectedBrowseChat)
      return
    }
    if (isLayoutView) {
      if (selectedLayoutTool) void executeItem(selectedLayoutTool)
      return
    }
    if (isSettingsView) {
      if (selectedSettingsTool) void executeItem(selectedSettingsTool)
      return
    }
    if (isStoreView) return

    if (selectedItem) {
      void executeItem(selectedItem)
    }
  }, [
    executeItem,
    input,
    insertEmoji,
    isChatsView,
    isEmojiView,
    isLayoutView,
    isSettingsView,
    isStoreView,
    selectedBrowseChat,
    selectedEmoji,
    selectedLayoutTool,
    selectedSettingsTool,
    selectedItem,
  ])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (isGitHubView && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent('github-workspace:submit-sign-in'))
      return
    }
    if (event.key.startsWith('Arrow')) {
      selectionTouchedRef.current = true
      selectedItemIdRef.current = selectedItem?.id ?? null
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (actionsOpen) {
        closeActionsMenu()
        return
      }
      if (confirmingWorkflow) {
        setConfirmingWorkflow(null)
        return
      }
      if (isNestedCommandView) {
        closeCommandView()
        return
      }
      hideOverlay()
      return
    }
    if (isNestedCommandView && event.key === 'Backspace' && !input) {
      event.preventDefault()
      closeCommandView()
      return
    }
    // Raycast-style: Ctrl/Cmd+K opens the secondary Actions menu for apps.
    if (
      (event.key === 'k' || event.key === 'K') &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !isNestedCommandView &&
      (selectedItem?.type === 'app' ||
        selectedItem?.type === 'file' ||
        selectedItem?.type === 'folder')
    ) {
      event.preventDefault()
      if (actionsOpen) closeActionsMenu()
      else openActionsMenu()
      return
    }
    if (actionsOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActionsHighlight((current) =>
          Math.min(current + 1, Math.max(selectedAppActions.length - 1, 0))
        )
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActionsHighlight((current) => Math.max(current - 1, 0))
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const action = selectedAppActions[actionsHighlight]
        if (
          (selectedItem?.type === 'app' ||
            selectedItem?.type === 'file' ||
            selectedItem?.type === 'folder') &&
          action &&
          !('disabled' in action && action.disabled)
        ) {
          void runItemAction(selectedItem, action.id)
        }
        return
      }
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
      return
    }
    if (isEmojiView) {
      const count = emojiResults.length
      if (count === 0) return
      const cols = EMOJI_GRID_COLUMNS
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setSelectionVisible(true)
        setSelectedIndex((current) => Math.min(current + 1, count - 1))
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setSelectionVisible(true)
        setSelectedIndex((current) => Math.max(current - 1, 0))
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectionVisible(true)
        setSelectedIndex((current) => Math.min(current + cols, count - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectionVisible(true)
        setSelectedIndex((current) => Math.max(current - cols, 0))
        return
      }
      return
    }
    if (isChatsView || isLayoutView || isSettingsView) {
      const count = isChatsView
        ? chatBrowseResults.length
        : isLayoutView
          ? layoutBrowseResults.length
          : settingsBrowseResults.length
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectionVisible(true)
        setSelectedIndex((current) => Math.min(current + 1, Math.max(count - 1, 0)))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectionVisible(true)
        setSelectedIndex((current) => Math.max(current - 1, 0))
        return
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectionVisible(true)
      const rowCount = filteredRows.length
      setSelectedIndex((current) => Math.min(current + 1, Math.max(rowCount - 1, 0)))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectionVisible(true)
      setSelectedIndex((current) => Math.max(current - 1, 0))
    }
  }

  const footerActionLabel = ((): string => {
    if (isEmojiView) return 'Paste Emoji'
    if (isChatsView) return selectedBrowseChat ? 'Open Chat' : 'Search Chats'
    if (isLayoutView) return selectedLayoutTool ? 'Run Action' : 'Search Layout'
    if (isSettingsView) return selectedSettingsTool ? 'Open Settings' : 'Search Settings'
    if (isStoreView) return 'Browse Extensions'
    const item = selectedItem
    if (!item) return 'Search'
    switch (item.type) {
      case 'app':
        return item.existingWindow ? 'Focus Window' : 'Open Application'
      case 'workflow':
        return 'Run Workflow'
      case 'window':
        return 'Focus Window'
      case 'action':
        return INTERACTIVE_EXTRA_ACTION_IDS.has(item.actionId) ? 'Open Command' : 'Run Action'
      case 'chat':
        return 'Open Chat'
      default:
        return 'Open'
    }
  })()

  const selectedAppActions = useMemo(() => {
    if (!selectedItem) return []
    if (selectedItem.type === 'file' || selectedItem.type === 'folder') return FILE_ACTION_DEFS
    if (selectedItem.type !== 'app') return []
    return APP_ACTION_DEFS.filter((action) => action.available(selectedItem)).map((action) =>
      action.id === 'open' && selectedItem.existingWindow
        ? { ...action, label: 'Open Application' }
        : action
    )
  }, [selectedItem])

  const showAppActions = !isNestedCommandView && selectedAppActions.length > 0

  useEffect(() => {
    if (!showAppActions && actionsOpen) {
      setActionsOpen(false)
      setActionsHighlight(0)
    }
  }, [actionsOpen, showAppActions])

  useEffect(() => {
    if (actionsHighlight >= selectedAppActions.length) {
      setActionsHighlight(Math.max(selectedAppActions.length - 1, 0))
    }
  }, [actionsHighlight, selectedAppActions.length])

  useEffect(() => {
    if (!actionsOpen) return
    const frame = requestAnimationFrame(() => {
      const firstItem = actionsMenuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      )
      if (!firstItem) return
      const index = Number(firstItem.dataset.actionIndex ?? 0)
      setActionsHighlight(index)
      firstItem.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [actionsOpen])

  const handleActionsMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      actionsMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      ) ?? []
    )
    if (items.length === 0) return

    if (
      event.key === 'Escape' ||
      ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault()
      closeActionsMenu()
      return
    }

    const currentIndex = Math.max(items.indexOf(document.activeElement as HTMLButtonElement), 0)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    if (event.key === 'Tab') {
      nextIndex = event.shiftKey
        ? (currentIndex - 1 + items.length) % items.length
        : (currentIndex + 1) % items.length
    }
    if (nextIndex === null) return

    event.preventDefault()
    const nextItem = items[nextIndex]
    setActionsHighlight(Number(nextItem.dataset.actionIndex ?? 0))
    nextItem.focus()
    if (typeof nextItem.scrollIntoView === 'function') {
      nextItem.scrollIntoView({ block: 'nearest' })
    }
  }

  return (
    <div className="command-center-root">
      <div className={`command-center-panel ${actionsOpen ? 'has-actions-menu' : ''}`}>
        <div className="command-center-topbar">
          {isNestedCommandView && (
            <button
              type="button"
              className="command-center-back"
              onClick={closeCommandView}
              aria-label="Back to Command Center"
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <div
            className={`command-center-input-shell ${showGitHubCommitBar ? 'is-github-commit' : ''}`}
          >
            <input
              ref={(node) => {
                inputRef.current = node
              }}
              autoFocus
              value={showGitHubCommitBar ? githubSummary : input}
              readOnly={isGitHubView && !showGitHubCommitBar}
              maxLength={showGitHubCommitBar ? 10_000 : undefined}
              onChange={(event) => {
                if (showGitHubCommitBar) {
                  setGithubSummary(event.target.value)
                  return
                }
                handleInputChange(event.target.value)
              }}
              onKeyDown={(event) => {
                if (showGitHubCommitBar) {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.stopPropagation()
                    if (canGitHubCommit) runGitHubCommit()
                  }
                  return
                }
                handleKeyDown(event)
              }}
              placeholder={
                showGitHubCommitBar
                  ? githubCommitMeta.selectedCount
                    ? `Commit ${githubCommitMeta.selectedCount} selected file${githubCommitMeta.selectedCount === 1 ? '' : 's'}…`
                    : githubCommitMeta.changeCount
                      ? 'Check files to include in the commit…'
                      : 'Summary (required)'
                  : isEmojiView
                    ? 'Search emojis by name...'
                    : isChatsView
                      ? 'Search chats...'
                      : isLayoutView
                        ? 'Search layout actions...'
                        : isSettingsView
                          ? 'Search System Settings...'
                          : isGitHubView
                            ? 'GitHub Workspace'
                            : isExtensionView
                              ? 'Extension'
                              : isStoreView
                                ? 'Search extensions...'
                                : 'Search workflows, apps, windows...'
              }
              aria-label={
                showGitHubCommitBar
                  ? 'Commit message'
                  : isEmojiView
                    ? 'Search emojis'
                    : isChatsView
                      ? 'Search chats'
                      : isLayoutView
                        ? 'Search layout'
                        : isSettingsView
                          ? 'Search settings'
                          : isGitHubView
                            ? 'GitHub Workspace'
                            : isExtensionView
                              ? 'Extension'
                              : isStoreView
                                ? 'Search Zura Store'
                                : 'Search Command Center'
              }
              aria-controls={!showGitHubCommitBar ? 'command-center-results' : undefined}
              aria-activedescendant={
                !showGitHubCommitBar && selectedItem ? resultOptionId(selectedItem.id) : undefined
              }
              aria-autocomplete={!showGitHubCommitBar ? 'list' : undefined}
            />
            {showGitHubCommitBar && (
              <button
                type="button"
                className={`command-center-github-commit ${githubCommitMeta.committing ? 'is-busy' : ''}`}
                disabled={!canGitHubCommit}
                aria-label={githubCommitHint || githubCommitLabel}
                aria-busy={githubCommitMeta.committing || undefined}
                onClick={runGitHubCommit}
              >
                {githubCommitMeta.committing ? (
                  <RefreshCcw
                    size={14}
                    className="command-center-github-commit__spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ZuraCommitGlyph size={15} className="command-center-github-commit__glyph" />
                )}
                <span className="command-center-github-commit__label">{githubCommitLabel}</span>
                {canGitHubCommit && !githubCommitMeta.committing && (
                  <kbd className="command-center-github-commit__kbd" aria-hidden="true">
                    <CornerDownLeft size={11} />
                  </kbd>
                )}
              </button>
            )}
          </div>
          {isGitHubView && !githubSignedIn && (
            <span className="command-center-github-login-hint">
              <kbd>Enter</kbd>
              <span>to sign in</span>
            </span>
          )}
        </div>

        {searchSyntaxSuggestions.length > 0 && (
          <div className="command-center-filter-suggestions" aria-label="Search filters">
            {searchSyntaxSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  const parts = input.split(/\s+/)
                  parts[parts.length - 1] = suggestion
                  setInput(parts.join(' '))
                  requestAnimationFrame(() => inputRef.current?.focus())
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="command-center-body">
          <Suspense
            fallback={
              <CommandCenterSkeleton template="rows" label="Loading command" className="command-center-results" />
            }
          >
            {isEmojiView ? (
              <div
                className="command-center-results command-center-emoji-results"
                role="listbox"
                aria-label="Emoji results"
                ref={emojiScrollRef}
                onScroll={handleEmojiScroll}
              >
                <section className="command-center-group command-center-emoji-group">
                  <h2>
                    {!emojiCatalogReady
                      ? 'Emojis'
                      : input.trim()
                        ? `Search Results (${emojiResults.length})`
                        : `All Emojis (${emojiResults.length})`}
                  </h2>
                  {visibleEmojiResults.length > 0 ? (
                    <div
                      className="command-center-emoji-grid"
                      style={{ ['--emoji-grid-cols' as string]: EMOJI_GRID_COLUMNS }}
                    >
                      {visibleEmojiResults.map((entry, rowIndex) => {
                        const selected = selectionVisible && rowIndex === selectedIndex
                        return (
                          <button
                            key={entry.emoji}
                            type="button"
                            className={`command-center-emoji-cell ${selected ? 'selected' : ''}`}
                            aria-label={entry.name}
                            onClick={() => {
                              setSelectionVisible(true)
                              setSelectedIndex(rowIndex)
                              void insertEmoji(entry)
                            }}
                            role="option"
                            aria-selected={selected}
                          >
                            <span aria-hidden="true">{entry.emoji}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : !emojiCatalogReady ? (
                    <CommandCenterSkeleton template="emoji-grid" label="Loading emoji library" />
                  ) : (
                    <div className="command-center-empty">
                      {input.trim()
                        ? 'No emoji found. Try a feeling, object, or activity.'
                        : 'No emoji available.'}
                    </div>
                  )}
                  {emojiCatalogReady &&
                    visibleEmojiResults.length > 0 &&
                    visibleEmojiResults.length < emojiResults.length && (
                      <div className="command-center-emoji-more">
                        Showing {visibleEmojiResults.length} of {emojiResults.length} — scroll for
                        more
                      </div>
                    )}
                </section>
              </div>
            ) : isChatsView ? (
              <div className="command-center-results" role="listbox" aria-label="Zura AI Chats">
                <section className="command-center-group">
                  <h2>{input.trim() ? 'Search Results' : 'Recent'}</h2>
                  {chatBrowseResults.map((item, rowIndex) => {
                    const selected = selectionVisible && rowIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`command-center-result ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectionVisible(true)
                          setSelectedIndex(rowIndex)
                          requestAnimationFrame(() => inputRef.current?.focus())
                        }}
                        onDoubleClick={() => void executeItem(item)}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="command-center-result__icon">{iconForItem(item)}</span>
                        <span className="command-center-result__text">
                          <span>{item.title}</span>
                          {item.subtitle && <small>{item.subtitle}</small>}
                        </span>
                        <span className="command-center-result__hint">{item.hint}</span>
                      </button>
                    )
                  })}
                </section>
                {chatBrowseResults.length === 0 && (
                  <div className="command-center-empty">
                    {input.trim() ? 'No matching chats.' : 'No recent chats yet.'}
                  </div>
                )}
              </div>
            ) : isLayoutView ? (
              <div className="command-center-results" role="listbox" aria-label="Layout">
                <section className="command-center-group">
                  <h2>{input.trim() ? 'Search Results' : LAYOUT_GROUP}</h2>
                  {layoutBrowseResults.map((item, rowIndex) => {
                    const selected = selectionVisible && rowIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`command-center-result ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectionVisible(true)
                          setSelectedIndex(rowIndex)
                          requestAnimationFrame(() => inputRef.current?.focus())
                        }}
                        onDoubleClick={() => void executeItem(item)}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="command-center-result__icon">{iconForItem(item)}</span>
                        <span className="command-center-result__text">
                          <span>{item.title}</span>
                          {item.subtitle && <small>{item.subtitle}</small>}
                        </span>
                        <span className="command-center-result__hint">{item.hint}</span>
                      </button>
                    )
                  })}
                </section>
                {layoutBrowseResults.length === 0 && (
                  <div className="command-center-empty">No matching layout actions.</div>
                )}
              </div>
            ) : isSettingsView ? (
              <div className="command-center-results" role="listbox" aria-label="System Settings">
                <section className="command-center-group">
                  <h2>{input.trim() ? 'Search Results' : SETTINGS_GROUP}</h2>
                  {settingsBrowseResults.map((item, rowIndex) => {
                    const selected = selectionVisible && rowIndex === selectedIndex
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`command-center-result ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectionVisible(true)
                          setSelectedIndex(rowIndex)
                          requestAnimationFrame(() => inputRef.current?.focus())
                        }}
                        onDoubleClick={() => void executeItem(item)}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="command-center-result__icon">{iconForItem(item)}</span>
                        <span className="command-center-result__text">
                          <span>{item.title}</span>
                          {item.subtitle && <small>{item.subtitle}</small>}
                        </span>
                        <span className="command-center-result__hint">{item.hint}</span>
                      </button>
                    )
                  })}
                </section>
                {settingsBrowseResults.length === 0 && (
                  <div className="command-center-empty">No matching settings pages.</div>
                )}
              </div>
            ) : isGitHubView ? (
              <div className="command-center-github-host">
                <GitHubWorkspace
                  summary={githubSummary}
                  onSummaryChange={setGithubSummary}
                  onSignedInChange={setGitHubSignedIn}
                  onCommitMetaChange={setGithubCommitMeta}
                  commitHandlerRef={githubCommitHandlerRef}
                />
              </div>
            ) : isExtensionView && activeExtension ? (
              <CommandCenterExtensionHost
                extensionId={activeExtension.extensionId}
                commandId={activeExtension.commandId}
              />
            ) : isStoreView ? (
              <CommandCenterStore query={input} onOpenExtension={openExtensionView} />
            ) : (
              <div
                id="command-center-results"
                className="command-center-results"
                role="listbox"
                aria-label="Command Center results"
              >
                <span className="command-center-sr-only" role="status" aria-live="polite">
                  {filteredRows.length} result{filteredRows.length === 1 ? '' : 's'}
                </span>
                {appIndexWarning && (
                  <div className="command-center-index-warning">
                    Apps may be incomplete: {appIndexWarning}
                  </div>
                )}
                {index.diagnostics?.windowsSearch && !index.diagnostics.windowsSearch.ok && (
                  <div className="command-center-index-warning" role="status">
                    Windows file search is unavailable: {index.diagnostics.windowsSearch.error}
                  </div>
                )}
                {groupedRows.length > 0 ? (
                  groupedRows.map(([group, items]) => (
                    <section key={group} className="command-center-group">
                      <h2>{group}</h2>
                      {items.map((item) => {
                        const rowIndex = rowIndexById.get(item.id) ?? -1
                        const selected = selectionVisible && rowIndex === selectedIndex
                        return (
                          <button
                            key={item.id}
                            id={resultOptionId(item.id)}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`command-center-result ${selected ? 'selected' : ''}`}
                            onClick={() => {
                              // Single click selects the row (strong,
                              // persistent highlight) and returns focus to the
                              // input so keyboard actions (Enter to open,
                              // arrows to move) act on the selection. Hover is
                              // a separate CSS-only lighter highlight and no
                              // longer moves the selection.
                              setSelectionVisible(true)
                              selectionTouchedRef.current = true
                              selectedItemIdRef.current = item.id
                              setSelectedIndex(rowIndex)
                              requestAnimationFrame(() => inputRef.current?.focus())
                            }}
                            onDoubleClick={() => void executeItem(item)}
                            onContextMenu={(event) => {
                              // Right-click opens the app Actions menu (same as ⌃K).
                              if (
                                item.type !== 'app' &&
                                item.type !== 'file' &&
                                item.type !== 'folder'
                              )
                                return
                              event.preventDefault()
                              setSelectionVisible(true)
                              selectionTouchedRef.current = true
                              selectedItemIdRef.current = item.id
                              setSelectedIndex(rowIndex)
                              openActionsMenu()
                              requestAnimationFrame(() => inputRef.current?.focus())
                            }}
                          >
                            <span className="command-center-result__icon">{iconForItem(item)}</span>
                            <span className="command-center-result__text">
                              <span>{item.title}</span>
                              {item.subtitle && <small>{item.subtitle}</small>}
                            </span>
                            <span className="command-center-result__hint">{item.hint}</span>
                          </button>
                        )
                      })}
                    </section>
                  ))
                ) : indexLoading && filteredRows.length === 0 ? (
                  <CommandCenterSkeleton template="rows" label="Loading Command Center" />
                ) : input.trim() ? (
                  <div className="command-center-empty">No matching results.</div>
                ) : (
                  <div className="command-center-empty">No Command Center items found.</div>
                )}
              </div>
            )}
          </Suspense>
        </div>

        {!isGitHubView && (
          <footer className="command-center-footer">
            <span className="command-center-footer__brand">
              <img src="icon-mark.png" alt="" />
            </span>
            <div className="command-center-footer__actions" ref={actionsRootRef}>
              {isStoreView ? (
                <span className="command-center-footer__store-note">
                  Install support coming soon
                </span>
              ) : (
                <button
                  type="button"
                  className="command-center-footer__action"
                  onClick={submit}
                  aria-label={footerActionLabel}
                >
                  <span>{footerActionLabel}</span>
                  <kbd>
                    <CornerDownLeft size={12} />
                  </kbd>
                </button>
              )}
              {showAppActions &&
                selectedItem &&
                (selectedItem.type === 'app' ||
                  selectedItem.type === 'file' ||
                  selectedItem.type === 'folder') && (
                  <>
                    <div className="command-center-footer__separator" />
                    <button
                      ref={actionsTriggerRef}
                      type="button"
                      className={`command-center-footer__action command-center-footer__actions-btn ${actionsOpen ? 'is-open' : ''}`}
                      aria-label="Actions"
                      aria-haspopup="menu"
                      aria-expanded={actionsOpen}
                      aria-controls="command-center-actions-menu"
                      onClick={() => {
                        if (actionsOpen) closeActionsMenu()
                        else openActionsMenu()
                      }}
                    >
                      <span>Actions</span>
                      <kbd className="command-center-footer__chord">
                        <span>⌃</span>
                        <span>K</span>
                      </kbd>
                    </button>
                    {actionsOpen ? (
                      <div
                        ref={actionsMenuRef}
                        id="command-center-actions-menu"
                        className="command-center-actions-popover"
                        role="menu"
                        aria-label={`${selectedItem.title} actions`}
                        onKeyDown={handleActionsMenuKeyDown}
                      >
                        <div className="command-center-actions-popover__title">
                          <span
                            className="command-center-actions-popover__title-icon"
                            aria-hidden="true"
                          >
                            {iconForItem(selectedItem)}
                          </span>
                          <span className="command-center-actions-popover__title-label">
                            {selectedItem.title}
                          </span>
                        </div>
                        <div
                          className="command-center-actions-popover__separator"
                          role="separator"
                        />
                        <div className="command-center-actions-popover__list">
                          {selectedAppActions.map((action, index) => {
                            const prev = selectedAppActions[index - 1]
                            const getGroup = (id: string) => {
                              if (id === 'open' || id === 'focus-window') return 1
                              if (id === 'show-in-folder' || id === 'reveal-shortcut') return 2
                              if (id === 'add-to-favorite') return 3
                              if (
                                id === 'copy-name' ||
                                id === 'copy-path' ||
                                id === 'copy-dir' ||
                                id === 'copy-bundle-id'
                              ) {
                                return 4
                              }
                              if (id === 'force-quit') return 5
                              if (id === 'disable-application' || id === 'uninstall-application') {
                                return 6
                              }
                              return 7
                            }
                            const showSeparator = prev && getGroup(action.id) !== getGroup(prev.id)
                            const active = index === actionsHighlight
                            const disabled = 'disabled' in action && Boolean(action.disabled)
                            return (
                              <div key={action.id}>
                                {showSeparator ? (
                                  <div
                                    className="command-center-actions-popover__separator"
                                    role="separator"
                                  />
                                ) : null}
                                <button
                                  type="button"
                                  role="menuitem"
                                  data-action-index={index}
                                  tabIndex={active ? 0 : -1}
                                  disabled={disabled}
                                  aria-disabled={disabled || undefined}
                                  className={`command-center-actions-popover__item ${active ? 'is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                                  onMouseEnter={() => setActionsHighlight(index)}
                                  onClick={() => {
                                    if (disabled) return
                                    void runItemAction(selectedItem, action.id)
                                  }}
                                >
                                  <span className="command-center-actions-popover__icon">
                                    {action.icon}
                                  </span>
                                  <span className="command-center-actions-popover__label">
                                    {action.label}
                                  </span>
                                  {action.id === 'open' ? (
                                    <kbd className="command-center-actions-popover__shortcut">
                                      <CornerDownLeft size={12} />
                                    </kbd>
                                  ) : disabled ? (
                                    <span className="command-center-actions-popover__soon">
                                      Soon
                                    </span>
                                  ) : null}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
            </div>
          </footer>
        )}

        {(error || status) && (
          <div className={`command-center-status ${error ? 'error' : ''}`}>{error || status}</div>
        )}
      </div>

      {confirmingWorkflow && confirmingWorkflow.type === 'workflow' && (
        <div className="command-center-confirm">
          <div>
            <Sparkles size={18} />
            <strong>Run {confirmingWorkflow.workflow.name}?</strong>
            <span>{confirmingWorkflow.workflow.steps.length} step workflow</span>
          </div>
          <button type="button" onClick={() => setConfirmingWorkflow(null)}>
            Cancel
          </button>
          <button type="button" onClick={() => void runConfirmedWorkflow()}>
            <Check size={15} />
            Run
          </button>
        </div>
      )}

      <style>{`
        html, body, #root {
          width: 100%;
          height: 100%;
          margin: 0;
          overflow: hidden;
        }

        html, body {
          background: transparent;
        }

        /*
         * Desktop blur is provided by the native window material (Windows
         * acrylic / macOS vibrancy), so we no longer stack a heavy CSS
         * backdrop-filter here (it can't blur the desktop through a
         * non-transparent window anyway and just wastes GPU). This is a thin
         * tint over the material for contrast/depth. A light backdrop-filter
         * is kept as a graceful fallback for platforms without a native
         * material (e.g. Linux, or when transparency effects are disabled).
         */
        #root {
          background: rgba(10, 10, 14, 0.62);
          backdrop-filter: saturate(116%) brightness(0.94);
          -webkit-backdrop-filter: saturate(116%) brightness(0.94);
        }

        .command-center-root {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: rgba(255, 244, 248, 0.92);
        }

        .command-center-panel {
          position: relative;
          width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
          border-radius: 0;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: transparent;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.18),
            inset 0 -1px 0 rgba(0, 0, 0, 0.48),
            0 28px 90px rgba(0, 0, 0, 0.52);
          transition: height 180ms ease, width 180ms ease;
        }

        .command-center-panel.is-chat {
          height: 100vh;
        }

        .command-center-topbar {
          position: relative;
          z-index: 1;
          flex: 0 0 auto;
          height: 56px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 10px 0 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03);
        }

        .command-center-brand {
          flex: 0 0 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          color: rgba(255, 231, 238, 0.72);
          font-size: 14px;
          font-weight: 600;
        }

        .command-center-logo {
          width: 21px;
          height: 21px;
          object-fit: contain;
          display: block;
          transform: translateY(1px);
        }

        .command-center-back {
          flex: 0 0 30px;
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: rgba(255, 241, 246, 0.62);
          font: inherit;
          cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease;
        }

        .command-center-back:hover,
        .command-center-back:focus-visible {
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 249, 251, 0.94);
          outline: none;
        }

        .command-center-back span {
          display: block;
          font-size: 26px;
          font-weight: 300;
          line-height: 1;
          transform: translateY(-1px);
        }

        .command-center-github-login-hint { flex: none; display: inline-flex; align-items: center; gap: 6px; margin-right: 10px; color: rgba(255,231,238,.42); font-size: 10px; white-space: nowrap; }
        .command-center-github-login-hint kbd { padding: 3px 5px; border: 1px solid rgba(255,255,255,.1); border-radius: 4px; background: rgba(255,255,255,.045); color: rgba(255,239,244,.62); font: inherit; font-size: 8px; font-weight: 600; }

        .command-center-input-shell.is-github-commit {
          padding-right: 6px;
          gap: 10px;
        }

        /* Primary commit action — stable width, Enter hint, busy spinner. */
        .command-center-input-shell button.command-center-github-commit {
          flex: none;
          width: auto;
          min-width: 7.5rem;
          height: 32px;
          gap: 7px;
          padding: 0 10px 0 12px;
          border: 1px solid color-mix(in srgb, var(--theme-accent) 55%, transparent);
          border-radius: 8px;
          background: var(--theme-accent);
          color: var(--theme-text-inverse);
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.01em;
          white-space: nowrap;
          box-shadow: none;
          transition:
            background 120ms ease,
            border-color 120ms ease,
            opacity 120ms ease;
        }

        .command-center-input-shell button.command-center-github-commit:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--theme-accent-hover, var(--theme-accent)) 70%, transparent);
          background: var(--theme-accent-hover, var(--theme-accent));
        }

        .command-center-input-shell button.command-center-github-commit:focus-visible {
          outline: 2px solid var(--theme-accent-muted);
          outline-offset: 2px;
        }

        .command-center-input-shell button.command-center-github-commit:disabled {
          opacity: 0.5;
          cursor: default;
          border-color: var(--theme-border);
          background: var(--theme-surface-subtle);
          color: var(--theme-text-muted);
          box-shadow: none;
        }

        .command-center-input-shell button.command-center-github-commit.is-busy:disabled {
          opacity: 0.92;
          border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
          background: color-mix(in srgb, var(--theme-accent) 78%, var(--theme-surface));
          color: var(--theme-text-inverse);
          cursor: progress;
        }

        .command-center-github-commit__label {
          min-width: 3.6rem;
          text-align: left;
        }

        .command-center-github-commit__glyph {
          flex: none;
          color: currentColor;
        }

        .command-center-github-commit__kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 18px;
          margin-left: 2px;
          padding: 0 4px;
          border-radius: 4px;
          border: 1px solid color-mix(in srgb, var(--theme-text-inverse) 22%, transparent);
          background: color-mix(in srgb, var(--theme-text-inverse) 14%, transparent);
          color: inherit;
          opacity: 0.9;
        }

        .command-center-github-commit__spin {
          animation: command-center-github-spin 0.85s linear infinite;
        }

        @keyframes command-center-github-spin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .command-center-github-commit__spin { animation: none; }
        }

        .command-center-input-shell button,
        .command-center-confirm button {
          border: 0;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .command-center-body {
          position: relative;
          z-index: 1;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .command-center-github-host {
          flex: 1 1 auto;
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .command-center-github-host > * {
          flex: 1 1 auto;
          min-height: 0;
        }

        .command-center-filter-suggestions {
          display: flex;
          gap: 6px;
          padding: 0 18px 9px;
          overflow: hidden;
        }

        .command-center-filter-suggestions button {
          border: 0;
          border-radius: 5px;
          padding: 3px 7px;
          color: rgba(246, 233, 238, 0.76);
          background: rgba(255, 255, 255, 0.055);
          font: inherit;
          font-size: 11px;
          cursor: pointer;
        }

        .command-center-filter-suggestions button:hover,
        .command-center-filter-suggestions button:focus-visible {
          color: rgba(255, 246, 249, 0.96);
          background: rgba(214, 116, 148, 0.16);
          outline: none;
        }

        .command-center-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .command-center-footer {
          position: relative;
          flex: 0 0 auto;
          z-index: 5;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px 0 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .command-center-footer__brand {
          display: inline-flex;
          align-items: center;
          opacity: 0.5;
        }

        .command-center-footer__brand img {
          width: 18px;
          height: 18px;
          object-fit: contain;
          display: block;
        }

        .command-center-footer__actions {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 2px;
        }

        .command-center-footer__separator {
          width: 1px;
          height: 14px;
          background: rgba(255, 255, 255, 0.15);
          margin: 0 4px;
        }

        .command-center-footer__action {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 28px;
          padding: 0 8px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: rgba(255, 241, 246, 0.74);
          font: inherit;
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease;
        }

        .command-center-footer__action:hover,
        .command-center-footer__action.is-open {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 249, 251, 0.92);
        }

        .command-center-footer__store-note {
          padding-right: 8px;
          color: rgba(255, 231, 238, 0.42);
          font-size: 12px;
        }

        .command-center-footer__action kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
          min-width: 20px;
          height: 19px;
          padding: 0 4px;
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.13);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10);
          color: rgba(255, 246, 249, 0.82);
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
        }

        .command-center-footer__action kbd svg {
          display: block;
        }

        .command-center-footer__chord span {
          display: inline-block;
        }

        /* Dense neutral acrylic: quiet translucency, no decorative glare or exterior shadow. */
        .command-center-actions-popover {
          position: absolute;
          right: 0;
          bottom: calc(100% + 6px);
          z-index: 30;
          width: min(260px, calc(100vw - 24px));
          height: min(360px, calc(100vh - 72px));
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          padding: 4px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(38, 38, 40, 0.90);
          color: rgba(255, 255, 255, 0.92);
          box-shadow: none;
          backdrop-filter: blur(32px) saturate(118%) brightness(0.88);
          -webkit-backdrop-filter: blur(32px) saturate(118%) brightness(0.88);
        }

        .command-center-actions-popover__title {
          display: flex;
          align-items: center;
          gap: 7px;
          min-width: 0;
          padding: 7px 10px 5px;
          color: rgba(255, 255, 255, 0.42);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .command-center-actions-popover__title-icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          overflow: hidden;
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.52);
        }

        .command-center-actions-popover__title-icon .command-center-result__app-icon,
        .command-center-actions-popover__title-icon svg {
          width: 18px;
          height: 18px;
        }

        .command-center-actions-popover__title-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .command-center-actions-popover__list {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
        }

        .command-center-actions-popover__list::-webkit-scrollbar {
          width: 4px;
        }

        .command-center-actions-popover__list::-webkit-scrollbar-track {
          background: transparent;
        }

        .command-center-actions-popover__list::-webkit-scrollbar-thumb {
          min-height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.24);
        }

        .command-center-actions-popover__separator {
          height: 1px;
          margin: 4px 8px;
          background: rgba(255, 255, 255, 0.08);
        }

        .command-center-actions-popover__item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 32px;
          margin: 0;
          padding: 0 10px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: rgba(255, 255, 255, 0.90);
          font: inherit;
          font-size: 13px;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
        }

        .command-center-actions-popover__item:hover,
        .command-center-actions-popover__item.is-active {
          background: rgba(255, 255, 255, 0.075);
          color: #fff;
        }

        .command-center-actions-popover__item.is-disabled,
        .command-center-actions-popover__item.is-disabled:hover,
        .command-center-actions-popover__item.is-disabled.is-active {
          opacity: 0.42;
          cursor: not-allowed;
          background: transparent;
          color: rgba(255, 241, 246, 0.55);
        }

        .command-center-actions-popover__soon {
          margin-left: auto;
          padding-left: 10px;
          color: rgba(255, 231, 238, 0.38);
          font-size: 11px;
          font-weight: 500;
        }

        .command-center-actions-popover__icon {
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.55);
          flex: 0 0 auto;
        }

        .command-center-actions-popover__item.is-active .command-center-actions-popover__icon,
        .command-center-actions-popover__item:hover .command-center-actions-popover__icon {
          color: rgba(255, 255, 255, 0.88);
        }

        .command-center-actions-popover__label {
          flex: 1 1 auto;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .command-center-actions-popover__shortcut {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 16px;
          margin-left: 8px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: rgba(255, 255, 255, 0.38);
          flex: 0 0 auto;
        }

        .command-center-actions-popover__shortcut svg {
          display: block;
        }

        .command-center-input-shell {
          flex: 1;
          min-width: 180px;
          height: 34px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 4px 0 10px;
          border-radius: 7px;
          background: transparent;
          border: 1px solid transparent;
          box-shadow: none;
          color: rgba(255, 231, 238, 0.64);
        }

        .command-center-panel.is-chat .command-center-input-shell {
          background: rgba(255, 255, 255, 0.10);
          border-color: rgba(255, 255, 255, 0.13);
        }

        .command-center-input-shell input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: rgba(255, 245, 248, 0.96);
          font-size: 15px;
          letter-spacing: 0.005em;
          caret-color: rgba(255, 190, 214, 0.95);
        }

        .command-center-input-shell input::placeholder {
          color: rgba(255, 231, 238, 0.42);
        }

        .command-center-input-shell button {
          width: 30px;
          height: 30px;
          border-radius: 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.14);
        }

        .command-center-results {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 8px 8px 14px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.34) transparent;
        }

        .command-center-panel.has-actions-menu .command-center-results {
          overflow: hidden;
          overscroll-behavior: none;
          touch-action: none;
        }

        .command-center-results::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }

        .command-center-results::-webkit-scrollbar-track {
          background: transparent;
        }

        .command-center-results::-webkit-scrollbar-thumb {
          min-height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.28);
        }

        .command-center-results::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.42);
        }

        .command-center-group {
          display: flex;
          flex-direction: column;
          gap: 1px;
          margin-bottom: 12px;
        }

        .command-center-group h2 {
          margin: 0 0 4px;
          padding: 0 10px;
          color: rgba(255, 231, 238, 0.40);
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.01em;
        }

        .command-center-result {
          width: 100%;
          min-height: 40px;
          display: grid;
          grid-template-columns: 28px minmax(0, 1fr) auto;
          align-items: center;
          column-gap: 10px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: rgba(255, 241, 246, 0.78);
          text-align: left;
          padding: 0 10px;
          font: inherit;
          cursor: pointer;
          transition: background-color 110ms ease, color 110ms ease;
        }

        .command-center-result:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 249, 251, 0.94);
        }

        .command-center-result.selected {
          background: rgba(255, 255, 255, 0.095);
          color: rgba(255, 250, 252, 0.98);
        }

        .command-center-result__icon {
          width: 22px;
          height: 22px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 221, 231, 0.60);
          overflow: hidden;
          border-radius: 5px;
          background: transparent;
        }

        .command-center-result__icon svg {
          width: 19px;
          height: 19px;
          display: block;
          flex: 0 0 auto;
        }

        .command-center-result__app-icon {
          width: 22px;
          height: 22px;
          display: block;
          flex: 0 0 auto;
          object-fit: contain;
          border-radius: 5px;
          /* Avoid decode flash when the same icon re-renders after index refresh. */
          content-visibility: auto;
          background: transparent;
        }

        .command-center-emoji-group {
          gap: 8px;
        }

        .zura-store {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 20px 22px 18px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
        }

        .zura-store::-webkit-scrollbar {
          width: 4px;
        }

        .zura-store::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.28);
        }

        .zura-store-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin: 0 2px 17px;
        }

        .zura-store-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: rgba(255, 203, 220, 0.66);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .zura-store-heading h1 {
          margin: 4px 0 2px;
          color: rgba(255, 248, 250, 0.97);
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.025em;
          line-height: 1.05;
        }

        .zura-store-heading p {
          margin: 0;
          color: rgba(255, 231, 238, 0.48);
          font-size: 12.5px;
          line-height: 1.4;
        }

        .zura-store-preview-badge {
          flex: 0 0 auto;
          margin-top: 3px;
          padding: 4px 8px;
          border: 1px solid rgba(255, 219, 229, 0.13);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 227, 235, 0.54);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .zura-store-featured {
          position: relative;
          isolation: isolate;
          min-height: 118px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 130px;
          gap: 22px;
          align-items: center;
          overflow: hidden;
          margin-bottom: 16px;
          padding: 16px 17px 16px 19px;
          border: 1px solid rgba(84, 243, 142, 0.16);
          border-radius: 12px;
          background: rgba(18, 42, 28, 0.55);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .zura-store-featured__wash {
          position: absolute;
          z-index: -1;
          inset: 0;
          background:
            radial-gradient(circle at 86% 44%, rgba(30, 215, 96, 0.22), transparent 31%),
            linear-gradient(105deg, rgba(11, 19, 14, 0.22), transparent 68%);
          pointer-events: none;
        }

        .zura-store-featured__label {
          color: rgba(169, 255, 199, 0.62);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .zura-store-featured__copy h2 {
          margin: 3px 0 3px;
          color: rgba(243, 255, 247, 0.96);
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.015em;
        }

        .zura-store-featured__copy p {
          margin: 0;
          color: rgba(221, 248, 229, 0.58);
          font-size: 11.5px;
          line-height: 1.4;
        }

        .zura-store-capabilities {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 9px;
        }

        .zura-store-capabilities span {
          padding: 3px 6px;
          border-radius: 5px;
          background: rgba(231, 255, 239, 0.07);
          color: rgba(218, 255, 231, 0.57);
          font-size: 9.5px;
        }

        .zura-store-featured__action {
          display: grid;
          grid-template-columns: auto 1fr;
          align-items: center;
          gap: 8px;
          padding-left: 14px;
          border-left: 1px solid rgba(209, 255, 225, 0.11);
        }

        .zura-store-featured__action strong {
          color: rgba(242, 255, 247, 0.92);
          font-size: 13px;
          font-weight: 600;
        }

        .zura-store-featured__action button {
          grid-column: 1 / -1;
          height: 28px;
          border: 1px solid rgba(218, 255, 231, 0.13);
          border-radius: 7px;
          background: rgba(230, 255, 239, 0.08);
          color: rgba(222, 255, 234, 0.53);
          font: inherit;
          font-size: 10.5px;
          font-weight: 600;
          cursor: not-allowed;
        }

        .zura-store-icon {
          --store-accent: #f1d6df;
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          border-radius: 9px;
          background: color-mix(in srgb, var(--store-accent) 16%, rgba(24, 18, 21, 0.92));
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--store-accent) 24%, transparent);
          color: var(--store-accent);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        .zura-store-icon.is-large {
          width: 40px;
          height: 40px;
          border-radius: 50%;
        }

        .zura-store-icon--spotify {
          background: var(--store-accent);
          box-shadow: none;
        }

        .zura-store-icon--spotify svg {
          width: 24px;
          height: 24px;
          fill: none;
          stroke: rgba(7, 30, 15, 0.92);
          stroke-width: 2.1;
          stroke-linecap: round;
        }

        .zura-store-icon--github {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 28% 18%, rgba(193, 220, 255, 0.42), transparent 42%),
            linear-gradient(145deg, #4579c8 0%, #234a91 55%, #152d62 100%);
          box-shadow:
            inset 0 0 0 1px rgba(202, 225, 255, 0.24),
            0 5px 14px rgba(7, 21, 55, 0.32);
          color: rgba(246, 250, 255, 0.96);
        }

        .zura-store-icon--github svg {
          position: relative;
          z-index: 1;
          width: 21px;
          height: 21px;
          fill: currentColor;
          filter: drop-shadow(0 1px 3px rgba(4, 14, 38, 0.42));
        }

        .zura-store-filterbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 0 2px 9px;
        }

        .zura-store-categories {
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .zura-store-categories button {
          height: 25px;
          padding: 0 8px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: rgba(255, 231, 238, 0.42);
          font: inherit;
          font-size: 10.5px;
          cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease;
        }

        .zura-store-categories button:hover,
        .zura-store-categories button.is-active {
          background: rgba(255, 255, 255, 0.07);
          color: rgba(255, 244, 247, 0.83);
        }

        .zura-store-categories button:focus-visible {
          outline: 1px solid rgba(255, 210, 223, 0.48);
          outline-offset: 1px;
        }

        .zura-store-count {
          color: rgba(255, 231, 238, 0.32);
          font-size: 10.5px;
          white-space: nowrap;
        }

        .zura-store-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1px 12px;
        }

        .zura-store-row {
          min-width: 0;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 10px 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }

        .zura-store-row--github {
          position: relative;
          overflow: hidden;
          margin-block: 3px;
          padding-inline: 10px;
          border: 1px solid rgba(126, 174, 245, 0.17);
          border-radius: 9px;
          background:
            radial-gradient(circle at 8% 8%, rgba(107, 166, 255, 0.18), transparent 38%),
            linear-gradient(112deg, rgba(43, 85, 154, 0.25), rgba(20, 40, 80, 0.12) 62%, rgba(14, 26, 52, 0.04));
        }

        .zura-store-row--github .zura-store-row__title span {
          color: rgba(184, 212, 255, 0.5);
        }

        .zura-store-row--github p {
          color: rgba(183, 211, 255, 0.7);
          font-weight: 600;
          letter-spacing: 0.01em;
        }

        .zura-store-row__copy {
          min-width: 0;
        }

        .zura-store-row__title {
          display: flex;
          align-items: baseline;
          gap: 6px;
          min-width: 0;
        }

        .zura-store-row h2 {
          overflow: hidden;
          margin: 0;
          color: rgba(255, 244, 247, 0.88);
          font-size: 12.5px;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .zura-store-row__title span {
          color: rgba(255, 231, 238, 0.31);
          font-size: 9px;
          white-space: nowrap;
        }

        .zura-store-row p {
          display: -webkit-box;
          overflow: hidden;
          margin: 2px 0 0;
          color: rgba(255, 231, 238, 0.43);
          font-size: 10.5px;
          line-height: 1.35;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .zura-store-row > button {
          height: 24px;
          padding: 0 7px;
          border: 0;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 231, 238, 0.35);
          font: inherit;
          font-size: 9.5px;
          font-weight: 600;
          cursor: not-allowed;
        }

        .zura-store-row__actions { display: flex; align-items: center; gap: 5px; }
        .zura-store-row__actions button { height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: rgba(201, 146, 131, 0.14); color: rgba(255, 239, 234, 0.82); font: inherit; font-size: 9.5px; font-weight: 600; cursor: pointer; }
        .zura-store-row__actions button:hover:not(:disabled), .zura-store-row__actions button:focus-visible { background: rgba(201, 146, 131, 0.24); outline: none; }
        .zura-store-row__actions button:disabled { opacity: .55; cursor: default; }

        .zura-store-runtime-error {
          display: flex; align-items: center; gap: 6px; margin: 0 2px 9px; padding: 7px 9px;
          border: 1px solid rgba(225, 112, 102, .18); border-radius: 7px;
          background: rgba(160, 62, 62, .1); color: rgba(255, 190, 181, .84); font-size: 10px;
        }
        .zura-store-review {
          display: grid; grid-template-columns: minmax(130px,.75fr) minmax(220px,1.3fr) auto;
          align-items: center; gap: 13px; margin: 0 2px 10px; padding: 10px 12px;
          border: 1px solid rgba(201,146,131,.22); border-radius: 9px;
          background: rgba(201,146,131,.075);
        }
        .zura-store-review>div:first-child { display:flex; flex-direction:column; gap:2px; }
        .zura-store-review>div:first-child span,.zura-store-review small { color:var(--theme-text-muted); font-size:9px; }
        .zura-store-review>div:first-child strong { font-size:12px; }
        .zura-store-review ul { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px 10px; margin:0; padding:0; list-style:none; color:var(--theme-text-secondary); font-size:9.5px; }
        .zura-store-review li { display:flex; align-items:center; gap:4px; }
        .zura-store-review__actions { display:flex; gap:5px; }
        .zura-store-review button,.zura-store-dev-import,.zura-store-row__details>button { height:26px; padding:0 8px; border:0; border-radius:6px; background:rgba(255,255,255,.065); color:var(--theme-text-secondary); font:inherit; font-size:9.5px; cursor:pointer; }
        .zura-store-list { grid-template-columns:1fr; gap:6px; }
        .zura-store-row { grid-template-columns:minmax(0,1fr) auto; gap:6px; padding:7px; border:1px solid rgba(255,255,255,.055); border-radius:9px; }
        .zura-store-row > .zura-store-row__summary { min-width:0; height:auto; display:grid; grid-template-columns:38px minmax(0,1fr) auto; align-items:center; gap:10px; padding:3px; border:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
        .zura-store-row__summary .zura-store-icon { width:38px; height:38px; padding:0; overflow:hidden; }
        .zura-store-row__summary .zura-store-icon img { width:100%; height:100%; object-fit:cover; }
        .zura-store-row__copy { display:flex; flex-direction:column; gap:3px; }
        .zura-store-row__title strong { color:var(--theme-text-primary); font-size:12px; }
        .zura-store-row__title em { color:var(--theme-text-muted); font-size:9px; font-style:normal; }
        .zura-store-row__copy small { overflow:hidden; color:var(--theme-text-muted); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
        .zura-store-trust { padding:2px 5px; border-radius:5px; background:rgba(255,255,255,.05); color:var(--theme-text-muted); font-size:8.5px; text-transform:capitalize; }
        .zura-store-trust.is-reviewed { background:rgba(108,177,139,.1); color:rgba(174,225,194,.72); }
        .zura-store-trust.is-development { background:rgba(212,159,90,.1); color:rgba(240,199,143,.75); }
        .zura-store-row__actions { justify-self:end; }
        .zura-store-row__details { grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:9px 10px 5px; border-top:1px solid rgba(255,255,255,.06); color:var(--theme-text-muted); font-size:9.5px; }
        .zura-store-row__details dl { display:grid; gap:4px; margin:0; }
        .zura-store-row__details dl div { display:grid; grid-template-columns:60px 1fr; gap:6px; }
        .zura-store-row__details dt { color:rgba(255,231,238,.34); }
        .zura-store-row__details dd { margin:0; color:var(--theme-text-secondary); overflow-wrap:anywhere; }
        .zura-store-row__details strong { color:var(--theme-text-secondary); }
        .zura-store-row__details ul { margin:4px 0 0; padding-left:14px; }
        .zura-store-validation { grid-column:1/-1; display:flex; gap:5px; color:rgba(255,180,169,.8); }

        .zura-store-empty {
          min-height: 104px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: rgba(255, 231, 238, 0.4);
          text-align: center;
        }

        .zura-store-empty strong {
          color: rgba(255, 244, 247, 0.7);
          font-size: 12px;
        }

        .zura-store-empty span {
          font-size: 10.5px;
        }

        .zura-store-note {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin: 12px 2px 0;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          color: rgba(255, 231, 238, 0.35);
          font-size: 9.5px;
        }

        .zura-store-note span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        @media (max-width: 680px) {
          .zura-store-list {
            grid-template-columns: 1fr;
          }

          .zura-store-categories button {
            padding-inline: 6px;
          }
        }

        .command-center-result__emoji-icon {
          font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .command-center-emoji-results {
          display: flex;
          flex-direction: column;
        }

        .command-center-emoji-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .command-center-emoji-grid {
          display: grid;
          grid-template-columns: repeat(var(--emoji-grid-cols, 9), minmax(0, 1fr));
          gap: 6px;
          padding: 0 6px 8px;
        }

        .command-center-emoji-cell {
          width: 100%;
          aspect-ratio: 1;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.03);
          color: inherit;
          padding: 0;
          font: inherit;
          cursor: pointer;
          transition: background-color 110ms ease;
        }

        .command-center-emoji-cell span {
          font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
          font-size: 28px;
          line-height: 1;
          user-select: none;
        }

        .command-center-emoji-cell:hover {
          background: rgba(255, 255, 255, 0.07);
        }

        .command-center-emoji-cell.selected {
          background: rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 0 0 1px rgba(255, 210, 222, 0.22);
        }

        .command-center-emoji-more {
          padding: 4px 10px 10px;
          color: rgba(255, 231, 238, 0.38);
          font-size: 11.5px;
        }

        .command-center-result__text {
          min-width: 0;
          display: flex;
          flex-direction: row;
          align-items: baseline;
          gap: 8px;
          line-height: 1.2;
        }

        .command-center-result__text span,
        .command-center-result__text small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .command-center-result__text span {
          flex: 0 1 auto;
          font-size: 13.5px;
          font-weight: 500;
          letter-spacing: 0.005em;
        }

        .command-center-result__text small {
          flex: 0 1 auto;
          min-width: 0;
          color: rgba(255, 231, 238, 0.42);
          font-size: 13px;
        }

        .command-center-result__hint {
          justify-self: end;
          padding-left: 12px;
          color: rgba(255, 231, 238, 0.34);
          font-size: 12.5px;
          font-weight: 400;
          transition: color 130ms ease;
        }

        .command-center-result.selected .command-center-result__hint {
          color: rgba(255, 231, 238, 0.55);
        }

        .command-center-empty {
          color: rgba(255, 231, 238, 0.56);
        }

        .command-center-empty {
          padding: 32px 10px;
          font-size: 14px;
        }

        .command-center-index-warning {
          margin: 0 0 14px;
          padding: 8px 10px;
          border-radius: 7px;
          background: rgba(255, 194, 205, 0.10);
          color: rgba(255, 210, 220, 0.86);
          font-size: 12px;
          line-height: 1.35;
        }

        .command-center-confirm button {
          min-height: 30px;
          border-radius: 7px;
          padding: 0 11px;
          background: rgba(255, 255, 255, 0.13);
          color: rgba(255, 241, 246, 0.78);
        }

        .command-center-status {
          position: absolute;
          z-index: 2;
          left: 18px;
          right: 18px;
          bottom: 12px;
          color: rgba(211, 255, 225, 0.82);
          font-size: 12px;
          pointer-events: none;
        }

        .command-center-status.error {
          color: rgba(255, 194, 205, 0.94);
        }

        .command-center-confirm {
          position: absolute;
          z-index: 5;
          left: 50%;
          bottom: 28px;
          transform: translateX(-50%);
          width: min(520px, calc(100vw - 44px));
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 10px;
          align-items: center;
          padding: 12px;
          border-radius: 8px;
          background: rgba(38, 18, 30, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.38);
        }

        .command-center-confirm div {
          min-width: 0;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 3px 9px;
          align-items: center;
        }

        .command-center-confirm strong,
        .command-center-confirm span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .command-center-confirm span {
          grid-column: 2;
          color: rgba(255, 231, 238, 0.54);
          font-size: 12px;
        }

        @media (prefers-reduced-motion: reduce) {
          .command-center-panel {
            transition: none;
          }
        }
      `}</style>
    </div>
  )
}
