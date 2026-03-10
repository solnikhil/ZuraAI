import { Settings } from '../contexts/SettingsContext'
import { buildEnabledSkillsPrompt } from '../skills'

/**
 * Determines the effective system prompt based on current settings.
 * 
 * @param settings - Current application settings
 * @returns The effective system prompt to use for AI calls
 */
export function getEffectiveSystemPrompt(settings: Pick<Settings, 'systemPrompt'> & Partial<Pick<Settings, 'skills'>>): string {
    const enabledSkillsSection = buildEnabledSkillsPrompt(settings.skills)
    if (!enabledSkillsSection) {
        return settings.systemPrompt
    }

    return `${settings.systemPrompt}\n\n${enabledSkillsSection}`
}

/**
 * Determines if tools should be enabled based on settings.
 *
 * @param settings - Current application settings
 * @returns Whether tools should be available
 */
export function shouldEnableTools(settings: Pick<Settings, 'toolsEnabled'>): boolean {
    // The master tools toggle gates all tool execution.
    return settings.toolsEnabled
}
