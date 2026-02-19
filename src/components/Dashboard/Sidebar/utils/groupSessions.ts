import type { ChatSession, Folder } from '../../../../contexts/ChatHistoryContext'

/**
 * Grouped sessions structure for sidebar rendering.
 * Sessions are partitioned into mutually exclusive groups:
 * pinned, folder-assigned, or time-based.
 */
export interface GroupedSessions {
  pinned: ChatSession[]
  folders: Map<string, ChatSession[]> // folderId -> sessions
  today: ChatSession[]
  yesterday: ChatSession[]
  previous7Days: ChatSession[]
  previous30Days: ChatSession[]
  older: ChatSession[]
}

/**
 * Computes the start-of-day (midnight) for a given Date in local time.
 */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Groups chat sessions into pinned, folder-assigned, and time-based groups.
 *
 * Grouping logic:
 * 1. Pinned sessions (pinned === true) go to the pinned group
 * 2. Folder-assigned sessions (folderId != null, non-pinned) go to folder groups
 * 3. Remaining sessions (non-pinned, no folder) are grouped by updatedAt:
 *    - Today: updatedAt is within the current calendar day
 *    - Yesterday: updatedAt is within the previous calendar day
 *    - Previous 7 Days: updatedAt is within the last 7 days (excluding today and yesterday)
 *    - Previous 30 Days: updatedAt is within the last 30 days (excluding the above)
 *    - Older: everything else
 *
 * Requirements: 5.1, 5.2, 5.3
 */
export function groupSessions(
  sessions: ChatSession[],
  folders: Folder[]
): GroupedSessions {
  const now = new Date()
  const todayStart = startOfDay(now)

  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const sevenDaysAgoStart = new Date(todayStart)
  sevenDaysAgoStart.setDate(sevenDaysAgoStart.getDate() - 7)

  const thirtyDaysAgoStart = new Date(todayStart)
  thirtyDaysAgoStart.setDate(thirtyDaysAgoStart.getDate() - 30)

  const todayMs = todayStart.getTime()
  const yesterdayMs = yesterdayStart.getTime()
  const sevenDaysAgoMs = sevenDaysAgoStart.getTime()
  const thirtyDaysAgoMs = thirtyDaysAgoStart.getTime()

  // Initialize folder groups for all known folders
  const folderMap = new Map<string, ChatSession[]>()
  for (const folder of folders) {
    folderMap.set(folder.id, [])
  }

  const result: GroupedSessions = {
    pinned: [],
    folders: folderMap,
    today: [],
    yesterday: [],
    previous7Days: [],
    previous30Days: [],
    older: [],
  }

  for (const session of sessions) {
    // 1. Pinned sessions go to pinned group
    if (session.pinned === true) {
      result.pinned.push(session)
      continue
    }

    // 2. Folder-assigned sessions (non-pinned) go to folder groups
    if (session.folderId != null && session.folderId !== '') {
      const folderSessions = result.folders.get(session.folderId)
      if (folderSessions) {
        folderSessions.push(session)
      } else {
        // folderId references a non-existent folder — treat as no folder,
        // fall through to time-based grouping (error handling per design doc)
        // We still group by time below
      }
      // If the folder existed, we're done with this session
      if (folderSessions) {
        continue
      }
    }

    // 3. Remaining sessions grouped by updatedAt
    const updatedAt = session.updatedAt

    if (updatedAt >= todayMs) {
      result.today.push(session)
    } else if (updatedAt >= yesterdayMs) {
      result.yesterday.push(session)
    } else if (updatedAt >= sevenDaysAgoMs) {
      result.previous7Days.push(session)
    } else if (updatedAt >= thirtyDaysAgoMs) {
      result.previous30Days.push(session)
    } else {
      result.older.push(session)
    }
  }

  return result
}
