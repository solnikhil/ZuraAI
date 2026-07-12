import { shell, type BrowserWindow } from 'electron'

function parseOrigin(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function isExternalHttpUrl(url: string, devServerUrl?: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    const devServerOrigin = parseOrigin(devServerUrl)
    return !devServerOrigin || parsed.origin !== devServerOrigin
  } catch {
    return false
  }
}

/**
 * Renderer windows may open explicit HTTP(S) links in the user's browser, but
 * must never navigate their privileged document to another URL or protocol.
 */
export function installExternalNavigationGuards(
  win: BrowserWindow,
  devServerUrl = process.env.VITE_DEV_SERVER_URL
): void {
  const openExternalIfAllowed = (url: string) => {
    if (isExternalHttpUrl(url, devServerUrl)) {
      void shell.openExternal(url)
    }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    openExternalIfAllowed(url)
  })
}
