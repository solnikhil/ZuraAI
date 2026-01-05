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
    // Tools are enabled if either:
    // 1. The general toolsEnabled setting is true
    // 2. Web search is specifically enabled (allows model to use web_search tool)
    return settings.toolsEnabled || settings.webSearchEnabled
}
