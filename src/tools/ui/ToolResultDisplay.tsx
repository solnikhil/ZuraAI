import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Search, AlertCircle } from '../../components/icons'

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
    // LobeHub-compatible metadata fields
    source?: string
    displayed_link?: string
    date?: string
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
                                <div className="search-result-url">
                                    {r.displayed_link || r.url}
                                    {r.date && (
                                        <span className="search-result-date"> • {r.date}</span>
                                    )}
                                </div>
                                {r.source && r.source !== r.displayed_link?.split(' › ')[0] && (
                                    <div className="search-result-source">{r.source}</div>
                                )}
                                <p className="search-result-snippet">{r.snippet}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }
    
    // Other tools are disabled; fall through to generic renderer.


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

