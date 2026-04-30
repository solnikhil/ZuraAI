import React, { useEffect, useRef, useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Copy, Edit2, Pin, Trash2 } from '../../icons'
import DeleteChatAlertDialog from './DeleteChatAlertDialog'
import type { ChatRowAction } from './ChatRow'
import { isMacOSRuntime } from '../../../utils/platform'

interface ChatRowContextMenuProps {
  isPinned: boolean
  onAction: (action: ChatRowAction) => void
  children: React.ReactNode
}

export default function ChatRowContextMenu({
  isPinned,
  onAction,
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
