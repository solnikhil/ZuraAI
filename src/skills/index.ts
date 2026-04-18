export type SkillId = 'web_research' | 'code_execution'

export interface SkillState {
  enabled: boolean
  config?: Record<string, unknown>
}

export interface WebResearchSkillState extends SkillState {}

export interface CodeExecutionSkillState extends SkillState {}

export type SkillsSettings = Record<string, SkillState> & {
  web_research: WebResearchSkillState
  code_execution: CodeExecutionSkillState
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
  {
    id: 'code_execution',
    name: 'Code Execution',
    description: 'Run JavaScript and Python code to perform calculations, data analysis, and other computational tasks.',
    note: 'Requires user approval before each execution. Code runs on a remote sandbox.',
    usageGuidance: [
      'Use code_execution for calculations, data transforms, and logic the model cannot do reliably in-context.',
      'Prefer Python for math/data tasks and JavaScript for string/JSON manipulation.',
    ],
  },
]

const DEFAULT_WEB_RESEARCH_SKILL: WebResearchSkillState = {
  enabled: true,
}

const DEFAULT_CODE_EXECUTION_SKILL: CodeExecutionSkillState = {
  enabled: false,
}

export const defaultSkillsSettings: SkillsSettings = {
  web_research: DEFAULT_WEB_RESEARCH_SKILL,
  code_execution: DEFAULT_CODE_EXECUTION_SKILL,
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

function normalizeKnownSkill(raw: unknown, defaultState: SkillState): SkillState {
  if (!isRecord(raw) || typeof raw.enabled !== 'boolean') {
    return { enabled: defaultState.enabled }
  }
  return { enabled: raw.enabled }
}

export function normalizeSkillsSettings(raw: unknown): SkillsSettings {
  const normalized: Record<string, SkillState> = {}

  if (isRecord(raw)) {
    for (const [skillId, value] of Object.entries(raw)) {
      if (skillId === 'web_research' || skillId === 'code_execution' || skillId === 'testing') continue
      const generic = normalizeGenericSkillState(value)
      if (generic) {
        normalized[skillId] = generic
      }
    }
  }

  const rawRecord = isRecord(raw) ? raw : undefined
  normalized.web_research = normalizeKnownSkill(
    rawRecord?.web_research,
    defaultSkillsSettings.web_research
  )
  normalized.code_execution = normalizeKnownSkill(
    rawRecord?.code_execution,
    defaultSkillsSettings.code_execution
  )

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

// ==================== Web Research helpers ====================

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
  return {
    exposeWebSearch: normalized.web_research.enabled,
    exposeResearchPlan: false,
  }
}

// ==================== Code Execution helpers ====================

export function isCodeExecutionEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).code_execution.enabled
}

export function withCodeExecutionEnabled(skills: SkillsSettings | undefined, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    code_execution: {
      ...normalized.code_execution,
      enabled,
    },
  }
}

export function getCodeExecutionToolExposure(skills: SkillsSettings | undefined): {
  exposeCodeExecution: boolean
} {
  return {
    exposeCodeExecution: normalizeSkillsSettings(skills).code_execution.enabled,
  }
}

// ==================== Generic skill helpers ====================

export function isSkillEnabled(skills: SkillsSettings | undefined, skillId: SkillId): boolean {
  const normalized = normalizeSkillsSettings(skills)
  return normalized[skillId]?.enabled ?? false
}

export function withSkillEnabled(skills: SkillsSettings | undefined, skillId: SkillId, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    [skillId]: {
      ...normalized[skillId],
      enabled,
    },
  }
}

export function buildEnabledSkillsPrompt(
  skills: SkillsSettings | undefined,
  options?: { codeExecutionPrompt?: string },
): string {
  if (!skills) return ''

  const sections: string[] = []
  const normalized = normalizeSkillsSettings(skills)

  const skillLines: string[] = []

  if (normalized.web_research.enabled) {
    skillLines.push('- Tavily (`web_research`): use `web_search` for current facts, verification, and source-backed answers.')
    skillLines.push('- Use concise, targeted queries and cite relevant sources in the final response.')
  }

  if (normalized.code_execution.enabled) {
    skillLines.push('- Code Execution (`code_execution`): use `code_execution` to run JavaScript or Python code for calculations, data analysis, and logic.')
    skillLines.push('- Prefer Python for math/data tasks. Keep code concise and self-contained. The sandbox has no filesystem or network access.')
  }

  if (skillLines.length > 0) {
    sections.push(`Enabled Skills:\n${skillLines.join('\n')}`)
  }

  if (normalized.code_execution.enabled && options?.codeExecutionPrompt) {
    sections.push(options.codeExecutionPrompt)
  }

  return sections.join('\n\n')
}
