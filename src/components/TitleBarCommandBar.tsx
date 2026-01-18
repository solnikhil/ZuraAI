import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, SettingsIcon, LayoutDashboard, Plus, PanelLeft, ChevronDown,
  ChartNoAxesCombined, Cpu, Box, Key, Command, FileText
} from './icons'
import { useAppShell } from '../contexts/AppShellContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from './shared/Toast'
import { executeTool } from '../tools/executor'
import { exportChatToMarkdown, exportChatToText, downloadFile } from '../utils/chatExport'
import { shouldEnableTools } from '../utils/promptSelection'
import {
  CommandBarAction,
  CommandBarSuggestion,
  getCommandBarSuggestions,
  normalizeCommandQuery
} from '../commandBar/suggestions'

function getSuggestionIcon(suggestion: CommandBarSuggestion): { Icon: any, iconClass: string } {
  // Navigation actions
  if (suggestion.id === 'go-settings') return { Icon: SettingsIcon, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-chat') return { Icon: LayoutDashboard, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-pdf') return { Icon: FileText, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }

  // Settings section actions
  if (suggestion.id === 'go-settings-usage') return { Icon: ChartNoAxesCombined, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-models') return { Icon: Cpu, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-themes') return { Icon: Box, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-preferences') return { Icon: Key, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }
  if (suggestion.id === 'go-settings-commandbar') return { Icon: Command, iconClass: 'app-titlebar__commandbar-item-icon--navigate' }

  // Create actions
  if (suggestion.id === 'new-chat') return { Icon: Plus, iconClass: 'app-titlebar__commandbar-item-icon--create' }

  // Toggle actions
  if (suggestion.id === 'toggle-sidebar-hidden' || suggestion.id === 'toggle-sidebar-collapsed') {
    return { Icon: PanelLeft, iconClass: 'app-titlebar__commandbar-item-icon--toggle' }
  }

  // Export actions
  if (suggestion.id.startsWith('export-')) {
    return { Icon: Search, iconClass: 'app-titlebar__commandbar-item-icon--export' }
  }

  // Tool actions
  if (suggestion.action.type === 'run_tool') {
    return { Icon: Search, iconClass: 'app-titlebar__commandbar-item-icon--tool' }
  }

  return { Icon: Search, iconClass: '' }
}

interface CommandBarHistoryEntry {
  suggestionId: string
  title: string
  subtitle?: string
  input: string
  action: CommandBarAction
  lastUsedAt: number
}

const COMMAND_BAR_HISTORY_KEY = 'zura-commandbar-history-v1'
const COMMAND_BAR_HISTORY_MAX = 30

function loadCommandBarHistory(): CommandBarHistoryEntry[] {
  try {
    const raw = localStorage.getItem(COMMAND_BAR_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((entry: any) => entry && typeof entry === 'object')
      .filter((entry: any) => typeof entry.suggestionId === 'string')
      .filter((entry: any) => typeof entry.title === 'string')
      .filter((entry: any) => entry.action && typeof entry.action === 'object')
      .map((entry: any) => ({
        suggestionId: entry.suggestionId,
        title: entry.title,
        subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : undefined,
        input: typeof entry.input === 'string' ? entry.input : '',
        action: entry.action as CommandBarAction,
        lastUsedAt: typeof entry.lastUsedAt === 'number' ? entry.lastUsedAt : Date.now()
      }))
      .slice(0, COMMAND_BAR_HISTORY_MAX)
  } catch {
    return []
  }
}

function saveCommandBarHistory(entries: CommandBarHistoryEntry[]) {
  try {
    localStorage.setItem(COMMAND_BAR_HISTORY_KEY, JSON.stringify(entries.slice(0, COMMAND_BAR_HISTORY_MAX)))
  } catch {
    // Ignore storage failures.
  }
}

function formatFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 60)
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ')
}

const COMMAND_AUTOCOMPLETE_KEYWORDS: Record<string, string> = {
  'go-chat': 'chat',
  'go-settings': 'settings',
  'go-settings-usage': 'usage settings',
  'go-settings-models': 'model settings',
  'go-settings-themes': 'theme settings',
  'go-settings-preferences': 'api keys',
  'go-settings-commandbar': 'command bar settings',
  'new-chat': 'new chat',
  'toggle-sidebar-hidden': 'toggle sidebar',
  'toggle-sidebar-collapsed': 'toggle sidebar collapse',
  'export-chat-markdown': 'export markdown',
  'export-chat-text': 'export text'
}

