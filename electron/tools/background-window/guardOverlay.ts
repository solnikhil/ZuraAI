import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import type { BackgroundWindowSnapshot, GuardOverlayAction } from './types'

export interface TargetGuardOverlayCallbacks {
  onAction(action: GuardOverlayAction): void
  onPlacementFailed(): void
}

export class TargetGuardOverlay {
  private window: BrowserWindow | null = null
  private token = ''
  private targetHwnd: number | null = null
  private callbacks: TargetGuardOverlayCallbacks | null = null

  show(snapshot: BackgroundWindowSnapshot, callbacks: TargetGuardOverlayCallbacks): boolean {
    this.callbacks = callbacks
    this.targetHwnd = snapshot.hwnd
    this.token = randomUUID()
    const win = this.getOrCreateWindow()
    win.setBounds(snapshot.bounds)
    void win.loadURL(buildGuardHtmlUrl(this.token, snapshot.title)).catch(() => {
      this.callbacks?.onPlacementFailed()
    })
    return this.place(snapshot)
  }

  update(snapshot: BackgroundWindowSnapshot): boolean {
    if (snapshot.hwnd !== this.targetHwnd || !this.window || this.window.isDestroyed()) return false
    if (
      !snapshot.visible ||
      snapshot.minimized ||
      snapshot.bounds.width < 1 ||
      snapshot.bounds.height < 1
    ) {
      this.window.hide()
      return true
    }
    this.window.setBounds(snapshot.bounds)
    return this.place(snapshot)
  }

  destroy(): void {
    const win = this.window
    this.window = null
    this.callbacks = null
    this.targetHwnd = null
    this.token = ''
    if (win && !win.isDestroyed()) win.destroy()
  }

  private place(snapshot: BackgroundWindowSnapshot): boolean {
    const win = this.window
    if (!win || win.isDestroyed()) return false
    if (!snapshot.visible || snapshot.minimized) {
      win.hide()
      return true
    }
    try {
      win.showInactive()
      // Relative placement avoids a global always-on-top overlay over unrelated applications.
      win.moveAbove(`window:${snapshot.hwnd}:0`)
      return true
    } catch {
      win.hide()
      this.callbacks?.onPlacementFailed()
      return false
    }
  }

  private getOrCreateWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const win = new BrowserWindow({
      title: 'Zura background window guard',
      frame: false,
      transparent: true,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    })
    win.removeMenu()
    win.setIgnoreMouseEvents(false)
    win.webContents.setWindowOpenHandler(({ url }) => {
      this.handleActionUrl(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event, url) => {
      event.preventDefault()
      this.handleActionUrl(url)
    })
    win.on('closed', () => {
      if (this.window === win) this.window = null
      this.callbacks?.onPlacementFailed()
    })
    this.window = win
    return win
  }

  private handleActionUrl(url: string): void {
    try {
      const parsed = new URL(url)
      if (
        parsed.protocol !== 'zura-window-guard:' ||
        parsed.searchParams.get('token') !== this.token
      ) {
        return
      }
      const action = parsed.hostname
      if (action === 'continue' || action === 'stop-and-release' || action === 'stop-task') {
        this.callbacks?.onAction(action)
      }
    } catch {
      // Invalid navigation is denied and ignored.
    }
  }
}

function buildGuardHtmlUrl(token: string, rawTitle: string): string {
  const title = escapeHtml(rawTitle.trim().slice(0, 160) || 'this window')
  const actionUrl = (action: GuardOverlayAction): string =>
    `zura-window-guard://${action}?token=${encodeURIComponent(token)}`
  const html = `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; navigate-to zura-window-guard:;">
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:Inter,"Segoe UI",sans-serif;user-select:none}
body{border:3px solid #8b5cf6;background:rgba(76,29,149,.055);display:flex;align-items:flex-start;justify-content:center;padding:10px}
.bar{display:flex;align-items:center;gap:9px;max-width:calc(100% - 16px);padding:7px 8px 7px 12px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(17,17,20,.96);color:#fafafa;box-shadow:0 8px 25px rgba(0,0,0,.35)}
.status{min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status strong{color:#c4b5fd}.actions{display:flex;gap:6px;flex:none}a{padding:5px 8px;border-radius:6px;color:#e4e4e7;text-decoration:none;font-size:11px;border:1px solid rgba(255,255,255,.15)}a.stop{color:#fecaca;border-color:rgba(248,113,113,.35)}
</style></head><body><div class="bar"><div class="status"><strong>Zura is using</strong> ${title}</div><nav class="actions"><a href="${actionUrl('continue')}">Continue</a><a href="${actionUrl('stop-and-release')}">Take control</a><a class="stop" href="${actionUrl('stop-task')}">Stop task</a></nav></div></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
