export interface BackgroundWindowTargetIdentity {
  hwnd: number
  pid: number
  processStartTime: number
}

export interface BackgroundWindowRunSession {
  runId: string
  senderWebContentsId: number
  target: BackgroundWindowTargetIdentity
  attachedAt: number
}

export type RunSessionReleaseReason =
  | 'run-finished'
  | 'run-cancelled'
  | 'run-failed'
  | 'user-release'
  | 'target-lost'
  | 'renderer-destroyed'
  | 'computer-use-disabled'
  | 'shutdown'

export interface BackgroundWindowRunSessionRegistryHooks {
  onRelease?: (
    session: Readonly<BackgroundWindowRunSession>,
    reason: RunSessionReleaseReason
  ) => void | Promise<void>
}

export type RegisterRunTargetResult =
  | { ok: true; session: BackgroundWindowRunSession; created: boolean }
  | { ok: false; reason: 'run-owned-by-another-renderer' | 'run-already-has-target' }

const copy = (session: BackgroundWindowRunSession): BackgroundWindowRunSession => ({
  ...session,
  target: { ...session.target },
})

function normalizeTarget(target: BackgroundWindowTargetIdentity): BackgroundWindowTargetIdentity {
  const result = { ...target, hwnd: Math.trunc(target.hwnd), pid: Math.trunc(target.pid) }
  if (
    !Number.isSafeInteger(result.hwnd) ||
    result.hwnd <= 0 ||
    !Number.isSafeInteger(result.pid) ||
    result.pid <= 0 ||
    !Number.isFinite(result.processStartTime) ||
    result.processStartTime <= 0
  ) {
    throw new Error('Invalid background window target identity.')
  }
  return result
}

/** Main-owned, sender-bound ownership registry for one target per chat run. */
export class BackgroundWindowRunSessionRegistry {
  private readonly sessions = new Map<string, BackgroundWindowRunSession>()

  constructor(private readonly hooks: BackgroundWindowRunSessionRegistryHooks = {}) {}

  register(
    runId: string,
    senderWebContentsId: number,
    target: BackgroundWindowTargetIdentity
  ): RegisterRunTargetResult {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) throw new Error('Invalid background window run id.')
    if (!Number.isSafeInteger(senderWebContentsId) || senderWebContentsId <= 0) {
      throw new Error('Invalid background window session owner.')
    }
    const normalizedTarget = normalizeTarget(target)
    const current = this.sessions.get(runId)
    if (current) {
      if (current.senderWebContentsId !== senderWebContentsId) {
        return { ok: false, reason: 'run-owned-by-another-renderer' }
      }
      const same =
        current.target.hwnd === normalizedTarget.hwnd &&
        current.target.pid === normalizedTarget.pid &&
        current.target.processStartTime === normalizedTarget.processStartTime
      return same
        ? { ok: true, session: copy(current), created: false }
        : { ok: false, reason: 'run-already-has-target' }
    }
    const session = {
      runId,
      senderWebContentsId,
      target: normalizedTarget,
      attachedAt: Date.now(),
    }
    this.sessions.set(runId, session)
    return { ok: true, session: copy(session), created: true }
  }

  get(runId: string, senderWebContentsId: number): BackgroundWindowRunSession | null {
    const session = this.sessions.get(runId)
    return session?.senderWebContentsId === senderWebContentsId ? copy(session) : null
  }

  async release(
    runId: string,
    senderWebContentsId: number,
    reason: RunSessionReleaseReason
  ): Promise<boolean> {
    const session = this.sessions.get(runId)
    if (!session || session.senderWebContentsId !== senderWebContentsId) return false
    this.sessions.delete(runId)
    await this.hooks.onRelease?.(copy(session), reason)
    return true
  }

  async releaseSender(
    senderWebContentsId: number,
    reason: RunSessionReleaseReason = 'renderer-destroyed'
  ): Promise<number> {
    const owned = [...this.sessions.values()].filter(
      (session) => session.senderWebContentsId === senderWebContentsId
    )
    for (const session of owned) await this.release(session.runId, senderWebContentsId, reason)
    return owned.length
  }

  async dispose(reason: RunSessionReleaseReason = 'shutdown'): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      await this.release(session.runId, session.senderWebContentsId, reason)
    }
  }
}

export const backgroundWindowRunSessionRegistry = new BackgroundWindowRunSessionRegistry()
