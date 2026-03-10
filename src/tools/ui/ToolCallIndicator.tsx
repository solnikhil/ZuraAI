import React from 'react'
import { Search, Loader2, Globe } from '../../components/icons'
import { getWebToolLabel, inferWebToolModeFromArgs } from './webToolDisplay'

import './ToolCallIndicator.css'

// Simple tool name formatter (replaces underscores with spaces)
function formatToolDisplayName(name: string): string {
    return name.replace(/_/g, ' ')
}

const toolIcons: Record<string, React.ReactNode> = {
    web_search: <Search size={16} />,
}

const toolDisplayNames: Record<string, string> = {
    web_search: 'Web Search',
}


interface ToolCallIndicatorProps {
    toolName: string
    status: 'pending' | 'executing' | 'complete' | 'error'
    arguments?: Record<string, unknown>
}

export default function ToolCallIndicator({ toolName, status, arguments: args }: ToolCallIndicatorProps) {
    const webToolMode = toolName === 'web_search' ? inferWebToolModeFromArgs(args) : null
    const icon = toolName === 'web_search'
        ? (webToolMode === 'extract' ? <Globe size={16} /> : <Search size={16} />)
        : (toolIcons[toolName] || <Search size={16} />)
    const displayName = toolName === 'web_search'
        ? getWebToolLabel(webToolMode || 'search')
        : (toolDisplayNames[toolName] || formatToolDisplayName(toolName))
    
    const getStatusMessage = () => {
        switch (status) {
            case 'executing':
                if (toolName === 'web_search' && args?.query) {
                    return `Tool: ${displayName} "${args.query}"`
                }
                if (toolName === 'web_search') {
                    return `Tool: ${displayName}`
                }
                return `Using ${displayName}...`
            case 'complete':
                return `${displayName} complete`
            case 'error':
                return `${displayName} failed`
            default:
                return `Will use ${displayName}`
        }
    }
    
    return (
        <div className={`tool-indicator tool-indicator-${status}${toolName === 'web_search' && webToolMode === 'extract' ? ' tool-indicator-web-extract' : ''}`}>
            <div className="tool-indicator-icon">
                {status === 'executing' ? (
                    <Loader2 size={16} className="tool-spinner" />
                ) : (
                    icon
                )}
            </div>
            <span className="tool-indicator-text">{getStatusMessage()}</span>
        </div>
    )
}

