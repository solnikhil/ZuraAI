export type SkillId = 'web_research' | 'code_execution' | 'computer_use' | 'chart_generation' | 'memory' | 'agent_desktop'

export interface SkillState {
  enabled: boolean
  config?: Record<string, unknown>
}

export interface WebResearchSkillState extends SkillState {}

export interface CodeExecutionSkillState extends SkillState {}

export interface ComputerUseSkillState extends SkillState {}

export interface ChartGenerationSkillState extends SkillState {}

export interface MemorySkillState extends SkillState {}

/**
 * Agent Desktop (Agent View) skill state. This is the mirrored, Skills-map side
 * of Agent Desktop's dual source of truth: the richer policy/persistence fields
 * live under `settings.agentDesktop`, while `skills.agent_desktop.enabled` keeps
 * the skills map and tool-exposure gating consistent (same pattern as Memory).
 * The user-facing enable toggle is disclosure-gated and owned by
 * `AgentDesktopSection`, and quick surfaces that enable it must acknowledge
 * the same not-a-sandbox disclosure before turning it on.
 */
export interface AgentDesktopSkillState extends SkillState {}

export type SkillsSettings = Record<string, SkillState> & {
  web_research: WebResearchSkillState
  code_execution: CodeExecutionSkillState
  computer_use: ComputerUseSkillState
  chart_generation: ChartGenerationSkillState
  memory: MemorySkillState
  agent_desktop: AgentDesktopSkillState
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
  {
    id: 'computer_use',
    name: 'Control This Desktop',
    description: 'Let the assistant use screenshots, clicks, typing, scrolling, and app controls on the desktop you are currently using.',
    note: 'Requires approval before each action. Press Esc+Esc to emergency stop.',
    usageGuidance: [
      'Always take a screenshot first to see the current screen state.',
      'Analyze the screenshot carefully before performing any action.',
      'Verify results with a follow-up screenshot after each action.',
    ],
  },
  {
    id: 'agent_desktop',
    name: 'Control Separate Desktop',
    description: 'Let the assistant use the same desktop-control tools on a separate Windows virtual desktop instead of your current desktop.',
    note: 'Windows only. Workspace separation, not a sandbox. Press Esc+Esc to emergency stop.',
    usageGuidance: [
      'Use the existing computer_* tools through the separate-desktop gate.',
      'Launch and inspect work on the dedicated virtual desktop.',
      'Use Take Over when input must be delivered to the displayed separate desktop.',
    ],
  },
  {
    id: 'chart_generation',
    name: 'Chart Generation',
    description: 'Automatically generate bar, line, and pie charts using Mermaid when data is present in the conversation.',
    note: 'Uses Mermaid syntax — no additional dependencies required.',
    usageGuidance: [
      'Generate charts proactively when data is present.',
      'Use pie for proportions, bar for comparisons, line for trends.',
    ],
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Remember durable facts about the user (preferences, projects, name, etc.) and reuse them across chats. Stored locally only.',
    note: 'Inject saved memories into the system prompt and let the assistant call save/update/delete/search memory tools.',
    usageGuidance: [
      'Save short, durable facts about the user the first time they mention them.',
      'Update an existing entry instead of duplicating when a fact already exists.',
      'Never save sensitive data (passwords, credentials, financial details).',
    ],
  },
]

const DEFAULT_WEB_RESEARCH_SKILL: WebResearchSkillState = {
  enabled: true,
}

const DEFAULT_CODE_EXECUTION_SKILL: CodeExecutionSkillState = {
  enabled: false,
}

const DEFAULT_COMPUTER_USE_SKILL: ComputerUseSkillState = {
  enabled: false,
}

const DEFAULT_CHART_GENERATION_SKILL: ChartGenerationSkillState = {
  enabled: false,
}

const DEFAULT_MEMORY_SKILL: MemorySkillState = {
  enabled: true,
}

const DEFAULT_AGENT_DESKTOP_SKILL: AgentDesktopSkillState = {
  enabled: false,
}

export const defaultSkillsSettings: SkillsSettings = {
  web_research: DEFAULT_WEB_RESEARCH_SKILL,
  code_execution: DEFAULT_CODE_EXECUTION_SKILL,
  computer_use: DEFAULT_COMPUTER_USE_SKILL,
  chart_generation: DEFAULT_CHART_GENERATION_SKILL,
  memory: DEFAULT_MEMORY_SKILL,
  agent_desktop: DEFAULT_AGENT_DESKTOP_SKILL,
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
      if (skillId === 'web_research' || skillId === 'code_execution' || skillId === 'testing' || skillId === 'computer_use' || skillId === 'chart_generation' || skillId === 'memory' || skillId === 'agent_desktop') continue
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
  normalized.computer_use = normalizeKnownSkill(
    rawRecord?.computer_use,
    defaultSkillsSettings.computer_use
  )
  normalized.chart_generation = normalizeKnownSkill(
    rawRecord?.chart_generation,
    defaultSkillsSettings.chart_generation
  )
  normalized.memory = normalizeKnownSkill(
    rawRecord?.memory,
    defaultSkillsSettings.memory
  )
  normalized.agent_desktop = normalizeKnownSkill(
    rawRecord?.agent_desktop,
    defaultSkillsSettings.agent_desktop
  )

  return normalized as SkillsSettings
}

