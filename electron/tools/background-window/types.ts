export interface BackgroundWindowTarget {
  hwnd: number
  processId: number
  processStartTimeMs: number
  title: string
}

export interface BackgroundWindowSnapshot extends BackgroundWindowTarget {
  bounds: Electron.Rectangle
  visible: boolean
  minimized: boolean
}

export type BackgroundWindowReleaseReason =
  | 'released'
  | 'stop-and-release'
  | 'stop-task'
  | 'target-lost'
  | 'overlay-failed'

export type GuardOverlayAction = 'continue' | 'stop-and-release' | 'stop-task'

export function isValidNativeWindowHandle(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function sameTarget(
  target: BackgroundWindowTarget,
  snapshot: BackgroundWindowSnapshot
): boolean {
  return (
    target.hwnd === snapshot.hwnd &&
    target.processId === snapshot.processId &&
    target.processStartTimeMs === snapshot.processStartTimeMs
  )
}
