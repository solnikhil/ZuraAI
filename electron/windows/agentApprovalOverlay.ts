import { BrowserWindow, ipcMain, screen } from 'electron'

export interface AgentApprovalOverlayRequest {
  id: string
  title: string
  summary: string
  toolName: string
  kind: string
  arguments: Array<{ label: string; value: string }>
}

export interface AgentApprovalOverlayDecision {
  approved: boolean
  trusted?: boolean
}

let approvalWindow: BrowserWindow | null = null
let activeRequestId: string | null = null
let resolveActive: ((decision: AgentApprovalOverlayDecision) => void) | null = null

export function registerAgentApprovalOverlayHandlers(): void {
  ipcMain.handle('agent-approval:request', async (_event, payload: unknown) => {
    const request = normalizeApprovalRequest(payload)
    if (!request) {
      return { approved: false }
    }
    return showAgentApprovalOverlay(request)
  })
}

export function unregisterAgentApprovalOverlayHandlers(): void {
  ipcMain.removeHandler('agent-approval:request')
}

export function destroyAgentApprovalOverlay(): void {
  finishActive({ approved: false })
  if (approvalWindow && !approvalWindow.isDestroyed()) {
    approvalWindow.destroy()
  }
  approvalWindow = null
}

function showAgentApprovalOverlay(
  request: AgentApprovalOverlayRequest
): Promise<AgentApprovalOverlayDecision> {
  finishActive({ approved: false })

  return new Promise((resolve) => {
    activeRequestId = request.id
    resolveActive = resolve

    const win = createApprovalWindow()
    const bounds = approvalBounds()
    win.setBounds(bounds)
    win.loadURL(buildApprovalHtmlUrl(request)).catch(() => {
      finishActive({ approved: false })
    })
    win.show()
    win.focus()
  })
}

function createApprovalWindow(): BrowserWindow {
  if (approvalWindow && !approvalWindow.isDestroyed()) {
    return approvalWindow
  }

  approvalWindow = new BrowserWindow({
    title: 'Approve Agent Mode action',
    width: 460,
    height: 360,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  approvalWindow.setAlwaysOnTop(true, 'screen-saver')
  approvalWindow.removeMenu()

  approvalWindow.webContents.setWindowOpenHandler(({ url }) => {
    handleApprovalUrl(url)
    return { action: 'deny' }
  })

  approvalWindow.webContents.on('will-navigate', (event, url) => {
    if (handleApprovalUrl(url)) {
      event.preventDefault()
    }
  })

  approvalWindow.on('closed', () => {
    approvalWindow = null
    finishActive({ approved: false })
  })

  return approvalWindow
}

function approvalBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = 460
  const height = 360
  return {
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 24,
    y: display.workArea.y + display.workArea.height - height - 24,
  }
}

function handleApprovalUrl(url: string): boolean {
  if (!url.startsWith('zura-agent-approval://')) return false
  try {
    const parsed = new URL(url)
    const requestId = parsed.searchParams.get('requestId')
    if (!requestId || requestId !== activeRequestId) return true
    finishActive({
      approved: parsed.hostname === 'approve' || parsed.hostname === 'trust',
      trusted: parsed.hostname === 'trust',
    })
  } catch {
    finishActive({ approved: false })
  }
  return true
}

function finishActive(decision: AgentApprovalOverlayDecision): void {
  const resolve = resolveActive
  activeRequestId = null
  resolveActive = null
  if (approvalWindow && !approvalWindow.isDestroyed() && approvalWindow.isVisible()) {
    approvalWindow.hide()
  }
  resolve?.(decision)
}

function normalizeApprovalRequest(payload: unknown): AgentApprovalOverlayRequest | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const id = sanitizeText(record.id, 100)
  const title = sanitizeText(record.title, 120)
  const summary = sanitizeText(record.summary, 240)
  const toolName = sanitizeText(record.toolName, 100)
  const kind = sanitizeText(record.kind, 40)
  if (!id || !title || !toolName) return null

  const rawArguments = Array.isArray(record.arguments) ? record.arguments : []
  const argumentRows = rawArguments
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const arg = item as Record<string, unknown>
      const label = sanitizeText(arg.label, 60)
      const value = sanitizeText(arg.value, 1000)
      return label ? { label, value } : null
    })
    .filter((item): item is { label: string; value: string } => Boolean(item))
    .slice(0, 12)

  return {
    id,
    title,
    summary,
    toolName,
    kind: kind || 'tool',
    arguments: argumentRows,
  }
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength)
}