function buildAutocompleteText(rawQuery: string, keyword: string): string {
  const trimmed = rawQuery.trim()
  const commandsOnly = trimmed.startsWith('>')
  const withoutPrefix = commandsOnly ? trimmed.slice(1).trimStart() : trimmed

  const lower = withoutPrefix.toLowerCase()
  const withCommandsOnly = (text: string) => commandsOnly ? `> ${text}` : text

  if (lower === 'go' || lower.startsWith('go ')) {
    return withCommandsOnly(`go to ${keyword}`)
  }
  if (lower.startsWith('go to ')) {
    return withCommandsOnly(`go to ${keyword}`)
  }
  if (lower === 'goto' || lower.startsWith('goto ')) {
    return withCommandsOnly(`goto ${keyword}`)
  }
  if (lower === 'open' || lower.startsWith('open ')) {
    return withCommandsOnly(`open ${keyword}`)
  }
  if (lower === 'show' || lower.startsWith('show ')) {
    return withCommandsOnly(`show ${keyword}`)
  }
  if (lower === 'navigate' || lower.startsWith('navigate ')) {
    return withCommandsOnly(`navigate to ${keyword}`)
  }

  return withCommandsOnly(keyword)
}

interface TitleBarCommandBarProps {
  idlePlaceholder?: string
}

