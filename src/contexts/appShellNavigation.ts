export interface AppShellNavigationSnapshot {
  pathname: string
  dashboardView: 'chat' | 'settings' | 'reminders'
  activeSettingsSection: string
}

export interface AppShellNavigationHistory {
  entries: AppShellNavigationSnapshot[]
  index: number
}

export function areShellSnapshotsEqual(
  left: AppShellNavigationSnapshot,
  right: AppShellNavigationSnapshot
): boolean {
  return (
    left.pathname === right.pathname &&
    left.dashboardView === right.dashboardView &&
    left.activeSettingsSection === right.activeSettingsSection
  )
}

export function createShellNavigationHistory(
  initialSnapshot: AppShellNavigationSnapshot
): AppShellNavigationHistory {
  return {
    entries: [initialSnapshot],
    index: 0,
  }
}

export function pushShellNavigationSnapshot(
  history: AppShellNavigationHistory,
  snapshot: AppShellNavigationSnapshot
): AppShellNavigationHistory {
  const currentEntry = history.entries[history.index]
  if (currentEntry && areShellSnapshotsEqual(currentEntry, snapshot)) {
    return history
  }

  const nextEntries = history.entries.slice(0, history.index + 1)
  nextEntries.push(snapshot)

  return {
    entries: nextEntries,
    index: nextEntries.length - 1,
  }
}

export function canGoBackInShellHistory(history: AppShellNavigationHistory): boolean {
  return history.index > 0
}

export function canGoForwardInShellHistory(history: AppShellNavigationHistory): boolean {
  return history.index < history.entries.length - 1
}

export function getPreviousShellSnapshot(
  history: AppShellNavigationHistory
): AppShellNavigationSnapshot | null {
  if (!canGoBackInShellHistory(history)) {
    return null
  }

  return history.entries[history.index - 1] ?? null
}

export function getNextShellSnapshot(
  history: AppShellNavigationHistory
): AppShellNavigationSnapshot | null {
  if (!canGoForwardInShellHistory(history)) {
    return null
  }

  return history.entries[history.index + 1] ?? null
}

export function moveBackInShellHistory(
  history: AppShellNavigationHistory
): AppShellNavigationHistory {
  if (!canGoBackInShellHistory(history)) {
    return history
  }

  return {
    ...history,
    index: history.index - 1,
  }
}

export function moveForwardInShellHistory(
  history: AppShellNavigationHistory
): AppShellNavigationHistory {
  if (!canGoForwardInShellHistory(history)) {
    return history
  }

  return {
    ...history,
    index: history.index + 1,
  }
}
