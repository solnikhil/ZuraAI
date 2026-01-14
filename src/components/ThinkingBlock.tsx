import React, { useState, useEffect, useRef } from 'react'
import { ChevronRight } from './icons'
import './ThinkingBlock.css'
import { ThinkingBlock as ThinkingBlockType } from '../contexts/ChatHistoryContext'

interface ThinkingBlockProps {
    thinking: string
    isThinking?: boolean
    thinkingDuration?: number // in milliseconds
    isSearching?: boolean // Show "Searching" state instead of "Thinking"
    searchQuery?: string // The search query being searched
    // New props for showing completed blocks
    completedBlocks?: ThinkingBlockType[]
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

// Component for a single completed block (collapsed by default)
function CompletedBlock({ block, defaultExpanded }: { block: ThinkingBlockType; defaultExpanded?: boolean }) {
    const shouldExpand = defaultExpanded !== undefined ? defaultExpanded : block.type === 'thinking'
    const [isExpanded, setIsExpanded] = useState(shouldExpand)

    if (block.type === 'searching') {
        return (
            <div className="thinking-block completed">
                <div className="thinking-header completed" onClick={() => setIsExpanded(!isExpanded)}>
                    <div className="thinking-label">
                        <span className="thinking-text">
                            Tool: Web Search req{block.query ? ` "${block.query}"` : ''}
                        </span>
                        <ChevronRight
                            size={14}
                            className={`thinking-chevron ${isExpanded ? 'rotated' : ''}`}
                        />
                    </div>
                </div>
            </div>
        )
    }

    // Thinking block
    const hasContent = block.content && block.content.trim().length > 0
    return (
        <div className="thinking-block completed">
            <div className="thinking-header completed" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="thinking-label">
                    <span className="thinking-text">
                        Thought for {block.duration ? formatDuration(block.duration) : 'a moment'}
                    </span>
                    {hasContent && (
                        <ChevronRight
                            size={14}
                            className={`thinking-chevron ${isExpanded ? 'rotated' : ''}`}
                        />
                    )}
                </div>
            </div>
            {isExpanded && hasContent && (
                <div className="thinking-content">
                    {block.content}
                </div>
            )}
        </div>
    )
}

export default function ThinkingBlock({ thinking, isThinking = false, thinkingDuration, isSearching = false, searchQuery, completedBlocks = [] }: ThinkingBlockProps) {
    const [isExpanded, setIsExpanded] = useState(true) // Auto-expand by default
    const [elapsedTime, setElapsedTime] = useState(0) // Track elapsed time in seconds
    const [finalTime, setFinalTime] = useState<number | null>(null) // Store final time when thinking completes
    const thinkingStartRef = useRef<number | null>(null)

    // Live timer effect - runs while isThinking is true
    useEffect(() => {
        if (isThinking) {
            // Start timer ONLY when thinking content arrives (first token)
            if (thinking && thinking.trim().length > 0) {
                if (!thinkingStartRef.current) {
                    thinkingStartRef.current = Date.now()
                    setFinalTime(null)
                }

                const interval = setInterval(() => {
                    if (thinkingStartRef.current) {
                        setElapsedTime((Date.now() - thinkingStartRef.current) / 1000)
                    }
                }, 100)

                return () => clearInterval(interval)
            }
        } else if (thinkingStartRef.current) {
            // isThinking just became false - capture final time
            const elapsed = (Date.now() - thinkingStartRef.current) / 1000
            setFinalTime(elapsed)
            setElapsedTime(elapsed)
            thinkingStartRef.current = null
        }
    }, [isThinking, thinking])

    // Auto-expand when thinking content exists
    useEffect(() => {
        if (thinking && thinking.trim().length > 0) {
            setIsExpanded(true)
        }
    }, [thinking])

    const handleToggle = () => {
        setIsExpanded(!isExpanded)
    }

    if (!thinking && !isThinking && !isSearching && completedBlocks.length === 0) return null

    const hasThinkingContent = thinking && thinking.trim().length > 0
    const showActiveBlock = hasThinkingContent || isThinking || isSearching

    // Use finalTime when thinking is complete, otherwise use live elapsedTime
    const displayTime = finalTime !== null ? finalTime : elapsedTime

    return (
        <div className="thinking-blocks-container">
            {/* Render completed blocks first */}
            {completedBlocks.map((block, index) => (
                <CompletedBlock
                    key={`completed-${index}-${block.timestamp}`}
                    block={block}
                    defaultExpanded={block.type === 'thinking'}
                />
            ))}

            {/* Current active block */}
            {showActiveBlock && (
                <div className={`thinking-block ${isExpanded ? 'expanded' : ''}`}>
                    <div className={`thinking-header ${isSearching ? 'searching' : ''}`} onClick={handleToggle}>
                        <div className="thinking-label">
                            {isSearching && !hasThinkingContent ? (
                                <>
                                    <span className="thinking-dot searching-dot"><span className="middle-dot"></span></span>
                                    <span className="thinking-text">
                                        Tool: Web Search req{searchQuery ? ` "${searchQuery}"` : ''}
                                    </span>
                                </>
                            ) : isThinking ? (
                                <>
                                    {!hasThinkingContent && <span className="thinking-dot"><span className="middle-dot"></span></span>}
                                    <span className="thinking-text">Thinking {elapsedTime.toFixed(3)} seconds</span>
                                </>
                            ) : (
                                <>
                                    <span className="thinking-text">
                                        Thought for {displayTime.toFixed(3)} seconds
                                    </span>
                                    <ChevronRight
                                        size={14}
                                        className={`thinking-chevron ${isExpanded ? 'rotated' : ''}`}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                    {isExpanded && hasThinkingContent && (
                        <div className="thinking-content">
                            {thinking}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
