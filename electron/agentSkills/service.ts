import crypto from 'crypto'
import fs from 'fs/promises'
import https from 'https'
import os from 'os'
import path from 'path'

import { extract as tarExtract } from 'tar'

import type {
  AgentSkillActivationResult,
  AgentSkillDiagnostic,
  AgentSkillInstallResult,
  AgentSkillsListResult,
  AgentSkillScope,
  AgentSkillSearchResult,
  AgentSkillSummary,
} from '../../src/agentSkills/types'

const MAX_SKILL_MD_BYTES = 256_000
const MAX_RESOURCE_ENTRIES = 80
const NPM_REGISTRY = 'https://registry.npmjs.org'
const NPM_SEARCH_SIZE = 20

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
      const existing = isRecord(data[currentMapKey])
        ? (data[currentMapKey] as Record<string, string>)
        : {}
      existing[nested[1]] = parseScalar(nested[2])
      data[currentMapKey] = existing
      continue
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) {
      diagnostics.push({
        level: 'warning',
        message: `Unsupported frontmatter line: ${line.trim()}`,
      })
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
      diagnostics: [
        { level: 'error', message: 'SKILL.md is missing YAML frontmatter.', path: skillPath },
      ],
    }
  }

  const endMatch = /\r?\n---\r?\n/.exec(normalized.slice(3))
  if (!endMatch || endMatch.index < 0) {
    return {
      body: '',
      diagnostics: [
        { level: 'error', message: 'SKILL.md frontmatter is not closed.', path: skillPath },
      ],
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
        Object.entries(data.metadata).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
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
      const skillDiagnostics = parsed.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: diagnostic.path ?? skillPath,
      }))
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

