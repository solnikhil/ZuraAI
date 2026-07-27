import { BrowserWindow, dialog, screen } from 'electron'
import type { WebContents } from 'electron'
import { getToolSecurityProfile } from '../../src/tools/builtinMainToolContract'
import { trustedIpcMain as ipcMain } from '../ipc/trustedIpc'
import {
  buildToolApprovalSignature,
  clearToolApprovalAuthorizations,
  issueToolApprovalAuthorization,
} from '../tools/toolApprovalAuthorizations'
import {
  isAgentAutonomousModeEnabled,
  setAgentAutonomousModeEnabled,
} from '../tools/agentAutonomousMode'
import {
  listAgentTrustedActions,
  revokeAgentTrustedAction,
  revokeAllAgentTrustedActions,
  trustAgentExactRepeat,
  useAgentTrustedAction,
  type AgentTrustedActionRiskClass,
} from '../tools/agentTrustedActions'

export interface AgentApprovalOverlayRequest {
  id: string
  runId?: string
  taskTitle?: string
  title: string
  summary: string
  toolName: string
  kind: string
  arguments: Array<{ label: string; value: string }>
  toolArguments: Record<string, unknown>
}

export type AgentApprovalOverlayOutcome =
  | 'approved_once'
  | 'approved_session'
  | 'approved_policy'
  | 'rejected'
  | 'timed_out'
  | 'unavailable'
  | 'cancelled'
  | 'error'

export interface AgentApprovalOverlayDecision {
  approved: boolean
  outcome: AgentApprovalOverlayOutcome
  trusted?: boolean
  autonomous?: boolean
  approvalToken?: string
}

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
const MAX_PENDING_APPROVALS = 64
const MAX_PENDING_APPROVALS_PER_SCOPE = 16

interface QueuedAgentApproval {
  request: AgentApprovalOverlayRequest
  senderId: number
  resolve: (decision: AgentApprovalOverlayDecision) => void
  timeout: ReturnType<typeof setTimeout> | null
  settled: boolean
}

let approvalWindow: BrowserWindow | null = null
let activeApproval: QueuedAgentApproval | null = null
let activeRenderRevision = 0
const approvalQueue: QueuedAgentApproval[] = []
const observedSenders = new Map<number, { sender: WebContents; listener: () => void }>()

export function registerAgentApprovalOverlayHandlers(): void {
  ipcMain.handle('agent-approval:get-autonomous-mode', async () => ({
    enabled: await isAgentAutonomousModeEnabled(),
  }))
  ipcMain.handle('agent-approval:set-autonomous-mode', async (event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Autonomous mode must be a boolean.')
    if (!enabled) {
      await setAgentAutonomousModeEnabled(false)
      // Revocation is immediate: authorizations issued under the old policy must not remain
      // usable during their TTL after the user turns autonomous mode off.
      clearToolApprovalAuthorizations()
      return { enabled: false }
    }

    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      type: 'warning' as const,
      title: 'Enable fully autonomous mode?',
      message: 'Agent Mode will approve tool actions automatically.',
      detail:
        'This includes terminal commands, code execution, desktop control, file changes, app actions, and MCP tools. ZuraAI will still enforce tool validation, scope limits, and the Esc+Esc emergency stop.',
      buttons: ['Cancel', 'Enable fully autonomous mode'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }
    const confirmation = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options)
    if (confirmation.response !== 1) {
      return { enabled: await isAgentAutonomousModeEnabled() }
    }
    await setAgentAutonomousModeEnabled(true)
    return { enabled: true }
  })
  ipcMain.handle('agent-approval:list-trusted-actions', () => listAgentTrustedActions())
  ipcMain.handle('agent-approval:revoke-trusted-action', async (_event, id: unknown) => {
    if (typeof id !== 'string') return false
    const revoked = await revokeAgentTrustedAction(id)
    if (revoked) clearToolApprovalAuthorizations()
    return revoked
  })
  ipcMain.handle('agent-approval:revoke-all-trusted-actions', async () => {
    const revoked = await revokeAllAgentTrustedActions()
    if (revoked > 0) clearToolApprovalAuthorizations()
    return revoked
  })

  ipcMain.handle('agent-approval:request', async (event, payload: unknown) => {
    const request = normalizeApprovalRequest(payload)
    if (!request) {
      return decision('error')
    }
    observeApprovalSender(event.sender)

    try {
      const signature = buildToolApprovalSignature(request.toolName, request.toolArguments)
      if (await isAgentAutonomousModeEnabled()) {
        return approvedDecision('approved_policy', event.sender.id, request, {
          autonomous: true,
        })
      }
      if (await useAgentTrustedAction(signature)) {
        return approvedDecision('approved_policy', event.sender.id, request, { trusted: true })
      }

      const overlayDecision = await enqueueAgentApproval(request, event.sender.id)
      try {
        if (!overlayDecision.approved) return overlayDecision
        if (overlayDecision.trusted) {
          try {
            await trustAgentExactRepeat(
              signature,
              request.toolName,
              classifyTrustedActionRisk(request)
            )
          } catch {
            return decision('error')
          }
        }
        const approvedOutcome =
          overlayDecision.outcome === 'approved_policy' ? 'approved_policy' : 'approved_once'
        return approvedDecision(approvedOutcome, event.sender.id, request, {
          trusted: overlayDecision.trusted,
        })
      } finally {
        showNextAgentApproval()
      }
    } catch {
      return decision('error')
    }
  })
}

