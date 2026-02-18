import React from 'react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { ChevronDown } from '../../icons'
import type { ChatSession } from '../../../contexts/ChatHistoryContext'

interface TimeGroupProps {
    label: string
    sessions: ChatSession[]
    children: React.ReactNode
}

export default function TimeGroup({ label, sessions, children }: TimeGroupProps) {
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
                    <span>{label}</span>
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
