export type SkillId = 'web_research'

export interface SkillState {
  enabled: boolean
  config?: Record<string, unknown>
}

export interface WebResearchSkillState extends SkillState {}

export type SkillsSettings = Record<string, SkillState> & {
  web_research: WebResearchSkillState
}

export interface BuiltInSkill {
  id: SkillId
  name: string
  description: string
  note: string
  usageGuidance: string[]
}

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: 'web_research',
    name: 'Web Research',
    description: 'Search the web for current information and cite sources in responses.',
    note: '',
    usageGuidance: [
      'Use web_search directly for targeted queries.',
      'Run follow-up searches only when the first results are incomplete.',
    ],
  },
]

const DEFAULT_WEB_RESEARCH_SKILL: WebResearchSkillState = {
  enabled: true,
}

export const defaultSkillsSettings: SkillsSettings = {
  web_research: DEFAULT_WEB_RESEARCH_SKILL,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeGenericSkillState(raw: unknown): SkillState | null {
  if (!isRecord(raw)) return null

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : false
  const config = isRecord(raw.config) ? { ...raw.config } : {}

  return {
    enabled,
    config,
  }
}

export function normalizeSkillsSettings(raw: unknown): SkillsSettings {
  const normalized: Record<string, SkillState> = {}

  if (isRecord(raw)) {
    for (const [skillId, value] of Object.entries(raw)) {
      if (skillId === 'web_research' || skillId === 'testing') continue
      const generic = normalizeGenericSkillState(value)
      if (generic) {
        normalized[skillId] = generic
      }
    }
  }

  const rawWebResearch = isRecord(raw) && isRecord(raw.web_research)
    ? raw.web_research
    : undefined
  normalized.web_research = {
    enabled:
      isRecord(rawWebResearch) && typeof rawWebResearch.enabled === 'boolean'
        ? rawWebResearch.enabled
        : defaultSkillsSettings.web_research.enabled,
  }

  return normalized as SkillsSettings
}

interface LegacySkillMigrationInput {
  skills: unknown
  webSearchEnabled: unknown
  structuredResearchEnabled: unknown
  deepResearchEnabled: unknown
}

export function migrateSkillsFromLegacySettings({
  skills,
  webSearchEnabled,
  structuredResearchEnabled: _structuredResearchEnabled,
  deepResearchEnabled,
}: LegacySkillMigrationInput): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  const hasPersistedWebResearchSkill = isRecord(skills) && Object.prototype.hasOwnProperty.call(skills, 'web_research')

  if (hasPersistedWebResearchSkill) {
    return normalized
  }

  const enabledFromLegacy =
    typeof webSearchEnabled === 'boolean'
      ? webSearchEnabled
      : (typeof deepResearchEnabled === 'boolean'
          ? deepResearchEnabled
          : normalized.web_research.enabled)

  return {
    ...normalized,
    web_research: {
      enabled: enabledFromLegacy,
    },
  }
}

export function isWebResearchEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).web_research.enabled
}

export function withWebResearchEnabled(skills: SkillsSettings | undefined, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    web_research: {
      ...normalized.web_research,
      enabled,
    },
  }
}

export function getWebResearchToolExposure(skills: SkillsSettings | undefined): {
  exposeWebSearch: boolean
  exposeResearchPlan: boolean
} {
  const normalized = normalizeSkillsSettings(skills)
  const enabled = normalized.web_research.enabled

  return {
    exposeWebSearch: enabled,
    exposeResearchPlan: false,
  }
}

export function buildEnabledSkillsPrompt(skills: SkillsSettings | undefined): string {
  if (!skills) return ''

  const lines: string[] = []
  const normalized = normalizeSkillsSettings(skills)
  const webResearch = normalized.web_research

  if (webResearch.enabled) {
    lines.push('- Tavily (`web_research`): use `web_search` for current facts, verification, and source-backed answers.')
    lines.push('- Use concise, targeted queries and cite relevant sources in the final response.')
  }

  if (lines.length === 0) {
    return ''
  }

  return `Enabled Skills:\n${lines.join('\n')}`
}