export function unregisterAgentApprovalOverlayHandlers(): void {
  ipcMain.removeHandler('agent-approval:request')
  ipcMain.removeHandler('agent-approval:get-autonomous-mode')
  ipcMain.removeHandler('agent-approval:set-autonomous-mode')
  ipcMain.removeHandler('agent-approval:list-trusted-actions')
  ipcMain.removeHandler('agent-approval:revoke-trusted-action')
  ipcMain.removeHandler('agent-approval:revoke-all-trusted-actions')
}

export function destroyAgentApprovalOverlay(): void {
  settleQueuedApprovals(() => true, decision('cancelled'))
  finishActive(decision('cancelled'))
  clearObservedSenders()
  clearToolApprovalAuthorizations()
  if (approvalWindow && !approvalWindow.isDestroyed()) {
    approvalWindow.destroy()
  }
  approvalWindow = null
}

/** Cancels only approvals owned by an exact main-issued sender/run pair. */
export function cancelQueuedAgentApprovalsForRun(senderId: number, runId: string): number {
  if (!Number.isSafeInteger(senderId) || senderId <= 0 || !isValidRunId(runId)) return 0
  const matches = (entry: QueuedAgentApproval) =>
    entry.senderId === senderId && entry.request.runId === runId
  const queuedCount = settleQueuedApprovals(matches, decision('cancelled'))
  const activeCount = activeApproval && matches(activeApproval) ? 1 : 0
  if (activeCount) finishActive(decision('cancelled'))
  else if (queuedCount > 0) refreshActiveApproval()
  return queuedCount + activeCount
}

function enqueueAgentApproval(
  request: AgentApprovalOverlayRequest,
  senderId: number
): Promise<AgentApprovalOverlayDecision> {
  const pendingCount = approvalQueue.length + (activeApproval ? 1 : 0)
  const matchesScope = (entry: QueuedAgentApproval) =>
    entry.senderId === senderId && entry.request.runId === request.runId
  const pendingForScope =
    approvalQueue.filter(matchesScope).length +
    (activeApproval && matchesScope(activeApproval) ? 1 : 0)
  if (pendingCount >= MAX_PENDING_APPROVALS || pendingForScope >= MAX_PENDING_APPROVALS_PER_SCOPE) {
    return Promise.resolve(decision('unavailable'))
  }
  return new Promise((resolve) => {
    approvalQueue.push({ request, senderId, resolve, timeout: null, settled: false })
    if (activeApproval) refreshActiveApproval()
    else showNextAgentApproval()
  })
}

function showNextAgentApproval(): void {
  if (activeApproval) return
  const next = approvalQueue.shift()
  if (!next) return
  activeApproval = next
  next.timeout = setTimeout(() => {
    if (activeApproval === next) finishActive(decision('timed_out'))
  }, APPROVAL_TIMEOUT_MS)
  next.timeout.unref?.()

  renderActiveApproval(true)
}

function renderActiveApproval(showAndFocus: boolean): void {
  const entry = activeApproval
  if (!entry) return
  try {
    const win = createApprovalWindow()
    const bounds = approvalBounds()
    win.setBounds(bounds)
    const revision = ++activeRenderRevision
    win.loadURL(buildApprovalHtmlUrl(entry.request, approvalQueue.length)).catch(() => {
      if (activeApproval === entry && activeRenderRevision === revision) {
        finishActive(decision('unavailable'))
      }
    })
    if (showAndFocus) {
      win.show()
      win.focus()
    }
  } catch {
    finishActive(decision('unavailable'))
  }
}

function refreshActiveApproval(): void {
  if (activeApproval) renderActiveApproval(false)
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
    finishActive(decision('cancelled'))
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
    if (!requestId || requestId !== activeApproval?.request.id) return true
    if (parsed.hostname === 'approve') finishActive(decision('approved_once'))
    else if (parsed.hostname === 'trust') {
      finishActive({ ...decision('approved_policy'), trusted: true })
    } else if (parsed.hostname === 'reject') finishActive(decision('rejected'))
    else finishActive(decision('error'))
  } catch {
    finishActive(decision('error'))
  }
  return true
}

function finishActive(decision: AgentApprovalOverlayDecision): void {
  const active = activeApproval
  if (!active) return
  activeApproval = null
  activeRenderRevision += 1
  settleApproval(active, decision)
  if (approvalWindow && !approvalWindow.isDestroyed() && approvalWindow.isVisible()) {
    approvalWindow.hide()
  }
}

