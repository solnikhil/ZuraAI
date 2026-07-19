import type { ChatSession, Folder } from '../../../chat/types'
import type { GroupedSessions } from './utils/groupSessions'

export interface TimeGroupBucket {
  label: string
  sessions: ChatSession[]
}

export type SidebarListItem =
  | { type: 'section'; key: string; label: string; icon?: 'pin' | 'folder'; folder?: Folder }
  | { type: 'folder-heading'; key: string; label: string }
  | { type: 'row'; key: string; session: ChatSession; indented?: boolean }

export interface SidebarListOpenState {
  pinned: boolean
  projects: boolean
  recents: boolean
}

export function buildTimeGroups(groupedSessions: GroupedSessions): TimeGroupBucket[] {
  return [
    { label: 'Today', sessions: groupedSessions.today },
    { label: 'Yesterday', sessions: groupedSessions.yesterday },
    { label: 'Previous 7 days', sessions: groupedSessions.previous7Days },
    { label: 'Previous 30 days', sessions: groupedSessions.previous30Days },
    { label: 'Older', sessions: groupedSessions.older },
  ].filter((bucket) => bucket.sessions.length > 0)
}

export function buildSidebarListItems(options: {
  groupedSessions: GroupedSessions
  folders: Folder[]
  timeGroups: TimeGroupBucket[]
  open: SidebarListOpenState
  /** When false, omits the Projects/folders sidebar section (code path retained). */
  foldersSectionEnabled?: boolean
}): SidebarListItem[] {
  const { groupedSessions, folders, timeGroups, open, foldersSectionEnabled = true } = options
  const items: SidebarListItem[] = []

  if (groupedSessions.pinned.length > 0) {
    items.push({ type: 'section', key: 'pinned', label: 'Pinned', icon: 'pin' })
    if (open.pinned) {
      for (const session of groupedSessions.pinned) {
        items.push({ type: 'row', key: `pinned:${session.id}`, session })
      }
    }
  }

  if (foldersSectionEnabled) {
    items.push({ type: 'folder-heading', key: 'folders-heading', label: 'Projects' })
    if (open.projects) {
      for (const folder of folders) {
        items.push({
          type: 'section',
          key: `folder:${folder.id}`,
          label: folder.name,
          icon: 'folder',
          folder,
        })
        for (const session of groupedSessions.folders.get(folder.id) ?? []) {
          items.push({
            type: 'row',
            key: `folder:${folder.id}:${session.id}`,
            session,
            indented: true,
          })
        }
      }
    }
  }

  items.push({ type: 'section', key: 'your-chats', label: 'Recents' })
  if (open.recents) {
    for (const group of timeGroups) {
      for (const session of group.sessions) {
        items.push({ type: 'row', key: `${group.label}:${session.id}`, session })
      }
    }
  }

  return items
}
