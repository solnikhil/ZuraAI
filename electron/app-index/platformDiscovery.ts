import type { RawAppMatch, UserAssistUsage } from './types'

export interface AppPlatformDiscovery {
  readonly platform: 'windows' | 'macos'
  discoverNative(query?: string, timeoutMs?: number): Promise<RawAppMatch[]>
  discoverShortcuts(): Promise<RawAppMatch[]>
  discoverUsage(): Promise<UserAssistUsage[]>
}

type DiscoveryDependencies = {
  native: (query?: string, timeoutMs?: number) => Promise<RawAppMatch[]>
  shortcuts: () => Promise<RawAppMatch[]>
  usage?: () => Promise<UserAssistUsage[]>
}

export function createPlatformDiscovery(
  platform: AppPlatformDiscovery['platform'],
  dependencies: DiscoveryDependencies
): AppPlatformDiscovery {
  return {
    platform,
    discoverNative: dependencies.native,
    discoverShortcuts: dependencies.shortcuts,
    discoverUsage: dependencies.usage ?? (async () => []),
  }
}
