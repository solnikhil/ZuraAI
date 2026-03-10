import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { Search } from '../icons'
import { useAppShell } from '../../contexts/AppShellContext'
import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { useSettingsUI } from '../../contexts/SettingsUIContext'
import { useQuickSend } from '../../contexts/QuickSendContext'
import { useToast } from '../shared/Toast'
import { exportChatToMarkdown, exportChatToText, downloadFile } from '../../utils/chatExport'
import {
  type CommandBarAction,
  type CommandBarSuggestion,
  getCommandBarSuggestions,
} from '../../commandBar/suggestions'
import {
  type CommandBarHistoryEntry,
  loadCommandBarHistory,
  recordCommandHistory,
} from '../../commandBar/history'
import CommandPaletteResultList from './CommandPaletteResultList'
import CommandPaletteFooter from './CommandPaletteFooter'

/* ── helpers ── */

function formatFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 60)
}

/* ── inline styles ── */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9998,
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
}

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: '20%',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 9999,
  width: '100%',
  maxWidth: 560,
  maxHeight: '70vh',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 12,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-surface)',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.24), 0 4px 12px rgba(0, 0, 0, 0.12)',
  outline: 'none',
  overflow: 'hidden',
}

const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderBottom: '1px solid var(--theme-border)',
  flexShrink: 0,
}

const searchIconStyle: React.CSSProperties = {
  flexShrink: 0,
  color: 'var(--theme-text-muted)',
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: '0.88rem',
  color: 'var(--theme-text-primary)',
  fontFamily: 'inherit',
  lineHeight: 1.4,
}

const liveRegionStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/* ── component ── */

