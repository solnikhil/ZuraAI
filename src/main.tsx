/**
 * Main entry point for the Zura AI renderer process
 * 
 * **React 18+ Automatic Batching**
 * This application uses React 19 with ReactDOM.createRoot(), which enables
 * automatic batching of state updates. This means multiple setState calls
 * within the same event handler, setTimeout, Promise, or native event handler
 * will be batched into a single re-render.
 * 
 * **Validates: Requirements 8.5**
 * WHEN multiple contexts are updated simultaneously, THE Renderer_Process SHALL
 * batch updates to prevent cascading re-renders
 * 
 * **Property 32: Batched Context Updates**
 * For any simultaneous updates to multiple contexts, they SHALL result in a
 * single React render cycle (batched).
 * 
 * React 18+ automatic batching works for:
 * - Event handlers (onClick, onChange, etc.)
 * - setTimeout/setInterval callbacks
 * - Promise callbacks (.then, async/await)
 * - Native event handlers (addEventListener)
 * 
 * @module main
 */
import ReactDOM from 'react-dom/client'
import App from './App'
import { getDefaultTheme, getThemeById } from './themes/themeRegistry'
import { applyThemeToDocument } from './themes/themeUtils'
import { 
    initializeRendererPerformance, 
    reportRendererMetricsToMain,
    rendererPerformanceTracker 
} from './utils/rendererPerformance'
import { injectLazyImageStyles } from './components/shared/LazyImage'
import { preloadMarkdown } from './utils/markdownPreloader'
import './index.css'

// Initialize renderer performance tracking early
// **Validates: Requirement 6.3**
// THE Renderer_Process SHALL track and report Time To Interactive (TTI) and 
// First Contentful Paint (FCP) metrics
initializeRendererPerformance()

// Inject lazy image styles for skeleton animation
// **Validates: Requirements 7.4, 7.5**
// THE Renderer_Process SHALL defer loading of non-critical assets until after TTI
// WHEN images are displayed, THE Renderer_Process SHALL use lazy loading with intersection observer
injectLazyImageStyles()

// Eagerly preload markdown rendering pipeline so chat messages render with
// formatting immediately, avoiding a flash of unstyled/raw markdown text.
preloadMarkdown()

// Set up automatic reporting of metrics to main process
// Report metrics when key performance events occur
rendererPerformanceTracker.onMetricsUpdate((updates) => {
    // Report to main process when FCP or TTI is captured
    if (updates.fcp !== undefined || updates.tti !== undefined) {
        reportRendererMetricsToMain().catch((error) => {
            console.warn('[main.tsx] Failed to report renderer metrics:', error)
        })
    }
})

// Also report metrics after the page is fully loaded
if (document.readyState === 'complete') {
    // Page already loaded, report metrics after a short delay
    setTimeout(() => {
        reportRendererMetricsToMain().catch((error) => {
            console.warn('[main.tsx] Failed to report renderer metrics on load:', error)
        })
    }, 100)
} else {
    window.addEventListener('load', () => {
        // Report metrics after load event
        setTimeout(() => {
            reportRendererMetricsToMain().catch((error) => {
                console.warn('[main.tsx] Failed to report renderer metrics on load:', error)
            })
        }, 100)
    })
}

const savedSettings = localStorage.getItem('zura-settings')
if (savedSettings) {
    try {
        const parsed = JSON.parse(savedSettings) as { activeTheme?: string; softenedContrast?: boolean }
        const theme = parsed.activeTheme ? getThemeById(parsed.activeTheme) : getDefaultTheme()
        applyThemeToDocument(theme || getDefaultTheme(), { softenedContrast: parsed.softenedContrast })
    } catch {
        applyThemeToDocument(getDefaultTheme())
    }
} else {
    applyThemeToDocument(getDefaultTheme())
}

/**
 * Using ReactDOM.createRoot (React 18+ API) enables automatic batching
 * of state updates across all contexts. This ensures that multiple
 * context updates (e.g., SettingsUIContext + SettingsConfigContext)
 * result in a single render cycle.
 * 
 * **Validates: Requirements 8.5, Property 32: Batched Context Updates**
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <App />
)
