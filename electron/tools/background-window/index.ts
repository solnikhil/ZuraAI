export { TargetGuardOverlay } from './guardOverlay'
export { BackgroundWindowSessionManager } from './sessionManager'
export { BackgroundWindowCoordinator, backgroundWindowCoordinator } from './coordinator'
export { PowerShellTargetWindowSnapshotProvider, TargetWindowWatcher } from './targetWatcher'
export type {
  BackgroundWindowCoordinatorOptions,
  BackgroundWindowOwner,
  BackgroundWindowRunStopReason,
} from './coordinator'
export type {
  BackgroundWindowSessionCallbacks,
  BackgroundWindowSessionManagerOptions,
  BackgroundWindowSessionRequest,
} from './sessionManager'
export type { TargetWindowSnapshotProvider, TargetWindowWatcherOptions } from './targetWatcher'
export type {
  BackgroundWindowReleaseReason,
  BackgroundWindowSnapshot,
  BackgroundWindowTarget,
  GuardOverlayAction,
} from './types'
