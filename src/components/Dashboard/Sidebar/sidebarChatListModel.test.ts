import { describe, expect, it } from 'vitest'
import type { ChatSession, Folder } from '../../../chat/types'
import type { GroupedSessions } from './utils/groupSessions'
import { buildSidebarListItems, buildTimeGroups } from './sidebarChatListModel'

const session = (id: string): ChatSession => ({
  id,
  title: id,
  messages: [],
  createdAt: 1,
  updatedAt: 1,
})
const folder: Folder = { id: 'folder-1', name: 'Project', order: 0, createdAt: 1 }
const grouped: GroupedSessions = {
  pinned: [session('pinned')],
  folders: new Map([[folder.id, [session('folder-chat')]]]),
  today: [session('today')],
  yesterday: [],
  previous7Days: [],
  previous30Days: [],
  older: [],
}

describe('sidebar chat list model', () => {
  it('builds stable section and row keys in display order', () => {
    const timeGroups = buildTimeGroups(grouped)
    expect(
      buildSidebarListItems({
        groupedSessions: grouped,
        folders: [folder],
        timeGroups,
        open: { pinned: true, projects: true, recents: true },
        foldersSectionEnabled: true,
      }).map((item) => item.key)
    ).toEqual([
      'pinned',
      'pinned:pinned',
      'folders-heading',
      'folder:folder-1',
      'folder:folder-1:folder-chat',
      'your-chats',
      'Today:today',
    ])
  })

  it('omits rows for collapsed sections while retaining their headers', () => {
    const items = buildSidebarListItems({
      groupedSessions: grouped,
      folders: [folder],
      timeGroups: buildTimeGroups(grouped),
      open: { pinned: false, projects: false, recents: false },
      foldersSectionEnabled: true,
    })
    expect(items.map((item) => item.key)).toEqual(['pinned', 'folders-heading', 'your-chats'])
  })

  it('omits the Projects section when folders UI is disabled', () => {
    const items = buildSidebarListItems({
      groupedSessions: grouped,
      folders: [folder],
      timeGroups: buildTimeGroups(grouped),
      open: { pinned: true, projects: true, recents: true },
      foldersSectionEnabled: false,
    })
    expect(items.map((item) => item.key)).toEqual([
      'pinned',
      'pinned:pinned',
      'your-chats',
      'Today:today',
    ])
  })
})
