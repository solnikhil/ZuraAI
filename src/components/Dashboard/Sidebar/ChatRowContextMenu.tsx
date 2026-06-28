import React, { useEffect, useRef, useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Copy, Edit2, FolderOpen, Pin, Trash2, X } from '../../icons'
import DeleteChatAlertDialog from './DeleteChatAlertDialog'
import type { ChatRowAction } from './ChatRow'
import { isMacOSRuntime } from '../../../utils/platform'
import type { Folder } from '../../../chat/types'

interface ChatRowContextMenuProps {
  isPinned: boolean
  currentFolderId?: string | null
  folders: Folder[]
  onAction: (action: ChatRowAction) => void
  onAssignFolder: (folderId: string) => void
  children: React.ReactNode
}

export default function ChatRowContextMenu({
  isPinned,
  currentFolderId,
  folders,
  onAction,
  onAssignFolder,
  children,
}: ChatRowContextMenuProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const awaitingNativeActionRef = useRef(false)
  const isDev = import.meta.env.DEV
  const supportsNativeMacContextMenu = isMacOSRuntime() && Boolean(window.contextMenu?.show)

  const handleAction = (action: ChatRowAction) => {
    if (action === 'delete') {
      setDeleteConfirmOpen(true)
      return
    }

    onAction(action)
  }

  useEffect(() => {
    if (!supportsNativeMacContextMenu || !window.contextMenu?.onAction) {
      return
    }

    return window.contextMenu.onAction((action) => {
      if (!awaitingNativeActionRef.current) {
        return
      }

      const mappedAction: ChatRowAction | null =
        action === 'chat-rename'
          ? 'rename'
          : action === 'chat-pin'
            ? 'pin'
            : action === 'chat-unpin'
              ? 'unpin'
              : action === 'chat-duplicate'
                ? 'duplicate'
                : action === 'chat-remove-from-folder'
                  ? 'removeFromFolder'
                  : action === 'chat-delete'
                    ? 'delete'
                    : null

      if (!mappedAction) {
        return
      }

      awaitingNativeActionRef.current = false
      handleAction(mappedAction)
    })
  }, [supportsNativeMacContextMenu, isPinned, onAction])

  if (supportsNativeMacContextMenu) {
    return (
      <>
        <div
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            awaitingNativeActionRef.current = true

            void window.contextMenu.show({
              hasSelection: false,
              isEditable: false,
              isContentEditable: false,
              hasLink: false,
              linkUrl: '',
              mouseX: event.clientX,
              mouseY: event.clientY,
              isDev,
              kind: 'chat-row',
              isPinnedChatRow: isPinned,
              isChatRowInFolder: Boolean(currentFolderId),
            })
          }}
        >
          {children}
        </div>

        <DeleteChatAlertDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          onConfirm={() => {
            onAction('delete')
          }}
        />
      </>
    )
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onContextMenu={(event) => {
              event.stopPropagation()
            }}
          >
            {children}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuGroup>
            <ContextMenuItem onSelect={() => handleAction('rename')}>
              <Edit2 size={14} />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handleAction(isPinned ? 'unpin' : 'pin')}>
              <Pin size={14} />
              {isPinned ? 'Unpin' : 'Pin'}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handleAction('duplicate')}>
              <Copy size={14} />
              Duplicate
            </ContextMenuItem>
          </ContextMenuGroup>
          {folders.length > 0 || currentFolderId ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuGroup>
                {folders.length > 0 ? (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>
                      <FolderOpen size={14} />
                      Move to folder
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      {folders.map((folder) => (
                        <ContextMenuItem
                          key={folder.id}
                          disabled={folder.id === currentFolderId}
                          onSelect={() => onAssignFolder(folder.id)}
                        >
                          {folder.name}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ) : null}
                {currentFolderId ? (
                  <ContextMenuItem onSelect={() => handleAction('removeFromFolder')}>
                    <X size={14} />
                    Remove from folder
                  </ContextMenuItem>
                ) : null}
              </ContextMenuGroup>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => handleAction('delete')} variant="destructive">
            <Trash2 size={14} />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <DeleteChatAlertDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={() => {
          onAction('delete')
        }}
      />
    </>
  )
}
