import { app, nativeImage } from 'electron'
import { existsSync } from 'fs'
import path from 'path'

const DEFAULT_ICON_NAME = 'icon.png'
const DEV_ICON_NAME = 'icon-dev.png'

function getPublicPath(fileName: string): string {
  return path.join(process.env.PUBLIC || '', fileName)
}

function getFallbackPublicPath(fileName: string): string {
  return path.join(__dirname, `../public/${fileName}`)
}

export function resolveAppIconPath(): string {
  const candidates = !app.isPackaged
    ? [
        getPublicPath(DEV_ICON_NAME),
        getFallbackPublicPath(DEV_ICON_NAME),
        getPublicPath(DEFAULT_ICON_NAME),
        getFallbackPublicPath(DEFAULT_ICON_NAME),
      ]
    : [getPublicPath(DEFAULT_ICON_NAME), getFallbackPublicPath(DEFAULT_ICON_NAME)]

  const resolved = candidates.find((candidate) => existsSync(candidate))
  return resolved ?? getPublicPath(DEFAULT_ICON_NAME)
}

export function createAppIcon() {
  return nativeImage.createFromPath(resolveAppIconPath())
}

export function applyDevelopmentAppIcon(): void {
  if (app.isPackaged || process.platform !== 'darwin' || !app.dock) {
    return
  }

  const icon = createAppIcon()
  if (!icon.isEmpty()) {
    app.dock.setIcon(icon)
  }
}
