import './polyfills'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getDefaultTheme, getThemeById } from './themes/themeRegistry'
import { applyThemeToDocument } from './themes/themeUtils'
import { initializeRendererPerformance } from './utils/rendererPerformance'
import { injectLazyImageStyles } from './components/shared/LazyImage'
import { preloadMarkdown } from './utils/markdownPreloader'
import { preloadSettings } from './components/Settings/settingsLoader'
import './index.css'

initializeRendererPerformance()

injectLazyImageStyles()

// Eagerly preload markdown rendering pipeline so chat messages render with
// formatting immediately, avoiding a flash of unstyled/raw markdown text.
preloadMarkdown()

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
      softenedContrast?: boolean
    }
    const theme = parsed.activeTheme ? getThemeById(parsed.activeTheme) : getDefaultTheme()
    
    // Migrate softenedContrast to themeContrast if needed
    let contrast = parsed.themeContrast
    if (contrast === undefined && parsed.softenedContrast === true) {
      contrast = 85
    }
    
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

// Warm the settings chunk in the background so its styles are ready before the
// user opens the settings view for the first time.
window.setTimeout(() => {
  void preloadSettings()
}, 0)
