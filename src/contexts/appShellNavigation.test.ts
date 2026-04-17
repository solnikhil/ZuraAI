import { describe, expect, it } from 'vitest'
import {
  canGoBackInShellHistory,
  canGoForwardInShellHistory,
  createShellNavigationHistory,
  moveBackInShellHistory,
  moveForwardInShellHistory,
  pushShellNavigationSnapshot,
} from './appShellNavigation'

describe('appShellNavigation', () => {
  const baseSnapshot = {
    pathname: '/dashboard',
    dashboardView: 'chat' as const,
    activeSettingsSection: 'providers',
  }

  it('records committed shell navigation snapshots', () => {
    const history = pushShellNavigationSnapshot(
      createShellNavigationHistory(baseSnapshot),
      {
        ...baseSnapshot,
        dashboardView: 'settings',
      }
    )

    expect(history.entries).toHaveLength(2)
    expect(history.index).toBe(1)
  })

  it('does not record duplicate consecutive snapshots', () => {
    const initial = createShellNavigationHistory(baseSnapshot)
    const history = pushShellNavigationSnapshot(initial, baseSnapshot)

    expect(history).toBe(initial)
  })

  it('moves backward and forward through shell history', () => {
    const seeded = pushShellNavigationSnapshot(
      pushShellNavigationSnapshot(createShellNavigationHistory(baseSnapshot), {
        ...baseSnapshot,
        dashboardView: 'settings',
      }),
      {
        ...baseSnapshot,
        pathname: '/settings',
        dashboardView: 'settings',
      }
    )

    const movedBack = moveBackInShellHistory(seeded)
    const movedForward = moveForwardInShellHistory(movedBack)

    expect(movedBack.index).toBe(1)
    expect(movedForward.index).toBe(2)
  })

  it('clears forward history after branching from the middle', () => {
    const seeded = pushShellNavigationSnapshot(
      pushShellNavigationSnapshot(createShellNavigationHistory(baseSnapshot), {
        ...baseSnapshot,
        dashboardView: 'settings',
      }),
      {
        ...baseSnapshot,
        pathname: '/settings',
        dashboardView: 'settings',
      }
    )

    const movedBack = moveBackInShellHistory(seeded)
    const branched = pushShellNavigationSnapshot(movedBack, {
      ...baseSnapshot,
      activeSettingsSection: 'mcp',
      dashboardView: 'settings',
    })

    expect(branched.entries).toHaveLength(3)
    expect(branched.entries[2]?.activeSettingsSection).toBe('mcp')
    expect(canGoForwardInShellHistory(branched)).toBe(false)
  })

  it('reports history boundaries accurately', () => {
    const history = createShellNavigationHistory(baseSnapshot)

    expect(canGoBackInShellHistory(history)).toBe(false)
    expect(canGoForwardInShellHistory(history)).toBe(false)
  })
})
