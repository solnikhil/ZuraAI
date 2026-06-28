import { describe, expect, it } from 'vitest'
import { getSessionMemoryScope } from './memoryScope'

describe('getSessionMemoryScope', () => {
  it('returns project scope for chats assigned to a Space', () => {
    expect(getSessionMemoryScope([{ id: 'chat-1', folderId: 'space-1' }], 'chat-1')).toEqual({
      type: 'project',
      projectId: 'space-1',
      includeGlobal: true,
    })
  })

  it('returns project-only scope for folder-only memory mode', () => {
    expect(
      getSessionMemoryScope(
        [{ id: 'chat-1', folderId: 'space-1' }],
        'chat-1',
        [{ id: 'space-1', memoryMode: 'folder-only' }]
      )
    ).toEqual({
      type: 'project',
      projectId: 'space-1',
      includeGlobal: false,
    })
  })

  it('returns global scope for unassigned or missing chats', () => {
    expect(getSessionMemoryScope([{ id: 'chat-1', folderId: null }], 'chat-1')).toEqual({
      type: 'global',
    })
    expect(getSessionMemoryScope([{ id: 'chat-1', folderId: 'space-1' }], 'missing')).toEqual({
      type: 'global',
    })
    expect(getSessionMemoryScope([], null)).toEqual({ type: 'global' })
  })
})
