import ReactDOM from 'react-dom/client'
import App from './App'
import { getDefaultTheme, getThemeById } from './themes/themeRegistry'
import { applyThemeToDocument } from './themes/themeUtils'
import { initializeRendererPerformance } from './utils/rendererPerformance'
import { injectLazyImageStyles } from './components/shared/LazyImage'
import { preloadMarkdown } from './utils/markdownPreloader'
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
    const parsed = JSON.parse(savedSettings) as { activeTheme?: string; softenedContrast?: boolean }
    const theme = parsed.activeTheme ? getThemeById(parsed.activeTheme) : getDefaultTheme()
    applyThemeToDocument(theme || getDefaultTheme(), { softenedContrast: parsed.softenedContrast })
  } catch {
    applyThemeToDocument(getDefaultTheme())
  }
} else {
  applyThemeToDocument(getDefaultTheme())
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
