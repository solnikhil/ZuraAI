import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

import type {
  AgentSkillActivationResult,
  AgentSkillDiagnostic,
  AgentSkillInstallResult,
  AgentSkillsListResult,
  AgentSkillScope,
  AgentSkillSearchResult,
  AgentSkillSummary,
} from '../../src/agentSkills/types'

const execFileAsync = promisify(execFile)
const MAX_SKILL_MD_BYTES = 256_000
const MAX_RESOURCE_ENTRIES = 80
const SKILLS_CLI_TIMEOUT_MS = 60_000

export interface AgentSkillsQuery {
  projectRoot?: string
  disabledSkillNames?: string[]
}

interface ParsedSkillFile {
  name?: string
  description?: string
  license?: string
  compatibility?: string
  allowedTools?: string
  metadata?: Record<string, string>
  body: string
  diagnostics: AgentSkillDiagnostic[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeProjectRoot(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return path.resolve(trimmed)
}

function getUserSkillsRoot(): string {
  return path.join(os.homedir(), '.agents', 'skills')
}

function getProjectSkillsRoot(projectRoot?: string): string | null {
  const normalized = normalizeProjectRoot(projectRoot)
  return normalized ? path.join(normalized, '.agents', 'skills') : null
}

function parseScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatterBlock(block: string): {
  data: Record<string, unknown>
  diagnostics: AgentSkillDiagnostic[]
} {
  const data: Record<string, unknown> = {}
  const diagnostics: AgentSkillDiagnostic[] = []
  const lines = block.split(/\r?\n/)
  let currentMapKey: string | null = null

  for (const line of lines) {
    if (!line.trim()) continue

    const nested = /^ {2,}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (nested && currentMapKey) {
      const existing = isRecord(data[currentMapKey]) ? data[currentMapKey] as Record<string, string> : {}
      existing[nested[1]] = parseScalar(nested[2])
      data[currentMapKey] = existing
      continue
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) {
      diagnostics.push({ level: 'warning', message: `Unsupported frontmatter line: ${line.trim()}` })
      currentMapKey = null
      continue
    }

    const [, rawKey, rawValue] = match
    const key = rawKey === 'allowed-tools' ? 'allowedTools' : rawKey
    if (!rawValue.trim()) {
      data[key] = {}
      currentMapKey = key
      continue
    }

    data[key] = parseScalar(rawValue)
    currentMapKey = null
  }

  return { data, diagnostics }
}

function parseSkillMarkdown(content: string, skillPath: string): ParsedSkillFile | null {
  const normalized = content.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---')) {
    return {
      body: normalized.trim(),
      diagnostics: [{ level: 'error', message: 'SKILL.md is missing YAML frontmatter.', path: skillPath }],
    }
  }

  const endMatch = /\r?\n---\r?\n/.exec(normalized.slice(3))
  if (!endMatch || endMatch.index < 0) {
    return {
      body: '',
      diagnostics: [{ level: 'error', message: 'SKILL.md frontmatter is not closed.', path: skillPath }],
    }
  }

  const frontmatterEnd = 3 + endMatch.index
  const frontmatter = normalized.slice(3, frontmatterEnd)
  const body = normalized.slice(frontmatterEnd + endMatch[0].length).trim()
  const parsed = parseFrontmatterBlock(frontmatter)
  const data = parsed.data
  const diagnostics = [...parsed.diagnostics]
  const metadata = isRecord(data.metadata)
    ? Object.fromEntries(
        Object.entries(data.metadata).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      )
    : undefined

  return {
    name: typeof data.name === 'string' ? data.name.trim() : undefined,
    description: typeof data.description === 'string' ? data.description.trim() : undefined,
    license: typeof data.license === 'string' ? data.license.trim() : undefined,
    compatibility: typeof data.compatibility === 'string' ? data.compatibility.trim() : undefined,
    allowedTools: typeof data.allowedTools === 'string' ? data.allowedTools.trim() : undefined,
    metadata,
    body,
    diagnostics,
  }
}

async function readSkillFile(skillPath: string): Promise<string> {
  const stat = await fs.stat(skillPath)
  if (!stat.isFile()) throw new Error('SKILL.md path is not a file.')
  if (stat.size > MAX_SKILL_MD_BYTES) {
    throw new Error(`SKILL.md exceeds ${MAX_SKILL_MD_BYTES} bytes.`)
  }
  return fs.readFile(skillPath, 'utf8')
}

async function scanSkillsRoot(
  skillsRoot: string,
  scope: AgentSkillScope
): Promise<{ skills: AgentSkillSummary[]; diagnostics: AgentSkillDiagnostic[] }> {
  const diagnostics: AgentSkillDiagnostic[] = []
  const skills: AgentSkillSummary[] = []
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillDir = path.join(skillsRoot, entry.name)
    const skillPath = path.join(skillDir, 'SKILL.md')
    try {
      const content = await readSkillFile(skillPath)
      const parsed = parseSkillMarkdown(content, skillPath)
      if (!parsed) continue
      const skillDiagnostics = parsed.diagnostics.map((diagnostic) => ({ ...diagnostic, path: diagnostic.path ?? skillPath }))
      if (!parsed.name || !parsed.description) {
        diagnostics.push({
          level: 'error',
          message: 'SKILL.md must include name and description frontmatter.',
          path: skillPath,
        })
        diagnostics.push(...skillDiagnostics)
        continue
      }
      skills.push({
        name: parsed.name,
        description: parsed.description,
        scope,
        skillPath,
        skillDir,
        license: parsed.license || undefined,
        compatibility: parsed.compatibility || undefined,
        allowedTools: parsed.allowedTools || undefined,
        metadata: parsed.metadata,
        diagnostics: skillDiagnostics.length ? skillDiagnostics : undefined,
      })
    } catch (error) {
      diagnostics.push({
        level: 'error',
        message: error instanceof Error ? error.message : 'Failed to read SKILL.md.',
        path: skillPath,
      })
    }
  }

