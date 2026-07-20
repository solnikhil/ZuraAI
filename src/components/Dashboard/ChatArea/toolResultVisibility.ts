/**
 * Thinking-timeline tool row suppression.
 * Live post-message cards use `shouldShowLiveToolResultCard` in tools/ui.
 */

/** High-churn tools that should not appear as completed ThinkingBlock rows. */
const SUPPRESSED_THINKING_TOOL_NAMES = new Set([
  'code_execution',
  'scheduled_task_create',
  'scheduled_task_update',
  'scheduled_task_delete',
  'scheduled_task_list',
  'scheduled_task_get_logs',
])

export function shouldSuppressNoisyToolUi(toolName: string | undefined): boolean {
  return Boolean(toolName && SUPPRESSED_THINKING_TOOL_NAMES.has(toolName))
}

// Re-export for ChatArea call sites that historically imported visibility from here.
export { shouldShowLiveToolResultCard } from '../../../tools/ui/liveToolResultCards'
