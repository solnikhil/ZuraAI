import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import { useChatHistory } from '../../contexts/ChatHistoryContext'
import { type DashboardView, useAppShell } from '../../contexts/AppShellContext'
import { useSettingsUI } from '../../contexts/SettingsUIContext'
import { useSettings } from '../../contexts/SettingsContext'
import { isSkillEnabled } from '../../skills'
import TitleBarInfoMenu from '../TitleBarInfoMenu'
import SidebarSearchOverlay from './Sidebar/SidebarSearchOverlay'
import { groupSessions } from './Sidebar/utils/groupSessions'
import type { ChatRowAction } from './Sidebar/ChatRow'
import { SIDEBAR_COLLAPSED_WIDTH_PX, clampSidebarWidth } from '../../constants/sidebar'
import './Sidebar/Sidebar.css'
import SidebarChatView from './SidebarChatView'
import SidebarSettingsView from './SidebarSettingsView'
import { isMacOSRuntime, isWindowsRuntime } from '../../utils/platform'
import { WithTooltip } from '../ui/WithTooltip'

interface SidebarProps {
  view: DashboardView
  activeSettingsSection: string
  onNavigateSettings: (section: string) => void
}

export default function Sidebar({ view, activeSettingsSection, onNavigateSettings }: SidebarProps) {
  const isMacOS = isMacOSRuntime()
  const isWindows = isWindowsRuntime()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false)
  const {
    dashboardView,
    setDashboardView,
    hasUnsavedSettings,
    sidebarHidden,
    sidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    setIsResizingSidebar,
    selectedFolderId,
    setSelectedFolderId,
  } = useAppShell()
  const {
    sessions,
    folders,
    currentSessionId,
    switchSession,
    deleteSession,
    clearCurrentSession,
    updateSessionTitle,
    pinSession,
    unpinSession,
    duplicateSession: duplicateSessionAction,
    assignFolder,
    removeFromFolder,
    createFolder,
    deleteFolder,
    renameFolder,
  } = useChatHistory()
  const { settingsUI } = useSettingsUI()
  const { settings } = useSettings()
  const { chatSelectedOverlayStyle = 'linear' } = settingsUI
  const remindersEnabled = isSkillEnabled(settings.skills, 'reminders')
  const artifactsEnabled = isSkillEnabled(settings.skills, 'artifacts')
  const sidebarFooterScrollPadding = 72
  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) => a.order - b.order || a.createdAt - b.createdAt || a.name.localeCompare(b.name)
      ),
    [folders]
  )

  // Sidebar state
  const [focusIndex, setFocusIndex] = useState(-1)
  const [peeking, setPeeking] = useState(false)
  const [peekClosing, setPeekClosing] = useState(false)
  const peekCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  // Group sessions for sidebar list
  const groupedSessions = useMemo(
    () => groupSessions(sessions, sortedFolders),
    [sessions, sortedFolders]
  )

  // Flatten visible sessions for keyboard navigation (pinned + folders + time groups in display order)
  const flatVisibleSessions = useMemo(() => {
    const flat = [...groupedSessions.pinned]
    flat.push(
      ...groupedSessions.today,
      ...groupedSessions.yesterday,
      ...groupedSessions.previous7Days,
      ...groupedSessions.previous30Days,
      ...groupedSessions.older
    )
    return flat
  }, [groupedSessions])

  const sessionIndexMap = useMemo(() => {
    const indexMap = new Map<string, number>()
    flatVisibleSessions.forEach((session, index) => {
      indexMap.set(session.id, index)
    })
    return indexMap
  }, [flatVisibleSessions])

  // Clamp focus index when list changes
  useEffect(() => {
    if (focusIndex >= flatVisibleSessions.length) {
      setFocusIndex(Math.max(flatVisibleSessions.length - 1, -1))
    }
  }, [flatVisibleSessions.length, focusIndex])

  // Global Ctrl+N / Cmd+N shortcut (Requirement 2.4)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        clearCurrentSession()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [clearCurrentSession])

  useEffect(() => {
    if (view !== 'chat' && searchOverlayOpen) {
      setSearchOverlayOpen(false)
      setSearchQuery('')
    }
  }, [view, searchOverlayOpen])

  const openSearchOverlay = useCallback(() => {
    setSearchOverlayOpen(true)
  }, [])

  const closeSearchOverlay = useCallback(() => {
    setSearchOverlayOpen(false)
    setSearchQuery('')
  }, [])

  const openReminders = useCallback(() => {
    setDashboardView('reminders')
  }, [setDashboardView])

  const openArtifacts = useCallback(() => {
    setDashboardView('artifacts')
  }, [setDashboardView])

  const openFolders = useCallback(() => {
    setDashboardView('folders')
  }, [setDashboardView])

  const openFolder = useCallback(
    (folderId: string) => {
      setSelectedFolderId(folderId)
      setDashboardView('folders')
    },
    [setDashboardView, setSelectedFolderId]
  )

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      switchSession(sessionId)
      if (
        dashboardView === 'reminders' ||
        dashboardView === 'artifacts' ||
        dashboardView === 'folders'
      ) {
        setDashboardView('chat')
      }
    },
    [switchSession, dashboardView, setDashboardView]
  )

  const handleNewChat = useCallback(() => {
    clearCurrentSession()
    if (
      dashboardView === 'reminders' ||
      dashboardView === 'artifacts' ||
      dashboardView === 'folders'
    ) {
      setDashboardView('chat')
    }
  }, [clearCurrentSession, dashboardView, setDashboardView])

  const handleCreateFolder = useCallback(
    (name: string, memoryMode?: Parameters<typeof createFolder>[1]) => {
      const folderId = createFolder(name, memoryMode)
      openFolder(folderId)
    },
    [createFolder, openFolder]
  )

  // Keyboard navigation handler (Requirements 4.4, 4.5, 4.6, 4.7)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const listLength = flatVisibleSessions.length
      if (listLength === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusIndex((prev) => Math.min(prev + 1, listLength - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          if (focusIndex >= 0 && focusIndex < listLength) {
            handleSelectSession(flatVisibleSessions[focusIndex].id)
          }
          break
        case 'Escape': {
          setSearchOverlayOpen(true)
          setFocusIndex(-1)
          break
        }
      }
    },
    [flatVisibleSessions, focusIndex, handleSelectSession]
  )

  // Context menu action handler
  const handleContextAction = useCallback(
    (action: ChatRowAction, sessionId: string) => {
      switch (action) {
        case 'rename':
          // Handled by RenameChatDialog in SidebarChatList
          break
        case 'pin':
          pinSession(sessionId)
          break
        case 'unpin':
          unpinSession(sessionId)
          break
        case 'delete':
          deleteSession(sessionId)
          break
        case 'duplicate':
          duplicateSessionAction(sessionId)
          break
        case 'removeFromFolder':
          removeFromFolder(sessionId)
          break
      }
    },
    [pinSession, unpinSession, deleteSession, duplicateSessionAction, removeFromFolder]
  )

  const handleRenameConfirm = useCallback(
    (id: string, newTitle: string) => {
      updateSessionTitle(id, newTitle)
    },
    [updateSessionTitle]
  )

  const handleDropSessionToFolder = useCallback(
    (sessionId: string, folderId: string) => {
      assignFolder(sessionId, folderId)
    },
    [assignFolder]
  )

  const stopResizing = useCallback(() => {
    if (!resizeStateRef.current) return
    // Cancel any pending animation frame
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
    resizeStateRef.current = null
    setIsResizing(false)
    setIsResizingSidebar(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [setIsResizingSidebar])

  const handleResizePointerMove = useCallback(
    (event: PointerEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState) return
      // Throttle to one update per animation frame to avoid per-pixel re-renders
      if (resizeRafRef.current !== null) return
      const clientX = event.clientX
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null
        const deltaX = clientX - resizeState.startX
        const nextWidth = clampSidebarWidth(resizeState.startWidth + deltaX)
        setSidebarWidth(nextWidth)
      })
    },
    [setSidebarWidth]
  )

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || sidebarHidden || sidebarCollapsed) return
      event.preventDefault()
      event.stopPropagation()
      resizeStateRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth,
      }
      setIsResizing(true)
      setIsResizingSidebar(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [sidebarCollapsed, sidebarHidden, sidebarWidth, setIsResizingSidebar]
  )

  useEffect(() => {
    if (!isResizing) return
    window.addEventListener('pointermove', handleResizePointerMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)
    return () => {
      window.removeEventListener('pointermove', handleResizePointerMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [handleResizePointerMove, isResizing, stopResizing])

  useEffect(() => {
    if ((sidebarHidden || sidebarCollapsed) && isResizing) {
      stopResizing()
    }
  }, [isResizing, sidebarCollapsed, sidebarHidden, stopResizing])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current)
      }
      if (peekCloseTimer.current) {
        clearTimeout(peekCloseTimer.current)
      }
    }
  }, [])

  const isPeeking = sidebarHidden && peeking
  const isPeekClosing = sidebarHidden && peekClosing && !peeking
  // Keep the flyout positioned as an overlay while it slides back out so the
  // main content layout never reflows when the peek closes.
  const isPeekOverlay = sidebarHidden && (peeking || peekClosing)

  const openPeek = useCallback(() => {
    if (peekCloseTimer.current) {
      clearTimeout(peekCloseTimer.current)
      peekCloseTimer.current = null
    }
    setPeekClosing(false)
    setPeeking(true)
  }, [])

  const closePeek = useCallback(() => {
    setPeeking(false)
    setPeekClosing(true)
    if (peekCloseTimer.current) clearTimeout(peekCloseTimer.current)
    peekCloseTimer.current = setTimeout(() => {
      setPeekClosing(false)
      peekCloseTimer.current = null
    }, 240)
  }, [])

  // Reset peek whenever the sidebar is no longer hidden
  useEffect(() => {
    if (!sidebarHidden && (peeking || peekClosing)) {
      setPeeking(false)
      setPeekClosing(false)
      if (peekCloseTimer.current) {
        clearTimeout(peekCloseTimer.current)
        peekCloseTimer.current = null
      }
    }
  }, [sidebarHidden, peeking, peekClosing])

  const containerClasses = [
    'sidebar-container',
    isMacOS ? 'sidebar-container--macos' : '',
    isWindows ? 'sidebar-container--windows' : '',
    sidebarHidden && !isPeekOverlay ? 'sidebar-container--hidden' : '',
    isPeekOverlay ? 'sidebar-container--peek' : '',
    isPeekClosing ? 'sidebar-container--peek-closing' : '',
    sidebarCollapsed ? 'sidebar-container--collapsed' : 'sidebar-container--expanded',
    isResizing ? 'sidebar-container--resizing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Structural styles stay inline for testability (JSDOM doesn't load CSS files)
  const openWidthPx = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : sidebarWidth
  const collapsedAway = sidebarHidden && !isPeekOverlay
  const layoutWidthPx = sidebarHidden ? 0 : openWidthPx
  const containerStyle: React.CSSProperties = {
    width: `${layoutWidthPx}px`,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: `${layoutWidthPx}px`,
    // Pin the inner content to its open width so it slides out cleanly (clipped by
    // overflow:hidden) instead of reflowing/squishing while width animates to 0.
    ['--sidebar-inner-width' as string]: `${openWidthPx}px`,
    background: 'var(--theme-sidebar-solid)',
    boxShadow: isPeekOverlay ? undefined : 'none',
    pointerEvents: collapsedAway ? 'none' : 'auto',
    transition: isResizing ? 'none' : undefined,
  }

  return (
    <>
      {sidebarHidden && !isPeeking && (
        <div className="sidebar-peek-trigger" aria-hidden="true" onMouseEnter={openPeek} />
      )}
      <div
        className={containerClasses}
        style={containerStyle}
        onMouseLeave={isPeeking ? closePeek : undefined}
      >
        <div className="sidebar__inner">
          <SidebarChatView
            active={
              view === 'chat' || view === 'reminders' || view === 'artifacts' || view === 'folders'
            }
            groupedSessions={groupedSessions}
            folders={sortedFolders}
            selectedFolderId={selectedFolderId}
            chatSelectedOverlayStyle={chatSelectedOverlayStyle}
            currentSessionId={
              view === 'reminders' || view === 'artifacts' || view === 'folders'
                ? null
                : currentSessionId
            }
            focusIndex={
              view === 'reminders' || view === 'artifacts' || view === 'folders' ? -1 : focusIndex
            }
            flatVisibleSessions={flatVisibleSessions}
            sessionIndexMap={sessionIndexMap}
            bottomPadding={sidebarFooterScrollPadding}
            remindersEnabled={remindersEnabled}
            artifactsEnabled={artifactsEnabled}
            onNewChat={handleNewChat}
            onCreateFolder={handleCreateFolder}
            onOpenSearch={openSearchOverlay}
            onOpenReminders={openReminders}
            onOpenArtifacts={openArtifacts}
            onOpenFolders={openFolders}
            onOpenFolder={openFolder}
            onSelectSession={handleSelectSession}
            onContextAction={handleContextAction}
            onAssignFolder={assignFolder}
            onRemoveFromFolder={removeFromFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onRenameConfirm={handleRenameConfirm}
            onDropSessionToFolder={handleDropSessionToFolder}
            onKeyDown={handleKeyDown}
          />
          <SidebarSettingsView
            active={view === 'settings'}
            activeSettingsSection={activeSettingsSection}
            onNavigateSettings={onNavigateSettings}
          />

          <div className="sidebar-footer-wrapper">
            <TitleBarInfoMenu
              hasUnsavedSettings={hasUnsavedSettings}
              isSettingsView={dashboardView === 'settings'}
              setDashboardView={setDashboardView}
              triggerVariant="sidebar"
              sidebarCollapsed={sidebarCollapsed}
            />
          </div>
        </div>

        <SidebarSearchOverlay
          isOpen={view === 'chat' && searchOverlayOpen}
          query={searchQuery}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onQueryChange={setSearchQuery}
          onSelectSession={handleSelectSession}
          onClose={closeSearchOverlay}
        />

        {!sidebarHidden && !sidebarCollapsed && (
          <WithTooltip tooltip="Drag to resize sidebar">
            <div
              className="sidebar-resize-handle"
              aria-hidden="true"
              onPointerDown={handleResizePointerDown}
            />
          </WithTooltip>
        )}
      </div>
    </>
  )
}
