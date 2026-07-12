export type SkillId =
  | 'web_research'
  | 'code_execution'
  | 'terminal'
  | 'computer_use'
  | 'command_center'
  | 'chart_generation'
  | 'memory'
  | 'reminders'
  | 'artifacts'
export type ExtensionId = SkillId

export interface SkillState {
  enabled: boolean
  config?: Record<string, unknown>
}

export interface WebResearchSkillState extends SkillState {}

export interface CodeExecutionSkillState extends SkillState {}

export interface TerminalSkillState extends SkillState {}

export interface ComputerUseSkillState extends SkillState {}
export interface CommandCenterSkillState extends SkillState {}

export interface ChartGenerationSkillState extends SkillState {}

export interface MemorySkillState extends SkillState {}

export interface RemindersSkillState extends SkillState {}
export interface ArtifactsSkillState extends SkillState {}

export type SkillsSettings = Record<string, SkillState> & {
  web_research: WebResearchSkillState
  code_execution: CodeExecutionSkillState
  terminal: TerminalSkillState
  computer_use: ComputerUseSkillState
  command_center: CommandCenterSkillState
  chart_generation: ChartGenerationSkillState
  memory: MemorySkillState
  reminders: RemindersSkillState
  artifacts: ArtifactsSkillState
}
export type ExtensionState = SkillState
export type ExtensionsSettings = SkillsSettings

export interface BuiltInSkill {
  id: SkillId
  name: string
  description: string
  note: string
  usageGuidance: string[]
}
export type BuiltInExtension = BuiltInSkill

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
    description:
      'Run JavaScript and Python code to perform calculations, data analysis, and other computational tasks.',
    note: 'Requires user approval before each execution. Code runs on a remote sandbox.',
    usageGuidance: [
      'Use code_execution for calculations, data transforms, and logic the model cannot do reliably in-context.',
      'Prefer Python for math/data tasks and JavaScript for string/JSON manipulation.',
    ],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description:
      'Run bounded PowerShell commands for system inspection and automation. Windows-only.',
    note: 'Windows-only. Requires user approval before each command. Commands are non-interactive and bounded by a timeout and output cap.',
    usageGuidance: [
      'Prefer native file/app/window tools before shell commands when they can do the job.',
      'Use PowerShell for system inspection and automation tasks the native tools cannot cover.',
      'Keep commands non-interactive and self-contained. Read the returned exit code, stdout, and stderr to verify success and self-correct.',
    ],
  },
  {
    id: 'computer_use',
    name: 'Control This Desktop',
    description:
      'Let Agent Mode use native OS tools, Command Center, screenshots, clicks, typing, scrolling, and app controls on this desktop.',
    note: 'Agent Mode includes native desktop tools and Control+Shift+Space Command Center. On macOS, Control+Option+Shift+Space is the fallback. Desktop control actions require approval. Press Esc+Esc to emergency stop.',
    usageGuidance: [
      'Prefer native OS tools and Command Center context before screenshots or shell commands.',
      'Use screenshots when visual inspection is required, then analyze before performing any action.',
      'Verify results with the narrowest read-only native tool or a follow-up screenshot.',
    ],
  },
  {
    id: 'command_center',
    name: 'Command Center',
    description:
      'Give the assistant native OS context and safe system controls for the active Windows or macOS desktop.',
    note: 'Available on Windows and macOS. Model-callable OS actions use the normal approval path; overlay shortcuts are limited to a fixed main-process allowlist.',
    usageGuidance: [
      'Use active-window context before acting on the current app or desktop.',
      'Prefer explicit OS tools for opening files/folders and window snap layouts instead of shell commands.',
      'Ask for approval before changing system state, then verify with read-only active window or window list context.',
    ],
  },
  {
    id: 'chart_generation',
    name: 'Chart Generation',
    description:
      'Automatically generate bar, line, and pie charts using Mermaid when data is present in the conversation.',
    note: 'Uses Mermaid syntax — no additional dependencies required.',
    usageGuidance: [
      'Generate charts proactively when data is present.',
      'Use pie for proportions, bar for comparisons, line for trends.',
    ],
  },
  {
    id: 'memory',
    name: 'Memory',
    description:
      'Remember durable facts about the user (preferences, projects, name, etc.) and reuse them across chats. Stored locally only.',
    note: 'Inject saved memories into the system prompt and let the assistant call save/update/delete/search memory tools.',
    usageGuidance: [
      'Save short, durable facts about the user the first time they mention them.',
      'Update an existing entry instead of duplicating when a fact already exists.',
      'Never save sensitive data (passwords, credentials, financial details).',
    ],
  },
  {
    id: 'artifacts',
    name: 'Artifacts',
    description: 'Create, update, preview, and manage assistant-generated documents across chats.',
    note: 'Artifacts are stored locally inside their source chat and can be copied, downloaded, restored, or deleted.',
    usageGuidance: [
      'Use artifact_create for substantial documents, code, markdown, HTML, JSON, SVG, or Mermaid output.',
      'Use artifact_update to revise an existing artifact instead of posting duplicate full copies in chat.',
      'Keep normal short answers in chat; use artifacts when the user will likely edit, reuse, or export the result.',
    ],
  },
  {
    id: 'reminders',
    name: 'Reminders & Lookouts',
    description:
      'Let the assistant create local reminders and scheduled web lookouts that appear in the Reminders sidebar.',
    note: 'Runs only while ZuraAI is open. Web lookouts support public pages and local loopback URLs; OS notifications fire for due reminders and changed lookouts.',
    usageGuidance: [
      'Use scheduled_task_create when the user asks to remind them, check something later, or watch a page for changes.',
      'Use reminder tasks for no-URL follow-ups and web_lookout tasks for public URLs or local loopback URLs.',
      'After creating a task, tell the user it can be viewed in the Reminders sidebar.',
    ],
  },
]

