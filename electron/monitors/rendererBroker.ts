import { BrowserWindow, type WebContents } from 'electron'
import { trustedIpcMain as ipcMain } from '../ipc/trustedIpc'
import type {
  ScheduledAutomationRunRequest,
  ScheduledAutomationRunResponse,
  ScheduledTaskSummaryRequest,
  ScheduledTaskSummaryResponse,
} from './types'

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface RendererTaskBroker {
  requestSummary: (request: ScheduledTaskSummaryRequest) => Promise<string>
  requestAutomationRun: (
    request: ScheduledAutomationRunRequest
  ) => Promise<ScheduledAutomationRunResponse>
  stop: () => void
}

interface RendererTaskBrokerOptions {
  setTimeoutImpl: typeof setTimeout
  clearTimeoutImpl: typeof clearTimeout
  sanitizeAutomationResponse: (
    response: ScheduledAutomationRunResponse
  ) => ScheduledAutomationRunResponse
  findTarget?: () => WebContents | null
}

export function findScheduledTaskRenderer(): WebContents | null {
  const candidates = BrowserWindow.getAllWindows().filter(
    (window) => !window.isDestroyed() && !window.webContents.isDestroyed()
  )
  const mainRenderer = candidates.find((window) => {
    const getURL = (window.webContents as WebContents & { getURL?: () => string }).getURL
    const url = typeof getURL === 'function' ? getURL.call(window.webContents) : ''
    if (!url || url.startsWith('data:') || url.includes('#/about')) return false
    return (
      url.includes('#/dashboard') ||
      url.includes('#/chat') ||
      url.endsWith('/index.html') ||
      url.endsWith('/')
    )
  })
  return mainRenderer?.webContents ?? candidates[0]?.webContents ?? null
}

export function createRendererTaskBroker(options: RendererTaskBrokerOptions): RendererTaskBroker {
  const pendingSummaries = new Map<string, PendingRequest<string>>()
  const pendingAutomationRuns = new Map<string, PendingRequest<ScheduledAutomationRunResponse>>()
  const findTarget = options.findTarget ?? findScheduledTaskRenderer

  ipcMain.handle(
    'scheduled-tasks:resolve-summary',
    (_event, response: ScheduledTaskSummaryResponse) => {
      if (!response || typeof response !== 'object' || typeof response.requestId !== 'string')
        return false
      const pending = pendingSummaries.get(response.requestId)
      if (!pending) return false
      pendingSummaries.delete(response.requestId)
      options.clearTimeoutImpl(pending.timer)
      if (typeof response.summary === 'string' && response.summary.trim()) {
        pending.resolve(response.summary.trim())
      } else {
        pending.reject(
          new Error(typeof response.error === 'string' ? response.error : 'AI summary failed.')
        )
      }
      return true
    }
  )

  ipcMain.handle(
    'scheduled-tasks:resolve-automation-run',
    (_event, response: ScheduledAutomationRunResponse) => {
      if (!response || typeof response !== 'object' || typeof response.requestId !== 'string')
        return false
      const pending = pendingAutomationRuns.get(response.requestId)
      if (!pending) return false
      pendingAutomationRuns.delete(response.requestId)
      options.clearTimeoutImpl(pending.timer)
      pending.resolve(options.sanitizeAutomationResponse(response))
      return true
    }
  )

  const requestSummary = (request: ScheduledTaskSummaryRequest): Promise<string> => {
    const target = findTarget()
    if (!target)
      return Promise.reject(new Error('No renderer is available to summarize monitor changes.'))
    return new Promise((resolve, reject) => {
      const timer = options.setTimeoutImpl(() => {
        pendingSummaries.delete(request.requestId)
        reject(new Error('AI summary timed out.'))
      }, 45_000)
      pendingSummaries.set(request.requestId, { resolve, reject, timer })
      target.send('scheduled-tasks:summary-request', request)
    })
  }

  const requestAutomationRun = (
    request: ScheduledAutomationRunRequest
  ): Promise<ScheduledAutomationRunResponse> => {
    const target = findTarget()
    if (!target) return Promise.reject(new Error('No renderer is available to run AI automation.'))
    const timeoutMs = Math.max(10_000, Math.min(15 * 60_000, request.budgets.timeoutMs ?? 120_000))
    return new Promise((resolve, reject) => {
      const timer = options.setTimeoutImpl(() => {
        pendingAutomationRuns.delete(request.requestId)
        reject(new Error('AI automation timed out.'))
      }, timeoutMs)
      pendingAutomationRuns.set(request.requestId, { resolve, reject, timer })
      target.send('scheduled-tasks:automation-run-request', request)
    })
  }

  const stop = () => {
    for (const [requestId, pending] of pendingSummaries) {
      options.clearTimeoutImpl(pending.timer)
      pending.reject(new Error('Monitor runtime stopped.'))
      pendingSummaries.delete(requestId)
    }
    for (const [requestId, pending] of pendingAutomationRuns) {
      options.clearTimeoutImpl(pending.timer)
      pending.reject(new Error('Monitor runtime stopped.'))
      pendingAutomationRuns.delete(requestId)
    }
    ipcMain.removeHandler('scheduled-tasks:resolve-summary')
    ipcMain.removeHandler('scheduled-tasks:resolve-automation-run')
  }

  return { requestSummary, requestAutomationRun, stop }
}