function settleApproval(
  entry: QueuedAgentApproval,
  approvalDecision: AgentApprovalOverlayDecision
): void {
  if (entry.settled) return
  entry.settled = true
  if (entry.timeout) clearTimeout(entry.timeout)
  entry.timeout = null
  entry.resolve(approvalDecision)
}

function settleQueuedApprovals(
  predicate: (entry: QueuedAgentApproval) => boolean,
  approvalDecision: AgentApprovalOverlayDecision
): number {
  let settledCount = 0
  for (let index = approvalQueue.length - 1; index >= 0; index -= 1) {
    const entry = approvalQueue[index]
    if (!predicate(entry)) continue
    approvalQueue.splice(index, 1)
    settleApproval(entry, approvalDecision)
    settledCount += 1
  }
  return settledCount
}

function cancelApprovalsForSender(senderId: number): void {
  const queuedCount = settleQueuedApprovals(
    (entry) => entry.senderId === senderId,
    decision('cancelled')
  )
  if (activeApproval?.senderId === senderId) finishActive(decision('cancelled'))
  else if (queuedCount > 0) refreshActiveApproval()
}

function observeApprovalSender(sender: WebContents): void {
  if (observedSenders.has(sender.id) || typeof sender.once !== 'function') return
  const listener = () => {
    observedSenders.delete(sender.id)
    cancelApprovalsForSender(sender.id)
  }
  observedSenders.set(sender.id, { sender, listener })
  sender.once('destroyed', listener)
}

function clearObservedSenders(): void {
  for (const { sender, listener } of observedSenders.values()) {
    sender.removeListener?.('destroyed', listener)
  }
  observedSenders.clear()
}

function decision(outcome: AgentApprovalOverlayOutcome): AgentApprovalOverlayDecision {
  return {
    approved:
      outcome === 'approved_once' ||
      outcome === 'approved_session' ||
      outcome === 'approved_policy',
    outcome,
  }
}

function approvedDecision(
  outcome: 'approved_once' | 'approved_session' | 'approved_policy',
  senderId: number,
  request: AgentApprovalOverlayRequest,
  details: Pick<AgentApprovalOverlayDecision, 'trusted' | 'autonomous'> = {}
): AgentApprovalOverlayDecision {
  return {
    ...decision(outcome),
    ...details,
    approvalToken: issueToolApprovalAuthorization(
      senderId,
      request.toolName,
      request.toolArguments
    ),
  }
}

function normalizeApprovalRequest(payload: unknown): AgentApprovalOverlayRequest | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const id = sanitizeText(record.id, 100)
  const runId = sanitizeText(record.runId, 128)
  const taskTitle = sanitizeText(record.taskTitle, 160)
  const title = sanitizeText(record.title, 120)
  const summary = sanitizeText(record.summary, 240)
  const toolName = sanitizeText(record.toolName, 100)
  const kind = sanitizeText(record.kind, 40)
  if (!id || !title || !toolName || (runId && !isValidRunId(runId))) return null

  const rawArguments = Array.isArray(record.arguments) ? record.arguments : []
  const toolArguments = normalizeToolArguments(record.toolArguments)
  if (!toolArguments) return null
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
    ...(runId ? { runId } : {}),
    ...(taskTitle ? { taskTitle } : {}),
    title,
    summary,
    toolName,
    kind: kind || 'tool',
    arguments: argumentRows,
    toolArguments,
  }
}

function isValidRunId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

function classifyTrustedActionRisk(
  request: Pick<AgentApprovalOverlayRequest, 'kind' | 'toolName' | 'toolArguments'>
): AgentTrustedActionRiskClass {
  const profile = getToolSecurityProfile(request.toolName, request.toolArguments)
  if (profile) return profile.risk
  if (request.kind === 'code' || request.kind === 'computer') return 'high'
  return 'elevated'
}

function normalizeToolArguments(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    const serialized = JSON.stringify(value)
    if (Buffer.byteLength(serialized, 'utf8') > 64 * 1024) return null
    const parsed = JSON.parse(serialized) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return [...value]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || code > 31
    })
    .join('')
    .trim()
    .slice(0, maxLength)
}

function buildApprovalHtmlUrl(request: AgentApprovalOverlayRequest, queuedCount: number): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildApprovalHtml(request, queuedCount))}`
}

function buildApprovalHtml(request: AgentApprovalOverlayRequest, queuedCount: number): string {
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
  const taskLabel = request.taskTitle || 'Current Agent task'
  const queuedLabel = queuedCount === 1 ? '1 queued' : `${queuedCount} queued`

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
    .context { margin-top: 5px; color: #a1a1aa; font-size: 11px; line-height: 1.3; }
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
          <div class="context">Task: ${escapeHtml(taskLabel)} &middot; ${escapeHtml(queuedLabel)}</div>
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
