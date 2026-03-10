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
                className={`sidebar-folder-dropzone ${isDragOver ? 'sidebar-folder-dropzone--over' : ''}`}
            >
                <CollapsibleTrigger asChild>
                    <div className="sidebar-section-label">
                        <ChevronDown
                            size={10}
                            className={`sidebar-section-label__chevron ${isOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
                        />
                        <FolderOpen size={12} className="sidebar-section-label__icon" />
                        <span className="sidebar-section-label__name">
                            {folder.name}
                        </span>
                        <span className="sidebar-section-label__count">
                            {sessionCount}
                        </span>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="sidebar-section-content sidebar-section-content--folder">
                        {children}
                    </div>
                    {sessionCount === 0 && (
                        <div className="sidebar-folder-empty">
                            Drop chats here
                        </div>
                    )}
                </CollapsibleContent>
            </div>
        </Collapsible>
    )
}
