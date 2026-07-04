import { Settings } from '../contexts/SettingsContext'
import { buildEnabledExtensionsPrompt } from '../skills'
import { CURRENT_YEAR_PLACEHOLDER } from '../prompts/defaultSystemPrompt'
import { buildSelectedPersonalityPrompt } from '../prompts/assistantPersonalities'
import { buildAgentSkillsCatalogPrompt } from '../agentSkills/prompt'
import { defaultCommandCenterPrompt } from '../prompts/defaultCommandCenterPrompt'

export interface EffectiveSystemPromptOptions {
  includeAgentSkillsCatalog?: boolean
}

export function resolveSystemPromptTemplate(systemPrompt: string): string {
  const currentYear = String(new Date().getFullYear())
  return systemPrompt.replaceAll(CURRENT_YEAR_PLACEHOLDER, currentYear)
}

/**
 * Determines the effective system prompt based on current settings.
 *
 * @param settings - Current application settings.
 * @param memoryBlock - Optional pre-built memory block (see `src/prompts/buildMemoryBlock.ts`).
 *   When non-empty it is appended after the extensions section so memories sit at the
 *   end of the system prompt — closest to the user message and most influential.
 * @returns The effective system prompt to use for AI calls.
 */
export function getEffectiveSystemPrompt(
  settings: Pick<Settings, 'systemPrompt'> &
    Partial<
      Pick<
        Settings,
        | 'assistantPersonality'
        | 'assistantMode'
        | 'skills'
        | 'extensions'
        | 'agentSkills'
        | 'codeExecutionPrompt'
        | 'terminalPrompt'
        | 'computerUsePrompt'
        | 'commandCenterPrompt'
        | 'chartGenerationPrompt'
        | 'remindersPrompt'
        | 'artifactsPrompt'
      >
    >,
  memoryBlock?: string,
  recentActivityBlock?: string,
  options: EffectiveSystemPromptOptions = {}
): string {
  const includeAgentSkillsCatalog = options.includeAgentSkillsCatalog ?? true
  const resolvedSystemPrompt = resolveSystemPromptTemplate(settings.systemPrompt)
  const selectedPersonalityPrompt = buildSelectedPersonalityPrompt(settings.assistantPersonality)
  const commandCenterPrompt =
    settings.assistantMode === 'agent'
      ? (settings.commandCenterPrompt ?? defaultCommandCenterPrompt)
      : undefined
  const enabledExtensionsSection = buildEnabledExtensionsPrompt(
    settings.extensions ?? settings.skills,
    {
      codeExecutionPrompt: settings.codeExecutionPrompt,
      terminalPrompt: settings.terminalPrompt,
      computerUsePrompt: settings.computerUsePrompt,
      commandCenterPrompt,
      commandCenterActive: settings.assistantMode === 'agent',
      chartGenerationPrompt: settings.chartGenerationPrompt,
      remindersPrompt: settings.remindersPrompt,
      artifactsPrompt: settings.artifactsPrompt,
    }
  )
  const sections = [resolvedSystemPrompt, selectedPersonalityPrompt]
  if (enabledExtensionsSection) sections.push(enabledExtensionsSection)
  if (includeAgentSkillsCatalog) {
    const agentSkillsCatalog = buildAgentSkillsCatalogPrompt(settings.agentSkills)
    if (agentSkillsCatalog) sections.push(agentSkillsCatalog)
  }
  if (recentActivityBlock && recentActivityBlock.trim()) sections.push(recentActivityBlock.trim())
  if (memoryBlock && memoryBlock.trim()) sections.push(memoryBlock.trim())
  return sections.join('\n\n')
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
