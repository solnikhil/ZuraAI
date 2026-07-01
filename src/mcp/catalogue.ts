import bundledCatalogue from './catalogue.json'
import {
  createDraftConfigValue,
  createEmptyMcpDraftServer,
  type McpDraftConfigValue,
  type McpDraftServer,
} from './draft'

export interface McpCatalogueEntry {
  id: string
  name: string
  title?: string
  description?: string
  version?: string
  repositoryUrl?: string
  publisher?: string
  sourceLabel: string
  installKind: 'npm' | 'pypi' | 'sse' | 'websocket' | 'unsupported'
  supported: boolean
  unsupportedReason?: string
  draft?: McpDraftServer
  secretRequirements: string[]
  fingerprints: string[]
  isLatest: boolean
}

interface CatalogueJsonEntry {
  name?: unknown
  title?: unknown
  description?: unknown
  version?: unknown
  repositoryUrl?: unknown
  publisher?: unknown
  install?: unknown
  setup?: unknown
}

interface CatalogueInstallTarget {
  type?: unknown
  identifier?: unknown
  url?: unknown
  reason?: unknown
}

interface CatalogueSetupRequirement {
  name?: unknown
  description?: unknown
  secret?: unknown
  required?: unknown
  target?: unknown
}

type SetupTarget =
  | 'authToken'
  | 'header'
  | 'env'
  | 'oauth2Pkce'
  | 'basicAuth'
  | 'jsonCredential'
  | 'connectionString'

type InstallTarget =
  | {
      kind: 'npm' | 'pypi'
      supported: true
      sourceLabel: string
      identifier: string
      requirements: NormalizedSetupRequirement[]
    }
  | {
      kind: 'sse' | 'websocket'
      supported: true
      sourceLabel: string
      url: string
      requirements: NormalizedSetupRequirement[]
    }
  | {
      kind: 'unsupported'
      supported: false
      sourceLabel: string
      unsupportedReason: string
      requirements: NormalizedSetupRequirement[]
    }

interface NormalizedSetupRequirement {
  name: string
  description?: string
  secret: boolean
  required: boolean
  target: SetupTarget
}

export function loadMcpCatalogue(): McpCatalogueEntry[] {
  return normalizeMcpCatalogueEntries(bundledCatalogue)
}

export async function fetchMcpCatalogue(): Promise<McpCatalogueEntry[]> {
  return loadMcpCatalogue()
}

export function normalizeMcpCatalogueEntries(value: unknown): McpCatalogueEntry[] {
  if (!Array.isArray(value)) return []

  const byName = new Map<string, McpCatalogueEntry>()
  for (const rawEntry of value) {
    const entry = normalizeMcpCatalogueEntry(rawEntry)
    if (!entry) continue

    const existing = byName.get(entry.name)
    if (!existing || compareVersions(entry.version, existing.version) > 0) {
      byName.set(entry.name, entry)
    }
  }

  return [...byName.values()].sort((left, right) => {
    const leftName = left.title || left.name
    const rightName = right.title || right.name
    return leftName.localeCompare(rightName)
  })
}

export function isCatalogueEntryAdded(
  entry: McpCatalogueEntry,
  draftServers: McpDraftServer[]
): boolean {
  if (entry.fingerprints.length === 0) return false
  const entryFingerprints = new Set(entry.fingerprints)
  return draftServers.some((server) =>
    getDraftServerFingerprints(server).some((fingerprint) => entryFingerprints.has(fingerprint))
  )
}

