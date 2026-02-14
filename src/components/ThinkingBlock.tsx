import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Loader2, Search } from './icons'
import './ThinkingBlock.css'
import { ThinkingBlock as ThinkingBlockType } from '../contexts/ChatHistoryContext'
import AITextLoading from './AITextLoading'

const toolDisplayNames: Record<string, string> = {
    web_search: 'Web Search',
}

function formatToolDisplayName(name: string): string {
    return toolDisplayNames[name] || name.replace(/_/g, ' ')
}

function getToolCallText(tool: { name: string; arguments?: Record<string, unknown> }): string {
    const displayName = formatToolDisplayName(tool.name)
    if (tool.name === 'web_search' && tool.arguments?.query) {
        return `Using ${displayName}: "${String(tool.arguments.query)}"`
    }
    return `Using ${displayName}...`
}

interface ThinkingBlockProps {
    thinking: string
    isThinking?: boolean
    thinkingDuration?: number // in milliseconds
    isSearching?: boolean // Show "Searching" state instead of "Thinking"
    searchQuery?: string // The search query being searched
    /** Active tool calls during streaming (shows tool calling animation) */
    activeToolCalls?: Array<{ name: string; arguments?: Record<string, unknown> }>
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

/** Inline Web Search tool call - dropdown with JSON input/output, follows thinking block style */
function InlineWebSearchBlock({ block }: { block: ThinkingBlockType }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const hasDetails = (block.toolInput && Object.keys(block.toolInput).length > 0) ||
        (block.toolOutput && (block.toolOutput.data !== undefined || block.toolOutput.error))
    const query = block.query || ''

    return (
        <div className="thinking-block thinking-inline-tool-call">
            <div
                className={`thinking-header tool-call ${isExpanded ? 'expanded' : ''} ${hasDetails ? 'clickable' : ''}`}
                onClick={() => hasDetails && setIsExpanded(!isExpanded)}
            >
                <div className="thinking-label">
                    <span className="thinking-tool-calling-icon">
                        <Search size={14} />
                    </span>
                    <span className="thinking-text">
                        Web Search{query ? `: "${query}"` : ''}
                    </span>
                    {hasDetails && (
                        <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        >
                            <ChevronRight size={14} className="thinking-chevron" />
                        </motion.div>
                    )}
                </div>
            </div>
            <AnimatePresence initial={false}>
                {isExpanded && hasDetails && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                            height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                            opacity: { duration: 0.15, ease: 'easeInOut' }
                        }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="thinking-content thinking-tool-details">
                            {block.toolInput && Object.keys(block.toolInput).length > 0 && (
                                <div className="thinking-tool-json">
                                    <div className="thinking-tool-json-label">Input</div>
                                    <pre>{JSON.stringify(block.toolInput, null, 2)}</pre>
                                </div>
                            )}
                            {block.toolOutput && (
                                <div className="thinking-tool-json">
                                    <div className="thinking-tool-json-label">
                                        Output
                                        {block.toolOutput.executionTime != null && (
                                            <span className="thinking-tool-meta"> ({block.toolOutput.executionTime}ms)</span>
                                        )}
                                    </div>
                                    <pre>
                                        {block.toolOutput.error
                                            ? block.toolOutput.error
                                            : block.toolOutput.data !== undefined
                                                ? JSON.stringify(block.toolOutput.data, null, 2)
                                                : '{}'}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/** Split thinking by --- and interleave with Web Search blocks (replaces --- with tool call UI) */
function renderThinkingWithToolCalls(thinking: string, searchBlocks: ThinkingBlockType[]): React.ReactNode {
    const separator = /\n\s*---\s*\n?/g
    const segments = thinking.split(separator)
    const searchBlocksFiltered = searchBlocks.filter(b => b.type === 'searching')
    if (segments.length <= 1 || searchBlocksFiltered.length === 0) {
        return thinking
    }
    const nodes: React.ReactNode[] = []
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        if (seg != null && seg.length > 0) {
            nodes.push(<span key={`seg-${i}`} className="thinking-segment">{seg}</span>)
        }
        if (i < segments.length - 1 && searchBlocksFiltered[i]) {
            nodes.push(<InlineWebSearchBlock key={`search-${i}`} block={searchBlocksFiltered[i]!} />)
        }
    }
    return <>{nodes}</>
}

// Component for a single completed block (collapsed by default)
function CompletedBlock({ block, defaultExpanded }: { block: ThinkingBlockType; defaultExpanded?: boolean }) {
    const shouldExpand = defaultExpanded !== undefined ? defaultExpanded : block.type === 'thinking'
    const [isExpanded, setIsExpanded] = useState(shouldExpand)

    if (block.type === 'searching') {
        const hasDetails = (block.toolInput && Object.keys(block.toolInput).length > 0) ||
            (block.toolOutput && (block.toolOutput.data !== undefined || block.toolOutput.error))
        return (
            <div className="thinking-block completed thinking-tool-call">
                <div
                    className={`thinking-header completed tool-call ${hasDetails ? 'clickable' : ''}`}
                    onClick={() => hasDetails && setIsExpanded(!isExpanded)}
                >
                    <div className="thinking-label">
                        <span className="thinking-tool-calling-icon">
                            <Search size={14} />
                        </span>
                        <span className="thinking-text">
                            Web Search{block.query ? `: "${block.query}"` : ''}
                        </span>
                        {hasDetails && (
                            <ChevronRight size={14} className={`thinking-chevron ${isExpanded ? 'rotated' : ''}`} />
                        )}
                    </div>
                </div>
                <AnimatePresence initial={false}>
                    {isExpanded && hasDetails && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                                height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                                opacity: { duration: 0.15, ease: 'easeInOut' }
                            }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div className="thinking-content thinking-tool-details">
                                {block.toolInput && Object.keys(block.toolInput).length > 0 && (
                                    <div className="thinking-tool-json">
                                        <div className="thinking-tool-json-label">Input</div>
                                        <pre>{JSON.stringify(block.toolInput, null, 2)}</pre>
                                    </div>
                                )}
                                {block.toolOutput && (
                                    <div className="thinking-tool-json">
                                        <div className="thinking-tool-json-label">
                                            Output
                                            {block.toolOutput.executionTime != null && (
                                                <span className="thinking-tool-meta"> ({block.toolOutput.executionTime}ms)</span>
                                            )}
                                        </div>
                                        <pre>
                                            {block.toolOutput.error
                                                ? block.toolOutput.error
                                                : block.toolOutput.data !== undefined
                                                    ? JSON.stringify(block.toolOutput.data, null, 2)
                                                    : '{}'}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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
                        <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        >
                            <ChevronRight
                                size={14}
                                className="thinking-chevron"
                            />
                        </motion.div>
                    )}
                </div>
            </div>
            <AnimatePresence initial={false}>
                {isExpanded && hasContent && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ 
                            height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                            opacity: { duration: 0.15, ease: 'easeInOut' }
                        }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div className="thinking-content">
                            {block.content}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function ThinkingBlock({ thinking, isThinking = false, thinkingDuration, isSearching = false, searchQuery, activeToolCalls = [], completedBlocks = [] }: ThinkingBlockProps) {
    const hasActiveToolCalls = activeToolCalls && activeToolCalls.length > 0
    const [isExpanded, setIsExpanded] = useState(isThinking || isSearching || hasActiveToolCalls) // Expand only for active state
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

    // Auto-expand while actively thinking, tool calling, or searching; expand when we have content to show
    useEffect(() => {
        if (isThinking && thinking && thinking.trim().length > 0) {
            setIsExpanded(true)
        } else if (hasActiveToolCalls) {
            setIsExpanded(true)
        } else if (isSearching) {
            setIsExpanded(true)
        } else if (!isThinking && !isSearching && !hasActiveToolCalls) {
            const hasContentToShow = (thinking && thinking.trim().length > 0) || completedBlocks.length > 0
            setIsExpanded(hasContentToShow)
        }
    }, [isThinking, isSearching, hasActiveToolCalls, thinking, completedBlocks.length])

    const handleToggle = () => {
        setIsExpanded(!isExpanded)
    }

    if (!thinking && !isThinking && !isSearching && !hasActiveToolCalls && completedBlocks.length === 0) return null

    const hasThinkingContent = thinking && thinking.trim().length > 0
    const showActiveBlock = hasThinkingContent || isThinking || isSearching || hasActiveToolCalls

    // Use finalTime when thinking is complete, otherwise use live elapsedTime
    const displayTime = finalTime !== null ? finalTime : elapsedTime

    // When thinking contains --- and we have search blocks, show them inline (don't duplicate above)
    const searchBlocks = completedBlocks.filter(b => b.type === 'searching')
    const hasThinkingWithToolCalls = hasThinkingContent && /\n\s*---\s*\n?/.test(thinking) && searchBlocks.length > 0
    const blocksToRender = hasThinkingWithToolCalls ? completedBlocks.filter(b => b.type !== 'searching') : completedBlocks

    return (
        <div className="thinking-blocks-container">
            {/* Render completed blocks first - exclude search when shown inline in thinking */}
            {blocksToRender.map((block, index) => (
                <CompletedBlock
                    key={`completed-${index}-${block.timestamp}`}
                    block={block}
                    defaultExpanded={!!(block.content && block.content.trim().length > 0)}
                />
            ))}

            {/* Current active block */}
            {showActiveBlock && (
                <div className={`thinking-block ${isExpanded ? 'expanded' : ''}`}>
                    <div className={`thinking-header ${hasActiveToolCalls ? 'tool-calling' : isSearching ? 'searching' : ''}`} onClick={handleToggle}>
                        <div className="thinking-label">
                            {hasActiveToolCalls ? (
                                <span className="thinking-text thinking-tool-calling">
                                    <span className="thinking-tool-calling-icon">
                                        <Loader2 size={14} className="tool-call-spinner" />
                                    </span>
                                    <AITextLoading
                                        text={getToolCallText(activeToolCalls[0])}
                                        animationKey="tool-calling"
                                    />
                                </span>
                            ) : isSearching ? (
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
                                    <motion.div
                                        animate={{ rotate: isExpanded ? 90 : 0 }}
                                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                                    >
                                        <ChevronRight
                                            size={14}
                                            className="thinking-chevron"
                                        />
                                    </motion.div>
                                </>
                            )}
                        </div>
                    </div>
                    <AnimatePresence initial={false}>
                        {isExpanded && hasThinkingContent && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ 
                                    height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
                                    opacity: { duration: 0.15, ease: 'easeInOut' }
                                }}
                                style={{ overflow: 'hidden' }}
                            >
                                <div className="thinking-content">
                                    {renderThinkingWithToolCalls(thinking, completedBlocks)}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    )
}
