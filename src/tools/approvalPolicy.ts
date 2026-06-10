import { getToolByName } from './definitions'
import {
  isMcpNamespacedToolName,
  type ToolCall,
  type ToolDescriptor,
} from './types'

const COMPUTER_TOOLS_REQUIRING_APPROVAL = new Set([
  'computer_click',
  'computer_type',
  'computer_key',
  'computer_scroll',
  'computer_cursor_position',
  'computer_launch_app',
  'computer_close_app',
])

export function requiresManualToolApproval(
  toolCall: ToolCall,
  availableTools: ToolDescriptor[]
): boolean {
  const toolDef = getToolByName(toolCall.name, availableTools)

  if (toolDef?.requiresApproval === true) {
    return true
  }

  if (toolCall.name === 'code_execution') {
    return true
  }

  if (COMPUTER_TOOLS_REQUIRING_APPROVAL.has(toolCall.name)) {
    return true
  }

  if (isMcpNamespacedToolName(toolCall.name)) {
    return true
  }

  return false
}
