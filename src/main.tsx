import './polyfills'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getDefaultTheme, getThemeById } from './themes/themeRegistry'
import {
  DEFAULT_FONT_SCALE,
  applyFontScaleToDocument,
  applyThemeToDocument,
} from './themes/themeUtils'
import { initializeRendererPerformance } from './utils/rendererPerformance'
import { injectLazyImageStyles } from './components/shared/LazyImage'
import { scheduleNonCriticalPreloads } from './utils/startupPreloads'
import './index.css'
import { applyOverlayRouteDocumentClasses } from './components/overlay/overlayDocument'
import { isOverlayRoute } from './components/overlay/overlaySessionPolicy'

if (typeof window !== 'undefined' && isOverlayRoute()) {
  applyOverlayRouteDocumentClasses()
}

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
      fontScale?: number
    }
    const theme = parsed.activeTheme ? getThemeById(parsed.activeTheme) : getDefaultTheme()
    
    const contrast = parsed.themeContrast
    
    applyThemeToDocument(theme || getDefaultTheme(), {
      customAccent: parsed.themeAccent,
      customBackground: parsed.themeBackground,
      customForeground: parsed.themeForeground,
      contrast: contrast !== undefined && contrast < 100 ? contrast : undefined,
    })
    applyFontScaleToDocument(parsed.fontScale ?? DEFAULT_FONT_SCALE)
  } catch {
    applyThemeToDocument(getDefaultTheme())
    applyFontScaleToDocument(DEFAULT_FONT_SCALE)
  }
} else {
  applyThemeToDocument(getDefaultTheme())
  applyFontScaleToDocument(DEFAULT_FONT_SCALE)
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)

// Keep startup focused on first paint, then warm heavy optional chunks once
// the renderer is interactive and idle.
scheduleNonCriticalPreloads()

// Electron/Chromium can leave :hover states stuck when the cursor exits the
// window without crossing element boundaries (e.g. moving quickly to another
// monitor). The previous pointer-events reflow hack did not reliably clear
// internal hover state. Instead, we explicitly dispatch synthetic mouseout
// events to every hovered element whenever the mouse leaves the window or the
// window loses focus, forcing Chromium to recalculate and clear hover.
function clearStuckHover() {
  const hovered = Array.from(document.querySelectorAll(':hover'))
  hovered.forEach((el) => {
    el.dispatchEvent(
      new MouseEvent('mouseout', {
        bubbles: true,
        cancelable: true,
        relatedTarget: document.body,
      })
    )
  })
}

// mouseleave on window is the most direct signal the cursor exited the app.
window.addEventListener('mouseleave', clearStuckHover)

// blur fires when the window loses focus (Alt-Tab, clicking another monitor,
// etc.). We also clear hover here because Chromium often leaves hover intact.
window.addEventListener('blur', clearStuckHover)

// mouseout on document with no relatedTarget means the cursor left the
// document entirely (another path Chromium sometimes takes).
document.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) {
    clearStuckHover()
  }
})
