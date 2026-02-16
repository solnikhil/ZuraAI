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
                        textTransform: 'uppercase',
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
                    <span>{label}</span>
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
