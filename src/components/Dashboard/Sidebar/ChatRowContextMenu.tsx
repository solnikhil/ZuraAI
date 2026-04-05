import React, { useState } from 'react'
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

  const handleAction = (action: ChatRowAction) => {
    if (action === 'delete') {
      setDeleteConfirmOpen(true)
      return
    }

    onAction(action)
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
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
