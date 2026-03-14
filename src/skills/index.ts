export type SkillId = 'web_research' | 'testing'

export type WebResearchMode = 'normal' | 'structured'
export type TestingMode = 'website_smoke'

export interface SkillState {
  enabled: boolean
  config?: Record<string, unknown>
}

export interface WebResearchSkillState extends SkillState {
  config: {
    mode: WebResearchMode
  }
}

export interface TestingSkillState extends SkillState {
  config: {
    mode: TestingMode
  }
}

export type SkillsSettings = Record<string, SkillState> & {
  web_research: WebResearchSkillState
  testing: TestingSkillState
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
    name: 'Tavily',
    description: 'Allows the agent to browse the web and cite sources.',
    note: 'Enables web browsing + citations.',
    usageGuidance: [
      'Use web_search when current facts or verification are required.',
      'Cite sources and synthesize results instead of pasting raw snippets.',
      'Structured mode uses research_plan first, then executes web searches.',
    ],
  },
  {
    id: 'testing',
    name: 'Testing',
    description: 'Lets the agent propose and run approved website smoke tests from chat.',
    note: 'Chat-driven, approval-gated website testing with screenshots, traces, and plain-English results.',
    usageGuidance: [
      'When the user asks you to test a workflow, gather enough details in chat, then draft a spec with propose_website_smoke_test before running anything.',
      'Keep the flow to one page context with a small number of steps and visible assertions.',
      'Do not request arbitrary code execution, shell commands, or desktop app automation.',
    ],
  },
]

const DEFAULT_WEB_RESEARCH_SKILL: WebResearchSkillState = {
  enabled: true,
  config: {
    mode: 'normal',
  },
}

const DEFAULT_TESTING_SKILL: TestingSkillState = {
  enabled: false,
  config: {
    mode: 'website_smoke',
  },
}

export const defaultSkillsSettings: SkillsSettings = {
  web_research: DEFAULT_WEB_RESEARCH_SKILL,
  testing: DEFAULT_TESTING_SKILL,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeWebResearchMode(mode: unknown): WebResearchMode {
  return mode === 'structured' ? 'structured' : 'normal'
}

export function normalizeTestingMode(mode: unknown): TestingMode {
  return mode === 'website_smoke' ? 'website_smoke' : 'website_smoke'
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
  const rawTesting = isRecord(raw) && isRecord(raw.testing) ? raw.testing : undefined
  const rawTestingConfig = isRecord(rawTesting?.config) ? rawTesting.config : undefined

  normalized.web_research = {
    enabled:
      isRecord(rawWebResearch) && typeof rawWebResearch.enabled === 'boolean'
        ? rawWebResearch.enabled
        : defaultSkillsSettings.web_research.enabled,
    config: {
      mode: normalizeWebResearchMode(rawWebResearchConfig?.mode),
    },
  }

  normalized.testing = {
    enabled:
      isRecord(rawTesting) && typeof rawTesting.enabled === 'boolean'
        ? rawTesting.enabled
        : defaultSkillsSettings.testing.enabled,
    config: {
      mode: normalizeTestingMode(rawTestingConfig?.mode),
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

export function isTestingEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).testing.enabled
}

export function getTestingMode(skills: SkillsSettings | undefined): TestingMode {
  return normalizeSkillsSettings(skills).testing.config.mode
}

export function withTestingEnabled(skills: SkillsSettings | undefined, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    testing: {
      ...normalized.testing,
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
  const mode = normalized.web_research.config.mode

  return {
    exposeWebSearch: enabled,
    exposeResearchPlan: enabled && mode === 'structured',
  }
}

export function getTestingToolExposure(skills: SkillsSettings | undefined): {
  exposeWebsiteSmokeTestProposal: boolean
  exposeWebsiteSmokeTestRun: boolean
} {
  const normalized = normalizeSkillsSettings(skills)

  return {
    exposeWebsiteSmokeTestProposal:
      normalized.testing.enabled && normalized.testing.config.mode === 'website_smoke',
    exposeWebsiteSmokeTestRun: false,
  }
}

export function buildEnabledSkillsPrompt(skills: SkillsSettings | undefined): string {
  if (!skills) return ''

  const lines: string[] = []
  const normalized = normalizeSkillsSettings(skills)
  const webResearch = normalized.web_research
  const testing = normalized.testing

  if (webResearch.enabled) {
    if (webResearch.config.mode === 'structured') {
      lines.push('- Tavily (`web_research`): call `research_plan` first, then synthesize results with citations.')
      lines.push('- Keep plan steps focused (2-6), and use each step for a distinct angle.')
    } else {
      lines.push('- Tavily (`web_research`): use `web_search` for current facts, verification, and source-backed answers.')
      lines.push('- Use concise, targeted queries and cite relevant sources in the final response.')
    }
  }

  if (testing.enabled) {
    lines.push(
      '- Testing (`testing`): when the user asks you to test a website workflow, gather the needed details in chat, then call `propose_website_smoke_test` to draft the URL, steps, and visible assertions.'
    )
    lines.push(
      '- After proposing the spec, wait for user approval. Do not call `run_website_smoke_test` directly from the model response.'
    )
    lines.push(
      '- Keep tests browser-only, single-context, and structured. Do not invent code, shell commands, or unsupported desktop actions.'
    )
  }

  if (lines.length === 0) {
    return ''
  }

  return `Enabled Skills:\n${lines.join('\n')}`
}
