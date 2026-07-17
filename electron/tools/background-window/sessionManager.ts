import { TargetGuardOverlay } from './guardOverlay'
import {
  PowerShellTargetWindowSnapshotProvider,
  TargetWindowWatcher,
  type TargetWindowSnapshotProvider,
} from './targetWatcher'
import {
  isValidNativeWindowHandle,
  type BackgroundWindowReleaseReason,
  type BackgroundWindowTarget,
  type GuardOverlayAction,
} from './types'

export interface BackgroundWindowSessionRequest {
  runId: string
  senderWebContentsId: number
  hwnd: number
}

export interface BackgroundWindowSessionCallbacks {
  onRelease?(reason: BackgroundWindowReleaseReason): void
  onStopTask?(): void
  onContinue?(): void
}

interface GuardOverlayController {
  show: TargetGuardOverlay['show']
  update: TargetGuardOverlay['update']
  destroy: TargetGuardOverlay['destroy']
}

export interface BackgroundWindowSessionManagerOptions {
  provider?: TargetWindowSnapshotProvider
  watcher?: TargetWindowWatcher
  overlay?: GuardOverlayController
}

export class BackgroundWindowSessionManager {
  private readonly provider: TargetWindowSnapshotProvider
  private readonly watcher: TargetWindowWatcher
  private readonly overlay: GuardOverlayController
  private session: {
    request: BackgroundWindowSessionRequest
    target: BackgroundWindowTarget
  } | null = null
  private callbacks: BackgroundWindowSessionCallbacks = {}

  constructor(options: BackgroundWindowSessionManagerOptions = {}) {
    this.provider = options.provider ?? new PowerShellTargetWindowSnapshotProvider()
    this.watcher = options.watcher ?? new TargetWindowWatcher({ provider: this.provider })
    this.overlay = options.overlay ?? new TargetGuardOverlay()
  }

  async reserve(
    request: BackgroundWindowSessionRequest,
    callbacks: BackgroundWindowSessionCallbacks = {}
  ): Promise<BackgroundWindowTarget> {
    validateRequest(request)
    if (this.session) {
      if (
        this.owns(request.runId, request.senderWebContentsId) &&
        this.session.request.hwnd === request.hwnd
      ) {
        return { ...this.session.target }
      }
      throw new Error('Another background window session is already active.')
    }
    const snapshot = await this.provider.read(request.hwnd)
    if (!snapshot) throw new Error('The target window is unavailable.')
    if (snapshot.processId === process.pid) throw new Error('ZuraAI cannot reserve its own window.')

    const target: BackgroundWindowTarget = {
      hwnd: snapshot.hwnd,
      processId: snapshot.processId,
      processStartTimeMs: snapshot.processStartTimeMs,
      title: snapshot.title,
    }
    this.session = { request: { ...request }, target }
    this.callbacks = callbacks
    const placed = this.overlay.show(snapshot, {
      onAction: (action) => this.handleOverlayAction(action),
      onPlacementFailed: () => this.release('overlay-failed'),
    })
    if (!placed) {
      this.release('overlay-failed')
      throw new Error('The guard could not be positioned above the target window.')
    }
    this.watcher.start(
      target,
      (next) => {
        if (!this.overlay.update(next)) this.release('overlay-failed')
      },
      () => this.release('target-lost')
    )
    return target
  }

  owns(runId: string, senderWebContentsId: number): boolean {
    return (
      this.session?.request.runId === runId &&
      this.session.request.senderWebContentsId === senderWebContentsId
    )
  }

  getTarget(): BackgroundWindowTarget | null {
    return this.session ? { ...this.session.target } : null
  }

  getSession(): {
    request: BackgroundWindowSessionRequest
    target: BackgroundWindowTarget
  } | null {
    return this.session
      ? {
          request: { ...this.session.request },
          target: { ...this.session.target },
        }
      : null
  }

  release(reason: BackgroundWindowReleaseReason = 'released'): void {
    if (!this.session) return
    const callbacks = this.callbacks
    this.session = null
    this.callbacks = {}
    this.watcher.stop()
    this.overlay.destroy()
    callbacks.onRelease?.(reason)
  }

  private handleOverlayAction(action: GuardOverlayAction): void {
    if (!this.session) return
    if (action === 'continue') {
      this.callbacks.onContinue?.()
      return
    }
    if (action === 'stop-task') {
      const onStopTask = this.callbacks.onStopTask
      this.release('stop-task')
      onStopTask?.()
      return
    }
    this.release('stop-and-release')
  }
}

function validateRequest(request: BackgroundWindowSessionRequest): void {
  if (!request || typeof request !== 'object') throw new Error('A session request is required.')
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(request.runId)) throw new Error('Invalid run ID.')
  if (!Number.isSafeInteger(request.senderWebContentsId) || request.senderWebContentsId <= 0) {
    throw new Error('Invalid renderer owner.')
  }
  if (!isValidNativeWindowHandle(request.hwnd)) throw new Error('Invalid target window handle.')
}
