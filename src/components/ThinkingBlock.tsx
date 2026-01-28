import React, { useState, useEffect, useRef } from 'react'
import { ChevronRight } from './icons'
import './ThinkingBlock.css'
import { ThinkingBlock as ThinkingBlockType } from '../contexts/ChatHistoryContext'
import AITextLoading from './AITextLoading'

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
    const [isExpanded, setIsExpanded] = useState(isThinking || isSearching) // Expand only for active state
    const [elapsedTime, setElapsedTime] = useState(0) // Track elapsed time in seconds
    // Initialize finalTime from thinkingDuration if provided (convert ms to seconds)
    const [finalTime, setFinalTime] = useState<number | null>(
        thinkingDuration ? thinkingDuration / 1000 : null
    )
    const thinkingStartRef = useRef<number | null>(null)

    // Start timer immediately when isThinking becomes true
    useEffect(() => {
        if (isThinking && !thinkingStartRef.current) {
            thinkingStartRef.current = Date.now()
            setFinalTime(null)
            setElapsedTime(0)
        }
    }, [isThinking])

    // Live timer effect - runs while isThinking is true
    useEffect(() => {
        let interval: NodeJS.Timeout

        if (isThinking && thinkingStartRef.current) {
            interval = setInterval(() => {
                setElapsedTime((Date.now() - thinkingStartRef.current!) / 1000)
            }, 100) // Update every 100ms for smoother display
        } else if (!isThinking && thinkingStartRef.current) {
            // isThinking just became false - capture final time
            const elapsed = (Date.now() - thinkingStartRef.current) / 1000
            setFinalTime(elapsed)
            setElapsedTime(elapsed)
            thinkingStartRef.current = null
        }

        return () => {
            if (interval) clearInterval(interval)
        }
    }, [isThinking])

    // Auto-expand only while actively thinking
    useEffect(() => {
        if (isThinking && thinking && thinking.trim().length > 0) {
            setIsExpanded(true)
        }
    }, [isThinking, thinking])

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
                    defaultExpanded={false}
                />
            ))}

            {/* Current active block */}
            {showActiveBlock && (
                <div className={`thinking-block ${isExpanded ? 'expanded' : ''}`}>
                    <div className={`thinking-header ${isSearching ? 'searching' : ''}`} onClick={handleToggle}>
                        <div className="thinking-label">
                            {isSearching ? (
                                <span className="thinking-text">
                                    <AITextLoading 
                                        text={`Searching web${searchQuery ? `: "${searchQuery}"` : ''}`}
                                        animationKey="searching"
                                    />
                                </span>
                            ) : isThinking ? (
                                <span className="thinking-text">
                                    {elapsedTime < 0.5 ? (
                                        <AITextLoading text="Connecting" animationKey="connecting" />
                                    ) : (
                                        <AITextLoading 
                                            text={`Thinking for ${elapsedTime.toFixed(1)} seconds`}
                                            animationKey="thinking"
                                        />
                                    )}
                                </span>
                            ) : (
                                <>
                                    <span className="thinking-text">
                                        <AITextLoading 
                                            text={`Thought For ${displayTime.toFixed(1)} Seconds`}
                                            animationKey="completed"
                                        />
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