export default function CommandPalette() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const {
    dashboardView,
    setDashboardView,
    setActiveSettingsSection,
    setSettingsSectionParams,
    hasUnsavedSettings,
    toggleSidebarCollapsed,
    toggleSidebarHidden,
  } = useAppShell()
  const { sessions, currentSessionId, createSession } = useChatHistory()
  const { queueMessage } = useQuickSend()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [history, setHistory] = useState<CommandBarHistoryEntry[]>(() => loadCommandBarHistory())

  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  /* ── settings-driven dynamic styles ── */

  const { settingsUI } = useSettingsUI()
  const { commandBar } = settingsUI
  const isCommandPaletteEnabled = commandBar.enabled !== false

  const widthMap = Object.create(null) as Record<string, number>
  widthMap.narrow = 440
  widthMap.default = 560
  widthMap.wide = 680
  const positionMap = Object.create(null) as Record<string, string>
  positionMap.top = '12%'
  positionMap.center = '20%'
  positionMap.lower = '30%'

  const dynamicOverlayStyle = useMemo<React.CSSProperties>(
    () => ({
      ...overlayStyle,
      backgroundColor: `rgba(0, 0, 0, ${(commandBar.overlayOpacity ?? 45) / 100})`,
    }),
    [commandBar.overlayOpacity]
  )

  const dynamicContentStyle = useMemo<React.CSSProperties>(
    () => ({
      ...contentStyle,
      maxWidth: widthMap[commandBar.paletteWidth ?? 'default'] ?? 560,
      top: positionMap[commandBar.palettePosition ?? 'center'] ?? '20%',
    }),
    [commandBar.paletteWidth, commandBar.palettePosition]
  )

  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === currentSessionId) || null
  }, [sessions, currentSessionId])

  /* ── suggestions ── */

  const baseSuggestions = useMemo(() => {
    return getCommandBarSuggestions(
      query,
      {
        hasCurrentSession: Boolean(currentSession),
      },
      commandBar.maxSuggestions
    )
  }, [commandBar.maxSuggestions, currentSession, query])

  const recentSuggestions = useMemo<CommandBarSuggestion[]>(() => {
    if (!commandBar.showRecents) return []
    if (history.length === 0) return []

    const normalized = query.trim().toLowerCase()
    const filtered = normalized
      ? history.filter(
          (entry) =>
            entry.title.toLowerCase().includes(normalized) ||
            entry.input.toLowerCase().includes(normalized)
        )
      : history

    return filtered.slice(0, Math.max(0, commandBar.maxRecents)).map((entry) => ({
      id: entry.suggestionId,
      title: entry.title,
      subtitle: 'Recent',
      action: entry.action,
      score: 1000,
    }))
  }, [commandBar.maxRecents, commandBar.showRecents, history, query])

  // When query is empty, show recent + commands (deduped).
  // When query is non-empty, show only baseSuggestions (no separate recents).
  const suggestions = useMemo(() => {
    if (query.trim().length > 0) return baseSuggestions

    const recentIds = new Set(recentSuggestions.map((s) => s.id))
    return baseSuggestions.filter((s) => !recentIds.has(s.id))
  }, [baseSuggestions, query, recentSuggestions])

  const displayedRecents = query.trim().length > 0 ? [] : recentSuggestions
  const totalItems = displayedRecents.length + suggestions.length

  /* ── live region for result count ── */
  const [liveText, setLiveText] = useState('')

  useEffect(() => {
    if (!open) return
    const count = totalItems
    setLiveText(count === 0 ? 'No results' : `${count} result${count === 1 ? '' : 's'} available`)
  }, [open, totalItems])

  /* ── reset highlight on query change ── */
  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  /* ── clamp highlight when list shrinks ── */
  useEffect(() => {
    setHighlightIndex((prev) => {
      if (totalItems === 0) return 0
      return Math.min(prev, totalItems - 1)
    })
  }, [totalItems])

  /* ── open / close helpers ── */

  const openPalette = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    setOpen(true)
    setQuery('')
    setHighlightIndex(0)
    // Focus is set via onOpenAutoFocus
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    // Restore focus
    requestAnimationFrame(() => {
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    })
  }, [])

  /* ── global keyboard shortcut: Ctrl+Space / Cmd+Space ── */

  useEffect(() => {
    if (!isCommandPaletteEnabled) {
      setOpen(false)
      setQuery('')
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.shiftKey || event.altKey) return

      event.preventDefault()

      if (open) {
        closePalette()
      } else {
        openPalette()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closePalette, isCommandPaletteEnabled, open, openPalette])

  /* ── action execution ── */

  const ensureDashboardView = useCallback(
    (view: 'chat' | 'settings') => {
      if (dashboardView === view) return

      if (hasUnsavedSettings && dashboardView === 'settings' && view !== 'settings') {
        showToast('You have unsaved settings changes', 'warning')
        return
      }

      setDashboardView(view)
    },
    [dashboardView, hasUnsavedSettings, setDashboardView, showToast]
  )

  const ensureDashboardRoute = useCallback(() => {
    navigate('/dashboard')
  }, [navigate])

  const runAction = useCallback(
    async (action: CommandBarAction): Promise<boolean> => {
      switch (action.type) {
        case 'open_dashboard_view':
          ensureDashboardRoute()
          ensureDashboardView(action.view)
          return true
        case 'open_settings_section': {
          ensureDashboardRoute()
          ensureDashboardView('settings')
          setActiveSettingsSection(action.section)
          if (
            action.provider != null ||
            action.manageMode != null ||
            action.commandPaletteTab != null
          ) {
            setSettingsSectionParams({
              ...(action.provider != null && { provider: action.provider }),
              ...(action.manageMode != null && { manageMode: action.manageMode }),
              ...(action.commandPaletteTab != null && {
                commandPaletteTab: action.commandPaletteTab,
              }),
            })
          } else {
            setSettingsSectionParams(null)
          }
          return true
        }
        case 'toggle_sidebar_hidden':
          toggleSidebarHidden()
          return true
        case 'toggle_sidebar_collapsed':
          toggleSidebarCollapsed()
          return true
        case 'new_chat': {
          ensureDashboardRoute()

          if (hasUnsavedSettings && dashboardView === 'settings') {
            showToast('You have unsaved settings changes', 'warning')
            return false
          }

          setDashboardView('chat')
          createSession()
          return true
        }
        case 'export_chat': {
          if (!currentSession) {
            showToast('No active chat to export', 'warning')
            return false
          }

          const baseName = formatFilenamePart(currentSession.title || 'chat') || 'chat'

          if (action.format === 'markdown') {
            const markdown = exportChatToMarkdown(currentSession)
            downloadFile(markdown, `${baseName}.md`, 'text/markdown')
            showToast('Exported chat as Markdown', 'success')
            return true
          }

          const text = exportChatToText(currentSession)
          downloadFile(text, `${baseName}.txt`, 'text/plain')
          showToast('Exported chat as text', 'success')
          return true
        }
        case 'send_chat_message': {
          const content = action.content.trim()
          if (!content) return false

          ensureDashboardRoute()

          if (hasUnsavedSettings && dashboardView === 'settings') {
            showToast('You have unsaved settings changes', 'warning')
            return false
          }

          setDashboardView('chat')
          queueMessage(content)
          return true
        }
        default:
          return false
      }
    },
    [
      ensureDashboardRoute,
      ensureDashboardView,
      setActiveSettingsSection,
      setSettingsSectionParams,
      toggleSidebarHidden,
      toggleSidebarCollapsed,
      hasUnsavedSettings,
      dashboardView,
      setDashboardView,
      showToast,
      createSession,
      currentSession,
      queueMessage,
    ]
  )

  const recordHistory = useCallback((suggestion: CommandBarSuggestion, input: string) => {
    setHistory((prev) => recordCommandHistory(prev, suggestion, input))
  }, [])

  const runSuggestion = useCallback(
    async (suggestion: CommandBarSuggestion) => {
      const inputSnapshot = query
      const didRun = await runAction(suggestion.action)
      if (didRun) {
        recordHistory(suggestion, inputSnapshot)
      }
      closePalette()
    },
    [query, runAction, recordHistory, closePalette]
  )

  /* ── keyboard navigation inside the palette ── */

  const handleInputKeyDown = useCallback(
    async (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Shift+Enter: quick-send the current query as a chat message
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        const content = query.trim()
        if (content) {
          const didRun = await runAction({ type: 'send_chat_message', content })
          if (didRun) {
            closePalette()
          }
        }
        return
      }

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          setHighlightIndex((prev) => Math.min(prev + 1, totalItems - 1))
          return
        }
        case 'ArrowUp': {
          event.preventDefault()
          setHighlightIndex((prev) => Math.max(prev - 1, 0))
          return
        }
        case 'Enter': {
          event.preventDefault()
          // Resolve which suggestion is at the current highlight index
          const allItems = [...displayedRecents, ...suggestions]
          const selected = allItems[highlightIndex]
          if (selected) {
            await runSuggestion(selected)
          }
          return
        }
        case 'Escape': {
          event.preventDefault()
          closePalette()
          return
        }
        case 'Tab': {
          if (!commandBar.enableTabAutocomplete || totalItems === 0) return
          event.preventDefault()
          const allItems = [...displayedRecents, ...suggestions]
          const selected = allItems[highlightIndex]
          if (selected) {
            setQuery(selected.title)
          }
          return
        }
        default:
          return
      }
    },
    [
      commandBar.enableTabAutocomplete,
      totalItems,
      displayedRecents,
      suggestions,
      highlightIndex,
      runSuggestion,
      closePalette,
      query,
      runAction,
    ]
  )

  /* ── active descendant id ── */

  const activeDescendantId = totalItems > 0 ? `command-palette-item-${highlightIndex}` : undefined

  /* ── render ── */

  if (!isCommandPaletteEnabled) {
    return null
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closePalette()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={dynamicOverlayStyle}
          data-state={open ? 'open' : 'closed'}
        />
        <DialogPrimitive.Content
          style={dynamicContentStyle}
          aria-label="Command palette"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            // Focus restoration handled in closePalette
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            closePalette()
          }}
          onPointerDownOutside={() => closePalette()}
        >
          {/* Hidden title for accessibility */}
          <DialogPrimitive.Title style={liveRegionStyle}>Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description style={liveRegionStyle}>
            Search and run commands
          </DialogPrimitive.Description>

          <div style={searchWrapStyle}>
            <Search size={16} style={searchIconStyle} />
            <input
              ref={inputRef}
              style={searchInputStyle}
              type="text"
              role="combobox"
              aria-expanded={totalItems > 0}
              aria-controls="command-palette-listbox"
              aria-activedescendant={activeDescendantId}
              aria-autocomplete="list"
              aria-label="Search commands"
              placeholder="Search commands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <CommandPaletteResultList
            suggestions={suggestions}
            recentSuggestions={displayedRecents}
            highlightIndex={highlightIndex}
            query={query}
            onSelect={runSuggestion}
            onHighlight={setHighlightIndex}
          />

          <CommandPaletteFooter />

          {/* Live region for screen readers */}
          <div role="status" aria-live="polite" aria-atomic="true" style={liveRegionStyle}>
            {liveText}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
