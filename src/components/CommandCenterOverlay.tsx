import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Brain,
  Check,
  Clipboard,
  Command,
  Copy,
  CornerDownLeft,
  ExternalLink,
  FolderOpen,
  MessageSquare,
  Monitor,
  Sparkles,
  X,
} from 'lucide-react'

import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useStreamingState } from '../contexts/StreamingContext'
import { MessageRenderer } from './Dashboard/ChatArea/MessageRenderer'
import { StreamingMessage } from './Dashboard/ChatArea/StreamingMessage'
import { useStreamingChat } from './Dashboard/ChatArea/hooks'
import { scoreAppSearch, scoreGenericSearch, scoreWindowSearch } from '../commandCenter/search'
import { searchCommandCenterEmojis, type CommandCenterEmoji } from '../commandCenter/emojis'
import type {
  CommandCenterIndex,
  CommandCenterIndexItem,
  CommandCenterItemActionId,
} from '../electron/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

type Mode = 'search' | 'ask'
type CommandView = 'root' | 'emojis'

type AppActionDef = {
  id: CommandCenterItemActionId
  label: string
  icon: React.ReactNode
  /** When false, the action is omitted for this item. */
  available: (item: Extract<CommandCenterIndexItem, { type: 'app' }>) => boolean
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
    id: 'copy-path',
    label: 'Copy Path',
    icon: <Clipboard size={15} />,
    available: (item) => Boolean(appPathCandidate(item)),
  },
  {
    id: 'copy-name',
    label: 'Copy Name',
    icon: <Copy size={15} />,
    available: () => true,
  },
]

function appPathCandidate(item: Extract<CommandCenterIndexItem, { type: 'app' }>): string | undefined {
  for (const candidate of [item.targetPath, item.shortcutPath, item.appPath]) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) return trimmed
  }
  return undefined
}

const motionEase = [0.22, 1, 0.36, 1] as const

const EMPTY_INDEX: CommandCenterIndex = {
  workflows: [],
  apps: [],
  windows: [],
  actions: [],
  chats: [],
}

// Fixed group order for the results list (keeps section headers stable).
const GROUP_ORDER = [
  'Saved Workflows',
  'Apps',
  'Windows',
  'Actions',
  'Chats',
  'Additional',
] as const

// Max rows rendered per group. Apps is the group that can grow into the
// hundreds, so it is capped hardest; the rest are already small.
const DEFAULT_GROUP_LIMIT = 20
const GROUP_RESULT_LIMITS: Record<string, number> = {
  'Saved Workflows': 12,
  Apps: 40,
  Windows: 12,
  Actions: 24,
  Chats: 8,
  Additional: 12,
}
// Apps shown in the default browse view (before the user types a query).
const DEFAULT_BROWSE_APP_LIMIT = 8

function flattenIndex(
  index: CommandCenterIndex
): Array<{ group: string; item: CommandCenterIndexItem }> {
  return [
    ...index.workflows.map((item) => ({ group: 'Saved Workflows', item })),
    ...index.apps.map((item) => ({ group: 'Apps', item })),
    ...index.windows.map((item) => ({ group: 'Windows', item })),
    ...index.actions.map((item) => ({
      group: item.type === 'action' && item.actionId === 'emoji-picker' ? 'Additional' : 'Actions',
      item,
    })),
    ...index.chats.map((item) => ({ group: 'Chats', item })),
  ]
}

