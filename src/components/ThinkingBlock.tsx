import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import './ThinkingBlock.css'

interface ThinkingBlockProps {
    thinking: string
    isThinking?: boolean
    thinkingDuration?: number // in milliseconds
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`
    }
    return `${remainingSeconds}s`
}

export default function ThinkingBlock({ thinking, isThinking = false, thinkingDuration }: ThinkingBlockProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    if (!thinking && !isThinking) return null

    return (
        <div className={`thinking-block ${isExpanded ? 'expanded' : ''}`}>
            <div
                className="thinking-header"
                onClick={() => !isThinking && setIsExpanded(!isExpanded)}
                style={{ cursor: isThinking ? 'default' : 'pointer' }}
            >
                <div className="thinking-label">
                    {isThinking ? (
                        <>
                            <span className="thinking-dot"></span>
                            <span className="thinking-text">Thinking</span>
                        </>
                    ) : (
                        <>
                            <span className="thinking-text">
                                Thought for {thinkingDuration ? formatDuration(thinkingDuration) : 'a moment'}
                            </span>
                            <ChevronRight
                                size={14}
                                className={`thinking-chevron ${isExpanded ? 'rotated' : ''}`}
                            />
                        </>
                    )}
                </div>
            </div>
            {isExpanded && thinking && (
                <div className="thinking-content">
                    {thinking}
                </div>
            )}
        </div>
    )
}
