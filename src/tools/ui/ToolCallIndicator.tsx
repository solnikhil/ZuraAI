import React from 'react'
import { Search, Loader2 } from '../../components/icons'

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
    arguments?: Record<string, any>
}

export default function ToolCallIndicator({ toolName, status, arguments: args }: ToolCallIndicatorProps) {
    const icon = toolIcons[toolName] || <Search size={16} />
    const displayName = toolDisplayNames[toolName] || formatToolDisplayName(toolName)
    
    const getStatusMessage = () => {
        switch (status) {
            case 'executing':
                if (toolName === 'web_search' && args?.query) {
                    return `Tool: Web Search "${args.query}"`
                }
                if (toolName === 'web_search') {
                    return 'Tool: Web Search'
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
        <div className={`tool-indicator tool-indicator-${status}`}>
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