export async function listAgentSkills(
  query: AgentSkillsQuery = {}
): Promise<AgentSkillsListResult> {
  const disabled = new Set(
    (query.disabledSkillNames ?? []).filter((name): name is string => typeof name === 'string')
  )
  const user = await scanSkillsRoot(getUserSkillsRoot(), 'user')
  const projectRoot = getProjectSkillsRoot(query.projectRoot)
  const project = projectRoot
    ? await scanSkillsRoot(projectRoot, 'project')
    : { skills: [], diagnostics: [] }
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

// --- npm registry HTTP helpers ---

function httpsGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          httpsGet(res.headers.location).then(resolve, reject)
          return
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

export async function downloadAndVerifyTarball(
  url: string,
  expectedShasum: string
): Promise<Buffer> {
  const data = await httpsGet(url)
  const hash = crypto.createHash('sha1').update(data).digest('hex')
  if (hash !== expectedShasum) {
    throw new Error(`Integrity check failed: expected sha1 ${expectedShasum}, got ${hash}`)
  }
  return data
}

interface NpmSearchObject {
  package: {
    name: string
    version: string
    description?: string
    keywords?: string[]
  }
}

interface NpmSearchResponse {
  objects: NpmSearchObject[]
}

export async function searchAgentSkills(query: string): Promise<AgentSkillSearchResult> {
  const trimmed = typeof query === 'string' ? query.trim() : ''
  if (!trimmed) return { ok: false, query: '', output: '', error: 'Search query is required.' }

  try {
    const searchUrl = `${NPM_REGISTRY}/-/v1/search?text=keywords:agent-skill+${encodeURIComponent(trimmed)}&size=${NPM_SEARCH_SIZE}`
    const data = await httpsGet(searchUrl)
    const response: NpmSearchResponse = JSON.parse(data.toString('utf8'))

    if (!response.objects || response.objects.length === 0) {
      return { ok: true, query: trimmed, output: 'No packages found.' }
    }

    const lines = response.objects.map((obj) => {
      const pkg = obj.package
      return `${pkg.name}@${pkg.version} - ${pkg.description || '(no description)'}`
    })

    return { ok: true, query: trimmed, output: lines.join('\n') }
  } catch (error) {
    return {
      ok: false,
      query: trimmed,
      output: '',
      error: error instanceof Error ? error.message : 'Search failed.',
    }
  }
}

interface NpmPackageVersion {
  version: string
  dist: {
    tarball: string
    shasum: string
  }
}

interface NpmPackageMetadata {
  name: string
  'dist-tags': Record<string, string>
  versions: Record<string, NpmPackageVersion>
}

async function extractSkillFromTarball(tarballBuffer: Buffer, targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true })

  // Write tarball to a temporary file, extract to a temp directory, then copy skill files
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zura-skill-'))
  const tarballPath = path.join(tmpDir, 'package.tgz')

  try {
    await fs.writeFile(tarballPath, tarballBuffer)
    await tarExtract({ file: tarballPath, cwd: tmpDir })

    // npm tarballs extract to a "package/" directory
    const packageDir = path.join(tmpDir, 'package')
    const packageDirExists = await fs
      .stat(packageDir)
      .then((s) => s.isDirectory())
      .catch(() => false)

    const sourceDir = packageDirExists ? packageDir : tmpDir

    // Look for SKILL.md at top level or agents/skills/ subdirectory
    const agentsSkillsDir = path.join(sourceDir, 'agents', 'skills')
    const hasAgentsSkills = await fs
      .stat(agentsSkillsDir)
      .then((s) => s.isDirectory())
      .catch(() => false)

    if (hasAgentsSkills) {
      await copyDir(agentsSkillsDir, targetDir)
    } else {
      await copyDir(sourceDir, targetDir)
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

export async function installAgentSkill(
  packageRef: string,
  target: AgentSkillScope,
  projectRoot?: string
): Promise<AgentSkillInstallResult> {
  const trimmed = typeof packageRef === 'string' ? packageRef.trim() : ''
  if (!trimmed)
    return {
      ok: false,
      packageRef: '',
      target,
      output: '',
      error: 'Package reference is required.',
    }

  const targetRoot = target === 'project' ? normalizeProjectRoot(projectRoot) : os.homedir()
  if (target === 'project' && !targetRoot) {
    return {
      ok: false,
      packageRef: trimmed,
      target,
      output: '',
      error: 'Project root is required for project installs.',
    }
  }

  // Resolve package metadata from npm registry
  let metadata: NpmPackageMetadata
  try {
    const registryUrl = `${NPM_REGISTRY}/${encodeURIComponent(trimmed)}`
    const data = await httpsGet(registryUrl)
    metadata = JSON.parse(data.toString('utf8'))
  } catch (error) {
    return {
      ok: false,
      packageRef: trimmed,
      target,
      output: '',
      error: `Failed to resolve package: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  const latestTag = metadata['dist-tags']?.latest
  if (!latestTag || !metadata.versions[latestTag]) {
    return {
      ok: false,
      packageRef: trimmed,
      target,
      output: '',
      error: 'Could not determine latest version for package.',
    }
  }

  const versionInfo = metadata.versions[latestTag]
  const { tarball, shasum } = versionInfo.dist
  const skillsDir = path.join(targetRoot || os.homedir(), '.agents', 'skills')

  // Show confirmation dialog with full details
  const { dialog } = await import('electron')
  const confirmation = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Install', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `Install Agent Skill "${metadata.name}"?`,
    detail: [
      `Package: ${metadata.name}`,
      `Version: ${versionInfo.version}`,
      `Source: ${tarball}`,
      `Integrity: sha1-${shasum}`,
      `Target: ${skillsDir}`,
    ].join('\n'),
  })

  if (confirmation.response !== 0) {
    return { ok: false, packageRef: trimmed, target, output: '', error: 'Install cancelled.' }
  }

  // Download and verify tarball integrity
  let tarballBuffer: Buffer
  try {
    tarballBuffer = await downloadAndVerifyTarball(tarball, shasum)
  } catch (error) {
    return {
      ok: false,
      packageRef: trimmed,
      target,
      output: '',
      error: `Download failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }

  // Extract skill files to target directory
  try {
    const skillTargetDir = path.join(skillsDir, metadata.name)
    await extractSkillFromTarball(tarballBuffer, skillTargetDir)
    return {
      ok: true,
      packageRef: trimmed,
      target,
      output: `Installed ${metadata.name}@${versionInfo.version} to ${skillTargetDir}`,
    }
  } catch (error) {
    return {
      ok: false,
      packageRef: trimmed,
      target,
      output: '',
      error: `Extraction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    }
  }
}

export async function selectAgentSkillsProjectRoot(): Promise<string> {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({
    title: 'Select project folder for Agent Skills',
    properties: ['openDirectory'],
  })
  return result.canceled ? '' : (result.filePaths[0] ?? '')
}
