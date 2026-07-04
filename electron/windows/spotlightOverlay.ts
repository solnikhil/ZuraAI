import { BrowserWindow, screen } from 'electron'

let spotlightWindow: BrowserWindow | null = null

function getOrCreateWindow(): BrowserWindow {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) return spotlightWindow

  const primary = screen.getPrimaryDisplay()
  const { x, y, width, height } = primary.bounds

  spotlightWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  spotlightWindow.setIgnoreMouseEvents(true)
  spotlightWindow.on('closed', () => {
    spotlightWindow = null
  })

  return spotlightWindow
}

function buildHTML(x: number, y: number, radius: number, label?: string, duration = 600): string {
  const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0}
body{overflow:hidden;background:transparent}
.overlay{
  position:fixed;inset:0;
  background:rgba(0,0,0,0.45);
  mask-image:radial-gradient(circle ${radius}px at ${x}px ${y}px,transparent ${radius}px,black ${radius + 2}px);
  -webkit-mask-image:radial-gradient(circle ${radius}px at ${x}px ${y}px,transparent ${radius}px,black ${radius + 2}px);
  animation:fade ${duration}ms ease-in-out forwards;
}
.ring{
  position:fixed;
  left:${x - radius - 4}px;top:${y - radius - 4}px;
  width:${(radius + 4) * 2}px;height:${(radius + 4) * 2}px;
  border:2px solid rgba(255,255,255,0.7);border-radius:50%;
  animation:fade ${duration}ms ease-in-out forwards;
  pointer-events:none;
}
.label{
  position:fixed;left:${x}px;top:${y + radius + 12}px;
  transform:translateX(-50%);
  color:#fff;font:500 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:rgba(0,0,0,0.7);padding:4px 10px;border-radius:6px;
  white-space:nowrap;
  animation:fade ${duration}ms ease-in-out forwards;
  pointer-events:none;
}
@keyframes fade{0%{opacity:0}15%{opacity:1}75%{opacity:1}100%{opacity:0}}
</style></head><body>
<div class="overlay"></div>
<div class="ring"></div>
${label ? `<div class="label">${esc(label)}</div>` : ''}
</body></html>`
}

export interface SpotlightOptions {
  x: number
  y: number
  radius?: number
  label?: string
  durationMs?: number
}

export async function showSpotlight(options: SpotlightOptions): Promise<void> {
  const { x, y, radius = 40, label, durationMs = 600 } = options
  const win = getOrCreateWindow()

  const display = screen.getDisplayNearestPoint({ x, y })
  const bounds = display.bounds
  win.setBounds(bounds)

  const relX = x - bounds.x
  const relY = y - bounds.y

  const html = buildHTML(relX, relY, radius, label, durationMs)
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  win.showInactive()

  return new Promise((resolve) => {
    setTimeout(() => {
      if (win && !win.isDestroyed()) win.hide()
      resolve()
    }, durationMs + 50)
  })
}

export function hideSpotlight(): void {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) spotlightWindow.hide()
}
