import { lazy, Suspense } from 'react'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import NotFound404 from './components/ui/demo'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { StreamingProvider } from './contexts/StreamingContext'
import { QuickSendProvider } from './contexts/QuickSendContext'
import { ToastProvider, ErrorBoundary } from './components/shared'

const Settings = lazy(() => import('./components/Settings/Settings'))

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
      <ToastProvider>
        <SettingsProvider>
          <ChatHistoryProvider>
            <StreamingProvider>
              <QuickSendProvider>
                <Router>
                  <Routes>
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
              </QuickSendProvider>
            </StreamingProvider>
          </ChatHistoryProvider>
        </SettingsProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
