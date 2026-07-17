import {
  BackgroundWindowRunSessionRegistry,
  backgroundWindowRunSessionRegistry,
} from './runSessionRegistry'
import { BackgroundWindowSessionManager } from './sessionManager'
import type { BackgroundWindowReleaseReason, BackgroundWindowTarget } from './types'

export type BackgroundWindowRunStopReason =
  | 'stop-and-release'
  | 'stop-task'
  | 'target-lost'
  | 'overlay-failed'

export interface BackgroundWindowOwner {
  runId: string
  senderWebContentsId: number
}

export interface BackgroundWindowCoordinatorOptions {
  manager?: BackgroundWindowSessionManager
  registry?: BackgroundWindowRunSessionRegistry
}

/** Coordinates the single guarded desktop window with sender-bound chat-run ownership. */
export class BackgroundWindowCoordinator {
  private readonly manager: BackgroundWindowSessionManager
  private readonly registry: BackgroundWindowRunSessionRegistry

  constructor(options: BackgroundWindowCoordinatorOptions = {}) {
    this.manager = options.manager ?? new BackgroundWindowSessionManager()
    this.registry = options.registry ?? backgroundWindowRunSessionRegistry
  }

  async attach(
    owner: BackgroundWindowOwner,
    hwnd: number,
    notifyRunStopped: (event: { runId: string; reason: BackgroundWindowRunStopReason }) => void,
    onReleased?: () => void
  ): Promise<BackgroundWindowTarget> {
    const existing = this.registry.get(owner.runId, owner.senderWebContentsId)
    if (existing) {
      if (existing.target.hwnd !== hwnd) {
        throw new Error('This run already owns a different background window.')
      }
      const target = this.manager.getTarget()
      if (target && this.manager.owns(owner.runId, owner.senderWebContentsId)) return target
    }

    const target = await this.manager.reserve(
      { ...owner, hwnd },
      {
        onRelease: (reason) => {
          onReleased?.()
          void this.registry.release(
            owner.runId,
            owner.senderWebContentsId,
            mapRegistryReleaseReason(reason)
          )
          if (isRunStoppingReason(reason)) {
            notifyRunStopped({
              runId: owner.runId,
              reason,
            })
          }
        },
      }
    )

    const registered = this.registry.register(owner.runId, owner.senderWebContentsId, {
      hwnd: target.hwnd,
      pid: target.processId,
      processStartTime: target.processStartTimeMs,
    })
    if (!registered.ok) {
      this.manager.release('released')
      throw new Error(
        registered.reason === 'run-owned-by-another-renderer'
          ? 'This run is owned by another renderer.'
          : 'This run already owns a different background window.'
      )
    }
    return target
  }

  status(owner: BackgroundWindowOwner): BackgroundWindowTarget | null {
    if (!this.registry.get(owner.runId, owner.senderWebContentsId)) return null
    if (!this.manager.owns(owner.runId, owner.senderWebContentsId)) return null
    return this.manager.getTarget()
  }

  async release(
    owner: BackgroundWindowOwner,
    reason: 'run-finished' | 'run-cancelled' | 'run-failed' | 'user-release'
  ): Promise<boolean> {
    const owned = Boolean(this.registry.get(owner.runId, owner.senderWebContentsId))
    if (!owned) return false
    if (this.manager.owns(owner.runId, owner.senderWebContentsId)) {
      this.manager.release('released')
    }
    await this.registry.release(owner.runId, owner.senderWebContentsId, reason)
    return true
  }

  async releaseSender(senderWebContentsId: number): Promise<void> {
    const active = this.manager.getSession()
    if (active?.request.senderWebContentsId === senderWebContentsId) {
      this.manager.release('released')
    }
    await this.registry.releaseSender(senderWebContentsId, 'renderer-destroyed')
  }

  async dispose(): Promise<void> {
    this.manager.release('released')
    await this.registry.dispose('shutdown')
  }
}

function isRunStoppingReason(
  reason: BackgroundWindowReleaseReason
): reason is BackgroundWindowRunStopReason {
  return (
    reason === 'stop-and-release' ||
    reason === 'stop-task' ||
    reason === 'target-lost' ||
    reason === 'overlay-failed'
  )
}

function mapRegistryReleaseReason(reason: BackgroundWindowReleaseReason) {
  return reason === 'target-lost' || reason === 'overlay-failed' ? 'target-lost' : 'user-release'
}

export const backgroundWindowCoordinator = new BackgroundWindowCoordinator()