function normalizeMcpCatalogueEntry(value: unknown): McpCatalogueEntry | null {
  if (!isRecord(value)) return null

  const rawEntry = value as CatalogueJsonEntry
  const name = getTrimmedString(rawEntry.name)
  if (!name) return null

  const title = getTrimmedString(rawEntry.title)
  const installTarget = resolveInstallTarget(rawEntry)
  const secretRequirements = installTarget.requirements
    .filter((requirement) => requirement.required || requirement.secret)
    .map(formatRequirementLabel)
  const fingerprints = buildCatalogueFingerprints(name, installTarget)
  const draft = installTarget.supported
    ? createDraftForInstallTarget({
        name: title || name,
        installTarget,
      })
    : undefined
  const version = getTrimmedString(rawEntry.version)

  return {
    id: `${name}:${version || 'bundled'}`,
    name,
    title,
    description: getTrimmedString(rawEntry.description),
    version,
    repositoryUrl: getTrimmedString(rawEntry.repositoryUrl),
    publisher: getTrimmedString(rawEntry.publisher),
    sourceLabel: installTarget.sourceLabel,
    installKind: installTarget.kind,
    supported: installTarget.supported,
    unsupportedReason: installTarget.supported ? undefined : installTarget.unsupportedReason,
    draft,
    secretRequirements,
    fingerprints,
    isLatest: true,
  }
}

function resolveInstallTarget(entry: CatalogueJsonEntry): InstallTarget {
  const setup = normalizeSetupRequirements(entry.setup)
  const install = isRecord(entry.install) ? (entry.install as CatalogueInstallTarget) : {}
  const type = getTrimmedString(install.type)?.toLowerCase()

  if (type === 'npm') {
    const identifier = getTrimmedString(install.identifier)
    if (identifier) {
      return {
        kind: 'npm',
        supported: true,
        sourceLabel: 'npm package',
        identifier,
        requirements: setup,
      }
    }
  }

  if (type === 'pypi') {
    const identifier = getTrimmedString(install.identifier)
    if (identifier) {
      return {
        kind: 'pypi',
        supported: true,
        sourceLabel: 'PyPI package',
        identifier,
        requirements: setup,
      }
    }
  }

  if (type === 'sse' || type === 'websocket') {
    const url = getTrimmedString(install.url)
    if (url) {
      return {
        kind: type,
        supported: true,
        sourceLabel: type === 'sse' ? 'SSE remote' : 'WebSocket remote',
        url,
        requirements: setup,
      }
    }
  }

  return {
    kind: 'unsupported',
    supported: false,
    sourceLabel: type === 'streamable-http' ? 'Streamable HTTP remote' : 'Unsupported',
    unsupportedReason:
      getTrimmedString(install.reason) ||
      (type === 'streamable-http'
        ? 'ZuraAI does not support streamable-http MCP transport yet.'
        : 'This catalogue entry does not expose an install target ZuraAI can configure yet.'),
    requirements: setup,
  }
}

function createDraftForInstallTarget(options: {
  name: string
  installTarget: Exclude<InstallTarget, { supported: false }>
}): McpDraftServer {
  const draft = {
    ...createEmptyMcpDraftServer(),
    name: options.name,
    enabled: true,
    trustState: 'untrusted' as const,
    autoConnect: false,
    requireApproval: true,
  }

  const setupPlaceholders = createSetupPlaceholders(options.installTarget.requirements)
  const auth = setupPlaceholders.auth

  if (options.installTarget.kind === 'npm') {
    return {
      ...draft,
      transport: 'stdio',
      command: 'npx',
      argsText: ['-y', options.installTarget.identifier].join('\n'),
      env: setupPlaceholders.env,
      headers: setupPlaceholders.headers,
      authToken: setupPlaceholders.authToken,
      auth,
    }
  }

  if (options.installTarget.kind === 'pypi') {
    return {
      ...draft,
      transport: 'stdio',
      command: 'uvx',
      argsText: options.installTarget.identifier,
      env: setupPlaceholders.env,
      headers: setupPlaceholders.headers,
      authToken: setupPlaceholders.authToken,
      auth,
    }
  }

  if (options.installTarget.kind === 'sse' || options.installTarget.kind === 'websocket') {
    return {
      ...draft,
      transport: options.installTarget.kind,
      url: options.installTarget.url,
      env: setupPlaceholders.env,
      headers: setupPlaceholders.headers,
      authToken: setupPlaceholders.authToken,
      auth,
    }
  }

  return draft
}

