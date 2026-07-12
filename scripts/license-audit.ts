import fs from 'node:fs'
import path from 'node:path'

type PackageManifest = {
  name?: string
  version?: string
  license?: string | { type?: string }
  licenses?: Array<string | { type?: string }>
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const root = path.resolve(import.meta.dirname, '..')
const rootManifest = readManifest(path.join(root, 'package.json'))
const visited = new Set<string>()
const findings: string[] = []

function readManifest(filePath: string): PackageManifest {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageManifest
}

function packageSegments(name: string): string[] {
  return name.startsWith('@') ? name.split('/') : [name]
}

function resolveInstalledManifest(name: string, fromDirectory: string): string | null {
  let cursor = fromDirectory
  while (true) {
    const candidate = path.join(cursor, 'node_modules', ...packageSegments(name), 'package.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(cursor)
    if (parent === cursor) return null
    cursor = parent
  }
}

function normalizedLicenses(manifest: PackageManifest): string[] {
  const values: Array<string | { type?: string } | undefined> = [
    manifest.license,
    ...(manifest.licenses ?? []),
  ]
  return values
    .map((value) => (typeof value === 'string' ? value : value?.type))
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
}

function licenseFileText(packageDirectory: string): string | null {
  const entry = fs
    .readdirSync(packageDirectory, { withFileTypes: true })
    .find((candidate) => candidate.isFile() && /^(licen[cs]e|copying)(\.|$)/i.test(candidate.name))
  return entry ? fs.readFileSync(path.join(packageDirectory, entry.name), 'utf8') : null
}

function isProhibited(license: string): boolean {
  return /(^|[^L])AGPL|SSPL|BUSL|Commons Clause|Elastic License/i.test(license)
}

function visitDependency(name: string, fromDirectory: string): void {
  const manifestPath = resolveInstalledManifest(name, fromDirectory)
  if (!manifestPath) {
    findings.push(`${name}: installed package manifest not found`)
    return
  }
  if (visited.has(manifestPath)) return
  visited.add(manifestPath)

  const manifest = readManifest(manifestPath)
  const identity = `${manifest.name ?? name}@${manifest.version ?? 'unknown'}`
  const licenses = normalizedLicenses(manifest)
  const packageDirectory = path.dirname(manifestPath)
  const licenseText = licenses.length === 0 ? licenseFileText(packageDirectory) : null
  if (licenses.length === 0 && !licenseText) {
    findings.push(`${identity}: missing license metadata`)
  } else if (licenses.some(isProhibited) || (licenseText ? isProhibited(licenseText) : false)) {
    findings.push(`${identity}: prohibited license ${licenses.join(' OR ')}`)
  }

  const dependencies = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
  }
  for (const dependencyName of Object.keys(dependencies).sort()) {
    visitDependency(dependencyName, packageDirectory)
  }
}

for (const dependencyName of Object.keys(rootManifest.dependencies ?? {}).sort()) {
  visitDependency(dependencyName, root)
}

if (findings.length > 0) {
  console.error('Production dependency license audit failed:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exitCode = 1
} else {
  console.log(`Production dependency license audit passed (${visited.size} packages checked).`)
}
