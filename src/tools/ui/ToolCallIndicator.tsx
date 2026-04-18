import React from 'react'
import { Search, Loader2, Globe, Wrench, Terminal } from '../../components/icons'
import { getWebToolLabel, inferWebToolModeFromArgs } from './webToolDisplay'
import { getToolArgumentSummary, getToolPresentation } from './toolPresentation'

import './ToolCallIndicator.css'

const toolIcons: Record<string, React.ReactNode> = {
  web_search: <Search size={16} />,
  code_execution: <Terminal size={16} />,
}

const toolDisplayNames: Record<string, string> = {
  web_search: 'Web Search',
  code_execution: 'Code Execution',
}

interface ToolCallIndicatorProps {
  toolName: string
  status: 'pending' | 'executing' | 'complete' | 'error'
  arguments?: Record<string, unknown>
}

export default function ToolCallIndicator({
  toolName,
  status,
  arguments: args,
}: ToolCallIndicatorProps) {
  const webToolMode = toolName === 'web_search' ? inferWebToolModeFromArgs(args) : null
  const toolPresentation = getToolPresentation(toolName)
  const argumentSummary = getToolArgumentSummary(args)
  const icon =
    toolName === 'web_search' ? (
      webToolMode === 'extract' ? (
        <Globe size={16} />
      ) : (
        <Search size={16} />
      )
    ) : (
      toolIcons[toolName] || <Wrench size={16} />
    )
  const displayName =
    toolName === 'web_search'
      ? getWebToolLabel(webToolMode || 'search')
      : toolDisplayNames[toolName] || toolPresentation.combinedLabel

  const getStatusMessage = () => {
    switch (status) {
      case 'executing':
        if (toolName === 'web_search' && args?.query) {
          return `Tool: ${displayName} "${args.query}"`
        }
        if (toolName === 'web_search') {
          return `Tool: ${displayName}`
        }
        if (toolName === 'code_execution') {
          const desc = args?.description ? String(args.description) : null
          const lang = args?.language === 'python' ? 'Python' : 'JavaScript'
          return desc ? `Running ${lang}: ${desc}` : `Running ${lang} code…`
        }
        return argumentSummary
          ? `Running ${displayName}: ${argumentSummary}`
          : `Running ${displayName}...`
      case 'complete':
        return `${displayName} complete`
      case 'error':
        return `${displayName} failed`
      default:
        return `Preparing ${displayName}`
    }
  }

  return (
    <div
      className={`tool-indicator tool-indicator-${status}${toolName === 'web_search' && webToolMode === 'extract' ? ' tool-indicator-web-extract' : ''}${toolPresentation.isMcp ? ' tool-indicator-mcp' : ''}`}
    >
      <div className="tool-indicator-icon">
        {status === 'executing' ? <Loader2 size={16} className="tool-spinner" /> : icon}
      </div>
      <span className="tool-indicator-text">{getStatusMessage()}</span>
    </div>
  )
}
