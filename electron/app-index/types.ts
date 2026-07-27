export type AppIndexSource = 'windows-search' | 'start-menu' | 'desktop' | 'macos-applications'

export type AppLaunchStrategy = 'appUserModelId' | 'shortcutPath'

export interface AppIndexEntry {
  id: string
  name: string
  normalizedName: string
  aliases: string[]
  source: AppIndexSource
  appUserModelId?: string
  shortcutPath?: string
  targetPath?: string
  iconPath?: string
  args?: string
  workingDirectory?: string
  launchStrategy: AppLaunchStrategy
  iconKey?: string
  lastSeenAt: number
  launchCount?: number
  lastLaunchedAt?: number
  usageCount?: number
  lastUsedAt?: number
}

export interface AppIndexDiagnostics {
  ok: boolean
  stale: boolean
  error?: string
  sourceCounts: Record<string, number>
  lastRefreshAt?: number
  refreshDurationMs?: number
}

export interface RankedAppIndexEntry extends AppIndexEntry {
  rank: number
}

export interface RawAppMatch {
  name: string
  source: AppIndexSource
  path?: string
  targetPath?: string
  iconPath?: string
  args?: string
  workingDirectory?: string
  appUserModelId?: string
}

export interface UserAssistUsage {
  name: string
  lastUsedAt?: number
  usageCount?: number
}
