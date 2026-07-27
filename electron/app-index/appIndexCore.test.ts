import { describe, expect, it, vi } from 'vitest'

import { AppIconLifecycle } from './iconLifecycle'
import { mergeByKey } from './merger'
import { createPlatformDiscovery } from './platformDiscovery'
import { rankApps } from './ranking'
import { AppIndexRefreshCoordinator } from './refreshCoordinator'
import type { AppIndexEntry } from './types'

function app(name: string, overrides: Partial<AppIndexEntry> = {}): AppIndexEntry {
  return {
    id: name,
    name,
    normalizedName: name.toLowerCase(),
    aliases: [name],
    source: 'windows-search',
    appUserModelId: name,
    launchStrategy: 'appUserModelId',
    lastSeenAt: 1,
    ...overrides,
  }
}

describe('app index core contracts', () => {
  it('merges duplicate keys deterministically without mutating input', () => {
    const input = [app('Alpha', { launchCount: 1 }), app('Alpha', { launchCount: 4 })]
    const merged = mergeByKey(
      input,
      (entry) => entry.id,
      (current, candidate) => ({
        ...candidate,
        launchCount: Math.max(current?.launchCount ?? 0, candidate.launchCount ?? 0),
      })
    )

    expect(merged).toEqual([expect.objectContaining({ name: 'Alpha', launchCount: 4 })])
    expect(input[0].launchCount).toBe(1)
  })

  it('keeps typed relevance ahead of usage while ranking empty lists by usage', () => {
    const now = 1_000_000
    const apps = [
      app('Target Editor'),
      app('Habit Player', { launchCount: 12, lastLaunchedAt: now - 1_000 }),
    ]

    expect(rankApps(apps, 'target', 10, now)[0].name).toBe('Target Editor')
    expect(rankApps(apps, '', 10, now)[0].name).toBe('Habit Player')
  })

  it('keeps platform discovery dependencies behind one stable contract', async () => {
    const native = vi.fn(async () => [{ name: 'App', source: 'windows-search' as const }])
    const shortcuts = vi.fn(async () => [])
    const discovery = createPlatformDiscovery('windows', { native, shortcuts })

    await expect(discovery.discoverNative('app', 200)).resolves.toHaveLength(1)
    await expect(discovery.discoverShortcuts()).resolves.toEqual([])
    await expect(discovery.discoverUsage()).resolves.toEqual([])
    expect(native).toHaveBeenCalledWith('app', 200)
  })

  it('invalidates captured refresh work on disposal and allows explicit reset', () => {
    const coordinator = new AppIndexRefreshCoordinator()
    const generation = coordinator.capture()
    expect(coordinator.isCurrent(generation)).toBe(true)

    coordinator.dispose()
    expect(coordinator.isCurrent(generation)).toBe(false)
    expect(coordinator.isDisposed()).toBe(true)

    coordinator.reset()
    expect(coordinator.isDisposed()).toBe(false)
    expect(coordinator.isCurrent(coordinator.capture())).toBe(true)
  })

  it('drops queued icon work and ignores in-flight completion after disposal', async () => {
    const resolvers: Array<(value: string) => void> = []
    const load = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const lifecycle = new AppIconLifecycle(1, load)

    lifecycle.request('first')
    lifecycle.request('queued')
    expect(load).toHaveBeenCalledTimes(1)

    lifecycle.dispose()
    resolvers[0]('data:image/png;base64,stale')
    await vi.waitFor(() => expect(lifecycle.isPending('first')).toBe(false))

    expect(load).toHaveBeenCalledTimes(1)
    expect(lifecycle.peek('first')).toBeUndefined()
    expect(lifecycle.peek('queued')).toBeUndefined()
  })
})
