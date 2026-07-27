import { getToolByName } from './definitions'
import { getToolSecurityProfile } from './builtinMainToolContract'
import { isMcpNamespacedToolName, type ToolCall, type ToolDescriptor } from './types'

export function requiresManualToolApproval(
  toolCall: ToolCall,
  availableTools: ToolDescriptor[]
): boolean {
  const securityProfile = getToolSecurityProfile(toolCall.name, toolCall.arguments)
  if (securityProfile) return securityProfile.approval === 'always'

  const toolDef = getToolByName(toolCall.name, availableTools)

  if (toolDef?.requiresApproval === true) {
    return true
  }

  // Unknown MCP shapes remain main-owned and conservatively approval-gated.
  if (isMcpNamespacedToolName(toolCall.name)) {
    return true
  }

  return false
}