const DEFAULT_WEB_RESEARCH_SKILL: WebResearchSkillState = {
  enabled: true,
}

const DEFAULT_CODE_EXECUTION_SKILL: CodeExecutionSkillState = {
  enabled: false,
}

const DEFAULT_TERMINAL_SKILL: TerminalSkillState = {
  enabled: false,
}

const DEFAULT_COMPUTER_USE_SKILL: ComputerUseSkillState = {
  enabled: false,
}

const DEFAULT_COMMAND_CENTER_SKILL: CommandCenterSkillState = {
  enabled: false,
}

const DEFAULT_CHART_GENERATION_SKILL: ChartGenerationSkillState = {
  enabled: false,
}

const DEFAULT_MEMORY_SKILL: MemorySkillState = {
  enabled: true,
  config: { autoManage: true },
}

const DEFAULT_REMINDERS_SKILL: RemindersSkillState = {
  enabled: false,
}

const DEFAULT_ARTIFACTS_SKILL: ArtifactsSkillState = {
  enabled: false,
}

export const defaultSkillsSettings: SkillsSettings = {
  web_research: DEFAULT_WEB_RESEARCH_SKILL,
  code_execution: DEFAULT_CODE_EXECUTION_SKILL,
  terminal: DEFAULT_TERMINAL_SKILL,
  computer_use: DEFAULT_COMPUTER_USE_SKILL,
  command_center: DEFAULT_COMMAND_CENTER_SKILL,
  chart_generation: DEFAULT_CHART_GENERATION_SKILL,
  memory: DEFAULT_MEMORY_SKILL,
  reminders: DEFAULT_REMINDERS_SKILL,
  artifacts: DEFAULT_ARTIFACTS_SKILL,
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

/**
 * Memory has a sub-toggle beyond `enabled`: `config.autoManage`.
 * - `enabled` gates the whole feature (inject memories at all).
 * - `autoManage` (default true) gates whether the ASSISTANT can manage memory
 *   (memory tools exposed + background "dreaming" extraction + autosave nudge).
 *   When false, memory is "manual-only": saved memories still inject into the
 *   prompt, but the model cannot write and extraction is paused.
 */
function normalizeMemorySkill(raw: unknown, defaultState: SkillState): MemorySkillState {
  const enabled =
    isRecord(raw) && typeof raw.enabled === 'boolean' ? raw.enabled : defaultState.enabled
  const autoManageRaw = isRecord(raw) && isRecord(raw.config) ? raw.config.autoManage : undefined
  const autoManage = typeof autoManageRaw === 'boolean' ? autoManageRaw : true
  return { enabled, config: { autoManage } }
}

export function normalizeSkillsSettings(raw: unknown): SkillsSettings {
  const normalized: Record<string, SkillState> = {}

  if (isRecord(raw)) {
    for (const [skillId, value] of Object.entries(raw)) {
      if (
        skillId === 'web_research' ||
        skillId === 'code_execution' ||
        skillId === 'terminal' ||
        skillId === 'testing' ||
        skillId === 'computer_use' ||
        skillId === 'command_center' ||
        skillId === 'chart_generation' ||
        skillId === 'memory' ||
        skillId === 'reminders' ||
        skillId === 'artifacts' ||
        skillId === 'agent_desktop'
      )
        continue
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
  normalized.terminal = normalizeKnownSkill(rawRecord?.terminal, defaultSkillsSettings.terminal)
  normalized.computer_use = normalizeKnownSkill(
    rawRecord?.computer_use,
    defaultSkillsSettings.computer_use
  )
  normalized.command_center = normalizeKnownSkill(
    rawRecord?.command_center,
    defaultSkillsSettings.command_center
  )
  normalized.chart_generation = normalizeKnownSkill(
    rawRecord?.chart_generation,
    defaultSkillsSettings.chart_generation
  )
  normalized.memory = normalizeMemorySkill(rawRecord?.memory, defaultSkillsSettings.memory)
  normalized.reminders = normalizeKnownSkill(rawRecord?.reminders, defaultSkillsSettings.reminders)
  normalized.artifacts = normalizeKnownSkill(rawRecord?.artifacts, defaultSkillsSettings.artifacts)
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
  const hasPersistedWebResearchSkill =
    isRecord(skills) && Object.prototype.hasOwnProperty.call(skills, 'web_research')
  const hasPersistedMemorySkill =
    isRecord(skills) && Object.prototype.hasOwnProperty.call(skills, 'memory')

  let result = normalized

  if (!hasPersistedWebResearchSkill) {
    const enabledFromLegacy =
      typeof webSearchEnabled === 'boolean'
        ? webSearchEnabled
        : typeof deepResearchEnabled === 'boolean'
          ? deepResearchEnabled
          : normalized.web_research.enabled

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
      memory: { enabled: enabledFromLegacy, config: { autoManage: true } },
    }
  }

  return result
}

// Web Research

export function isWebResearchEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).web_research.enabled
}