function createSetupPlaceholders(requirements: NormalizedSetupRequirement[]): {
  authToken: McpDraftConfigValue | null
  env: McpDraftConfigValue[]
  headers: McpDraftConfigValue[]
  auth: McpDraftServer['auth']
} {
  let authToken: McpDraftConfigValue | null = null
  const env: McpDraftConfigValue[] = []
  const headers: McpDraftConfigValue[] = []
  let auth: McpDraftServer['auth'] = { mode: 'none', state: 'none' }

  for (const requirement of requirements) {
    if (requirement.target === 'oauth2Pkce') {
      auth = { mode: 'oauth2Pkce', state: 'reauth_required' }
      continue
    }
    if (requirement.target === 'basicAuth') {
      auth = { mode: 'basicAuth', state: 'configured' }
    } else if (requirement.target === 'jsonCredential') {
      auth = { mode: 'jsonCredential', state: 'configured' }
    } else if (requirement.target === 'connectionString') {
      auth = { mode: 'connectionString', state: 'configured' }
    }

    if (!requirement.secret) continue

    const entry = createDraftConfigValue(
      requirement.target === 'env' ? 'env' : requirement.target === 'authToken' ? 'token' : 'header',
      {
        name: requirement.name,
        valueSource: 'secret',
        secretValue: '',
        secretStored: false,
      }
    )

    if (requirement.target === 'authToken' && !authToken) {
      authToken = entry
    } else if (requirement.target === 'env') {
      env.push(entry)
    } else if (requirement.target === 'header') {
      headers.push(entry)
    }
  }

  return { authToken, env, headers, auth }
}

function normalizeSetupRequirements(value: unknown): NormalizedSetupRequirement[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((rawRequirement) => {
    if (!isRecord(rawRequirement)) return []
    const requirement = rawRequirement as CatalogueSetupRequirement
    const name = getTrimmedString(requirement.name)
    if (!name) return []

    const target = normalizeSetupTarget(requirement.target)
    return [
      {
        name,
        description: getTrimmedString(requirement.description),
        secret: requirement.secret === true,
        required: requirement.required === true,
        target,
      },
    ]
  })
}

function normalizeSetupTarget(value: unknown): SetupTarget {
  const target = getTrimmedString(value)
  if (
    target === 'env' ||
    target === 'header' ||
    target === 'authToken' ||
    target === 'oauth2Pkce' ||
    target === 'basicAuth' ||
    target === 'jsonCredential' ||
    target === 'connectionString'
  ) {
    return target
  }
  return 'header'
}

function buildCatalogueFingerprints(name: string, installTarget: InstallTarget): string[] {
  const fingerprints = [`name:${name.toLowerCase()}`]

  if (installTarget.supported && (installTarget.kind === 'npm' || installTarget.kind === 'pypi')) {
    fingerprints.push(`${installTarget.kind}:${installTarget.identifier.toLowerCase()}`)
  }

  if (installTarget.supported && (installTarget.kind === 'sse' || installTarget.kind === 'websocket')) {
    fingerprints.push(`url:${installTarget.url.toLowerCase()}`)
  }

  return fingerprints
}

function getDraftServerFingerprints(server: McpDraftServer): string[] {
  const fingerprints = [`name:${server.name.trim().toLowerCase()}`]
  const url = server.url.trim()
  if (url) {
    fingerprints.push(`url:${url.toLowerCase()}`)
  }

  const command = server.command.trim().toLowerCase()
  const args = server.argsText
    .split(/\r?\n/)
    .map((arg) => arg.trim())
    .filter(Boolean)
  const packageIdentifier = args.find((arg) => !arg.startsWith('-'))
  if (command === 'npx' && packageIdentifier) {
    fingerprints.push(`npm:${packageIdentifier.toLowerCase()}`)
  }
  if (command === 'uvx' && packageIdentifier) {
    fingerprints.push(`pypi:${packageIdentifier.toLowerCase()}`)
  }

  return fingerprints.filter((fingerprint) => !fingerprint.endsWith(':'))
}

function compareVersions(left?: string, right?: string): number {
  if (!left && !right) return 0
  if (left && !right) return 1
  if (!left && right) return -1
  return (left ?? '').localeCompare(right ?? '', undefined, { numeric: true, sensitivity: 'base' })
}

function formatRequirementLabel(requirement: NormalizedSetupRequirement): string {
  const suffix = requirement.description ? `: ${requirement.description}` : ''
  return `${requirement.name}${suffix}`
}

function getTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
