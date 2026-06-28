import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from './SettingsContext'
import { SIDEBAR_DEFAULT_WIDTH_PX, clampSidebarWidth } from '../constants/sidebar'
import { normalizeSettingsSection, resolveSettingsNavigation } from '../constants/settingsSections'
import type { CatalogExtensionId } from '../components/Settings/sections/extensionCatalog'
import type { ProviderId } from '../providers/providerTypes'
import { warnOnceDuringHmr } from './hmrWarnings'
import {
  canGoBackInShellHistory,
  canGoForwardInShellHistory,
  createShellNavigationHistory,
  getNextShellSnapshot,
  getPreviousShellSnapshot,
  moveBackInShellHistory,
  moveForwardInShellHistory,
  pushShellNavigationSnapshot,
  type AppShellNavigationSnapshot,
} from './appShellNavigation'

export type DashboardView = 'chat' | 'settings' | 'reminders' | 'artifacts' | 'folders'

export type ProviderKey = ProviderId

export interface SettingsSectionParams {
  provider?: ProviderKey
  manageMode?: 'providers' | 'search-apis'
  commandPaletteTab?: boolean
  extension?: CatalogExtensionId
  extensionPanel?: 'notifications'
}

interface AppShellContextType {
  dashboardView: DashboardView
  setDashboardView: (view: DashboardView) => void
  activeSettingsSection: string
  setActiveSettingsSection: (section: string) => void
  settingsSectionParams: SettingsSectionParams | null
  setSettingsSectionParams: (params: SettingsSectionParams | null) => void
  selectedFolderId: string | null
  setSelectedFolderId: (folderId: string | null) => void
  hasUnsavedSettings: boolean
  setHasUnsavedSettings: (hasUnsaved: boolean) => void
  sidebarCollapsed: boolean
  toggleSidebarCollapsed: () => void
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  sidebarHidden: boolean
  toggleSidebarHidden: () => void
  setSidebarHidden: (hidden: boolean) => void
  /** True while the user is actively dragging the sidebar resize handle */
  isResizingSidebar: boolean
  setIsResizingSidebar: (resizing: boolean) => void
  canGoBack: boolean
  canGoForward: boolean
  goBack: () => void
  goForward: () => void
}

const AppShellContext = createContext<AppShellContextType | undefined>(undefined)

const STORAGE_KEYS = {
  dashboardView: 'zura-ui:dashboardView',
  settingsSection: 'zura-ui:settingsSection',
  sidebarCollapsed: 'zura-ui:sidebarCollapsed',
  sidebarWidth: 'zura-ui:sidebarWidth',
  sidebarHidden: 'zura-ui:sidebarHidden',
  selectedFolderId: 'zura-ui:selectedFolderId',
} as const

function readStoredDashboardView(): DashboardView | null {
  const raw = localStorage.getItem(STORAGE_KEYS.dashboardView)
  if (
    raw === 'chat' ||
    raw === 'settings' ||
    raw === 'reminders' ||
    raw === 'artifacts' ||
    raw === 'folders'
  ) return raw
  return null
}

function readStoredSettingsSection(): string | null {
  const raw = localStorage.getItem(STORAGE_KEYS.settingsSection)
  const normalized = normalizeSettingsSection(raw)
  return normalized
}

