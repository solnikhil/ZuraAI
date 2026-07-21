import React from 'react'
import {
  Bell,
  Box,
  Loader2,
  Globe,
  Search,
  Terminal,
  Monitor,
  MousePointer,
} from '../../components/icons'
import { getWebToolLabel, inferWebToolModeFromArgs } from './webToolDisplay'
import { getToolArgumentSummary, getToolPresentation } from './toolPresentation'

import './ToolCallIndicator.css'

const toolIcons: Record<string, React.ReactNode> = {
  web_search: <Search size={16} />,
  code_execution: <Terminal size={16} />,
  computer_screenshot: <Monitor size={16} />,
  computer_click: <MousePointer size={16} />,
  computer_type: <Monitor size={16} />,
  computer_key: <Monitor size={16} />,
  computer_scroll: <Monitor size={16} />,
  computer_cursor_position: <MousePointer size={16} />,
  computer_list_windows: <Monitor size={16} />,
  scheduled_task_create: <Bell size={16} />,
  scheduled_task_update: <Bell size={16} />,
  scheduled_task_delete: <Bell size={16} />,
  scheduled_task_list: <Bell size={16} />,
  scheduled_task_get_logs: <Bell size={16} />,
}

const toolDisplayNames: Record<string, string> = {
  web_search: 'Web Search',
  code_execution: 'Code Execution',
  computer_screenshot: 'Screenshot',
  computer_click: 'Click',
  computer_type: 'Type',
  computer_key: 'Key Press',
  computer_scroll: 'Scroll',
  computer_cursor_position: 'Move Cursor',
  computer_list_windows: 'List Windows',
  scheduled_task_create: 'Create schedule',
  scheduled_task_update: 'Update schedule',
  scheduled_task_delete: 'Delete schedule',
  scheduled_task_list: 'List schedules',
  scheduled_task_get_logs: 'Schedule history',
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
      toolIcons[toolName] || <Box size={16} />
    )
  const displayName =
    toolName === 'web_search'
      ? getWebToolLabel(webToolMode || 'search')
      : toolDisplayNames[toolName] || toolPresentation.combinedLabel

  const getStatusMessage = () => {
    switch (status) {
      case 'executing':
        if (toolName === 'web_search' && args?.query) {
          return `Sourcing “${args.query}”`
        }
        if (toolName === 'web_search') {
          return displayName
        }
        if (toolName === 'code_execution') {
          const desc = args?.description ? String(args.description) : null
          const lang = args?.language === 'python' ? 'Python' : 'JavaScript'
          return desc ? `Running ${lang}: ${desc}` : `Running ${lang} code…`
        }
        if (toolName === 'computer_screenshot') return 'Taking screenshot…'
        if (toolName === 'computer_list_windows') return 'Listing open windows…'
        if (toolName === 'computer_click')
          return `Clicking at (${args?.x ?? '?'}, ${args?.y ?? '?'})…`
        if (toolName === 'computer_type')
          return `Typing "${String(args?.text ?? '').slice(0, 30)}"…`
        if (toolName === 'computer_key') return `Pressing ${args?.key ?? '?'}…`
        if (toolName === 'computer_scroll') return `Scrolling ${args?.direction ?? '?'}…`
        if (toolName === 'computer_cursor_position')
          return `Moving cursor to (${args?.x ?? '?'}, ${args?.y ?? '?'})…`
        if (toolName.startsWith('scheduled_task_')) {
          const title =
            typeof args?.title === 'string' && args.title.trim()
              ? args.title.trim()
              : typeof args?.id === 'string'
                ? args.id.slice(0, 8)
                : null
          if (toolName === 'scheduled_task_create')
            return title ? `Creating schedule “${title}”…` : 'Creating schedule…'
          if (toolName === 'scheduled_task_update')
            return title ? `Updating schedule “${title}”…` : 'Updating schedule…'
          if (toolName === 'scheduled_task_delete') return 'Deleting schedule…'
          if (toolName === 'scheduled_task_list') return 'Listing schedules…'
          if (toolName === 'scheduled_task_get_logs') return 'Checking schedule history…'
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
