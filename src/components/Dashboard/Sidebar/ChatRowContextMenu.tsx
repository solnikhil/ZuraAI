import React, { useState } from 'react'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Edit2, Copy, Trash2, Pin } from '../../icons'
import { useSettingsUI } from '../../../contexts/SettingsUIContext'
import type { ChatRowAction } from './ChatRow'

interface ChatRowContextMenuProps {
    isPinned: boolean
    onAction: (action: ChatRowAction) => void
    children: React.ReactNode
    dropdownOpen: boolean
    onDropdownOpenChange: (open: boolean) => void
}

export default function ChatRowContextMenu({
    isPinned,
    onAction,
    children,
    dropdownOpen,
    onDropdownOpenChange,
}: ChatRowContextMenuProps) {
    const { settingsUI } = useSettingsUI()
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
    const isFrosted = settingsUI.frostedSidebar

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
            <DropdownMenu open={dropdownOpen} onOpenChange={onDropdownOpenChange}>
                <DropdownMenuTrigger asChild>
                    {children}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    side="bottom"
                    style={isFrosted ? {
                        background: 'linear-gradient(180deg, rgba(22, 24, 30, 0.74) 0%, rgba(14, 16, 22, 0.68) 100%)',
                        border: '1px solid color-mix(in srgb, var(--theme-border) 72%, rgba(255, 255, 255, 0.2) 28%)',
                        backdropFilter: 'blur(14px) saturate(120%)',
                        WebkitBackdropFilter: 'blur(14px) saturate(120%)',
                        boxShadow: '0 18px 38px rgba(0, 0, 0, 0.42)',
                    } : undefined}
                >
                    <DropdownMenuItem onClick={() => handleAction('rename')}>
                        <Edit2 size={14} />
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction(isPinned ? 'unpin' : 'pin')}>
                        <Pin size={14} />
                        {isPinned ? 'Unpin' : 'Pin'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction('duplicate')}>
                        <Copy size={14} />
                        Duplicate
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
