import { Settings } from '../contexts/SettingsContext'
import { buildEnabledSkillsPrompt } from '../skills'
import { CURRENT_YEAR_PLACEHOLDER } from '../prompts/defaultSystemPrompt'

export function resolveSystemPromptTemplate(systemPrompt: string): string {
    const currentYear = String(new Date().getFullYear())
    return systemPrompt.replaceAll(CURRENT_YEAR_PLACEHOLDER, currentYear)
}

/**
 * Determines the effective system prompt based on current settings.
 * 
 * @param settings - Current application settings
 * @returns The effective system prompt to use for AI calls
 */
export function getEffectiveSystemPrompt(settings: Pick<Settings, 'systemPrompt'> & Partial<Pick<Settings, 'skills' | 'codeExecutionPrompt' | 'computerUsePrompt'>>): string {
    const resolvedSystemPrompt = resolveSystemPromptTemplate(settings.systemPrompt)
    const enabledSkillsSection = buildEnabledSkillsPrompt(settings.skills, {
        codeExecutionPrompt: settings.codeExecutionPrompt,
        computerUsePrompt: settings.computerUsePrompt,
    })
    if (!enabledSkillsSection) {
        return resolvedSystemPrompt
    }

    return `${resolvedSystemPrompt}\n\n${enabledSkillsSection}`
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