export function withWebResearchEnabled(
  skills: SkillsSettings | undefined,
  enabled: boolean
): SkillsSettings {
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

export function withCodeExecutionEnabled(
  skills: SkillsSettings | undefined,
  enabled: boolean
): SkillsSettings {
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

// Terminal

export function isTerminalEnabled(skills: SkillsSettings | undefined): boolean {
  return normalizeSkillsSettings(skills).terminal.enabled
}

export function withTerminalEnabled(
  skills: SkillsSettings | undefined,
  enabled: boolean
): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    terminal: {
      ...normalized.terminal,
      enabled,
    },
  }
}

export function getTerminalToolExposure(skills: SkillsSettings | undefined): {
  exposeTerminal: boolean
} {
  return {
    exposeTerminal: normalizeSkillsSettings(skills).terminal.enabled,
  }
}

// Computer Use

export function withComputerUseEnabled(
  skills: SkillsSettings | undefined,
  enabled: boolean
): SkillsSettings {
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

export function withChartGenerationEnabled(
  skills: SkillsSettings | undefined,
  enabled: boolean
): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    chart_generation: {
      ...normalized.chart_generation,
      enabled,
    },
  }
}

// Memory

/**
 * Whether the assistant may autonomously manage memory (write tools + dreaming
 * extraction + autosave nudge). Independent of `memory.enabled`. Defaults true.
 * When false, memory is "manual-only": saved memories still inject, but the
 * model cannot write and background extraction is paused.
 */
export function isMemoryAutoManageEnabled(skills: SkillsSettings | undefined): boolean {
  const normalized = normalizeSkillsSettings(skills)
  if (!normalized.memory.enabled) return false
  const autoManage = normalized.memory.config?.autoManage
  return autoManage !== false
}

export function withMemoryAutoManage(
  skills: SkillsSettings | undefined,
  autoManage: boolean
): SkillsSettings {
  const normalized = normalizeSkillsSettings(skills)
  return {
    ...normalized,
    memory: {
      ...normalized.memory,
      config: { ...normalized.memory.config, autoManage },
    },
  }
}

// Generic

export function isSkillEnabled(skills: SkillsSettings | undefined, skillId: SkillId): boolean {
  const normalized = normalizeSkillsSettings(skills)
  return normalized[skillId]?.enabled ?? false
}

