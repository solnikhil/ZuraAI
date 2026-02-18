import React from 'react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronDown, Pin } from '../../icons'
import type { ChatSession } from '../../../contexts/ChatHistoryContext'

interface PinnedSectionProps {
    sessions: ChatSession[]
    children: React.ReactNode
}

export default function PinnedSection({ sessions, children }: PinnedSectionProps) {
    const [isOpen, setIsOpen] = React.useState(true)

    if (sessions.length === 0) return null

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
                <div className="sidebar-section-label">
                    <ChevronDown
                        size={10}
                        className={`sidebar-section-label__chevron ${isOpen ? 'sidebar-section-label__chevron--open' : 'sidebar-section-label__chevron--closed'}`}
                    />
                    <Pin size={11} className="sidebar-section-label__icon" />
                    <span>Pinned</span>
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="sidebar-section-content">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
