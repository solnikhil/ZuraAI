import { lazy, Suspense, useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import AboutWindow from './components/AboutWindow'
import OverlaySync from './components/OverlaySync'
import OverlayView from './components/OverlayView'
import PromptPopupView from './components/PromptPopupView'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import NotFound404 from './components/ui/demo'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { StreamingProvider } from './contexts/StreamingContext'
import { QuickSendProvider } from './contexts/QuickSendContext'
import { ModelSelectorProvider, useModelSelectorContext } from './contexts/ModelSelectorContext'
import { McpProvider } from './mcp/McpContext'
import { ToastProvider, ErrorBoundary } from './components/shared'
import { McpApprovalDialog } from './components/mcp/McpApprovalDialog'
import { loadSettingsModule } from './components/Settings/settingsLoader'

const Settings = lazy(loadSettingsModule)

function ModelSelectorOpener() {
  const { openSelector } = useModelSelectorContext()

  useEffect(() => {
    if (!window.ipcRenderer?.on) return
    const listener = (_event: unknown) => openSelector()
    window.ipcRenderer.on('model-selector:open', listener)
    return () => {
      window.ipcRenderer.off('model-selector:open', listener)
    }
  }, [openSelector])

  return null
}

function SettingsLoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        color: 'var(--theme-text-muted)',
        backgroundColor: 'var(--theme-background)',
      }}
    >
      Loading Settings...
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <SettingsProvider>
            <McpProvider>
              <ChatHistoryProvider>
                <StreamingProvider>
                  <QuickSendProvider>
                    <ModelSelectorProvider>
                    <ModelSelectorOpener />
                    <OverlaySync />
                    <Router>
                      <Routes>
<Route path="/about" element={<AboutWindow />} />
                        <Route path="/overlay" element={<OverlayView />} />
                        <Route path="/prompt-popup" element={<PromptPopupView />} />
                        <Route element={<AppShellLayout />}>
                          <Route path="/" element={<DashboardLayout />} />
                          <Route path="/dashboard" element={<DashboardLayout />} />
                          <Route
                            path="/settings"
                            element={
                              <Suspense fallback={<SettingsLoadingFallback />}>
                                <Settings />
                              </Suspense>
                            }
                          />
                          <Route path="/chat" element={<DashboardLayout />} />
                        </Route>
                        <Route path="*" element={<NotFound404 />} />
                      </Routes>
                    </Router>
                    <McpApprovalDialog />
                  </ModelSelectorProvider>
                  </QuickSendProvider>
                </StreamingProvider>
              </ChatHistoryProvider>
            </McpProvider>
          </SettingsProvider>
        </ToastProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}

export default App
