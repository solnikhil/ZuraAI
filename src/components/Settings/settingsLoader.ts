let settingsModulePromise: Promise<typeof import('./Settings')> | null = null

export function loadSettingsModule(): Promise<typeof import('./Settings')> {
  if (!settingsModulePromise) {
    settingsModulePromise = import('./Settings')
  }

  return settingsModulePromise
}

export function preloadSettings(): Promise<void> {
  return loadSettingsModule().then(() => undefined)
}