function readStoredBoolean(key: string): boolean | null {
  const raw = localStorage.getItem(key)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function readStoredSidebarWidth(): number | null {
  const raw = localStorage.getItem(STORAGE_KEYS.sidebarWidth)
  if (raw == null) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return clampSidebarWidth(parsed)
}

export interface AppShellProviderProps {
  children: React.ReactNode
  pathname?: string
  navigateToPath?: (pathname: string) => void
}

export function AppShellProvider({
  children,
  pathname = '/dashboard',
  navigateToPath,
}: AppShellProviderProps) {
  const { settings } = useSettings()

  const [dashboardView, setDashboardViewState] = useState<DashboardView>(() => {
    if (settings.rememberLastDashboardView) {
      return readStoredDashboardView() ?? 'chat'
    }
    return 'chat'
  })

  const [activeSettingsSection, setActiveSettingsSectionState] = useState<string>(() => {
    if (settings.rememberLastSettingsSection) {
      return readStoredSettingsSection() ?? 'providers'
    }
    return 'providers'
  })

  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false)

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (settings.rememberLastDashboardView) {
      return readStoredBoolean(STORAGE_KEYS.sidebarCollapsed) ?? false
    }
    return false
  })

  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    if (settings.rememberLastDashboardView) {
      return readStoredSidebarWidth() ?? SIDEBAR_DEFAULT_WIDTH_PX
    }
    return SIDEBAR_DEFAULT_WIDTH_PX
  })

  const [sidebarHidden, setSidebarHiddenState] = useState<boolean>(() => {
    if (settings.rememberLastDashboardView) {
      return readStoredBoolean(STORAGE_KEYS.sidebarHidden) ?? false
    }
    return false
  })

  const [settingsSectionParams, setSettingsSectionParamsState] =
    useState<SettingsSectionParams | null>(null)
  const [selectedFolderId, setSelectedFolderIdState] = useState<string | null>(() => {
    if (!settings.rememberLastDashboardView) return null
    const raw = localStorage.getItem(STORAGE_KEYS.selectedFolderId)
    return raw && raw.trim() ? raw : null
  })

  const [isResizingSidebar, setIsResizingSidebarState] = useState(false)
  const [navigationHistory, setNavigationHistory] = useState(() =>
    createShellNavigationHistory({
      pathname,
      dashboardView,
      activeSettingsSection,
    })
  )
  const pendingAppliedSnapshotRef = useRef<AppShellNavigationSnapshot | null>(null)

  const setIsResizingSidebar = useCallback((resizing: boolean) => {
    setIsResizingSidebarState(resizing)
  }, [])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthState(clampSidebarWidth(width))
  }, [])

  const toggleSidebarHidden = useCallback(() => {
    setSidebarHiddenState((prev) => !prev)
  }, [])

  const setSidebarHidden = useCallback((hidden: boolean) => {
    setSidebarHiddenState(hidden)
  }, [])

  const setDashboardView = useCallback((view: DashboardView) => {
    setDashboardViewState(view)
  }, [])

  const setActiveSettingsSection = useCallback((section: string) => {
    const resolved = resolveSettingsNavigation(section)
    setActiveSettingsSectionState(resolved.section)
    if (resolved.extension || resolved.extensionPanel) {
      setSettingsSectionParamsState({
        extension: resolved.extension,
        extensionPanel: resolved.extensionPanel,
      })
    } else {
      setSettingsSectionParamsState(null)
    }
  }, [])

  const setSettingsSectionParamsCallback = useCallback((params: SettingsSectionParams | null) => {
    setSettingsSectionParamsState(params)
  }, [])

  const setSelectedFolderId = useCallback((folderId: string | null) => {
    setSelectedFolderIdState(folderId)
  }, [])

  useEffect(() => {
    const currentSnapshot: AppShellNavigationSnapshot = {
      pathname,
      dashboardView,
      activeSettingsSection,
    }

    const pendingAppliedSnapshot = pendingAppliedSnapshotRef.current
    if (pendingAppliedSnapshot) {
      if (
        pendingAppliedSnapshot.pathname === currentSnapshot.pathname &&
        pendingAppliedSnapshot.dashboardView === currentSnapshot.dashboardView &&
        pendingAppliedSnapshot.activeSettingsSection === currentSnapshot.activeSettingsSection
      ) {
        pendingAppliedSnapshotRef.current = null
      }
      return
    }

    setNavigationHistory((prev) => pushShellNavigationSnapshot(prev, currentSnapshot))
  }, [activeSettingsSection, dashboardView, pathname])

  const applyHistorySnapshot = useCallback(
    (snapshot: AppShellNavigationSnapshot) => {
      pendingAppliedSnapshotRef.current = snapshot

      if (snapshot.pathname !== pathname) {
        navigateToPath?.(snapshot.pathname)
      }

      setDashboardViewState(snapshot.dashboardView)
      setActiveSettingsSectionState(snapshot.activeSettingsSection)
    },
    [navigateToPath, pathname]
  )

  const goBack = useCallback(() => {
    const targetSnapshot = getPreviousShellSnapshot(navigationHistory)
    if (!targetSnapshot) {
      return
    }

    setNavigationHistory((prev) => moveBackInShellHistory(prev))
    applyHistorySnapshot(targetSnapshot)
  }, [applyHistorySnapshot, navigationHistory])

  const goForward = useCallback(() => {
    const targetSnapshot = getNextShellSnapshot(navigationHistory)
    if (!targetSnapshot) {
      return
    }

    setNavigationHistory((prev) => moveForwardInShellHistory(prev))
    applyHistorySnapshot(targetSnapshot)
  }, [applyHistorySnapshot, navigationHistory])

  const canGoBack = canGoBackInShellHistory(navigationHistory)
  const canGoForward = canGoForwardInShellHistory(navigationHistory)

  useEffect(() => {
    if (!settings.rememberLastDashboardView) {
      localStorage.removeItem(STORAGE_KEYS.dashboardView)
      return
    }
    localStorage.setItem(STORAGE_KEYS.dashboardView, dashboardView)
  }, [dashboardView, settings.rememberLastDashboardView])

  useEffect(() => {
    if (!settings.rememberLastDashboardView) {
      localStorage.removeItem(STORAGE_KEYS.sidebarCollapsed)
      return
    }
    localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, String(sidebarCollapsed))
  }, [sidebarCollapsed, settings.rememberLastDashboardView])

  useEffect(() => {
    if (!settings.rememberLastDashboardView) {
      localStorage.removeItem(STORAGE_KEYS.sidebarWidth)
      return
    }
    // Avoid synchronous localStorage writes on every drag frame; the value is
    // persisted once when the resize gesture ends (isResizingSidebar flips back).
    if (isResizingSidebar) return
    localStorage.setItem(STORAGE_KEYS.sidebarWidth, String(clampSidebarWidth(sidebarWidth)))
  }, [sidebarWidth, settings.rememberLastDashboardView, isResizingSidebar])

  useEffect(() => {
    if (!settings.rememberLastDashboardView) {
      localStorage.removeItem(STORAGE_KEYS.sidebarHidden)
      return
    }
    localStorage.setItem(STORAGE_KEYS.sidebarHidden, String(sidebarHidden))
  }, [sidebarHidden, settings.rememberLastDashboardView])

  useEffect(() => {
    if (!settings.rememberLastSettingsSection) {
      localStorage.removeItem(STORAGE_KEYS.settingsSection)
      return
    }
    localStorage.setItem(STORAGE_KEYS.settingsSection, activeSettingsSection)
  }, [activeSettingsSection, settings.rememberLastSettingsSection])

  useEffect(() => {
    if (!settings.rememberLastDashboardView) {
      localStorage.removeItem(STORAGE_KEYS.selectedFolderId)
      return
    }
    if (selectedFolderId) {
      localStorage.setItem(STORAGE_KEYS.selectedFolderId, selectedFolderId)
    } else {
      localStorage.removeItem(STORAGE_KEYS.selectedFolderId)
    }
  }, [selectedFolderId, settings.rememberLastDashboardView])

  const value = useMemo(
    () => ({
      dashboardView,
      setDashboardView,
      activeSettingsSection,
      setActiveSettingsSection,
      settingsSectionParams,
      setSettingsSectionParams: setSettingsSectionParamsCallback,
      selectedFolderId,
      setSelectedFolderId,
      hasUnsavedSettings,
      setHasUnsavedSettings,
      sidebarCollapsed,
      toggleSidebarCollapsed,
      sidebarWidth,
      setSidebarWidth,
      sidebarHidden,
      toggleSidebarHidden,
      setSidebarHidden,
      isResizingSidebar,
      setIsResizingSidebar,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
    }),
    [
      activeSettingsSection,
      canGoBack,
      canGoForward,
      dashboardView,
      goBack,
      goForward,
      hasUnsavedSettings,
      isResizingSidebar,
      setActiveSettingsSection,
      setDashboardView,
      setIsResizingSidebar,
      setSelectedFolderId,
      setSettingsSectionParamsCallback,
      setSidebarHidden,
      settingsSectionParams,
      selectedFolderId,
      sidebarCollapsed,
      sidebarWidth,
      sidebarHidden,
      setSidebarWidth,
      toggleSidebarCollapsed,
      toggleSidebarHidden,
    ]
  )

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell() {
  const context = useContext(AppShellContext)
  if (context === undefined) {
    // During HMR, the context may temporarily be undefined
    // Return a safe default to prevent crashes during hot reload
    if (import.meta.hot) {
      warnOnceDuringHmr('AppShellContext', '[AppShellContext] Context undefined during HMR, using defaults')
      return {
        dashboardView: 'chat' as DashboardView,
        setDashboardView: () => {},
        activeSettingsSection: 'providers',
        setActiveSettingsSection: () => {},
        settingsSectionParams: null,
        setSettingsSectionParams: () => {},
        selectedFolderId: null,
        setSelectedFolderId: () => {},
        hasUnsavedSettings: false,
        setHasUnsavedSettings: () => {},
        sidebarCollapsed: false,
        toggleSidebarCollapsed: () => {},
        sidebarWidth: SIDEBAR_DEFAULT_WIDTH_PX,
        setSidebarWidth: () => {},
        sidebarHidden: false,
        toggleSidebarHidden: () => {},
        setSidebarHidden: () => {},
        isResizingSidebar: false,
        setIsResizingSidebar: () => {},
        canGoBack: false,
        canGoForward: false,
        goBack: () => {},
        goForward: () => {},
      }
    }
    throw new Error('useAppShell must be used within a AppShellProvider')
  }
  return context
}
