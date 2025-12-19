import React, { useState } from 'react'
import { 
    ChevronDown, 
    ChevronUp, 
    Loader2, 
    CheckCircle2, 
    XCircle, 
    Clock,
    Search,
    Globe,
    Calculator,
    Clipboard,
    MousePointer,
    Keyboard,
    FolderOpen,
    Terminal,
    Eye,
    Wrench
} from 'lucide-react'
import './AgentToolExecution.css'

// Tool icons mapping
const toolIcons: Record<string, React.ReactNode> = {
    web_search: <Search size={16} />,
    fetch_url: <Globe size={16} />,
    calculator: <Calculator size={16} />,
    get_datetime: <Clock size={16} />,
    read_clipboard: <Clipboard size={16} />,
    write_clipboard: <Clipboard size={16} />,
    mouse_click: <MousePointer size={16} />,
    mouse_move: <MousePointer size={16} />,
    keyboard_type: <Keyboard size={16} />,
    keyboard_press: <Keyboard size={16} />,
    read_file: <FolderOpen size={16} />,
    write_file: <FolderOpen size={16} />,
    list_directory: <FolderOpen size={16} />,
    execute_command: <Terminal size={16} />,
    take_screenshot: <Eye size={16} />,
}

// Tool display names
const toolDisplayNames: Record<string, string> = {
    web_search: 'Web Search',
    fetch_url: 'Fetch URL',
    calculator: 'Calculator',
    get_datetime: 'Date/Time',
    read_clipboard: 'Read Clipboard',
    write_clipboard: 'Write Clipboard',
    mouse_click: 'Mouse Click',
    mouse_move: 'Mouse Move',
    keyboard_type: 'Keyboard Type',
    keyboard_press: 'Keyboard Press',
    read_file: 'Read File',
    write_file: 'Write File',
    list_directory: 'List Directory',
    execute_command: 'Execute Command',
    take_screenshot: 'Screenshot',
}

export interface AgentToolExecutionProps {
    toolName: string
    args: Record<string, any>
    status: 'pending' | 'executing' | 'success' | 'error'
    result?: any
    error?: string
    duration?: number
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    const seconds = (ms / 1000).toFixed(1)
    return `${seconds}s`
}

function formatArgs(args: Record<string, any>): string[] {
    return Object.entries(args).map(([key, value]) => {
        const displayValue = typeof value === 'string' 
            ? (value.length > 50 ? value.slice(0, 50) + '...' : value)
            : JSON.stringify(value)
        return `${key}: ${displayValue}`
    })
}

export default function AgentToolExecution({ 
    toolName, 
    args, 
    status, 
    result, 
    error, 
    duration 
}: AgentToolExecutionProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    
    const icon = toolIcons[toolName] || <Wrench size={16} />
    const displayName = toolDisplayNames[toolName] || toolName.replace(/_/g, ' ')
    const formattedArgs = formatArgs(args)
    
    const getStatusIcon = () => {
        switch (status) {
            case 'executing':
                return <Loader2 size={16} className="agent-tool-spinner" />
            case 'success':
                return <CheckCircle2 size={16} />
            case 'error':
                return <XCircle size={16} />
            default:
                return <Clock size={16} />
        }
    }
    
    const getStatusText = () => {
        switch (status) {
            case 'executing':
                return 'Executing...'
            case 'success':
                return 'Success'
            case 'error':
                return 'Error'
            default:
                return 'Pending'
        }
    }
    
    const hasResults = status === 'success' && result !== undefined
    const hasError = status === 'error' && error
    const canExpand = hasResults || hasError
    
    return (
        <div className={`agent-tool-execution agent-tool-${status}`}>
            <div 
                className={`agent-tool-header ${canExpand ? 'agent-tool-clickable' : ''}`}
                onClick={() => canExpand && setIsExpanded(!isExpanded)}
            >
                <div className="agent-tool-icon">
                    {icon}
                </div>
                <span className="agent-tool-name">{displayName}</span>
                <div className={`agent-tool-status agent-tool-status-${status}`}>
                    {getStatusIcon()}
                    <span>{getStatusText()}</span>
                </div>
                {duration !== undefined && (
                    <span className="agent-tool-duration">
                        <Clock size={12} />
                        {formatDuration(duration)}
                    </span>
                )}
                {canExpand && (
                    <div className="agent-tool-expand">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                )}
            </div>
            
            {/* Parameters */}
            {formattedArgs.length > 0 && (
                <div className="agent-tool-params">
                    {formattedArgs.map((arg, i) => (
                        <div key={i} className="agent-tool-param">
                            <span className="agent-tool-param-prefix">├─</span>
                            <span className="agent-tool-param-text">{arg}</span>
                        </div>
                    ))}
                </div>
            )}
            
            {/* Collapsible Results */}
            {isExpanded && hasResults && (
                <div className="agent-tool-results">
                    <div className="agent-tool-results-header">
                        <ChevronDown size={14} />
                        <span>Results</span>
                    </div>
                    <div className="agent-tool-results-content">
                        {renderResult(toolName, result)}
                    </div>
                </div>
            )}
            
            {/* Error Display */}
            {isExpanded && hasError && (
                <div className="agent-tool-error">
                    <div className="agent-tool-error-header">
                        <XCircle size={14} />
                        <span>Error</span>
                    </div>
                    <div className="agent-tool-error-content">
                        {error}
                    </div>
                </div>
            )}
        </div>
    )
}

// Render result based on tool type
function renderResult(toolName: string, result: any): React.ReactNode {
    if (result === null || result === undefined) {
        return <span className="agent-tool-result-empty">No result</span>
    }
    
    // Web search results
    if (toolName === 'web_search' && result.results) {
        return (
            <div className="agent-tool-search-results">
                {result.answer && (
                    <div className="agent-tool-search-answer">{result.answer}</div>
                )}
                {result.results.slice(0, 3).map((r: any, i: number) => (
                    <div key={i} className="agent-tool-search-item">
                        <span className="agent-tool-search-bullet">•</span>
                        <span className="agent-tool-search-title">{r.title}</span>
                    </div>
                ))}
                {result.results.length > 3 && (
                    <div className="agent-tool-search-more">
                        +{result.results.length - 3} more results
                    </div>
                )}
            </div>
        )
    }
    
    // Calculator result
    if (toolName === 'calculator' && result.result !== undefined) {
        return (
            <div className="agent-tool-calc-result">
                <span className="agent-tool-calc-expr">{result.expression}</span>
                <span className="agent-tool-calc-eq">=</span>
                <span className="agent-tool-calc-answer">{result.formatted || result.result}</span>
            </div>
        )
    }
    
    // String result
    if (typeof result === 'string') {
        const truncated = result.length > 200 ? result.slice(0, 200) + '...' : result
        return <pre className="agent-tool-result-text">{truncated}</pre>
    }
    
    // Object result - show JSON
    if (typeof result === 'object') {
        const json = JSON.stringify(result, null, 2)
        const truncated = json.length > 500 ? json.slice(0, 500) + '\n...' : json
        return <pre className="agent-tool-result-json">{truncated}</pre>
    }
    
    // Primitive result
    return <span className="agent-tool-result-primitive">{String(result)}</span>
}

// Export a list component for multiple tool executions
export function AgentToolExecutionList({ 
    executions 
}: { 
    executions: AgentToolExecutionProps[] 
}) {
    if (!executions || executions.length === 0) return null
    
    return (
        <div className="agent-tool-execution-list">
            {executions.map((exec, i) => (
                <AgentToolExecution key={i} {...exec} />
            ))}
        </div>
    )
}
