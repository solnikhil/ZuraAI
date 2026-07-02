import { scan } from 'react-scan'
import { performanceDiagnostics } from './performanceDiagnostics'

export function initializeReactScanDiagnostics(): void {
  performanceDiagnostics.initialize()

  scan({
    enabled: true,
    showToolbar: true,
    showFPS: true,
    safeArea: {
      top: 52,
      right: 24,
      bottom: 24,
      left: 24,
    },
    onRender: (_fiber, renders) => {
      performanceDiagnostics.recordReactScanRender(renders)
    },
  })
}
