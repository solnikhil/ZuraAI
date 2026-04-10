import { lazy, Suspense } from 'react'
import { MotionConfig } from 'framer-motion'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import AboutWindow from './components/AboutWindow'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import PerformanceWindow from './components/PerformanceWindow'
import NotFound404 from './components/ui/demo'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { StreamingProvider } from './contexts/StreamingContext'
import { QuickSendProvider } from './contexts/QuickSendContext'
import { McpProvider } from './mcp/McpContext'
import { ToastProvider, ErrorBoundary } from './components/shared'
import { McpApprovalDialog } from './components/mcp/McpApprovalDialog'
import { loadSettingsModule } from './components/Settings/settingsLoader'

const Settings = lazy(loadSettingsModule)

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
                    <Router>
                      <Routes>
                        <Route path="/about" element={<AboutWindow />} />
                        <Route path="/performance" element={<PerformanceWindow />} />
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
