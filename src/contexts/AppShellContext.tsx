import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSettings } from './SettingsContext'

export type DashboardView = 'chat' | 'settings'

export type ProviderKey = 'openrouter' | 'perplexity' | 'groq' | 'ollama' | 'alibaba'

export interface SettingsSectionParams {
    provider?: ProviderKey
    manageMode?: 'providers' | 'search-apis'
    commandPaletteTab?: boolean
}

interface AppShellContextType {
    dashboardView: DashboardView
    setDashboardView: (view: DashboardView) => void
    activeSettingsSection: string
    setActiveSettingsSection: (section: string) => void
    settingsSectionParams: SettingsSectionParams | null
    setSettingsSectionParams: (params: SettingsSectionParams | null) => void
    hasUnsavedSettings: boolean
    setHasUnsavedSettings: (hasUnsaved: boolean) => void
    sidebarCollapsed: boolean
    toggleSidebarCollapsed: () => void
    sidebarHidden: boolean
    toggleSidebarHidden: () => void
    setSidebarHidden: (hidden: boolean) => void
}

const AppShellContext = createContext<AppShellContextType | undefined>(undefined)

const STORAGE_KEYS = {
    dashboardView: 'zura-ui:dashboardView',
    settingsSection: 'zura-ui:settingsSection',
    sidebarCollapsed: 'zura-ui:sidebarCollapsed',
    sidebarHidden: 'zura-ui:sidebarHidden',
} as const

const VALID_SETTINGS_SECTIONS = new Set<string>([
    'usage',
    'providers',
    'themes',
    'systemprompt',
    'experimental',
])

function normalizeSettingsSection(section: string | null): string | null {
    if (!section) return null
    if (section === 'tools' || section === 'models' || section === 'preferences') return 'providers'
    if (section === 'commandbar') return 'themes'
    if (section === 'notifications') return 'usage'
    const normalized = VALID_SETTINGS_SECTIONS.has(section) ? section : null
    return normalized
}

function readStoredDashboardView(): DashboardView | null {

    const raw = localStorage.getItem(STORAGE_KEYS.dashboardView)
    if (raw === 'chat' || raw === 'settings') return raw
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

export function AppShellProvider({ children }: { children: React.ReactNode }) {
    const { settings } = useSettings()

    const [dashboardView, setDashboardViewState] = useState<DashboardView>(() => {
        if (settings.rememberLastDashboardView) {
            return readStoredDashboardView() ?? 'chat'
        }
        return 'chat'
    })

    const [activeSettingsSection, setActiveSettingsSectionState] = useState<string>(() => {
        if (settings.rememberLastSettingsSection) {
            return readStoredSettingsSection() ?? 'usage'
        }
        return 'usage'
    })

    const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false)

    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        if (settings.rememberLastDashboardView) {
            return readStoredBoolean(STORAGE_KEYS.sidebarCollapsed) ?? false
        }
        return false
    })

    const [sidebarHidden, setSidebarHiddenState] = useState<boolean>(() => {
        if (settings.rememberLastDashboardView) {
            return readStoredBoolean(STORAGE_KEYS.sidebarHidden) ?? false
        }
        return false
    })

    const [settingsSectionParams, setSettingsSectionParamsState] = useState<SettingsSectionParams | null>(null)

    const toggleSidebarCollapsed = useCallback(() => {
        setSidebarCollapsed(prev => !prev)
    }, [])

    const toggleSidebarHidden = useCallback(() => {
        setSidebarHiddenState(prev => !prev)
    }, [])

    const setSidebarHidden = useCallback((hidden: boolean) => {
        setSidebarHiddenState(hidden)
    }, [])

    const setDashboardView = useCallback((view: DashboardView) => {
        setDashboardViewState(view)
    }, [])

    const setActiveSettingsSection = useCallback((section: string) => {
        const normalized = normalizeSettingsSection(section) ?? 'usage'
        setActiveSettingsSectionState(normalized)
    }, [])

    const setSettingsSectionParamsCallback = useCallback((params: SettingsSectionParams | null) => {
        setSettingsSectionParamsState(params)
    }, [])


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

    const value = useMemo(() => ({
        dashboardView,
        setDashboardView,
        activeSettingsSection,
        setActiveSettingsSection,
        settingsSectionParams,
        setSettingsSectionParams: setSettingsSectionParamsCallback,
        hasUnsavedSettings,
        setHasUnsavedSettings,
        sidebarCollapsed,
        toggleSidebarCollapsed,
        sidebarHidden,
        toggleSidebarHidden,
        setSidebarHidden,
    }), [
        activeSettingsSection,
        dashboardView,
        hasUnsavedSettings,
        setActiveSettingsSection,
        setDashboardView,
        setSettingsSectionParamsCallback,
        setSidebarHidden,
        settingsSectionParams,
        sidebarCollapsed,
        sidebarHidden,
        toggleSidebarCollapsed,
        toggleSidebarHidden,
    ])

    return (
        <AppShellContext.Provider value={value}>
            {children}
        </AppShellContext.Provider>
    )
}

export function useAppShell() {
    const context = useContext(AppShellContext)
    if (context === undefined) {
        // During HMR, the context may temporarily be undefined
        // Return a safe default to prevent crashes during hot reload
        if (import.meta.hot) {
            console.warn('[AppShellContext] Context undefined during HMR, using defaults')
            return {
                dashboardView: 'chat' as DashboardView,
                setDashboardView: () => {},
                activeSettingsSection: 'usage',
                setActiveSettingsSection: () => {},
                settingsSectionParams: null,
                setSettingsSectionParams: () => {},
                hasUnsavedSettings: false,
                setHasUnsavedSettings: () => {},
                sidebarCollapsed: false,
                toggleSidebarCollapsed: () => {},
                sidebarHidden: false,
                toggleSidebarHidden: () => {},
                setSidebarHidden: () => {},
            }
        }
        throw new Error('useAppShell must be used within a AppShellProvider')
    }
    return context
}
