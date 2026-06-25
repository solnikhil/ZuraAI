export type AgentSkillScope = 'user' | 'project'

export interface AgentSkillDiagnostic {
  level: 'warning' | 'error'
  message: string
  path?: string
}

export interface AgentSkillSummary {
  name: string
  description: string
  scope: AgentSkillScope
  skillPath: string
  skillDir: string
  license?: string
  compatibility?: string
  allowedTools?: string
  metadata?: Record<string, string>
  diagnostics?: AgentSkillDiagnostic[]
}

export interface AgentSkillActivationResult {
  name: string
  content: string
  skillDir: string
  resources: string[]
}

export interface AgentSkillsListResult {
  skills: AgentSkillSummary[]
  diagnostics: AgentSkillDiagnostic[]
}

export interface AgentSkillSearchResult {
  ok: boolean
  query: string
  output: string
  error?: string
}

export interface AgentSkillInstallResult {
  ok: boolean
  packageRef: string
  target: AgentSkillScope
  output: string
  error?: string
}

export interface AgentSkillsSettings {
  enabled: boolean
  projectRoot: string
  disabledSkillNames: string[]
  catalog: AgentSkillSummary[]
}
