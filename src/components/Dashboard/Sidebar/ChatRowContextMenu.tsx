import React, { useState } from 'react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Edit2, Copy, Trash2 } from '../../icons'
import type { ChatRowAction } from './ChatRow'

interface ChatRowContextMenuProps {
    isPinned: boolean
    isArchived: boolean
    onAction: (action: ChatRowAction) => void
    children: React.ReactNode
    dropdownOpen: boolean
    onDropdownOpenChange: (open: boolean) => void
}

function MenuItems({
    isPinned,
    isArchived,
    onAction,
}: {
    isPinned: boolean
    isArchived: boolean
    onAction: (action: ChatRowAction) => void
}) {
    return (
        <>
            <div
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[var(--theme-text-primary)] outline-none transition-colors hover:bg-[var(--theme-surface-hover)]"
                onClick={() => onAction('rename')}
            >
                <Edit2 size={14} />
                Rename
            </div>
            <div
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[var(--theme-text-primary)] outline-none transition-colors hover:bg-[var(--theme-surface-hover)]"
                onClick={() => onAction(isPinned ? 'unpin' : 'pin')}
            >
                {isPinned ? '📌' : '📌'}{' '}
                {isPinned ? 'Unpin' : 'Pin'}
            </div>
            <div
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[var(--theme-text-primary)] outline-none transition-colors hover:bg-[var(--theme-surface-hover)]"
                onClick={() => onAction('duplicate')}
            >
                <Copy size={14} />
                Duplicate
            </div>
            <div
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-[var(--theme-text-primary)] outline-none transition-colors hover:bg-[var(--theme-surface-hover)]"
                onClick={() => onAction('archive')}
            >
                {isArchived ? 'Unarchive' : 'Archive'}
            </div>
            <div className="-mx-1 my-1 h-px bg-[var(--theme-border)]" />
            <div
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-400 outline-none transition-colors hover:bg-[var(--theme-surface-hover)]"
                onClick={() => onAction('delete')}
            >
                <Trash2 size={14} />
                Delete
            </div>
        </>
    )
}

export default function ChatRowContextMenu({
    isPinned,
    isArchived,
    onAction,
    children,
    dropdownOpen,
    onDropdownOpenChange,
}: ChatRowContextMenuProps) {
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

    const handleAction = (action: ChatRowAction) => {
        onDropdownOpenChange(false)
        if (action === 'delete') {
            setDeleteConfirmOpen(true)
        } else {
            onAction(action)
        }
    }

    return (
        <>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <DropdownMenu open={dropdownOpen} onOpenChange={onDropdownOpenChange}>
                        <DropdownMenuTrigger asChild>
                            {children}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" side="bottom">
                            <DropdownMenuItem onClick={() => handleAction('rename')}>
                                <Edit2 size={14} />
                                Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAction(isPinned ? 'unpin' : 'pin')}>
                                {isPinned ? 'Unpin' : 'Pin'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAction('duplicate')}>
                                <Copy size={14} />
                                Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAction('archive')}>
                                {isArchived ? 'Unarchive' : 'Archive'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => handleAction('delete')}
                                className="!text-red-400"
                            >
                                <Trash2 size={14} />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => handleAction('rename')}>
                        <Edit2 size={14} />
                        Rename
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleAction(isPinned ? 'unpin' : 'pin')}>
                        {isPinned ? 'Unpin' : 'Pin'}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleAction('duplicate')}>
                        <Copy size={14} />
                        Duplicate
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleAction('archive')}>
                        {isArchived ? 'Unarchive' : 'Archive'}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onClick={() => handleAction('delete')}
                        className="!text-red-400"
                    >
                        <Trash2 size={14} />
                        Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent
                    showCloseButton={false}
                    style={{
                        background: 'var(--theme-surface)',
                        border: '1px solid var(--theme-border)',
                        color: 'var(--theme-text-primary)',
                    }}
                >
                    <DialogHeader>
                        <DialogTitle style={{ color: 'var(--theme-text-primary)' }}>Delete chat?</DialogTitle>
                        <DialogDescription style={{ color: 'var(--theme-text-muted)' }}>
                            This action cannot be undone. This will permanently delete this conversation.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button
                            onClick={() => setDeleteConfirmOpen(false)}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: '1px solid var(--theme-border)',
                                background: 'transparent',
                                color: 'var(--theme-text-primary)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                setDeleteConfirmOpen(false)
                                onAction('delete')
                            }}
                            style={{
                                padding: '6px 16px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#ef4444',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                            }}
                        >
                            Delete
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
