import React, { useState, useEffect } from 'react'
import { Bot, Brain, Loader2, CheckCircle, Search, FolderOpen, MousePointer, Keyboard, Globe, Calculator, Clock, Clipboard, Terminal, FileText, Settings } from 'lucide-react'
import './AgentCursor.css'

export type AgentCursorState = 'idle' | 'thinking' | 'executing' | 'complete'

interface AgentCursorProps {
    isActive: boolean
    state: AgentCursorState
    currentAction?: string
    toolName?: string
    startTime?: number
}

// Map tool names to icons
const toolIcons: Record<string, React.ReactNode> = {
    web_search: <Search size={14} />,
    fetch_url: <Globe size={14} />,
    calculator: <Calculator size={14} />,
    get_datetime: <Clock size={14} />,
    read_clipboard: <Clipboard size={14} />,
    write_clipboard: <Clipboard size={14} />,
    read_file: <FileText size={14} />,
    write_file: <FileText size={14} />,
    list_directory: <FolderOpen size={14} />,
    mouse_click: <MousePointer size={14} />,
    mouse_move: <MousePointer size={14} />,
    keyboard_type: <Keyboard size={14} />,
    keyboard_press: <Keyboard size={14} />,
    run_command: <Terminal size={14} />,
    system_info: <Settings size={14} />,
}

// Map tool names to display names
const toolDisplayNames: Record<string, string> = {
    web_search: 'Searching',
    fetch_url: 'Fetching',
    calculator: 'Calculating',
    get_datetime: 'Getting time',
    read_clipboard: 'Reading clipboard',
    write_clipboard: 'Writing clipboard',
    read_file: 'Reading file',
    write_file: 'Writing file',
    list_directory: 'Listing directory',
    mouse_click: 'Clicking',
    mouse_move: 'Moving mouse',
    keyboard_type: 'Typing',
    keyboard_press: 'Pressing key',
    run_command: 'Running command',
    system_info: 'Getting system info',
}

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const tenths = Math.floor((ms % 1000) / 100)
    return `${seconds}.${tenths}s`
}

export default function AgentCursor({ 
    isActive, 
    state, 
    currentAction, 
    toolName,
    startTime 
}: AgentCursorProps) {
    const [duration, setDuration] = useState(0)

    // Update duration every 100ms when active
    useEffect(() => {
        if (!isActive || !startTime) {
            setDuration(0)
            return
        }

        const interval = setInterval(() => {
            setDuration(Date.now() - startTime)
        }, 100)

        return () => clearInterval(interval)
    }, [isActive, startTime])

    if (!isActive) return null

    const getStateIcon = () => {
        switch (state) {
            case 'thinking':
                return <Brain size={16} className="agent-cursor-icon thinking" />
            case 'executing':
                return toolName && toolIcons[toolName] 
                    ? <span className="agent-cursor-icon executing">{toolIcons[toolName]}</span>
                    : <Loader2 size={16} className="agent-cursor-icon executing spinner" />
            case 'complete':
                return <CheckCircle size={16} className="agent-cursor-icon complete" />
            default:
                return <Bot size={16} className="agent-cursor-icon idle" />
        }
    }

    const getStateLabel = () => {
        switch (state) {
            case 'thinking':
                return 'Thinking...'
            case 'executing':
                if (toolName) {
                    return toolDisplayNames[toolName] || currentAction || `Using ${toolName.replace(/_/g, ' ')}...`
                }
                return currentAction || 'Executing...'
            case 'complete':
                return 'Done'
            default:
                return 'Agent Ready'
        }
    }

    return (
        <div className={`agent-cursor agent-cursor-${state}`}>
            <div className="agent-cursor-content">
                <div className="agent-cursor-header">
                    <Bot size={14} className="agent-cursor-bot-icon" />
                    <span className="agent-cursor-title">Agent Active</span>
                </div>
                <div className="agent-cursor-status">
                    {getStateIcon()}
                    <span className="agent-cursor-label">{getStateLabel()}</span>
                </div>
                {(state === 'thinking' || state === 'executing') && startTime && (
                    <div className="agent-cursor-duration">
                        <Clock size={12} />
                        <span>{formatDuration(duration)}</span>
                    </div>
                )}
            </div>
            {state === 'thinking' && <div className="agent-cursor-pulse" />}
        </div>
    )
}