export function withSkillEnabled(
  skills: SkillsSettings | undefined,
  skillId: SkillId,
  enabled: boolean
): SkillsSettings {
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
  options?: {
    codeExecutionPrompt?: string
    terminalPrompt?: string
    computerUsePrompt?: string
    commandCenterPrompt?: string
    commandCenterActive?: boolean
    chartGenerationPrompt?: string
    remindersPrompt?: string
    artifactsPrompt?: string
  }
): string {
  if (!skills) return ''

  const sections: string[] = []
  const normalized = normalizeSkillsSettings(skills)
  const commandCenterActive =
    normalized.command_center.enabled || options?.commandCenterActive === true

  const skillLines: string[] = []

  if (normalized.web_research.enabled) {
    skillLines.push(
      '- Tavily (`web_research`): use `web_search` for current facts, verification, and source-backed answers.'
    )
    skillLines.push(
      '- Use concise, targeted queries and cite relevant sources in the final response.'
    )
  }

  if (normalized.code_execution.enabled) {
    skillLines.push(
      '- Code Execution (`code_execution`): use `code_execution` to run JavaScript or Python code for calculations, data analysis, and logic.'
    )
    skillLines.push(
      '- Prefer Python for math/data tasks. Keep code concise and self-contained. The sandbox has no filesystem or network access.'
    )
  }

  if (normalized.terminal.enabled) {
    skillLines.push(
      '- Terminal (`system_shell`): run bounded, non-interactive PowerShell commands for system inspection and automation on Windows.'
    )
    skillLines.push(
      '- Prefer native file/app/window tools first. Each command requires user approval, is bounded by a timeout and output cap, and returns exit code/stdout/stderr — read them to verify success and self-correct.'
    )
  }

  if (normalized.computer_use.enabled) {
    skillLines.push(
      '- Control This Desktop (`computer_use`): prefer native Windows tools for filesystem/app/window/UIA work, and use screenshots/click/type/scroll only when native tools cannot handle the task.'
    )
    skillLines.push(
      '- For Desktop/file organization tasks, first inspect directories with `file_search`/`file_read`, propose changes, then use `file_move` after approval. Do not open Run/Explorer or use screenshots for simple file moves.'
    )
    skillLines.push(
      '- For visual desktop tasks, screenshot first, analyze before acting, and verify results with follow-up screenshots.'
    )
  }

  if (commandCenterActive) {
    skillLines.push(
      '- Command Center (`command_center`): use active-window context and explicit OS tools for native desktop requests before falling back to visual Computer Use or terminal commands.'
    )
    skillLines.push(
      '- Read current app/window context with `system_active_window`, find or launch installed apps with `app_find`/`app_launch`, and list or focus windows with `window_list`/`window_focus` before using screenshots or shell.'
    )
    skillLines.push(
      '- Read local machine status with `system_status`; use `system_settings_open`, `system_open_path`, and `window_snap` for direct OS-level actions with approval where required.'
    )
  }

  if (normalized.chart_generation.enabled) {
    skillLines.push(
      '- Chart Generation (`chart_generation`): generate Mermaid charts (bar, line, pie) when data is present.'
    )
    skillLines.push(
      '- Use pie for proportions, bar for comparisons, line for trends. Generate charts proactively.'
    )
  }

  if (normalized.reminders.enabled) {
    skillLines.push(
      '- Reminders & Lookouts (`reminders`): use `scheduled_task_*` tools to create, update, delete, list, and inspect local reminders and web lookouts for public or local loopback URLs.'
    )
    skillLines.push(
      '- Use `reminder` tasks for recurring notes/checklists and `web_lookout` tasks for public or local loopback URL change monitoring. Confirm created tasks and mention the Reminders sidebar.'
    )
    skillLines.push(
      '- For reminder requests like "in 1 minute" or "tomorrow at 9", set `dueAt` to the first run time; do not use `intervalPreset` as the first due time.'
    )
  }

  if (normalized.artifacts.enabled) {
    skillLines.push(
      '- Artifacts (`artifact_create`, `artifact_update`): create durable documents when output should be edited, previewed, reused, or exported.'
    )
    skillLines.push(
      '- Update an existing artifact for revisions instead of repeating long document content in chat.'
    )
  }

  if (skillLines.length > 0) {
    sections.push(`Enabled Skills:\n${skillLines.join('\n')}`)
  }

  if (normalized.code_execution.enabled && options?.codeExecutionPrompt) {
    sections.push(options.codeExecutionPrompt)
  }

  if (normalized.terminal.enabled && options?.terminalPrompt) {
    sections.push(options.terminalPrompt)
  }

  if (normalized.computer_use.enabled && options?.computerUsePrompt) {
    sections.push(options.computerUsePrompt)
  }

  if (commandCenterActive && options?.commandCenterPrompt) {
    sections.push(options.commandCenterPrompt)
  }

  if (normalized.chart_generation.enabled && options?.chartGenerationPrompt) {
    sections.push(options.chartGenerationPrompt)
  }

  if (normalized.reminders.enabled && options?.remindersPrompt) {
    sections.push(options.remindersPrompt)
  }

  if (normalized.artifacts.enabled && options?.artifactsPrompt) {
    sections.push(options.artifactsPrompt)
  }

  return sections.join('\n\n')
}

export const BUILT_IN_EXTENSIONS = BUILT_IN_SKILLS
export const defaultExtensionsSettings = defaultSkillsSettings
export const normalizeExtensionsSettings = normalizeSkillsSettings
export const migrateExtensionsFromLegacySettings = migrateSkillsFromLegacySettings
export const isExtensionEnabled = isSkillEnabled
export const withExtensionEnabled = withSkillEnabled
export const buildEnabledExtensionsPrompt = buildEnabledSkillsPrompt
