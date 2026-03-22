import { useState, useCallback, lazy, Suspense } from 'react'
import Sidebar from './Sidebar'
import ChatArea from './ChatArea'
import { useAppShell } from '../../contexts/AppShellContext'
import { loadSettingsModule } from '../Settings/settingsLoader'

// Lazy load Settings component for memory optimization
// Only loads when user actually opens Settings
const Settings = lazy(loadSettingsModule)

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
    activeSettingsSection,
    setActiveSettingsSection,
    hasUnsavedSettings,
    setHasUnsavedSettings,
  } = useAppShell()
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)

  // This callback is passed to Settings to track unsaved changes
  const handleUnsavedChange = useCallback((hasChanges: boolean) => {
    setHasUnsavedSettings(hasChanges)
  }, [])

  // This is called when trying to navigate away with unsaved changes
  const triggerWarning = useCallback(() => {
    setShowUnsavedWarning(true)
    setTimeout(() => setShowUnsavedWarning(false), 600)
  }, [])

  // Wrapper for navigation that checks for unsaved changes
  const handleNavigate = useCallback(
    (action: () => void) => {
      if (hasUnsavedSettings) {
        triggerWarning()
        return false // blocked
      }
      action()
      return true // allowed
    },
    [hasUnsavedSettings, triggerWarning]
  )

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
        onNavigateSettings={(section) => handleNavigate(() => setActiveSettingsSection(section))}
      />

      {/* Main Content Area - ChatArea or Settings - always has solid background */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--theme-sidebar-solid)',
          zIndex: 1,
          contain: 'strict', // Isolate from sidebar resize reflow — content is absolutely positioned inside
        }}
      >
        <div className="dashboard-main-canvas">
          {view === 'settings' ? (
            <div
              className="theme-section-enter"
              style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
            >
              <Suspense fallback={<SettingsLoadingFallback />}>
                <Settings
                  activeSection={activeSettingsSection}
                  onUnsavedChange={handleUnsavedChange}
                  showWarning={showUnsavedWarning}
                />
              </Suspense>
            </div>
          ) : (
            <div
              className="theme-section-enter"
              style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
            >
              <ChatArea />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