function searchScore(item: CommandCenterIndexItem, query: string): number {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return item.type === 'app' && typeof item.rank === 'number' ? item.rank : 1
  }
  switch (item.type) {
    case 'app': {
      const appScore = scoreAppSearch(item.title, item.aliases, trimmedQuery)
      if (appScore === 0) return 0
      return appScore + Math.min(item.rank ?? 0, 10)
    }
    case 'window':
      return scoreWindowSearch(item.title, item.subtitle ?? '', trimmedQuery)
    case 'workflow':
    case 'action':
    case 'chat':
      return scoreGenericSearch([item.title, ...item.aliases, item.hint], trimmedQuery)
    default:
      return 0
  }
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
  if (item.type === 'chat') return <MessageSquare size={22} />
  if (item.type === 'action' && item.actionId === 'emoji-picker') {
    return <span aria-hidden="true">😊</span>
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
    if (
      prev?.type === 'app' &&
      prev.iconDataUrl &&
      prev.iconKey &&
      prev.iconKey === app.iconKey
    ) {
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

export default function CommandCenterOverlay() {
  const [mode, setMode] = useState<Mode>('search')
  const [commandView, setCommandView] = useState<CommandView>('root')
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
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [promoted, setPromoted] = useState(false)
  const [optimisticText, setOptimisticText] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const indexRequestRef = useRef(0)
  const activeSearchQueryRef = useRef('')
  const reduceMotion = useReducedMotion()

  const {
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    clearCurrentSession,
    deleteSession,
  } = useChatHistory()
  const { settings } = useSettings()
  const streamingState = useStreamingState()
  const { isLoading, sendMessage, stopStreaming, regenerateMessage, toolState } = useStreamingChat()

  const chatSession = sessions.find((session) => session.id === chatSessionId)
  const chatMessages = chatSession?.messages ?? []
  const isChatMode = Boolean(chatSessionId)
  const isEmojiView = commandView === 'emojis' && !isChatMode

  const emojiResults = useMemo(() => searchCommandCenterEmojis(input), [input])
  const selectedEmoji = isEmojiView ? emojiResults[selectedIndex] : undefined

  useEffect(() => {
    void window.commandCenter.setLayout(isChatMode ? 'chat' : 'search')
  }, [isChatMode])

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
    for (const { group, item } of flattenIndex(searchIndex)) {
      if (!matchesItem(item, query)) continue
      groups.set(group, [...(groups.get(group) ?? []), item])
    }
    return GROUP_ORDER.filter((group) => groups.has(group)).map((group) => {
      const items = groups.get(group) ?? []
      const ordered = query
        ? [...items].sort(
            (a, b) =>
              searchScore(b, query) - searchScore(a, query) || a.title.localeCompare(b.title)
          )
        : items
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

  // O(1) id -> row index lookup so each rendered row doesn't run an O(n) findIndex
  // (which made selection cost O(n^2) across the whole list on every render).
  const rowIndexById = useMemo(() => {
    const map = new Map<string, number>()
    filteredRows.forEach((row, index) => map.set(row.item.id, index))
    return map
  }, [filteredRows])

  const selectedItem = filteredRows[selectedIndex]?.item
  const switchMode = useCallback(() => {
    if (isChatMode || isEmojiView) return
    setMode((current) => (current === 'search' ? 'ask' : 'search'))
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [isChatMode, isEmojiView])

  const openEmojiView = useCallback((initialQuery = '') => {
    setCommandView('emojis')
    setMode('search')
    setInput(initialQuery)
    setSelectedIndex(0)
    setSelectionVisible(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const handleInputChange = useCallback(
    (value: string) => {
      if (!isChatMode && !isEmojiView && mode === 'search' && value.startsWith(':')) {
        openEmojiView(value.slice(1))
        return
      }
      setInput(value)
    },
    [isChatMode, isEmojiView, mode, openEmojiView]
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
    setMode('search')
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
    setPendingPrompt(null)
    setOptimisticText(null)
    setPromoted(false)
    setChatSessionId(null)
    setActionsOpen(false)
    clearCurrentSession()
    void refreshIndex('', false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [clearCurrentSession, refreshIndex])

  useEffect(() => {
    resetOverlay()
    return window.commandCenter.onShown(resetOverlay)
  }, [resetOverlay])

  useEffect(() => {
    activeSearchQueryRef.current = input.trim()
    if (isChatMode || isEmojiView || mode !== 'search') return undefined
    const query = input.trim()
    const delay = query ? 90 : 0
    const timer = window.setTimeout(() => {
      void refreshIndex(query, false)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [input, isChatMode, isEmojiView, mode, refreshIndex])

  useEffect(() => {
    if (isChatMode || isEmojiView || mode !== 'search') return undefined
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
  }, [index.apps, input, isChatMode, isEmojiView, mode, refreshIndex])

  useEffect(() => {
    // Reset to the first row whenever the query or mode changes, and keep the
    // highlight visible so the top result is pre-selected.
    setSelectedIndex(0)
    setSelectionVisible(true)
  }, [commandView, input, mode])

  useEffect(() => {
    if (!pendingPrompt || !chatSessionId || currentSessionId !== chatSessionId || isLoading) return
    const prompt = pendingPrompt
    setPendingPrompt(null)
    void sendMessage(prompt, [])
  }, [chatSessionId, currentSessionId, isLoading, pendingPrompt, sendMessage])

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
    // Clear optimistic text once a real user message appears in the session
    if (optimisticText && chatMessages.some((m) => m.role === 'user')) {
      setOptimisticText(null)
    }
  }, [chatMessages.length, streamingState?.content, optimisticText])

  const hideOverlay = useCallback(() => {
    if (
      chatSessionId &&
      settings.commandCenterChatPersistence === 'temporary' &&
      !promoted &&
      !isLoading
    ) {
      deleteSession(chatSessionId)
    }
    void window.commandCenter.hide()
  }, [chatSessionId, deleteSession, isLoading, promoted, settings.commandCenterChatPersistence])

  const startChat = useCallback(
    (prompt: string) => {
      const trimmed = prompt.trim()
      if (!trimmed) return
      const sessionId = createSession()
      setChatSessionId(sessionId)
      switchSession(sessionId)
      setOptimisticText(trimmed)
      setPendingPrompt(trimmed)
      setMode('ask')
      setInput('')
    },
    [createSession, switchSession]
  )

  const executeItem = useCallback(
    async (item: CommandCenterIndexItem) => {
      if (item.type === 'action' && item.actionId === 'emoji-picker') {
        openEmojiView()
        return
      }
      if (item.type === 'workflow') {
        setConfirmingWorkflow(item)
        return
      }
      setError(null)
      setStatus(null)
      const query = mode === 'search' ? input.trim() : ''
      const result = await window.commandCenter.executeIndexItem(item.id, query)
      if (!result.success) {
        setError(result.error || 'Command failed.')
        return
      }
      if (result.aiPrompt) {
        startChat(result.aiPrompt)
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
    [input, mode, openEmojiView, refreshIndex, startChat]
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
      if (item.type !== 'app') return
      setActionsOpen(false)
      setError(null)
      setStatus(null)
      const query = mode === 'search' ? input.trim() : ''
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
    },
    [input, mode]
  )

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
      startChat(result.aiPrompt)
      return
    }
    setStatus(`${workflow.name} complete.`)
    void refreshIndex()
  }, [confirmingWorkflow, refreshIndex, startChat])

  const submit = useCallback(() => {
    if (isEmojiView) {
      if (selectedEmoji) void insertEmoji(selectedEmoji)
      return
    }
    if (isChatMode) {
      if (input.trim()) {
        const prompt = input.trim()
        setOptimisticText(prompt)
        setInput('')
        void sendMessage(prompt, [])
      }
      return
    }

    if (mode === 'ask') {
      startChat(input)
      return
    }

    if (selectedItem) {
      void executeItem(selectedItem)
      return
    }

    if (input.trim()) {
      setMode('ask')
      startChat(input)
    }
  }, [
    executeItem,
    input,
    insertEmoji,
    isChatMode,
    isEmojiView,
    mode,
    selectedEmoji,
    selectedItem,
    sendMessage,
    startChat,
  ])

  const openInFullChat = useCallback(async () => {
    if (!chatSessionId) return
    setPromoted(true)
    await window.commandCenter.openChatSession(chatSessionId)
  }, [chatSessionId])

  const handlePanelKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      switchMode()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (actionsOpen) {
        setActionsOpen(false)
        return
      }
      if (confirmingWorkflow) {
        setConfirmingWorkflow(null)
        return
      }
      if (isEmojiView) {
        closeCommandView()
        return
      }
      hideOverlay()
      return
    }
    if (isEmojiView && event.key === 'Backspace' && !input) {
      event.preventDefault()
      closeCommandView()
      return
    }
    // Raycast-style: Ctrl/Cmd+K opens the secondary Actions menu for apps.
    if (
      (event.key === 'k' || event.key === 'K') &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !isChatMode &&
      mode === 'search' &&
      !isEmojiView &&
      selectedItem?.type === 'app'
    ) {
      event.preventDefault()
      setActionsOpen((open) => !open)
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
      return
    }
    if (actionsOpen) return
    if (!isChatMode && mode === 'search' && event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectionVisible(true)
      const rowCount = isEmojiView ? emojiResults.length : filteredRows.length
      setSelectedIndex((current) => Math.min(current + 1, Math.max(rowCount - 1, 0)))
    }
    if (!isChatMode && mode === 'search' && event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectionVisible(true)
      setSelectedIndex((current) => Math.max(current - 1, 0))
    }
  }

  const footerActionLabel = ((): string => {
    if (isEmojiView) return 'Paste Emoji'
    if (mode === 'ask') return 'Ask Zura'
    const item = selectedItem
    if (!item) return input.trim() ? 'Ask Zura' : 'Search'
    switch (item.type) {
      case 'app':
        return item.existingWindow ? 'Focus Window' : 'Open Application'
      case 'workflow':
        return 'Run Workflow'
      case 'window':
        return 'Focus Window'
      case 'action':
        return item.actionId === 'emoji-picker' ? 'Open Command' : 'Run Action'
      case 'chat':
        return 'Open Chat'
      default:
        return 'Open'
    }
  })()

  const selectedAppActions = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'app') return []
    return APP_ACTION_DEFS.filter((action) => action.available(selectedItem)).map((action) =>
      action.id === 'open' && selectedItem.existingWindow
        ? { ...action, label: 'Open Application' }
        : action
    )
  }, [selectedItem])

  const showAppActions = !isChatMode && !isEmojiView && mode === 'search' && selectedAppActions.length > 0

  return (
    <div className="command-center-root">
      <motion.div
        className={`command-center-panel ${isChatMode ? 'is-chat' : ''}`}
        onKeyDownCapture={handlePanelKeyDownCapture}
        initial={false}
      >
        <motion.div className="command-center-topbar" initial={false}>
          {isEmojiView && (
            <button
              type="button"
              className="command-center-back"
              onClick={closeCommandView}
              aria-label="Back to Command Center"
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <motion.div
            className="command-center-input-shell"
            animate={reduceMotion ? { x: 0 } : { x: mode === 'ask' ? 4 : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: motionEase }}
          >
            <input
              ref={(node) => {
                inputRef.current = node
              }}
              autoFocus
              value={input}
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isChatMode
                  ? 'Ask a follow-up...'
                  : isEmojiView
                    ? 'Search emojis by name...'
                    : mode === 'search'
                      ? 'Search workflows, apps, windows, chats...'
                      : 'Ask Zura to help with this screen...'
              }
              aria-label={
                isChatMode
                  ? 'Ask a follow-up'
                  : isEmojiView
                    ? 'Search emojis'
                    : mode === 'search'
                      ? 'Search Command Center'
                      : 'Ask Zura'
              }
            />
            {isChatMode && (
              <button
                type="button"
                onClick={isLoading ? stopStreaming : submit}
                aria-label={isLoading ? 'Stop' : 'Send'}
              >
                {isLoading ? <X size={16} /> : <CornerDownLeft size={16} />}
              </button>
            )}
          </motion.div>
          {!isChatMode && !isEmojiView && (
            <button
              type="button"
              className="command-center-mode-hint"
              onClick={switchMode}
              aria-label={mode === 'ask' ? 'Switch to Search' : 'Switch to Ask AI'}
            >
              <kbd>Tab</kbd>
              <span>{mode === 'ask' ? 'to Search' : 'to AI'}</span>
            </button>
          )}
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {!isChatMode ? (
            <motion.div
              key={`${commandView}:${mode}`}
              className="command-center-body"
              initial={reduceMotion ? false : { x: mode === 'ask' ? 6 : -6 }}
              animate={reduceMotion ? undefined : { x: 0 }}
              exit={reduceMotion ? undefined : { x: mode === 'ask' ? 6 : -6 }}
              transition={{
                duration: reduceMotion ? 0 : 0.13,
                delay: reduceMotion ? 0 : 0.025,
                ease: motionEase,
              }}
            >
              {isEmojiView ? (
                <div
                  className="command-center-results command-center-emoji-results"
                  role="listbox"
                  aria-label="Emoji results"
                >
                  <section className="command-center-group">
                    <h2>{input.trim() ? 'Search Results' : 'Popular'}</h2>
                    {emojiResults.map((entry, rowIndex) => {
                      const selected = selectionVisible && rowIndex === selectedIndex
                      return (
                        <button
                          key={entry.emoji}
                          type="button"
                          className={`command-center-result command-center-emoji-result ${selected ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectionVisible(true)
                            setSelectedIndex(rowIndex)
                            requestAnimationFrame(() => inputRef.current?.focus())
                          }}
                          onDoubleClick={() => void insertEmoji(entry)}
                          role="option"
                          aria-selected={selected}
                        >
                          <span className="command-center-result__icon command-center-emoji-result__glyph">
                            {entry.emoji}
                          </span>
                          <span className="command-center-result__text">
                            <span>{entry.name}</span>
                            <small>{entry.keywords.slice(1, 4).join(' · ')}</small>
                          </span>
                          <span className="command-center-result__hint">Paste</span>
                        </button>
                      )
                    })}
                  </section>
                  {emojiResults.length === 0 && (
                    <div className="command-center-empty">
                      No emoji found. Try a feeling, object, or activity.
                    </div>
                  )}
                </div>
              ) : mode === 'search' ? (
                <div
                  className="command-center-results"
                  role="listbox"
                  aria-label="Command Center results"
                >
                  {appIndexWarning && (
                    <div className="command-center-index-warning">
                      Apps may be incomplete: {appIndexWarning}
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
                              type="button"
                              className={`command-center-result ${selected ? 'selected' : ''}`}
                              onClick={() => {
                                // Single click selects the row (strong,
                                // persistent highlight) and returns focus to the
                                // input so keyboard actions (Enter to open,
                                // arrows to move) act on the selection. Hover is
                                // a separate CSS-only lighter highlight and no
                                // longer moves the selection.
                                setSelectionVisible(true)
                                setSelectedIndex(rowIndex)
                                requestAnimationFrame(() => inputRef.current?.focus())
                              }}
                              onDoubleClick={() => void executeItem(item)}
                            >
                              <span className="command-center-result__icon">
                                {iconForItem(item)}
                              </span>
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
                    <div className="command-center-empty">Loading Command Center...</div>
                  ) : input.trim() ? (
                    <div className="command-center-empty">
                      No matching results. Press Enter to ask Zura instead.
                    </div>
                  ) : (
                    <div className="command-center-empty">No Command Center items found.</div>
                  )}
                </div>
              ) : (
                <div className="command-center-ask-empty">
                  <Brain size={26} />
                  <p>Waiting for your first message.</p>
                  <div>
                    <button type="button" onClick={() => setInput('Summarize this window')}>
                      Summarize this window
                    </button>
                    <button type="button" onClick={() => setInput('Find the next step')}>
                      Find the next step
                    </button>
                    <button type="button" onClick={() => setInput('Turn clipboard into a message')}>
                      Use clipboard
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              className="command-center-chat"
              initial={reduceMotion ? false : { y: 6 }}
              animate={reduceMotion ? undefined : { y: 0 }}
              exit={reduceMotion ? undefined : { y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.15, ease: motionEase }}
            >
              <div className="command-center-chat-actions">
                <span className="command-center-model-badge">
                  {settings.aiModel || 'assistant'}
                </span>
                <button type="button" onClick={openInFullChat}>
                  Open in Chat
                </button>
              </div>
              <div ref={bodyRef} className="command-center-chat-scroll">
                {/* Optimistic user message — shown instantly on submit before session syncs */}
                {optimisticText && (
                  <div
                    key="optimistic-msg"
                    className="command-center-chat-message command-center-chat-message--user"
                  >
                    <div className="command-center-user-bubble">{optimisticText}</div>
                  </div>
                )}
                {/* Thinking indicator — only for first message: no assistant messages in session, waiting for response */}
                {optimisticText &&
                chatMessages.filter((m) => m.role === 'assistant').length === 0 ? (
                  <div key="thinking-indicator" className="command-center-thinking">
                    <span className="command-center-thinking-dot" />
                    <span className="command-center-thinking-dot" />
                    <span className="command-center-thinking-dot" />
                  </div>
                ) : null}
                {chatMessages.map((message, index) => {
                  const isLastAssistant =
                    message.role === 'assistant' && index === chatMessages.length - 1
                  const streaming = isLoading && isLastAssistant
                  return (
                    <div key={message.id} className="command-center-chat-message">
                      {streaming ? (
                        <StreamingMessage
                          message={message}
                          sessionId={chatSessionId!}
                          activeToolCalls={toolState.activeToolCalls}
                          onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                        />
                      ) : (
                        <MessageRenderer
                          message={message}
                          sessionId={chatSessionId!}
                          isStreaming={false}
                          onRegenerate={(instruction) => regenerateMessage(message, instruction)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isChatMode && (
          <footer className="command-center-footer">
            <span className="command-center-footer__brand">
              <img src="icon-mark.png" alt="" />
            </span>
            <div className="command-center-footer__actions">
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
              {showAppActions && selectedItem?.type === 'app' && (
                <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="command-center-footer__action command-center-footer__actions-btn"
                      aria-label="Actions"
                      aria-haspopup="menu"
                      aria-expanded={actionsOpen}
                    >
                      <span>Actions</span>
                      <kbd className="command-center-footer__chord">
                        <span>⌃</span>
                        <span>K</span>
                      </kbd>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    side="top"
                    sideOffset={8}
                    className="command-center-actions-menu"
                    onCloseAutoFocus={(event) => {
                      event.preventDefault()
                      inputRef.current?.focus()
                    }}
                  >
                    {selectedAppActions.map((action, index) => {
                      const prev = selectedAppActions[index - 1]
                      const isUtility =
                        action.id === 'show-in-folder' ||
                        action.id === 'copy-path' ||
                        action.id === 'copy-name'
                      const prevIsPrimary =
                        !prev || prev.id === 'open' || prev.id === 'focus-window'
                      const showSeparator = isUtility && prevIsPrimary
                      return (
                        <Fragment key={action.id}>
                          {showSeparator ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem
                            className="command-center-actions-menu__item"
                            onSelect={() => {
                              if (selectedItem?.type === 'app') {
                                void runItemAction(selectedItem, action.id)
                              }
                            }}
                          >
                            <span className="command-center-actions-menu__icon">{action.icon}</span>
                            <span className="command-center-actions-menu__label">
                              {action.label}
                            </span>
                            {action.id === 'open' ? (
                              <DropdownMenuShortcut>
                                <CornerDownLeft size={12} />
                              </DropdownMenuShortcut>
                            ) : null}
                          </DropdownMenuItem>
                        </Fragment>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </footer>
        )}

        {(error || status) && (
          <div className={`command-center-status ${error ? 'error' : ''}`}>{error || status}</div>
        )}
      </motion.div>

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

        .command-center-mode-hint {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          height: 28px;
          padding: 0 9px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: rgba(255, 231, 238, 0.44);
          font: inherit;
          font-size: 12.5px;
          white-space: nowrap;
          cursor: pointer;
          transition: background-color 120ms ease, color 120ms ease;
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

        .command-center-mode-hint:hover {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 241, 246, 0.72);
        }

        .command-center-mode-hint kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 19px;
          padding: 0 5px;
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.13);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.10);
          color: rgba(255, 246, 249, 0.82);
          font: inherit;
          font-size: 11px;
          font-weight: 600;
        }

        .command-center-input-shell button,
        .command-center-chat-actions button,
        .command-center-ask-empty button,
        .command-center-confirm button {
          border: 0;
          color: inherit;
          font: inherit;
          cursor: pointer;
        }

        .command-center-body,
        .command-center-chat {
          position: relative;
          z-index: 1;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .command-center-footer {
          flex: 0 0 auto;
          z-index: 2;
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
          display: inline-flex;
          align-items: center;
          gap: 2px;
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
        .command-center-footer__action[data-state='open'] {
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 249, 251, 0.92);
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

        .command-center-actions-menu {
          min-width: 240px;
          max-width: min(320px, 92vw);
          padding: 6px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(22, 18, 24, 0.96);
          color: rgba(255, 244, 248, 0.92);
          box-shadow:
            0 18px 48px rgba(0, 0, 0, 0.45),
            0 0 0 1px rgba(255, 255, 255, 0.04) inset;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }

        .command-center-actions-menu__item {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 34px;
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 13px;
          color: rgba(255, 244, 248, 0.90);
          cursor: pointer;
        }

        .command-center-actions-menu__item:focus,
        .command-center-actions-menu__item[data-highlighted] {
          background: rgba(255, 255, 255, 0.09);
          color: rgba(255, 250, 252, 0.98);
          outline: none;
        }

        .command-center-actions-menu__icon {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 221, 231, 0.62);
          flex: 0 0 auto;
        }

        .command-center-actions-menu__label {
          flex: 1 1 auto;
          min-width: 0;
        }

        .command-center-actions-menu [data-slot='dropdown-menu-shortcut'] {
          margin-left: 12px;
          color: rgba(255, 236, 242, 0.48);
        }

        .command-center-actions-menu [data-slot='dropdown-menu-separator'] {
          background: rgba(255, 255, 255, 0.08);
          margin: 4px 2px;
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

        .command-center-results::-webkit-scrollbar,
        .command-center-chat-scroll::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }

        .command-center-results::-webkit-scrollbar-track,
        .command-center-chat-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .command-center-results::-webkit-scrollbar-thumb,
        .command-center-chat-scroll::-webkit-scrollbar-thumb {
          min-height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.28);
        }

        .command-center-results::-webkit-scrollbar-thumb:hover,
        .command-center-chat-scroll::-webkit-scrollbar-thumb:hover {
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

        .command-center-emoji-result {
          min-height: 46px;
        }

        .command-center-emoji-result__glyph {
          width: 28px;
          height: 28px;
          overflow: visible;
          font-family: "Segoe UI Emoji", "Apple Color Emoji", sans-serif;
          font-size: 22px;
          line-height: 1;
        }

        .command-center-emoji-result .command-center-result__text small {
          text-transform: lowercase;
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

        .command-center-empty,
        .command-center-ask-empty {
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

        .command-center-ask-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 28px;
          text-align: center;
        }

        .command-center-ask-empty p {
          margin: 0;
          font-size: 15px;
        }

        .command-center-ask-empty div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
        }

        .command-center-ask-empty button,
        .command-center-chat-actions button,
        .command-center-confirm button {
          min-height: 30px;
          border-radius: 7px;
          padding: 0 11px;
          background: rgba(255, 255, 255, 0.13);
          color: rgba(255, 241, 246, 0.78);
        }

        .command-center-chat-actions {
          height: 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 18px;
        }

        .command-center-chat-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 10px 20px 22px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.34) transparent;
        }

        .command-center-chat-message {
          max-width: 690px;
          margin: 0 auto;
        }

        .command-center-chat-message--user {
          max-width: 690px;
          margin: 0 auto 8px;
          display: flex;
          justify-content: flex-end;
        }

        .command-center-user-bubble {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 8px 14px;
          max-width: min(74%, 520px);
          font-size: 14px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .command-center-model-badge {
          font-size: 11px;
          color: rgba(255, 231, 238, 0.48);
          padding: 3px 8px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.08);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }

        .command-center-thinking {
          display: flex;
          align-items: center;
          gap: 4px;
          max-width: 690px;
          margin: 0 auto;
          padding: 14px 0;
        }

        .command-center-thinking-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 231, 238, 0.48);
          animation: thinkingPulse 0.8s ease-in-out infinite;
        }

        .command-center-thinking-dot:nth-child(2) {
          animation-delay: 0.16s;
        }

        .command-center-thinking-dot:nth-child(3) {
          animation-delay: 0.32s;
        }

        @keyframes thinkingPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
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
