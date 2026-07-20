/**
 * Live post-message tool cards are disabled by default.
 * Only product-surface tools that need interactive or summary UI are shown.
 */

const LIVE_TOOL_RESULT_CARD_ALLOWLIST = new Set([
  'artifact_create',
  'artifact_update',
  // Interactive "Add and connect" review for agent-proposed MCP servers.
  'mcp_request_add',
])

export function shouldShowLiveToolResultCard(toolName: string): boolean {
  return LIVE_TOOL_RESULT_CARD_ALLOWLIST.has(toolName)
}