export default function TitleBarCommandBar({ idlePlaceholder }: TitleBarCommandBarProps) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const {
    dashboardView,
    setDashboardView,
    activeSettingsSection,
    setActiveSettingsSection,
    hasUnsavedSettings,
    toggleSidebarCollapsed,
    toggleSidebarHidden,
  } = useAppShell()

  const { settings } = useSettings()
  const {
    sessions,
    currentSessionId,
    createSession,
    addMessageToSession,
  } = useChatHistory()

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [history, setHistory] = useState<CommandBarHistoryEntry[]>(() => loadCommandBarHistory())

  // Collapse state with localStorage persistence
  const [recentsCollapsed, setRecentsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('zura-commandbar-recents-collapsed') === 'true'
    } catch { return false }
  })
  const [shortcutsCollapsed, setShortcutsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('zura-commandbar-shortcuts-collapsed') === 'true'
    } catch { return false }
  })

  const toggleRecentsCollapsed = () => {
    setRecentsCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('zura-commandbar-recents-collapsed', String(next)) } catch { }
      return next
    })
  }

  const toggleShortcutsCollapsed = () => {
    setShortcutsCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('zura-commandbar-shortcuts-collapsed', String(next)) } catch { }
      return next
    })
  }

  const currentSession = useMemo(() => {
    return sessions.find(s => s.id === currentSessionId) || null
  }, [sessions, currentSessionId])

  const toolsEnabled = shouldEnableTools(settings)
  const commandBar = settings.commandBar

  const commandBarStyle = useMemo(() => {
    const width = commandBar.size === 'medium'
      ? 'clamp(420px, 44vw, 540px)'
      : 'clamp(360px, 40vw, 480px)'

    return {
      ['--commandbar-width' as any]: width,
      ['--commandbar-field-surface' as any]: `${commandBar.fieldSurface}%`,
      ['--commandbar-field-surface-focused' as any]: `${commandBar.fieldSurfaceFocused}%`,
      ['--commandbar-dropdown-surface' as any]: `${commandBar.dropdownSurface}%`,
      ['--commandbar-dropdown-blur' as any]: commandBar.enableBlur ? `${commandBar.blurPx}px` : '0px',
    } as React.CSSProperties
  }, [commandBar.blurPx, commandBar.dropdownSurface, commandBar.enableBlur, commandBar.fieldSurface, commandBar.fieldSurfaceFocused, commandBar.size])


  const maxSuggestions = Math.max(3, Math.min(commandBar.maxSuggestions, 12))
  const showRecents = commandBar.showRecents
  const maxRecents = Math.max(0, Math.min(commandBar.maxRecents, 3))

  const baseSuggestions = useMemo(() => {
    return getCommandBarSuggestions(query, {
      toolsEnabled,
      webSearchEnabled: settings.webSearchEnabled,
      hasCurrentSession: Boolean(currentSession)
    }, maxSuggestions)
  }, [currentSession, maxSuggestions, query, settings.webSearchEnabled, toolsEnabled])

  const recentSuggestions = useMemo<CommandBarSuggestion[]>(() => {
    if (!showRecents || maxRecents === 0) return []
    if (history.length === 0) return []

    const normalized = query.trim().toLowerCase()
    const filtered = normalized
      ? history.filter(entry =>
        entry.title.toLowerCase().includes(normalized) ||
        entry.input.toLowerCase().includes(normalized)
      )
      : history

    return filtered.slice(0, maxRecents).map((entry) => ({
      id: entry.suggestionId,
      title: entry.title,
      subtitle: 'Recent',
      action: entry.action,
      score: 1000
    }))
  }, [history, maxRecents, query, showRecents])

  const suggestions = useMemo(() => {
    const recentIds = new Set(recentSuggestions.map(s => s.id))
    const merged = [
      ...recentSuggestions,
      ...baseSuggestions.filter(s => !recentIds.has(s.id))
    ]

    return merged.slice(0, maxSuggestions)
  }, [baseSuggestions, maxSuggestions, recentSuggestions])

  const shouldShowDropdown = isFocused && suggestions.length > 0
  const isOpen = shouldShowDropdown || isClosing

  // Handle closing animation
  useEffect(() => {
    if (!shouldShowDropdown && !isClosing) return
    if (shouldShowDropdown) {
      setIsClosing(false)
      return
    }
    // Trigger closing animation
    setIsClosing(true)
    const timer = setTimeout(() => setIsClosing(false), 150)
    return () => clearTimeout(timer)
  }, [shouldShowDropdown, isClosing])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  useEffect(() => {
    setHighlightIndex((prev) => {
      if (suggestions.length === 0) return 0
      return Math.min(prev, suggestions.length - 1)
    })
  }, [suggestions.length])

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return
      const target = event.target as Node | null
      if (!target) return
      if (!containerRef.current.contains(target)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [])

  const focusInput = () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.shiftKey || event.altKey) return

      event.preventDefault()

      // Toggle - if focused, close it; if not focused, open it
      if (isFocused) {
        setIsFocused(false)
        setQuery('')
        setHighlightIndex(0)
        inputRef.current?.blur()
      } else {
        setIsFocused(true)
        setHighlightIndex(0)
        focusInput()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const ensureDashboardView = (view: 'chat' | 'settings') => {
    if (dashboardView === view) return

    if (hasUnsavedSettings && dashboardView === 'settings' && view === 'chat') {
      showToast('You have unsaved settings changes', 'warning')
      return
    }

    setDashboardView(view)
  }

  const ensureDashboardRoute = () => {
    navigate('/dashboard')
  }

  const revealChatIfSafe = () => {
    ensureDashboardRoute()

    if (hasUnsavedSettings && dashboardView === 'settings') {
      return false
    }

    setDashboardView('chat')
    return true
  }

  const runToolAndStoreResult = async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    if (!toolsEnabled) {
      showToast('Tools are disabled in Settings', 'warning')
      return false
    }

    if (toolName !== 'web_search') {
      showToast(`Tool disabled: ${formatToolName(toolName)}`, 'warning')
      return false
    }

    const didRevealChat = revealChatIfSafe()

    const sessionId = currentSessionId || createSession()
    const toolCallId = crypto.randomUUID()

    const toolResult = await executeTool(toolName, args)

    const toolCallResult = {
      toolCall: {
        id: toolCallId,
        name: toolName,
        arguments: args
      },
      result: toolResult
    }

    const statusLabel = toolResult.success ? 'Executed' : 'Failed'

    addMessageToSession(sessionId, {
      role: 'assistant',
      content: `${statusLabel}: ${formatToolName(toolName)}`,
      toolResults: [toolCallResult]
    })

    if (!toolResult.success) {
      showToast(toolResult.error || `Tool failed: ${toolName}`, 'error')
      return true
    }

    if (!didRevealChat) {
      showToast('Tool result added to chat', 'info')
    }

    return true
  }

  const recordHistory = (suggestion: CommandBarSuggestion, input: string) => {
    const trimmed = input.trim()
    const entry: CommandBarHistoryEntry = {
      suggestionId: suggestion.id,
      title: suggestion.title,
      subtitle: suggestion.subtitle,
      input: trimmed || suggestion.title,
      action: suggestion.action,
      lastUsedAt: Date.now()
    }

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.suggestionId !== entry.suggestionId)
      const next = [entry, ...filtered].slice(0, COMMAND_BAR_HISTORY_MAX)
      saveCommandBarHistory(next)
      return next
    })
  }

  const runAction = async (action: CommandBarAction): Promise<boolean> => {
    switch (action.type) {
      case 'open_dashboard_view':
        ensureDashboardRoute()
        ensureDashboardView(action.view)
        return true
      case 'open_settings_section':
        ensureDashboardRoute()
        ensureDashboardView('settings')
        setActiveSettingsSection(action.section)
        return true
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
      case 'run_tool':
        return await runToolAndStoreResult(action.toolName, action.args)
      default:
        return false
    }
  }

  const runSuggestion = async (suggestion: CommandBarSuggestion) => {
    const inputSnapshot = query
    const didRun = await runAction(suggestion.action)
    if (didRun) {
      recordHistory(suggestion, inputSnapshot)
    }

    setQuery('')
    setHighlightIndex(0)
    setIsFocused(false)
    inputRef.current?.blur()
  }


  const autocomplete = useMemo(() => {
    if (!commandBar.enableTabAutocomplete) return null

    const trimmed = query.trim()
    if (!trimmed) return null

    const keywordSuggestion = suggestions.find((suggestion) => COMMAND_AUTOCOMPLETE_KEYWORDS[suggestion.id])
    if (!keywordSuggestion) return null

    const keyword = COMMAND_AUTOCOMPLETE_KEYWORDS[keywordSuggestion.id]
    const normalized = normalizeCommandQuery(trimmed.startsWith('>') ? trimmed.slice(1) : trimmed)
    if (!normalized) return null

    if (!keyword.toLowerCase().startsWith(normalized.toLowerCase())) return null

    const completionText = buildAutocompleteText(trimmed, keyword)
    if (completionText.toLowerCase() === trimmed.toLowerCase()) return null

    const lowerTrimmed = trimmed.toLowerCase()
    const lowerCompletion = completionText.toLowerCase()
    const showGhost = lowerCompletion.startsWith(lowerTrimmed)

    return {
      completionText,
      ghostSuffix: showGhost ? completionText.slice(trimmed.length) : '',
      showGhost
    }
  }, [commandBar.enableTabAutocomplete, query, suggestions])

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab') {
      if (!autocomplete) return

      event.preventDefault()
      const nextValue = autocomplete.completionText
      setQuery(nextValue)

      requestAnimationFrame(() => {
        try {
          inputRef.current?.setSelectionRange(nextValue.length, nextValue.length)
        } catch {
          // Ignore selection errors.
        }
      })
      return
    }

    if (!isOpen && event.key === 'Enter') {
      event.preventDefault()
      if (suggestions.length === 0) {
        showToast('No matching commands', 'info')
        return
      }
      await runSuggestion(suggestions[0])
      return
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault()
        setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
        return
      }
      case 'ArrowUp': {
        event.preventDefault()
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      case 'Enter': {
        event.preventDefault()
        const selected = suggestions[highlightIndex] || suggestions[0]
        if (selected) {
          await runSuggestion(selected)
        }
        return
      }
      case 'Escape': {
        event.preventDefault()
        setQuery('')
        setIsFocused(false)
        inputRef.current?.blur()
        return
      }
      default:
        return
    }
  }

  const keyHint = navigator.platform.toLowerCase().includes('mac') ? '⌘ + Space' : 'Ctrl + Space'
  const idlePlaceholderText = idlePlaceholder && idlePlaceholder.trim() ? idlePlaceholder : 'Search or run a command'
  const placeholder = isFocused ? 'Search or run a command' : idlePlaceholderText

  const hasRecentsSection = showRecents && recentSuggestions.length > 0
  const recentsCount = hasRecentsSection ? recentSuggestions.length : 0
  const recentsToRender = recentsCount > 0 ? suggestions.slice(0, recentsCount) : []
  const otherSuggestionsToRender = suggestions.slice(recentsCount)

  const renderSuggestionItem = (suggestion: CommandBarSuggestion, index: number, isRecent: boolean = false) => {
    const isActive = index === highlightIndex

    return (
      <div
        key={suggestion.id}
        className={[
          'app-titlebar__commandbar-item',
          isActive ? 'app-titlebar__commandbar-item--active' : null,
        ].filter(Boolean).join(' ')}
        role="option"
        aria-selected={isActive}
        onMouseEnter={() => setHighlightIndex(index)}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void runSuggestion(suggestion)
        }}
      >
        <div className="app-titlebar__commandbar-item-text">
          <div className="app-titlebar__commandbar-item-title">{suggestion.title}</div>
          {!isRecent && suggestion.subtitle && (
            <div className="app-titlebar__commandbar-item-subtitle">{suggestion.subtitle}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="app-titlebar__commandbar no-drag"
      ref={containerRef}
      style={commandBarStyle}
      onMouseDown={(event) => {
        // Click empty space/icon to focus; don't steal caret clicks.
        const target = event.target as HTMLElement | null
        if (target && target.tagName === 'INPUT') return
        focusInput()
      }}
    >
      <div className={[
        'app-titlebar__commandbar-field',
        isFocused ? 'app-titlebar__commandbar-field--focused' : null,
      ].filter(Boolean).join(' ')}>
        <Search size={14} className="app-titlebar__commandbar-icon" />
        <div className="app-titlebar__commandbar-input-wrap">
          {autocomplete?.showGhost && autocomplete.ghostSuffix && (
            <div className="app-titlebar__commandbar-ghost" aria-hidden="true">
              <span className="app-titlebar__commandbar-ghost-prefix">{query}</span>
              <span className="app-titlebar__commandbar-ghost-suffix">{autocomplete.ghostSuffix}</span>
            </div>
          )}
          <input
            ref={inputRef}
            className="app-titlebar__commandbar-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // Outside clicks are handled globally; this keeps blur behavior predictable.
              setIsFocused(false)
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            spellCheck={false}
          />
        </div>
        {isFocused && autocomplete && (
          <span className="app-titlebar__commandbar-hint">Tab</span>
        )}
        {!query && !isFocused && (
          <span className="app-titlebar__commandbar-hint">{keyHint}</span>
        )}
      </div>

      {isOpen && (
        <div
          className={`app-titlebar__commandbar-dropdown ${isClosing ? 'app-titlebar__commandbar-dropdown--closing' : ''}`}
          role="listbox"
        >
          {hasRecentsSection && (
            <>
              <div
                className="app-titlebar__commandbar-section app-titlebar__commandbar-section--clickable"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleRecentsCollapsed()
                }}
              >
                <div className="app-titlebar__commandbar-section-label">Recent</div>
                <ChevronDown
                  size={12}
                  style={{
                    transform: recentsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                    opacity: 0.5
                  }}
                />
              </div>
              {!recentsCollapsed && recentsToRender.map((suggestion, index) =>
                renderSuggestionItem(suggestion, index, true)
              )}
            </>
          )}

          {otherSuggestionsToRender.length > 0 && (
            <>
              {hasRecentsSection && <div className="app-titlebar__commandbar-divider" />}
              <div
                className="app-titlebar__commandbar-section app-titlebar__commandbar-section--clickable"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleShortcutsCollapsed()
                }}
              >
                <div className="app-titlebar__commandbar-section-label">Shortcuts</div>
                <ChevronDown
                  size={12}
                  style={{
                    transform: shortcutsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                    opacity: 0.5
                  }}
                />
              </div>
              {!shortcutsCollapsed && otherSuggestionsToRender.map((suggestion, index) =>
                renderSuggestionItem(suggestion, recentsCount + index, false)
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
