import { useEffect, lazy, Suspense } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import { useAppShell } from '../../contexts/AppShellContext'
import { useSettings } from '../../contexts/SettingsContext'
import { isSkillEnabled } from '../../skills'
import { loadSettingsModule } from '../Settings/settingsLoader'
import { resolveSettingsNavigation } from '../../constants/settingsSections'

// Lazy load Settings component for memory optimization
// Only loads when user actually opens Settings
const Settings = lazy(loadSettingsModule)
const RemindersView = lazy(() => import('./RemindersView'))
const ArtifactsView = lazy(() => import('./ArtifactsView'))
const FoldersView = lazy(() => import('./FoldersView'))

function SettingsLoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--theme-text-muted)',
      }}
    >
      Loading Settings...
    </div>
  )
}

export default function DashboardLayout() {
  const {
    dashboardView: view,
    setDashboardView,
    activeSettingsSection,
    setActiveSettingsSection,
    setSettingsSectionParams,
  } = useAppShell()
  const { settings } = useSettings()
  const remindersEnabled = isSkillEnabled(settings.skills, 'reminders')
  const artifactsEnabled = isSkillEnabled(settings.skills, 'artifacts')

  useEffect(() => {
    if (view === 'reminders' && !remindersEnabled) {
      setDashboardView('chat')
    }
    if (view === 'artifacts' && !artifactsEnabled) {
      setDashboardView('chat')
    }
  }, [artifactsEnabled, remindersEnabled, setDashboardView, view])

  useEffect(() => {
    if (!window.ipcRenderer?.on) return
    const listener = (_event: unknown, section: unknown) => {
      if (typeof section !== 'string') return
      const resolved = resolveSettingsNavigation(section)
      setActiveSettingsSection(resolved.section)
      if (resolved.extension || resolved.extensionPanel) {
        setSettingsSectionParams({
          extension: resolved.extension,
          extensionPanel: resolved.extensionPanel,
        })
      } else {
        setSettingsSectionParams(null)
      }
      setDashboardView('settings')
    }
    window.ipcRenderer.on('settings:navigate', listener)
    return () => {
      window.ipcRenderer.off('settings:navigate', listener)
    }
  }, [setActiveSettingsSection, setDashboardView, setSettingsSectionParams])

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Sidebar
        view={view}
        activeSettingsSection={activeSettingsSection}
        onNavigateSettings={setActiveSettingsSection}
      />

      {/* Main Content Area - ChatArea or Settings - always has solid background */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'transparent',
          zIndex: 1,
          contain: 'strict', // Isolate from sidebar resize reflow — content is absolutely positioned inside
        }}
      >
        <div className="dashboard-main-canvas">
          {view === 'settings' ? (
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
              <Suspense fallback={<SettingsLoadingFallback />}>
                <Settings activeSection={activeSettingsSection} />
              </Suspense>
            </div>
          ) : view === 'reminders' && remindersEnabled ? (
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
              <Suspense fallback={<SettingsLoadingFallback />}>
                <RemindersView />
              </Suspense>
            </div>
          ) : view === 'artifacts' && artifactsEnabled ? (
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
              <Suspense fallback={<SettingsLoadingFallback />}>
                <ArtifactsView />
              </Suspense>
            </div>
          ) : view === 'folders' ? (
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
              <Suspense fallback={<SettingsLoadingFallback />}>
                <FoldersView />
              </Suspense>
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
              <ChatArea />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
