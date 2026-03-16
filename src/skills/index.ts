export type SkillId = 'web_research'

export type WebResearchMode = 'normal' | 'structured'

export interface SkillState {
  enabled: boolean
  config?: Record<string, unknown>
}

export interface WebResearchSkillState extends SkillState {
  config: {
    mode: WebResearchMode
  }
}

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
    description: 'Allows the agent to browse the web and cite sources.',
    note: '',
    usageGuidance: [
      'Normal mode: use web_search directly for targeted queries.',
      'Structured mode: call research_plan first for multi-step research.',
    ],
  },
]

const DEFAULT_WEB_RESEARCH_SKILL: WebResearchSkillState = {
  enabled: true,
  config: {
    mode: 'normal',
  },
}

export const defaultSkillsSettings: SkillsSettings = {
  web_research: DEFAULT_WEB_RESEARCH_SKILL,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeWebResearchMode(mode: unknown): WebResearchMode {
  return mode === 'structured' ? 'structured' : 'normal'
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
  const rawWebResearchConfig = isRecord(rawWebResearch?.config)
    ? rawWebResearch.config
    : undefined

  normalized.web_research = {
    enabled:
      isRecord(rawWebResearch) && typeof rawWebResearch.enabled === 'boolean'
        ? rawWebResearch.enabled
        : defaultSkillsSettings.web_research.enabled,
    config: {
      mode: normalizeWebResearchMode(rawWebResearchConfig?.mode),
    },
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
  structuredResearchEnabled,
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

  const structuredFromLegacy =
    typeof structuredResearchEnabled === 'boolean'
      ? structuredResearchEnabled
      : normalized.web_research.config.mode === 'structured'

  return {
    ...normalized,
    web_research: {
      enabled: enabledFromLegacy,
      config: {
        mode: structuredFromLegacy ? 'structured' : 'normal',
      },
    },
  }
}

export function isWebResearchEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).web_research.enabled
}

export function getWebResearchMode(skills: SkillsSettings | undefined): WebResearchMode {
  return normalizeSkillsSettings(skills).web_research.config.mode
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

export function withWebResearchMode(skills: SkillsSettings | undefined, mode: WebResearchMode): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    web_research: {
      ...normalized.web_research,
      config: {
        mode,
      },
    },
  }
}

export function getWebResearchToolExposure(skills: SkillsSettings | undefined): {
  exposeWebSearch: boolean
  exposeResearchPlan: boolean
} {
  const normalized = normalizeSkillsSettings(skills)
  const enabled = normalized.web_research.enabled
  const mode = normalized.web_research.config.mode

  return {
    exposeWebSearch: enabled,
    exposeResearchPlan: enabled && mode === 'structured',
  }
}

export function buildEnabledSkillsPrompt(skills: SkillsSettings | undefined): string {
  if (!skills) return ''

  const lines: string[] = []
  const normalized = normalizeSkillsSettings(skills)
  const webResearch = normalized.web_research

  if (webResearch.enabled) {
    if (webResearch.config.mode === 'structured') {
      lines.push('- Tavily (`web_research`): call `research_plan` first, then synthesize results with citations.')
      lines.push('- Keep plan steps focused (2-6), and use each step for a distinct angle.')
    } else {
      lines.push('- Tavily (`web_research`): use `web_search` for current facts, verification, and source-backed answers.')
      lines.push('- Use concise, targeted queries and cite relevant sources in the final response.')
    }
  }

  if (lines.length === 0) {
    return ''
  }

  return `Enabled Skills:\n${lines.join('\n')}`
}
