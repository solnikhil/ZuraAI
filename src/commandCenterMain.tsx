import ReactDOM from 'react-dom/client'

import CommandCenterApp from './components/CommandCenterApp'
import ErrorBoundary from './components/shared/ErrorBoundary'
import './command-center.css'

interface StoredCommandCenterAppearance {
  activeTheme?: string
  theme?: 'light' | 'dark' | 'system'
  themeContrast?: number
  fontScale?: number
}

function readStoredAppearance(): StoredCommandCenterAppearance {
  const savedSettings = localStorage.getItem('zura-settings')
  if (!savedSettings) return {}

  try {
    return JSON.parse(savedSettings) as StoredCommandCenterAppearance
  } catch (error) {
    console.error('[CommandCenter] Failed to read stored appearance:', error)
    return {}
  }
}

function applyStoredFontScale(fontScale: unknown): void {
  const value = typeof fontScale === 'number' && Number.isFinite(fontScale) ? fontScale : 100
  const normalized = Math.round(Math.min(125, Math.max(85, value)) / 5) * 5
  document.documentElement.style.setProperty('--app-font-scale', String(normalized / 100))
  document.documentElement.style.setProperty('--app-root-font-size', `${15 * (normalized / 100)}px`)
}

const storedAppearance = readStoredAppearance()
applyStoredFontScale(storedAppearance.fontScale)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ErrorBoundary>
    <CommandCenterApp />
  </ErrorBoundary>
)

// The complete theme registry is intentionally off the first-frame dependency graph.
// Hidden preload gives it time to apply the exact saved palette before the first shortcut.
void Promise.all([import('./themes/themeRegistry'), import('./themes/themeUtils')])
  .then(([themeRegistry, themeUtils]) => {
    const fallbackTheme = themeRegistry.getDefaultTheme()
    const theme = themeRegistry.getResolvedTheme(
      storedAppearance.activeTheme ?? fallbackTheme.id,
      storedAppearance.theme ?? 'dark',
      window.matchMedia('(prefers-color-scheme: dark)').matches
    )
    const contrast = storedAppearance.themeContrast
    themeUtils.applyThemeToDocument(theme || fallbackTheme, {
      contrast: contrast !== undefined && contrast < 100 ? contrast : undefined,
    })
  })
  .catch((error) => {
    console.error('[CommandCenter] Failed to apply stored theme:', error)
  })

if (import.meta.env.DEV) {
  requestAnimationFrame(() => {
    console.debug('[CommandCenter:perf]', {
      attemptId: 0,
      mark: 'renderer-mounted',
      elapsedMs: Number(performance.now().toFixed(2)),
    })
  })
}
