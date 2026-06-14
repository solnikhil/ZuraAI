import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import AboutWindow from './components/AboutWindow'
import OverlaySync from './components/OverlaySync'
import DashboardLayout from './components/Dashboard/Layout'
import AppShellLayout from './components/AppShellLayout'
import NotFound404 from './components/ui/demo'
import { SettingsProvider } from './contexts/SettingsContext'
import { ChatHistoryProvider } from './contexts/ChatHistoryContext'
import { StreamingProvider } from './contexts/StreamingContext'
import { QuickSendProvider } from './contexts/QuickSendContext'
import { ModelSelectorProvider } from './contexts/ModelSelectorContext'
import { McpProvider } from './mcp/McpContext'
import { ToastProvider, ErrorBoundary } from './components/shared'
import { McpApprovalDialog } from './components/mcp/McpApprovalDialog'
import { ComputerUseApprovalDialog } from './components/ComputerUseApprovalDialog'
import { AnalyticsConsentPrompt } from './components/AnalyticsConsentPrompt'
import { AgentToolApprovalProvider } from './agent/AgentToolApprovalContext'
import { isMacOSRuntime } from './utils/platform'
import type { PendingCodeApproval, PendingTerminalApproval } from './electron/types'

import { loadSettingsModule } from './components/Settings/settingsLoader'

const Settings = lazy(loadSettingsModule)
const OverlayView = lazy(() => import('./components/OverlayView'))
const CodeExecutionApprovalDialog = lazy(() =>
  import('./components/CodeExecutionApprovalDialog').then((module) => ({
    default: module.CodeExecutionApprovalDialog,
  }))
)
const TerminalApprovalDialog = lazy(() =>
  import('./components/TerminalApprovalDialog').then((module) => ({
    default: module.TerminalApprovalDialog,
  }))
)
// Loaded only inside the dev-only `#/chat-debug` BrowserWindow. Wrapped in
// `import.meta.env.DEV` so the chunk is dropped from production bundles.
const ChatDebugApp = import.meta.env.DEV
  ? lazy(() =>
      import('./components/ChatDebugPanel/ChatDebugApp').then((module) => ({
        default: module.ChatDebugApp,
      }))
    )
  : null

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

function CodeExecutionApprovalHost() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingCodeApproval[] | null>(null)

  useEffect(() => {
    if (!window.codeExecution?.onPendingApproval) return
    return window.codeExecution.onPendingApproval((pending) => {
      setPendingApprovals(pending.length > 0 ? pending : null)
    })
  }, [])

  if (!pendingApprovals) return null

  return (
    <Suspense fallback={null}>
      <CodeExecutionApprovalDialog initialPending={pendingApprovals} />
    </Suspense>
  )
}

function TerminalApprovalHost() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingTerminalApproval[] | null>(null)

  useEffect(() => {
    if (!window.terminal?.onPendingApproval) return
    return window.terminal.onPendingApproval((pending) => {
      setPendingApprovals(pending.length > 0 ? pending : null)
    })
  }, [])

  if (!pendingApprovals) return null

  return (
    <Suspense fallback={null}>
      <TerminalApprovalDialog initialPending={pendingApprovals} />
    </Suspense>
  )
}

function DashboardApp() {
  const macOS = isMacOSRuntime()

  return (
    <SettingsProvider>
      <McpProvider>
        <ChatHistoryProvider>
          <StreamingProvider>
            <QuickSendProvider>
              <AgentToolApprovalProvider>
                <ModelSelectorProvider>
                  {!macOS && <OverlaySync />}
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
                      {!macOS && (
                        <Route
                          path="/overlay"
                          element={
                            <Suspense fallback={null}>
                              <OverlayView />
                            </Suspense>
                          }
                        />
                      )}
                      <Route path="*" element={<NotFound404 />} />
                    </Routes>
                  </Router>
                  <McpApprovalDialog />
                  <AnalyticsConsentPrompt />
                </ModelSelectorProvider>
              </AgentToolApprovalProvider>
              <CodeExecutionApprovalHost />
              <TerminalApprovalHost />
              {!macOS && <ComputerUseApprovalDialog />}
            </QuickSendProvider>
          </StreamingProvider>
        </ChatHistoryProvider>
      </McpProvider>
    </SettingsProvider>
  )
}

function App() {
  const hashPath = typeof window === 'undefined' ? '' : window.location.hash

  let content: ReactNode
  if (hashPath.startsWith('#/about')) {
    content = <AboutWindow />
  } else if (hashPath.startsWith('#/chat-debug') && ChatDebugApp) {
    content = (
      <Suspense fallback={null}>
        <ChatDebugApp />
      </Suspense>
    )
  } else {
    content = <DashboardApp />
  }

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <ToastProvider>{content}</ToastProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}

export default App
