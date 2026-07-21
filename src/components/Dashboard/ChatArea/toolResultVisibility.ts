/**
 * Thinking-timeline tool row suppression.
 * Live post-message cards use `shouldShowLiveToolResultCard` in tools/ui.
 */

/**
 * High-churn tools that should not appear as completed ThinkingBlock rows.
 * scheduled_task_* stay visible so schedule work reads as deliberate agent action.
 */
const SUPPRESSED_THINKING_TOOL_NAMES = new Set(['code_execution'])

export function shouldSuppressNoisyToolUi(toolName: string | undefined): boolean {
  return Boolean(toolName && SUPPRESSED_THINKING_TOOL_NAMES.has(toolName))
}

// Re-export for ChatArea call sites that historically imported visibility from here.
export { shouldShowLiveToolResultCard } from '../../../tools/ui/liveToolResultCards'
