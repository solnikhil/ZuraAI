import { performanceDiagnostics } from './performanceDiagnostics'

type ReactScanModule = {
  scan?: (options: {
    enabled: boolean
    showToolbar: boolean
    showFPS: boolean
    safeArea: {
      top: number
      right: number
      bottom: number
      left: number
    }
    onRender: (
      fiber: unknown,
      renders: Parameters<typeof performanceDiagnostics.recordReactScanRender>[0]
    ) => void
  }) => void
}

export function initializeReactScanDiagnostics(): void {
  performanceDiagnostics.initialize()

  const loadReactScan = new Function(
    'specifier',
    'return import(specifier)'
  ) as (specifier: string) => Promise<ReactScanModule>

  void loadReactScan('react-scan')
    .then(({ scan }) => {
      if (typeof scan !== 'function') return

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
        onRender: (
          _fiber: unknown,
          renders: Parameters<typeof performanceDiagnostics.recordReactScanRender>[0]
        ) => {
          performanceDiagnostics.recordReactScanRender(renders)
        },
      })
    })
    .catch(() => {
      // react-scan is a dev-only optional diagnostic package.
    })
}
