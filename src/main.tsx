import './polyfills'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getDefaultTheme, getThemeById } from './themes/themeRegistry'
import { applyThemeToDocument } from './themes/themeUtils'
import { initializeRendererPerformance } from './utils/rendererPerformance'
import { injectLazyImageStyles } from './components/shared/LazyImage'
import { scheduleNonCriticalPreloads } from './utils/startupPreloads'
import './index.css'

initializeRendererPerformance()

injectLazyImageStyles()

// Apply the saved theme before the first render to avoid a flash of defaults.
const savedSettings = localStorage.getItem('zura-settings')
if (savedSettings) {
  try {
    const parsed = JSON.parse(savedSettings) as {
      activeTheme?: string
      themeAccent?: string
      themeBackground?: string
      themeForeground?: string
      themeContrast?: number
    }
    const theme = parsed.activeTheme ? getThemeById(parsed.activeTheme) : getDefaultTheme()
    
    const contrast = parsed.themeContrast
    
    applyThemeToDocument(theme || getDefaultTheme(), {
      customAccent: parsed.themeAccent,
      customBackground: parsed.themeBackground,
      customForeground: parsed.themeForeground,
      contrast: contrast !== undefined && contrast < 100 ? contrast : undefined,
    })
  } catch {
    applyThemeToDocument(getDefaultTheme())
  }
} else {
  applyThemeToDocument(getDefaultTheme())
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)

// Keep startup focused on first paint, then warm heavy optional chunks once
// the renderer is interactive and idle.
scheduleNonCriticalPreloads()
