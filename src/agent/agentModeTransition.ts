import type { AssistantMode } from '@/chat/types'
import { withComputerUseEnabled, type SkillsSettings } from '@/skills'

export interface AgentModeSettingsUpdate {
  assistantMode: AssistantMode
  skills: SkillsSettings
}

/**
 * The single renderer-side invariant for entering and leaving Agent Mode.
 * Agent Mode and its required Computer Use capability must never disagree.
 */
export function buildAgentModeSettingsUpdate(
  skills: SkillsSettings,
  enabled: boolean
): AgentModeSettingsUpdate {
  return {
    assistantMode: enabled ? 'agent' : 'chat',
    skills: withComputerUseEnabled(skills, enabled),
  }
}

/**
 * Leaving Agent Mode also revokes the main-owned automatic-approval policy.
 * A failed revocation leaves the mode enabled so the UI never claims the
 * lower-authority state while main still holds the broader policy.
 */
export async function prepareAgentModeExit(): Promise<void> {
  if (!window.agentApproval) return

  const nextState = await window.agentApproval.setAutonomousMode(false)
  if (nextState.enabled) {
    throw new Error('Fully autonomous mode could not be disabled.')
  }
}
