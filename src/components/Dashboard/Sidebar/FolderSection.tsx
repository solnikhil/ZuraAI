import React, { useState } from 'react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronDown, FolderOpen } from '../../icons'
import type { Folder } from '../../../contexts/ChatHistoryContext'

interface FolderSectionProps {
    folder: Folder
    sessionCount: number
    onDropSession: (sessionId: string, folderId: string) => void
    children: React.ReactNode
}

export default function FolderSection({
    folder,
    sessionCount,
    onDropSession,
    children,
}: FolderSectionProps) {
    const [isOpen, setIsOpen] = useState(true)
    const [isDragOver, setIsDragOver] = useState(false)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setIsDragOver(true)
    }

    const handleDragLeave = () => {
        setIsDragOver(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
        const sessionId = e.dataTransfer.getData('text/plain')
        if (sessionId) {
            onDropSession(sessionId, folder.id)
        }
    }

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    borderRadius: '6px',
                    border: isDragOver ? '1px dashed var(--theme-accent)' : '1px dashed transparent',
                    transition: 'border 0.15s ease',
                }}
            >
                <CollapsibleTrigger asChild>
                    <div
                        style={{
                            fontSize: '0.7rem',
                            color: 'var(--theme-text-muted)',
                            padding: '6px 6px 2px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            fontWeight: 500,
                            letterSpacing: '0.3px',
                        }}
                    >
                        <ChevronDown
                            size={10}
                            style={{
                                transition: 'transform 0.15s ease',
                                transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                flexShrink: 0,
                            }}
                        />
                        <FolderOpen size={12} style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {folder.name}
                        </span>
                        <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>
                            {sessionCount}
                        </span>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                        {children}
                    </div>
                    {sessionCount === 0 && (
                        <div style={{
                            fontSize: '0.7rem',
                            color: 'var(--theme-text-muted)',
                            padding: '8px 12px',
                            textAlign: 'center',
                            opacity: 0.6,
                        }}>
                            Drop chats here
                        </div>
                    )}
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