interface LegacySkillMigrationInput {
  skills: unknown
  webSearchEnabled: unknown
  structuredResearchEnabled: unknown
  deepResearchEnabled: unknown
  memoryEnabled?: unknown
  autoMemoryEnabled?: unknown
}

export function migrateSkillsFromLegacySettings({
  skills,
  webSearchEnabled,
  structuredResearchEnabled: _structuredResearchEnabled,
  deepResearchEnabled,
  memoryEnabled,
  autoMemoryEnabled,
}: LegacySkillMigrationInput): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  const hasPersistedWebResearchSkill = isRecord(skills) && Object.prototype.hasOwnProperty.call(skills, 'web_research')
  const hasPersistedMemorySkill = isRecord(skills) && Object.prototype.hasOwnProperty.call(skills, 'memory')

  let result = normalized

  if (!hasPersistedWebResearchSkill) {
    const enabledFromLegacy =
      typeof webSearchEnabled === 'boolean'
        ? webSearchEnabled
        : (typeof deepResearchEnabled === 'boolean'
            ? deepResearchEnabled
            : normalized.web_research.enabled)

    result = {
      ...result,
      web_research: { enabled: enabledFromLegacy },
    }
  }

  if (!hasPersistedMemorySkill) {
    // Legacy: memory was gated by both `memoryEnabled` AND `autoMemoryEnabled`
    // (full feature requires both). Collapse into the single skill toggle:
    // disabled if either legacy flag was explicitly off.
    const memoryFlag = typeof memoryEnabled === 'boolean' ? memoryEnabled : true
    const autoFlag = typeof autoMemoryEnabled === 'boolean' ? autoMemoryEnabled : true
    const enabledFromLegacy = memoryFlag && autoFlag

    result = {
      ...result,
      memory: { enabled: enabledFromLegacy },
    }
  }

  return result
}

// Web Research

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

// Code Execution

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

// Computer Use

export function withComputerUseEnabled(skills: SkillsSettings | undefined, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    computer_use: {
      ...normalized.computer_use,
      enabled,
    },
  }
}

export function getComputerUseToolExposure(skills: SkillsSettings | undefined): {
  exposeComputerUse: boolean
} {
  return {
    exposeComputerUse: normalizeSkillsSettings(skills).computer_use.enabled,
  }
}

// Chart Generation

export function isChartGenerationEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).chart_generation.enabled
}

export function withChartGenerationEnabled(skills: SkillsSettings | undefined, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    chart_generation: {
      ...normalized.chart_generation,
      enabled,
    },
  }
}

// Agent Desktop (Agent View)

export function isAgentDesktopEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).agent_desktop.enabled
}

export function withAgentDesktopEnabled(skills: SkillsSettings | undefined, enabled: boolean): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    agent_desktop: {
      ...normalized.agent_desktop,
      enabled,
    },
  }
}

// Generic

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
  options?: { codeExecutionPrompt?: string; computerUsePrompt?: string; chartGenerationPrompt?: string },
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

  if (normalized.agent_desktop.enabled) {
    skillLines.push('- Control Separate Desktop (`agent_desktop`): prefer native Windows tools for filesystem/app/window/UIA work, and use `computer_*` only for visual fallback on the dedicated Windows virtual desktop.')
    skillLines.push('- For Desktop/file organization tasks, first inspect directories with `file_search`/`file_read`, propose changes, then use `file_move` after approval. Do not open Run/Explorer or use screenshots for simple file moves.')
    skillLines.push('- Treat the separate desktop as workspace separation, not a sandbox. Screenshot first only when a visual desktop task actually needs it.')
  } else if (normalized.computer_use.enabled) {
    skillLines.push('- Control This Desktop (`computer_use`): prefer native Windows tools for filesystem/app/window/UIA work, and use screenshots/click/type/scroll only when native tools cannot handle the task.')
    skillLines.push('- For Desktop/file organization tasks, first inspect directories with `file_search`/`file_read`, propose changes, then use `file_move` after approval. Do not open Run/Explorer or use screenshots for simple file moves.')
    skillLines.push('- For visual desktop tasks, screenshot first, analyze before acting, and verify results with follow-up screenshots.')
  }

  if (normalized.chart_generation.enabled) {
    skillLines.push('- Chart Generation (`chart_generation`): generate Mermaid charts (bar, line, pie) when data is present.')
    skillLines.push('- Use pie for proportions, bar for comparisons, line for trends. Generate charts proactively.')
  }

  if (skillLines.length > 0) {
    sections.push(`Enabled Skills:\n${skillLines.join('\n')}`)
  }

  if (normalized.code_execution.enabled && options?.codeExecutionPrompt) {
    sections.push(options.codeExecutionPrompt)
  }

  if ((normalized.computer_use.enabled || normalized.agent_desktop.enabled) && options?.computerUsePrompt) {
    sections.push(options.computerUsePrompt)
  }

  if (normalized.chart_generation.enabled && options?.chartGenerationPrompt) {
    sections.push(options.chartGenerationPrompt)
  }

  return sections.join('\n\n')
}
