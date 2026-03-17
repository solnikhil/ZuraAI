import React, { useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useSettingsUI } from '../../../contexts/SettingsUIContext'
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
  const { settingsUI } = useSettingsUI()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const isFrosted = settingsUI.frostedSidebar

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
        <ContextMenuContent
          style={
            isFrosted
              ? {
                  background:
                    'linear-gradient(180deg, rgba(22, 24, 30, 0.74) 0%, rgba(14, 16, 22, 0.68) 100%)',
                  border:
                    '1px solid color-mix(in srgb, var(--theme-border) 72%, rgba(255, 255, 255, 0.2) 28%)',
                  backdropFilter: 'blur(14px) saturate(120%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(120%)',
                }
              : undefined
          }
        >
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
