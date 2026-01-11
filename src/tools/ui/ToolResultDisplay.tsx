import React, { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Search, Globe, Calculator, Clock, Clipboard, AlertCircle } from '../../components/icons'
import './ToolResultDisplay.css'

// Simple tool name formatter (replaces underscores with spaces)
function formatToolDisplayName(name: string): string {
    return name.replace(/_/g, ' ')
}

interface SearchResult {
    title: string
    url: string
    snippet: string
    favicon?: string
}

interface ImageResult {
    url: string
    description?: string
}

interface ToolResultDisplayProps {
    toolName: string
    result: any
    error?: string
}

export default function ToolResultDisplay({ toolName, result, error }: ToolResultDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    
    const displayName = formatToolDisplayName(toolName)

    if (error) {
        return (
            <div className="tool-result tool-result-error">
                <div className="tool-result-header">
                    <AlertCircle size={16} />
                    <span>Tool Error: {displayName}</span>
                </div>
                <div className="tool-result-error-message">{error}</div>
            </div>
        )
    }
    
    // Web Search Results
    if (toolName === 'web_search') {
        const hasImages = result?.images?.length > 0
        const imageCount = result?.imageCount || result?.images?.length || 0

        return (
            <div className="tool-result tool-result-search">
                <div
                    className="tool-result-header tool-result-clickable"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <Search size={16} />
                    <span>Web Search: {result?.query}</span>
                    <span className="tool-result-count">
                        {result?.results?.length || 0} results
                        {imageCount > 0 && ` • ${imageCount} images`}
                    </span>
                    {result?.searchDepth === 'advanced' && (
                        <span className="tool-result-badge">Advanced</span>
                    )}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>

                {result?.answer && (
                    <div className="tool-result-answer">
                        {result.answer}
                    </div>
                )}

                {/* Image Gallery */}
                {isExpanded && hasImages && (
                    <div className="search-images-gallery">
                        {result.images.slice(0, 6).map((img: ImageResult, i: number) => (
                            <a
                                key={i}
                                href={img.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="search-image-item"
                            >
                                <img
                                    src={img.url}
                                    alt={img.description || `Image ${i + 1}`}
                                    loading="lazy"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none'
                                    }}
                                />
                            </a>
                        ))}
                    </div>
                )}

                {isExpanded && result?.results?.length > 0 && (
                    <div className="search-results-list">
                        {result.results.map((r: SearchResult, i: number) => (
                            <div key={i} className="search-result-item">
                                <a
                                    href={r.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="search-result-title"
                                >
                                    {r.favicon && (
                                        <img
                                            src={r.favicon}
                                            alt=""
                                            className="search-result-favicon"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none'
                                            }}
                                        />
                                    )}
                                    {r.title}
                                    <ExternalLink size={12} />
                                </a>
                                <div className="search-result-url">{r.url}</div>
                                <p className="search-result-snippet">{r.snippet}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }
    
    // URL Fetch Results
    if (toolName === 'fetch_url') {
        return (
            <div className="tool-result tool-result-url">
                <div 
                    className="tool-result-header tool-result-clickable"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <Globe size={16} />
                    <span>Fetched: {result?.title || result?.url}</span>
                    <span className="tool-result-count">{result?.contentLength?.toLocaleString()} chars</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                
                {isExpanded && (
                    <div className="url-content-preview">
                        {result?.content?.slice(0, 500)}
                        {result?.content?.length > 500 && '...'}
                    </div>
                )}
            </div>
        )
    }
    
    // Calculator Results
    if (toolName === 'calculator') {
        return (
            <div className="tool-result tool-result-calculator">
                <div className="tool-result-header">
                    <Calculator size={16} />
                    <span>Calculator</span>
                </div>
                <div className="calculator-result">
                    <span className="calc-expression">{result?.expression}</span>
                    <span className="calc-equals">=</span>
                    <span className="calc-answer">{result?.formatted || result?.result}</span>
                </div>
            </div>
        )
    }
    
    // DateTime Results
    if (toolName === 'get_datetime') {
        return (
            <div className="tool-result tool-result-datetime">
                <div className="tool-result-header">
                    <Clock size={16} />
                    <span>Current Date/Time</span>
                </div>
                <div className="datetime-result">
                    {result?.formatted}
                </div>
            </div>
        )
    }
    
    // Clipboard Results
    if (toolName === 'read_clipboard' || toolName === 'write_clipboard') {
        return (
            <div className="tool-result tool-result-clipboard">
                <div className="tool-result-header">
                    <Clipboard size={16} />
                    <span>{toolName === 'read_clipboard' ? 'Clipboard Contents' : 'Copied to Clipboard'}</span>
                </div>
                {result?.preview && (
                    <div className="clipboard-preview">
                        {result.preview}
                        {result.length > 200 && '...'}
                    </div>
                )}
            </div>
        )
    }
    
    // Generic result display for unknown tools
    return (
        <div className="tool-result tool-result-generic">
            <div 
                className="tool-result-header tool-result-clickable"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span>Tool: {displayName}</span>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            
            {isExpanded && (
                <pre className="tool-result-json">
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    )
}

