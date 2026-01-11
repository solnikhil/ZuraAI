import React from 'react'
import { Search, Globe, Calculator, Clock, Clipboard, Loader2 } from '../../components/icons'
import './ToolCallIndicator.css'

// Simple tool name formatter (replaces underscores with spaces)
function formatToolDisplayName(name: string): string {
    return name.replace(/_/g, ' ')
}

const toolIcons: Record<string, React.ReactNode> = {
    web_search: <Search size={16} />,
    fetch_url: <Globe size={16} />,
    calculator: <Calculator size={16} />,
    get_datetime: <Clock size={16} />,
    read_clipboard: <Clipboard size={16} />,
    write_clipboard: <Clipboard size={16} />,
}

const toolDisplayNames: Record<string, string> = {
    web_search: 'Web Search',
    fetch_url: 'Fetching URL',
    calculator: 'Calculator',
    get_datetime: 'Getting Date/Time',
    read_clipboard: 'Reading Clipboard',
    write_clipboard: 'Writing to Clipboard',
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
                    return `Tool: Web Search req "${args.query}"`
                }
                if (toolName === 'web_search') {
                    return 'Tool: Web Search req'
                }
                if (toolName === 'fetch_url' && args?.url) {
                    const url = new URL(args.url)
                    return `Fetching ${url.hostname}...`
                }
                if (toolName === 'calculator' && args?.expression) {
                    return `Calculating ${args.expression}...`
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