  return { skills, diagnostics }
}

export async function listAgentSkills(query: AgentSkillsQuery = {}): Promise<AgentSkillsListResult> {
  const disabled = new Set((query.disabledSkillNames ?? []).filter((name): name is string => typeof name === 'string'))
  const user = await scanSkillsRoot(getUserSkillsRoot(), 'user')
  const projectRoot = getProjectSkillsRoot(query.projectRoot)
  const project = projectRoot ? await scanSkillsRoot(projectRoot, 'project') : { skills: [], diagnostics: [] }
  const byName = new Map<string, AgentSkillSummary>()

  for (const skill of user.skills) {
    if (!disabled.has(skill.name)) byName.set(skill.name, skill)
  }
  for (const skill of project.skills) {
    if (!disabled.has(skill.name)) byName.set(skill.name, skill)
  }

  return {
    skills: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics: [...user.diagnostics, ...project.diagnostics],
  }
}

async function listBundledResources(skillDir: string): Promise<string[]> {
  const resources: string[] = []
  const allowedRoots = ['scripts', 'references', 'assets']
  for (const rootName of allowedRoots) {
    const root = path.join(skillDir, rootName)
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (resources.length >= MAX_RESOURCE_ENTRIES) return resources
      if (!entry.isFile()) continue
      resources.push(path.join(rootName, entry.name).replace(/\\/g, '/'))
    }
  }
  return resources
}

export async function activateAgentSkill(
  name: string,
  query: AgentSkillsQuery = {}
): Promise<AgentSkillActivationResult> {
  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!trimmedName) throw new Error('Skill name is required.')
  const { skills } = await listAgentSkills(query)
  const skill = skills.find((candidate) => candidate.name === trimmedName)
  if (!skill) throw new Error(`Skill "${trimmedName}" is not available.`)
  const content = await readSkillFile(skill.skillPath)
  const parsed = parseSkillMarkdown(content, skill.skillPath)
  if (!parsed?.body) throw new Error(`Skill "${trimmedName}" has no instructions.`)
  const resources = await listBundledResources(skill.skillDir)
  return {
    name: skill.name,
    content: `<skill_content name="${skill.name}">\n${parsed.body}\n\nSkill directory: ${skill.skillDir}\nRelative paths in this skill are relative to the skill directory.\n<skill_resources>\n${resources.map((resource) => `  <file>${resource}</file>`).join('\n')}\n</skill_resources>\n</skill_content>`,
    skillDir: skill.skillDir,
    resources,
  }
}

function getNpxCommand(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

async function runSkillsCli(args: string[], cwd: string): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const result = await execFileAsync(getNpxCommand(), ['--yes', 'skills', ...args], {
      cwd,
      timeout: SKILLS_CLI_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1_000_000,
    })
    return { ok: true, output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      output: [err.stdout, err.stderr].filter(Boolean).join('\n').trim(),
      error: err.message ?? 'Skills CLI failed.',
    }
  }
}

export async function searchAgentSkills(query: string): Promise<AgentSkillSearchResult> {
  const trimmed = typeof query === 'string' ? query.trim() : ''
  if (!trimmed) return { ok: false, query: '', output: '', error: 'Search query is required.' }
  const result = await runSkillsCli(['find', trimmed], os.homedir())
  return { query: trimmed, ...result }
}

export async function installAgentSkill(
  packageRef: string,
  target: AgentSkillScope,
  projectRoot?: string
): Promise<AgentSkillInstallResult> {
  const trimmed = typeof packageRef === 'string' ? packageRef.trim() : ''
  if (!trimmed) return { ok: false, packageRef: '', target, output: '', error: 'Package reference is required.' }
  const cwd = target === 'project' ? normalizeProjectRoot(projectRoot) : os.homedir()
  if (target === 'project' && !cwd) {
    return { ok: false, packageRef: trimmed, target, output: '', error: 'Project root is required for project installs.' }
  }
  const { dialog } = await import('electron')
  const confirmation = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Install', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `Install Agent Skill "${trimmed}"?`,
    detail: `Target: ${target === 'project' ? cwd : 'user skills'}`,
  })
  if (confirmation.response !== 0) {
    return { ok: false, packageRef: trimmed, target, output: '', error: 'Install cancelled.' }
  }
  const result = await runSkillsCli(['add', trimmed, '--agent', 'universal'], cwd || os.homedir())
  return { packageRef: trimmed, target, ...result }
}

export async function selectAgentSkillsProjectRoot(): Promise<string> {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({
    title: 'Select project folder for Agent Skills',
    properties: ['openDirectory'],
  })
  return result.canceled ? '' : result.filePaths[0] ?? ''
}
