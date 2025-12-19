import { Settings, THINKING_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT } from '../contexts/SettingsContext'

/**
 * Determines the effective system prompt based on current settings.
 * 
 * Priority:
 * 1. Agent mode enabled -> AGENT_SYSTEM_PROMPT (overrides everything)
 * 2. Thinking mode enabled -> base prompt + THINKING_SYSTEM_PROMPT
 * 3. Default -> base system prompt from settings
 * 
 * @param settings - Current application settings
 * @returns The effective system prompt to use for AI calls
 */
export function getEffectiveSystemPrompt(settings: Pick<Settings, 'systemPrompt' | 'agentModeEnabled' | 'thinkingModeEnabled'>): string {
    // Agent mode takes priority - uses dedicated agent prompt
    if (settings.agentModeEnabled) {
        return AGENT_SYSTEM_PROMPT
    }
    
    // Thinking mode appends thinking instructions to base prompt
    if (settings.thinkingModeEnabled) {
        return `${settings.systemPrompt}\n\n${THINKING_SYSTEM_PROMPT}`
    }
    
    // Default: use the base system prompt
    return settings.systemPrompt
}

/**
 * Determines if tools should be enabled based on settings.
 * Agent mode always enables tools regardless of toolsEnabled setting.
 * 
 * @param settings - Current application settings
 * @returns Whether tools should be available
 */
export function shouldEnableTools(settings: Pick<Settings, 'agentModeEnabled' | 'toolsEnabled'>): boolean {
    // Agent mode always enables tools
    if (settings.agentModeEnabled) {
        return true
    }
    
    // Otherwise, respect the toolsEnabled setting
    return settings.toolsEnabled
}
