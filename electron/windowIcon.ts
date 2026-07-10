import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'fs'
import path from 'path'

const DEFAULT_ICON_NAME = 'icon.png'
const DEV_ICON_NAME = 'icon-dev.png'
const MARK_ICON_NAME = 'icon-mark.png'
const TRAY_TEMPLATE_NAME = 'trayTemplate.png'

function getPublicPath(fileName: string): string {
  return path.join(process.env.PUBLIC || '', fileName)
}

function getFallbackPublicPath(fileName: string): string {
  return path.join(__dirname, `../public/${fileName}`)
}

function getBuildPath(fileName: string): string {
  return path.join(__dirname, `../build/${fileName}`)
}

function firstExistingPath(candidates: string[]): string | null {
  return candidates.find((candidate) => existsSync(candidate)) ?? null
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

  const resolved = firstExistingPath(candidates)
  return resolved ?? getPublicPath(DEFAULT_ICON_NAME)
}

export function createAppIcon(): NativeImage {
  return nativeImage.createFromPath(resolveAppIconPath())
}

/**
 * macOS menu-bar tray icons should be template images (black + alpha) so the
 * system can invert them for light/dark menu bars.
 */
export function createTrayIcon(): NativeImage {
  if (process.platform === 'darwin') {
    const templatePath = firstExistingPath([
      getPublicPath(TRAY_TEMPLATE_NAME),
      getFallbackPublicPath(TRAY_TEMPLATE_NAME),
      getBuildPath(TRAY_TEMPLATE_NAME),
      path.join(process.env.PUBLIC || '', '..', 'build', TRAY_TEMPLATE_NAME),
    ])

    if (templatePath) {
      const template = nativeImage.createFromPath(templatePath)
      if (!template.isEmpty()) {
        template.setTemplateImage(true)
        return template.resize({ width: 22, height: 22 })
      }
    }

    // Fallback: use the mark as a template (alpha-driven silhouette).
    const markPath = firstExistingPath([
      getPublicPath(MARK_ICON_NAME),
      getFallbackPublicPath(MARK_ICON_NAME),
    ])
    if (markPath) {
      const mark = nativeImage.createFromPath(markPath)
      if (!mark.isEmpty()) {
        mark.setTemplateImage(true)
        return mark.resize({ width: 18, height: 18 })
      }
    }
  }

  let icon = createAppIcon()
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(resolveAppIconPath())
  }
  if (process.platform === 'win32') {
    return icon.resize({ width: 32, height: 32 })
  }
  if (process.platform === 'darwin') {
    return icon.resize({ width: 22, height: 22 })
  }
  return icon.resize({ width: 24, height: 24 })
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
