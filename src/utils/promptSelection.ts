import { Settings } from '../contexts/SettingsContext'

/**
 * Determines the effective system prompt based on current settings.
 * 
 * @param settings - Current application settings
 * @returns The effective system prompt to use for AI calls
 */
export function getEffectiveSystemPrompt(settings: Pick<Settings, 'systemPrompt'>): string {
    // Use the base system prompt
    return settings.systemPrompt
}

/**
 * Determines if tools should be enabled based on settings.
 *
 * @param settings - Current application settings
 * @returns Whether tools should be available
 */
export function shouldEnableTools(settings: Pick<Settings, 'toolsEnabled' | 'webSearchEnabled'>): boolean {
    // The master tools toggle gates all tool execution.
    // webSearchEnabled controls only web_search/research_plan availability when tools are enabled.
    return settings.toolsEnabled
}