function buildApprovalHtmlUrl(request: AgentApprovalOverlayRequest): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildApprovalHtml(request))}`
}

function buildApprovalHtml(request: AgentApprovalOverlayRequest): string {
  const approveUrl = `zura-agent-approval://approve?requestId=${encodeURIComponent(request.id)}`
  const trustUrl = `zura-agent-approval://trust?requestId=${encodeURIComponent(request.id)}`
  const rejectUrl = `zura-agent-approval://reject?requestId=${encodeURIComponent(request.id)}`
  const rows = request.arguments.length
    ? request.arguments
        .map(
          (row) => `
            <div class="row">
              <dt>${escapeHtml(row.label)}</dt>
              <dd>${escapeHtml(row.value)}</dd>
            </div>`
        )
        .join('')
    : '<div class="empty">No arguments</div>'

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; navigate-to zura-agent-approval:;">
  <title>Approve Agent Mode action</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #111; color: #f4f4f5; user-select: none; }
    .shell { display: grid; grid-template-rows: auto 1fr auto; gap: 14px; min-height: 100vh; padding: 18px; border: 1px solid rgba(255,255,255,.14); background: linear-gradient(180deg, #1f1f20, #121213); }
    .titlebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .eyebrow { color: #a1a1aa; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 4px 0 0; font-size: 18px; line-height: 1.25; letter-spacing: 0; }
    .badge { flex: 0 0 auto; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; padding: 5px 9px; color: #d4d4d8; font-size: 11px; }
    .summary { margin: 0; color: #d4d4d8; font-size: 13px; line-height: 1.45; }
    .warning { border: 1px solid rgba(245,158,11,.32); background: rgba(245,158,11,.12); color: #fde68a; border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.4; }
    dl { margin: 0; max-height: 130px; overflow: auto; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; background: rgba(0,0,0,.16); }
    .row { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 10px; padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .row:last-child { border-bottom: 0; }
    dt { color: #a1a1aa; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    dd { margin: 0; min-width: 0; color: #f4f4f5; font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: 11px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
    .empty { padding: 10px; color: #a1a1aa; font-size: 12px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .trust { grid-column: 1 / -1; height: 32px; border: 1px solid rgba(255,255,255,.14); background: transparent; color: #d4d4d8; font-size: 12px; }
    a { display: inline-flex; height: 38px; align-items: center; justify-content: center; border-radius: 7px; text-decoration: none; font-size: 13px; font-weight: 650; outline: none; }
    a:focus-visible { box-shadow: 0 0 0 3px rgba(59,130,246,.45); }
    .reject { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #f4f4f5; }
    .approve { background: #f4f4f5; color: #111; }
  </style>
</head>
<body>
  <main class="shell">
    <section>
      <div class="titlebar">
        <div>
          <div class="eyebrow">Agent Mode approval</div>
          <h1>${escapeHtml(request.title)}</h1>
        </div>
        <div class="badge">${escapeHtml(request.kind)} · ${escapeHtml(request.toolName)}</div>
      </div>
    </section>
    <section>
      <p class="summary">${escapeHtml(request.summary || 'Review this action before continuing.')}</p>
      <div class="warning">Approve once to continue. Reject stops this action and returns control to the chat.</div>
      <dl>${rows}</dl>
    </section>
    <nav class="actions">
      <a class="trust" href="${trustUrl}">Always allow exact repeat</a>
      <a class="reject" href="${rejectUrl}">Reject</a>
      <a class="approve" href="${approveUrl}" autofocus>Approve once</a>
    </nav>
  </main>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
