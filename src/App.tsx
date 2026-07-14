import { lazy, Suspense, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { ToastProvider, ErrorBoundary } from './components/shared'
import { TooltipProvider } from './components/ui/tooltip'
import AppLoadingFallback from './components/AppLoadingFallback'

const AboutWindow = lazy(() => import('./components/AboutWindow'))
const DashboardApp = lazy(() => import('./components/DashboardApp'))
// Loaded only inside the dev-only `#/chat-debug` BrowserWindow. Wrapped in
// `import.meta.env.DEV` so the chunk is dropped from production bundles.
const ChatDebugApp = import.meta.env.DEV
  ? lazy(() =>
      import('./components/ChatDebugPanel/ChatDebugApp').then((module) => ({
        default: module.ChatDebugApp,
      }))
    )
  : null

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
        <ToastProvider>
          <TooltipProvider>
            <Suspense fallback={<AppLoadingFallback />}>{content}</Suspense>
          </TooltipProvider>
        </ToastProvider>
      </MotionConfig>
    </ErrorBoundary>
  )
}

export default App
