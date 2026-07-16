import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatSession, Folder } from '../../../chat/types'
import type { GroupedSessions } from './utils/groupSessions'
import SidebarChatList from './SidebarChatList'

vi.mock('./ChatRow', () => ({
  default: ({ session }: { session: ChatSession }) => (
    <div data-testid={`chat-${session.id}`}>{session.title}</div>
  ),
}))
vi.mock('./ChatRowContextMenu', () => ({
  default: ({
    children,
    onAction,
  }: {
    children: React.ReactNode
    onAction: (action: string) => void
  }) => (
    <div>
      {children}
      <button onClick={() => onAction('rename')}>Rename chat</button>
    </div>
  ),
}))
vi.mock('./RenameChatDialog', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: (title: string) => void }) =>
    open ? <button onClick={() => onConfirm('Renamed chat')}>Confirm chat rename</button> : null,
}))
vi.mock('./FolderNameDialog', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: (name: string) => void }) =>
    open ? (
      <button onClick={() => onConfirm('Renamed folder')}>Confirm folder rename</button>
    ) : null,
}))
vi.mock('./DeleteFolderAlertDialog', () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={onConfirm}>Confirm folder delete</button> : null,
}))
vi.mock('@/components/ui/TooltipIconButton', () => ({
  TooltipIconButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))
vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode
    onSelect?: () => void
  }) => <button onClick={onSelect}>{children}</button>,
  ContextMenuRadioGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuRadioItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => null,
  ContextMenuSub: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuSubContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const sessions: ChatSession[] = [
  { id: 'pinned', title: 'Pinned chat', messages: [], createdAt: 1, updatedAt: 1, pinned: true },
  { id: 'recent', title: 'Recent chat', messages: [], createdAt: 1, updatedAt: 1 },
]
const folder: Folder = { id: 'folder-1', name: 'Project Alpha', order: 0, createdAt: 1 }
const grouped: GroupedSessions = {
  pinned: [sessions[0]],
  folders: new Map([[folder.id, []]]),
  today: [sessions[1]],
  yesterday: [],
  previous7Days: [],
  previous30Days: [],
  older: [],
}

function renderList(overrides: Record<string, unknown> = {}) {
  const props = {
    groupedSessions: grouped,
    folders: [folder],
    selectedFolderId: null,
    chatSelectedOverlayStyle: 'linear' as const,
    isFrosted: false,
    currentSessionId: null,
    streamingSessionId: null,
    focusIndex: 0,
    flatVisibleSessions: sessions,
    sessionIndexMap: new Map(sessions.map((session, index) => [session.id, index])),
    remindersEnabled: false,
    artifactsEnabled: false,
    onOpenReminders: vi.fn(),
    onOpenArtifacts: vi.fn(),
    onOpenFolders: vi.fn(),
    onCreateFolder: vi.fn(),
    onOpenFolder: vi.fn(),
    onSelectSession: vi.fn(),
    onContextAction: vi.fn(),
    onAssignFolder: vi.fn(),
    onRemoveFromFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onSetFolderMemoryMode: vi.fn(),
    onRenameConfirm: vi.fn(),
    onDropSessionToFolder: vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides,
  }
  return { ...render(<SidebarChatList {...props} />), props }
}

describe('SidebarChatList interactions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('collapses and keyboard-expands a section with accessible state', () => {
    renderList()
    const toggle = screen.getByRole('button', { name: 'Collapse Recents' })
    fireEvent.click(toggle)
    expect(screen.queryByTestId('chat-recent')).not.toBeInTheDocument()
    const collapsed = screen.getByRole('button', { name: 'Expand Recents' })
    fireEvent.keyDown(collapsed, { key: 'Enter' })
    expect(screen.getByTestId('chat-recent')).toBeInTheDocument()
  })

  it('drops a dragged session onto a folder', () => {
    const { props } = renderList()
    const data = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: '',
      dropEffect: '',
    }
    fireEvent.dragStart(screen.getByTestId('chat-recent').parentElement!, { dataTransfer })
    fireEvent.drop(screen.getByText('Project Alpha').closest('.sidebar-folder-dropzone')!, {
      dataTransfer,
    })
    expect(props.onDropSessionToFolder).toHaveBeenCalledWith('recent', 'folder-1')
  })

  it('coordinates chat rename and folder rename/delete dialogs', () => {
    const { props } = renderList()
    fireEvent.click(screen.getAllByText('Rename chat')[0])
    fireEvent.click(screen.getByText('Confirm chat rename'))
    expect(props.onRenameConfirm).toHaveBeenCalledWith('pinned', 'Renamed chat')

    fireEvent.click(screen.getByRole('button', { name: /^Rename$/i }))
    fireEvent.click(screen.getByText('Confirm folder rename'))
    expect(props.onRenameFolder).toHaveBeenCalledWith('folder-1', 'Renamed folder')

    fireEvent.click(screen.getByRole('button', { name: /Delete folder/i }))
    fireEvent.click(screen.getByText('Confirm folder delete'))
    expect(props.onDeleteFolder).toHaveBeenCalledWith('folder-1')
  })

  it('forwards listbox keyboard navigation', () => {
    const { props } = renderList()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    expect(props.onKeyDown).toHaveBeenCalled()
  })
})
