import { app, shell } from 'electron'
import { watch } from 'fs'
import type { FSWatcher } from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { AppIconLifecycle } from './app-index/iconLifecycle'
import { mergeByKey } from './app-index/merger'
import { createPlatformDiscovery } from './app-index/platformDiscovery'
import { rankApps } from './app-index/ranking'
import { AppIndexRefreshCoordinator } from './app-index/refreshCoordinator'
import { AppIndexRepository } from './app-index/repository'
import type {
  AppIndexDiagnostics,
  AppIndexEntry,
  AppIndexSource,
  AppLaunchStrategy,
  RankedAppIndexEntry,
  RawAppMatch,
  UserAssistUsage,
} from './app-index/types'
import {
  isWindows,
  MAX_APP_INDEX_OUTPUT_LENGTH,
  parseNdjsonOutput,
  runPowerShell,
} from './tools/native-common'

const SNAPSHOT_VERSION = 1
const SNAPSHOT_FILE = 'app-index.json'
const REFRESH_STALE_MS = 10 * 60_000
const ICON_CONCURRENCY = 4
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
const MAX_SNAPSHOT_APPS = 5_000
const MAX_APP_NAME_LENGTH = 256
const MAX_APP_ID_LENGTH = 512
const MAX_APP_PATH_LENGTH = 4_096
const MAX_APP_ALIASES = 32
/** Budget is charged only for directories + `.lnk` files (not every junk file). */
const MAX_SHORTCUT_SCAN_ENTRIES = 25_000
const MAX_SHORTCUT_SCAN_DEPTH = 20
const SHORTCUT_SCAN_DEADLINE_MS = 20_000

type ShortcutScanBudget = {
  /** Directories visited + `.lnk` files considered. */
  entries: number
  deadline: number
  /** Soft stop — keep partial results instead of failing the whole source. */
  stoppedReason?: 'entry-limit' | 'timeout'
}

export type {
  AppIndexDiagnostics,
  AppIndexEntry,
  AppIndexSource,
  AppLaunchStrategy,
  RankedAppIndexEntry,
} from './app-index/types'

interface AppIndexSnapshot {
  version: number
  updatedAt: number
  apps: AppIndexEntry[]
  sourceCounts: Record<string, number>
}

interface NativeStartApp {
  name?: string
  appUserModelId?: string
}

let memoryApps: AppIndexEntry[] = []
let diagnostics: AppIndexDiagnostics = {
  ok: true,
  stale: true,
  sourceCounts: {},
}
let loadedSnapshot = false
let refreshRequest: Promise<AppIndexDiagnostics> | null = null
/** Bound icon data-URL cache — each large (48px) base64 icon is multi-KB. */
/** Successful icons only. Failed keys live in `failedIconKeys` so they do not
 *  thrash the LRU or force the overlay into endless refresh loops. */
let watchersStarted = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined
const shortcutWatchers = new Set<FSWatcher>()
const refreshCoordinator = new AppIndexRefreshCoordinator()

function indexPath(): string {
  return path.join(app.getPath('userData'), SNAPSHOT_FILE)
}

function shortcutRoots(): Array<{ path: string; source: AppIndexSource }> {
  const systemDrive =
    process.env.SystemDrive || path.parse(process.env.SystemRoot || '').root || 'C:\\'
  const programData = process.env.ProgramData || path.join(systemDrive, 'ProgramData')
  const publicProfile = process.env.PUBLIC || path.join(systemDrive, 'Users', 'Public')

  return [
    {
      path: path.join(
        os.homedir(),
        'AppData',
        'Roaming',
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs'
      ),
      source: 'start-menu',
    },
    {
      path: path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      source: 'start-menu',
    },
    { path: path.join(os.homedir(), 'Desktop'), source: 'desktop' },
    { path: path.join(publicProfile, 'Desktop'), source: 'desktop' },
  ]
}

function macApplicationRoots(): string[] {
  return ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')]
}

async function collectMacApplications(): Promise<RawAppMatch[]> {
  const results: RawAppMatch[] = []
  for (const root of macApplicationRoots()) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().endsWith('.app')) continue
      const appPath = path.join(root, entry.name)
      results.push({
        name: entry.name.slice(0, -4),
        path: appPath,
        targetPath: appPath,
        source: 'macos-applications',
      })
    }
  }
  return results
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function compactWithoutVersion(value: string): string {
  return compact(value.replace(/\b(19|20)\d{2}\b/g, ''))
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return undefined
  return trimmed
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function powershellSingleQuotedString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function appDedupeKey(app: RawAppMatch | AppIndexEntry): string {
  const appUserModelId = compact(app.appUserModelId ?? '')
  if (appUserModelId) return `aumid:${appUserModelId}`

  const targetPath = compact(('targetPath' in app ? app.targetPath : undefined) ?? '')
  if (targetPath) return `target:${targetPath}`

  const shortcutPath = compact(
    ('shortcutPath' in app ? app.shortcutPath : undefined) ??
      ('path' in app ? app.path : undefined) ??
      ''
  )
  if (shortcutPath) return `shortcut:${compact(app.name)}:${shortcutPath}`

  return `name:${compact(app.name)}`
}

function rawAppRichness(app: RawAppMatch): number {
  let score = 0
  if (app.targetPath) score += 8
  if (app.iconPath) score += 4
  if (app.appUserModelId) score += 2
  if (app.workingDirectory) score += 1
  if (app.path?.toLowerCase().includes('desktop')) score += 1
  return score
}

function appEntryRichness(app: AppIndexEntry): number {
  let score = 0
  if (app.targetPath) score += 8
  if (app.iconPath) score += 4
  if (app.appUserModelId) score += 2
  if (app.workingDirectory) score += 1
  if (app.shortcutPath?.toLowerCase().includes('desktop')) score += 1
  return score
}

function preferRawAppMatch(current: RawAppMatch | undefined, candidate: RawAppMatch): RawAppMatch {
  if (!current) return candidate
  return rawAppRichness(candidate) > rawAppRichness(current) ? candidate : current
}

function preferAppEntry(
  current: AppIndexEntry | undefined,
  candidate: AppIndexEntry
): AppIndexEntry {
  if (!current) return candidate
  return appEntryRichness(candidate) > appEntryRichness(current) ? candidate : current
}

function mergedEntryId(
  entry: Pick<AppIndexEntry, 'appUserModelId' | 'targetPath' | 'shortcutPath' | 'name'>
): string {
  return entryIdFor({
    appUserModelId: entry.appUserModelId,
    targetPath: entry.targetPath,
    path: entry.shortcutPath,
    name: entry.name,
  })
}

function mergeAppEntries(
  current: AppIndexEntry | undefined,
  candidate: AppIndexEntry
): AppIndexEntry {
  if (!current) return candidate
  const preferred = preferAppEntry(current, candidate)
  const merged: AppIndexEntry = {
    ...preferred,
    name: preferred.name || current.name || candidate.name,
    normalizedName: preferred.normalizedName || current.normalizedName || candidate.normalizedName,
    aliases: Array.from(
      new Set(
        [
          ...current.aliases,
          ...candidate.aliases,
          current.appUserModelId ?? '',
          candidate.appUserModelId ?? '',
        ].filter((alias) => alias.trim().length > 0)
      )
    ),
    appUserModelId: candidate.appUserModelId ?? current.appUserModelId,
    shortcutPath: current.shortcutPath ?? candidate.shortcutPath,
    targetPath: current.targetPath ?? candidate.targetPath,
    iconPath: current.iconPath ?? candidate.iconPath,
    args: current.args ?? candidate.args,
    workingDirectory: current.workingDirectory ?? candidate.workingDirectory,
    launchStrategy:
      candidate.appUserModelId || current.appUserModelId ? 'appUserModelId' : 'shortcutPath',
    lastSeenAt: Math.max(current.lastSeenAt, candidate.lastSeenAt),
    launchCount: Math.max(current.launchCount ?? 0, candidate.launchCount ?? 0) || undefined,
    lastLaunchedAt:
      Math.max(current.lastLaunchedAt ?? 0, candidate.lastLaunchedAt ?? 0) || undefined,
    usageCount: Math.max(current.usageCount ?? 0, candidate.usageCount ?? 0) || undefined,
    lastUsedAt: Math.max(current.lastUsedAt ?? 0, candidate.lastUsedAt ?? 0) || undefined,
  }
  return {
    ...merged,
    id: mergedEntryId(merged),
    iconKey: iconKeyFor(merged),
  }
}

function entryIdFor(
  raw: Pick<RawAppMatch, 'appUserModelId' | 'targetPath' | 'path' | 'name'>
): string {
  const seed = raw.appUserModelId ?? raw.targetPath ?? raw.path ?? raw.name
  return `app:${Buffer.from(seed).toString('base64url')}`
}

function dedupeAppEntries(apps: AppIndexEntry[]): AppIndexEntry[] {
  const byName = new Map<string, AppIndexEntry>()
  for (const app of mergeByKey(apps, appDedupeKey, mergeAppEntries)) {
    const key = compact(app.name)
    if (!key) continue
    const current = byName.get(key)
    const merged = mergeAppEntries(current, app)
    const appUserModelId = merged.appUserModelId ?? current?.appUserModelId ?? app.appUserModelId
    byName.set(key, {
      ...merged,
      appUserModelId,
      launchStrategy: appUserModelId ? 'appUserModelId' : merged.launchStrategy,
      id: appUserModelId ? mergedEntryId({ ...merged, appUserModelId }) : merged.id,
      iconKey: iconKeyFor({ ...merged, appUserModelId }),
    })
  }
  return Array.from(byName.values())
}

function sourceCounts(apps: Array<Pick<AppIndexEntry, 'source'>>): Record<string, number> {
  return apps.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.source] = (counts[entry.source] ?? 0) + 1
    return counts
  }, {})
}

function parseProcessStartExe(args: string | undefined): string | undefined {
  const match = args?.match(/--processStart\s+(?:"([^"]+)"|([^\s]+))/i)
  return match?.[1] || match?.[2] || undefined
}

function expandWindowsEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, key) => process.env[key] ?? match)
}

function normalizeIconCandidatePath(candidatePath: string): string {
  return expandWindowsEnv(
    candidatePath
      .trim()
      .replace(/^"|"$/g, '')
      .replace(/,\s*-?\d+$/, '')
  )
}

// Icon resolution is unified around the OS. For any installed app we extract
// the icon directly from its target executable (or, as a last resort, the
// shortcut, whose target Windows resolves for us). This replaces the previous
// per-app guesses at packaged PNG/ICO asset locations, which only worked for a
// handful of apps (VS Code, GitHub Copilot, paint.net, ...) and left everything
// else without an icon.
function iconCandidates(
  appEntry: Pick<
    AppIndexEntry,
    'shortcutPath' | 'targetPath' | 'iconPath' | 'args' | 'workingDirectory'
  >
): string[] {
  const processStartExe = parseProcessStartExe(appEntry.args)
  const candidates = [
    // Primary: the real executable's embedded icon — always the app's icon.
    appEntry.targetPath,
    // Some launchers are stubs that start the real exe from the working dir
    // (e.g. Squirrel Update.exe --processStart app.exe).
    appEntry.workingDirectory && processStartExe
      ? path.join(appEntry.workingDirectory, processStartExe)
      : undefined,
    // An explicit icon the shortcut points at (kept only if it is a real path).
    appEntry.iconPath,
    // Last resort: the shortcut itself; Windows resolves its target icon.
    appEntry.shortcutPath,
  ]
  return Array.from(
    new Set(
      candidates
        .filter((candidate): candidate is string => Boolean(candidate))
        .map(normalizeIconCandidatePath)
        .filter((candidate) => candidate.length > 0)
    )
  )
}

function iconKeyFor(
  appEntry: Pick<
    AppIndexEntry,
    'appUserModelId' | 'shortcutPath' | 'targetPath' | 'iconPath' | 'args' | 'workingDirectory'
  >
): string | undefined {
  const candidates = iconCandidates(appEntry)
  return candidates.length > 0 ? candidates.join('|') : undefined
}

function likelyShortcutForNative(
  nativeApp: RawAppMatch,
  shortcutsByName: Map<string, RawAppMatch>
): RawAppMatch | undefined {
  const nativeName = compact(nativeApp.name)
  const exact = shortcutsByName.get(nativeName)
  if (exact) return exact

  const nativeNoVersion = compactWithoutVersion(nativeApp.name)
  const versionlessExact = shortcutsByName.get(nativeNoVersion)
  if (versionlessExact) return versionlessExact

  const candidates = Array.from(shortcutsByName.entries())
    .filter(([shortcutName]) => {
      const shortcutNoVersion = compactWithoutVersion(shortcutName)
      return (
        shortcutName === nativeName ||
        shortcutNoVersion === nativeNoVersion ||
        (nativeName.length >= 8 && shortcutName.startsWith(nativeName)) ||
        (nativeNoVersion.length >= 8 && shortcutNoVersion.startsWith(nativeNoVersion))
      )
    })
    .map(([, shortcut]) => shortcut)
  return candidates.length === 1 ? candidates[0] : undefined
}

function createEntry(raw: RawAppMatch, existing?: AppIndexEntry): AppIndexEntry {
  const shortcutPath = raw.path
  const launchStrategy: AppLaunchStrategy = raw.appUserModelId ? 'appUserModelId' : 'shortcutPath'
  const base: AppIndexEntry = {
    id: entryIdFor(raw),
    name: raw.name.trim(),
    normalizedName: normalizeName(raw.name),
    aliases: [
      raw.name,
      raw.appUserModelId ?? '',
      raw.targetPath ? path.basename(raw.targetPath, path.extname(raw.targetPath)) : '',
    ].filter((alias) => alias.trim().length > 0),
    source: raw.source,
    appUserModelId: raw.appUserModelId,
    shortcutPath,
    targetPath: raw.targetPath,
    iconPath: raw.iconPath,
    args: raw.args,
    workingDirectory: raw.workingDirectory,
    launchStrategy,
    lastSeenAt: Date.now(),
    launchCount: existing?.launchCount,
    lastLaunchedAt: existing?.lastLaunchedAt,
    usageCount: existing?.usageCount,
    lastUsedAt: existing?.lastUsedAt,
  }
  return {
    ...base,
    iconKey: iconKeyFor(base),
  }
}

function sanitizeSnapshot(value: unknown): AppIndexSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const updatedAt = finiteNonNegativeNumber(record.updatedAt)
  if (
    record.version !== SNAPSHOT_VERSION ||
    updatedAt === undefined ||
    !Array.isArray(record.apps) ||
    record.apps.length > MAX_SNAPSHOT_APPS
  )
    return null
  const apps = record.apps.flatMap((entry): AppIndexEntry[] => {
    if (!entry || typeof entry !== 'object') return []
    const appEntry = entry as Record<string, unknown>
    const id = boundedString(appEntry.id, MAX_APP_ID_LENGTH)
    const name = boundedString(appEntry.name, MAX_APP_NAME_LENGTH)
    if (
      !id ||
      !name ||
      (appEntry.source !== 'windows-search' &&
        appEntry.source !== 'start-menu' &&
        appEntry.source !== 'desktop') ||
      (appEntry.launchStrategy !== 'appUserModelId' && appEntry.launchStrategy !== 'shortcutPath')
    ) {
      return []
    }
    const sanitizedEntry: AppIndexEntry = {
      id,
      name,
      normalizedName: normalizeName(name),
      aliases: Array.isArray(appEntry.aliases)
        ? appEntry.aliases.slice(0, MAX_APP_ALIASES).flatMap((alias) => {
            const sanitized = boundedString(alias, MAX_APP_NAME_LENGTH)
            return sanitized ? [sanitized] : []
          })
        : [name],
      source: appEntry.source,
      appUserModelId: boundedString(appEntry.appUserModelId, MAX_APP_PATH_LENGTH),
      shortcutPath: boundedString(appEntry.shortcutPath, MAX_APP_PATH_LENGTH),
      targetPath: boundedString(appEntry.targetPath, MAX_APP_PATH_LENGTH),
      iconPath: boundedString(appEntry.iconPath, MAX_APP_PATH_LENGTH),
      args: boundedString(appEntry.args, MAX_APP_PATH_LENGTH),
      workingDirectory: boundedString(appEntry.workingDirectory, MAX_APP_PATH_LENGTH),
      launchStrategy: appEntry.launchStrategy,
      lastSeenAt: finiteNonNegativeNumber(appEntry.lastSeenAt) ?? updatedAt,
      launchCount: finiteNonNegativeNumber(appEntry.launchCount),
      lastLaunchedAt: finiteNonNegativeNumber(appEntry.lastLaunchedAt),
      usageCount: finiteNonNegativeNumber(appEntry.usageCount),
      lastUsedAt: finiteNonNegativeNumber(appEntry.lastUsedAt),
    }
    return [
      {
        ...sanitizedEntry,
        iconKey: iconKeyFor(sanitizedEntry),
      },
    ]
  })
  return {
    version: SNAPSHOT_VERSION,
    updatedAt,
    apps,
    sourceCounts: sourceCounts(apps),
  }
}

const snapshotRepository = new AppIndexRepository(indexPath, MAX_SNAPSHOT_BYTES, sanitizeSnapshot)

async function loadSnapshot(): Promise<void> {
  if (loadedSnapshot) return
  loadedSnapshot = true
  try {
    const snapshot = await snapshotRepository.load()
    if (!snapshot) throw new Error('App index snapshot is unavailable.')
    memoryApps = dedupeAppEntries(snapshot.apps)
    diagnostics = {
      ok: true,
      stale: Date.now() - snapshot.updatedAt > REFRESH_STALE_MS,
      sourceCounts: snapshot.sourceCounts,
      lastRefreshAt: snapshot.updatedAt,
    }
  } catch {
    memoryApps = []
    diagnostics = {
      ok: true,
      stale: true,
      sourceCounts: {},
    }
  }
}

async function saveSnapshot(apps: AppIndexEntry[], updatedAt: number): Promise<void> {
  const snapshot: AppIndexSnapshot = {
    version: SNAPSHOT_VERSION,
    updatedAt,
    apps,
    sourceCounts: sourceCounts(apps),
  }
  await snapshotRepository.save(snapshot)
}

function readShortcutDetails(shortcutPath: string): Electron.ShortcutDetails | null {
  if (!isWindows()) return null
  try {
    return shell.readShortcutLink(shortcutPath)
  } catch {
    return null
  }
}

function isUsefulIconPath(iconPath: string | undefined): iconPath is string {
  return Boolean(iconPath && normalizeIconCandidatePath(iconPath).length > 0)
}

async function scanShortcutApps(
  root: string,
  source: AppIndexSource,
  results: RawAppMatch[],
  budget: ShortcutScanBudget,
  depth = 0
): Promise<void> {
  if (budget.stoppedReason) return
  // Depth is per-branch: skip this folder rather than failing the whole scan.
  if (depth > MAX_SHORTCUT_SCAN_DEPTH) return
  if (Date.now() > budget.deadline) {
    budget.stoppedReason = 'timeout'
    return
  }

  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (budget.stoppedReason) return
    if (Date.now() > budget.deadline) {
      budget.stoppedReason = 'timeout'
      return
    }

    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      // Only directories and shortcuts consume budget (not .url/.ini/uninstall junk).
      budget.entries += 1
      if (budget.entries > MAX_SHORTCUT_SCAN_ENTRIES) {
        budget.stoppedReason = 'entry-limit'
        return
      }
      await scanShortcutApps(full, source, results, budget, depth + 1)
      continue
    }

    if (path.extname(entry.name).toLowerCase() !== '.lnk') continue

    budget.entries += 1
    if (budget.entries > MAX_SHORTCUT_SCAN_ENTRIES) {
      budget.stoppedReason = 'entry-limit'
      return
    }

    const name = path.basename(entry.name, '.lnk')
    const shortcut = readShortcutDetails(full)
    const targetPath = shortcut?.target || undefined
    const iconPath = isUsefulIconPath(shortcut?.icon) ? shortcut?.icon : undefined
    results.push({
      name,
      path: full,
      source,
      targetPath,
      iconPath,
      args: shortcut?.args || undefined,
      workingDirectory: shortcut?.cwd || undefined,
      appUserModelId: shortcut?.appUserModelId || undefined,
    })
  }
}

async function collectShortcutApps(): Promise<RawAppMatch[]> {
  const apps: RawAppMatch[] = []
  const budget: ShortcutScanBudget = {
    entries: 0,
    deadline: Date.now() + SHORTCUT_SCAN_DEADLINE_MS,
  }
  await Promise.all(
    shortcutRoots().map((root) => scanShortcutApps(root.path, root.source, apps, budget))
  )
  if (budget.stoppedReason) {
    // Soft-cap: keep every shortcut collected so far. Callers must not treat this as a hard failure.
    console.warn(
      `[AppIndex] Shortcut scan stopped early (${budget.stoppedReason}) after ${budget.entries} dir/lnk entries; kept ${apps.length} shortcuts.`
    )
  }
  return apps
}

async function queryNativeStartApps(query = '', timeoutMs = 10_000): Promise<RawAppMatch[]> {
  const trimmedQuery = query.trim()
  const nameFilter = trimmedQuery
    ? ` -Name ${powershellSingleQuotedString(`*${trimmedQuery}*`)}`
    : ''
  const script = `
$ErrorActionPreference = 'Stop'
function Remove-ControlChars([string]$Value) {
  if ($null -eq $Value) { return '' }
  return [regex]::Replace([string]$Value, '[\\x00-\\x1F\\x7F]', '')
}
Get-StartApps${nameFilter} |
  Select-Object -First 500 |
  ForEach-Object {
    [pscustomobject]@{
      name = Remove-ControlChars([string]$_.Name)
      appUserModelId = Remove-ControlChars([string]$_.AppID)
    } | ConvertTo-Json -Compress
  }
`
  const { stdout } = await runPowerShell(script, {
    timeoutMs,
    maxOutputLength: trimmedQuery ? undefined : MAX_APP_INDEX_OUTPUT_LENGTH,
  })
  if (!stdout.trim()) return []
  return parseNdjsonOutput<NativeStartApp>(stdout)
    .filter(
      (nativeApp): nativeApp is Required<Pick<NativeStartApp, 'name' | 'appUserModelId'>> =>
        typeof nativeApp.name === 'string' &&
        nativeApp.name.trim().length > 0 &&
        typeof nativeApp.appUserModelId === 'string' &&
        nativeApp.appUserModelId.trim().length > 0
    )
    .map((nativeApp) => ({
      name: nativeApp.name.trim(),
      source: 'windows-search' as const,
      appUserModelId: nativeApp.appUserModelId.trim(),
    }))
}

async function queryUserAssistUsage(): Promise<UserAssistUsage[]> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
function Decode-Rot13([string]$Value) {
  -join ($Value.ToCharArray() | ForEach-Object {
    $c = [int][char]$_
    if ($c -ge 65 -and $c -le 90) { [char](((($c - 65 + 13) % 26) + 65)) }
    elseif ($c -ge 97 -and $c -le 122) { [char](((($c - 97 + 13) % 26) + 97)) }
    else { [char]$c }
  })
}
$root = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist'
if (Test-Path $root) {
  Get-ChildItem $root | ForEach-Object {
    $countPath = Join-Path $_.PsPath 'Count'
    if (-not (Test-Path $countPath)) { return }
    $props = Get-ItemProperty $countPath
    foreach ($prop in $props.PSObject.Properties) {
      if ($prop.Name -like 'PS*' -or $prop.Value -isnot [byte[]]) { continue }
      $bytes = [byte[]]$prop.Value
      $decoded = Decode-Rot13 $prop.Name
      $lastUsedAt = $null
      $usageCount = 0
      if ($bytes.Length -ge 8) {
        $usageCount = [Math]::Max(0, [BitConverter]::ToInt32($bytes, 4))
      }
      if ($bytes.Length -ge 68) {
        $filetime = [BitConverter]::ToInt64($bytes, 60)
        if ($filetime -gt 0) {
          $lastUsedAt = [DateTime]::FromFileTimeUtc($filetime).ToString('o')
        }
      }
      [pscustomobject]@{
        name = [string]$decoded
        usageCount = [int]$usageCount
        lastUsedAt = $lastUsedAt
      } | ConvertTo-Json -Compress
    }
  }
}
`
  const { stdout } = await runPowerShell(script, { timeoutMs: 2_000, maxOutputLength: 256_000 })
  if (!stdout.trim()) return []
  return parseNdjsonOutput<{ name?: unknown; usageCount?: unknown; lastUsedAt?: unknown }>(
    stdout
  ).flatMap((entry): UserAssistUsage[] => {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) return []
    const lastUsedAt =
      typeof entry.lastUsedAt === 'string' ? Date.parse(entry.lastUsedAt) : undefined
    return [
      {
        name: entry.name,
        usageCount:
          typeof entry.usageCount === 'number' && Number.isFinite(entry.usageCount)
            ? entry.usageCount
            : undefined,
        lastUsedAt: lastUsedAt && Number.isFinite(lastUsedAt) ? lastUsedAt : undefined,
      },
    ]
  })
}

function mergeApps(
  nativeApps: RawAppMatch[],
  shortcutApps: RawAppMatch[],
  previousApps: AppIndexEntry[]
): AppIndexEntry[] {
  const previousByDedupeKey = new Map(previousApps.map((entry) => [appDedupeKey(entry), entry]))
  const previousByName = new Map<string, AppIndexEntry>()
  for (const entry of previousApps) {
    const key = compact(entry.name)
    previousByName.set(key, preferAppEntry(previousByName.get(key), entry))
  }
  const shortcutsByName = new Map<string, RawAppMatch>()
  const consumedShortcutPaths = new Set<string>()
  const consumedShortcutNames = new Set<string>()
  for (const shortcut of shortcutApps) {
    const key = compact(shortcut.name)
    if (!key) continue
    shortcutsByName.set(key, preferRawAppMatch(shortcutsByName.get(key), shortcut))
    const noVersionKey = compactWithoutVersion(shortcut.name)
    if (noVersionKey && noVersionKey !== key) {
      shortcutsByName.set(
        noVersionKey,
        preferRawAppMatch(shortcutsByName.get(noVersionKey), shortcut)
      )
    }
  }

  const rawByKey = new Map<string, RawAppMatch>()
  const addRaw = (raw: RawAppMatch) => {
    const key = appDedupeKey(raw)
    if (!key) return
    rawByKey.set(key, preferRawAppMatch(rawByKey.get(key), raw))
  }

  for (const nativeApp of nativeApps) {
    const nativeNameKey = compact(nativeApp.name)
    const shortcut = likelyShortcutForNative(nativeApp, shortcutsByName)
    if (shortcut?.path) {
      consumedShortcutPaths.add(compact(shortcut.path))
    }
    if (shortcut) {
      consumedShortcutNames.add(nativeNameKey)
      consumedShortcutNames.add(compact(shortcut.name))
    }
    addRaw({
      ...shortcut,
      ...nativeApp,
      path: shortcut?.path ?? nativeApp.path,
      targetPath: shortcut?.targetPath ?? nativeApp.targetPath,
      iconPath: shortcut?.iconPath ?? nativeApp.iconPath,
      args: shortcut?.args ?? nativeApp.args,
      workingDirectory: shortcut?.workingDirectory ?? nativeApp.workingDirectory,
      source: 'windows-search',
    })
  }

  for (const shortcut of shortcutApps) {
    if (consumedShortcutNames.has(compact(shortcut.name))) continue
    if (shortcut.path && consumedShortcutPaths.has(compact(shortcut.path))) continue
    addRaw(shortcut)
  }

  return Array.from(rawByKey.values())
    .map((raw) =>
      createEntry(
        raw,
        previousByDedupeKey.get(appDedupeKey(raw)) ?? previousByName.get(compact(raw.name))
      )
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

function appEntryAsRaw(entry: AppIndexEntry): RawAppMatch {
  return {
    name: entry.name,
    source: entry.source,
    path: entry.shortcutPath,
    targetPath: entry.targetPath,
    iconPath: entry.iconPath,
    args: entry.args,
    workingDirectory: entry.workingDirectory,
    appUserModelId: entry.appUserModelId,
  }
}

function usageKeysForApp(appEntry: AppIndexEntry): string[] {
  return Array.from(
    new Set(
      [
        compact(appEntry.name),
        compactWithoutVersion(appEntry.name),
        appEntry.appUserModelId ? compact(appEntry.appUserModelId) : '',
        appEntry.targetPath
          ? compact(path.basename(appEntry.targetPath, path.extname(appEntry.targetPath)))
          : '',
        appEntry.shortcutPath
          ? compact(path.basename(appEntry.shortcutPath, path.extname(appEntry.shortcutPath)))
          : '',
      ].filter(Boolean)
    )
  )
}

function usageKeysForUserAssist(usage: UserAssistUsage): string[] {
  const normalized = usage.name.replace(/^.*[\\/]/, '')
  return Array.from(
    new Set(
      [
        compact(usage.name),
        compactWithoutVersion(usage.name),
        compact(normalized),
        compactWithoutVersion(normalized),
        compact(path.basename(normalized, path.extname(normalized))),
      ].filter(Boolean)
    )
  )
}

function applyUsageSignals(apps: AppIndexEntry[], usages: UserAssistUsage[]): AppIndexEntry[] {
  if (usages.length === 0) return apps
  const usageByKey = new Map<string, UserAssistUsage>()
  for (const usage of usages) {
    for (const key of usageKeysForUserAssist(usage)) {
      const current = usageByKey.get(key)
      const currentTime = current?.lastUsedAt ?? 0
      const nextTime = usage.lastUsedAt ?? 0
      if (
        !current ||
        nextTime > currentTime ||
        (nextTime === currentTime && (usage.usageCount ?? 0) > (current.usageCount ?? 0))
      ) {
        usageByKey.set(key, usage)
      }
    }
  }
  return apps.map((appEntry) => {
    const usage = usageKeysForApp(appEntry)
      .map((key) => usageByKey.get(key))
      .filter((entry): entry is UserAssistUsage => Boolean(entry))
      .sort(
        (a, b) =>
          (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || (b.usageCount ?? 0) - (a.usageCount ?? 0)
      )[0]
    if (!usage) return appEntry
    return {
      ...appEntry,
      usageCount: Math.max(appEntry.usageCount ?? 0, usage.usageCount ?? 0) || undefined,
      lastUsedAt: Math.max(appEntry.lastUsedAt ?? 0, usage.lastUsedAt ?? 0) || undefined,
    }
  })
}

// Cap on how many UWP packages we resolve logos for per refresh, prioritized by
// usage/recency so the apps a user actually opens get icons first.
const MAX_UWP_LOGO_LOOKUPS = 80

function uwpFamilyNamesFor(apps: AppIndexEntry[]): string[] {
  const ranked = apps
    .filter(
      (app) =>
        !!app.appUserModelId && app.appUserModelId.includes('!') && !app.targetPath && !app.iconPath
    )
    .sort(
      (a, b) =>
        (b.lastUsedAt ?? b.lastLaunchedAt ?? 0) - (a.lastUsedAt ?? a.lastLaunchedAt ?? 0) ||
        (b.usageCount ?? 0) - (a.usageCount ?? 0)
    )
  const familyNames = new Set<string>()
  for (const app of ranked) {
    familyNames.add(app.appUserModelId!.split('!')[0])
    if (familyNames.size >= MAX_UWP_LOGO_LOOKUPS) break
  }
  return Array.from(familyNames)
}

// Resolves the best (largest) logo asset file for each requested UWP package
// family. Windows stores scaled variants (e.g. *.scale-200.png), so we glob the
// manifest logo's folder and pick the biggest matching file.
async function queryAppxLogos(familyNames: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!isWindows() || familyNames.length === 0) return map
  const targets = familyNames.map(powershellSingleQuotedString).join(',')
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$targets = @(${targets})
Get-AppxPackage | Where-Object { $targets -contains $_.PackageFamilyName } | ForEach-Object {
  $pkg = $_
  try {
    $manifest = Get-AppxPackageManifest $pkg
    $app = @($manifest.Package.Applications.Application)[0]
    $visual = $app.VisualElements
    $logo = $visual.Square44x44Logo
    if (-not $logo) { $logo = $visual.Square150x150Logo }
    if (-not $logo) { return }
    $logoFull = Join-Path $pkg.InstallLocation $logo
    $dir = Split-Path $logoFull -Parent
    $base = [System.IO.Path]::GetFileNameWithoutExtension($logoFull)
    $ext = [System.IO.Path]::GetExtension($logoFull)
    $resolved = $null
    if (Test-Path $dir) {
      $match = Get-ChildItem -Path $dir -Filter ($base + '*' + $ext) -File -ErrorAction SilentlyContinue |
        Sort-Object Length -Descending | Select-Object -First 1
      if ($match) { $resolved = $match.FullName }
    }
    if (-not $resolved -and (Test-Path $logoFull)) { $resolved = $logoFull }
    if ($resolved) {
      [pscustomobject]@{ familyName = [string]$pkg.PackageFamilyName; logo = [string]$resolved } |
        ConvertTo-Json -Compress
    }
  } catch {}
}
`
  const { stdout } = await runPowerShell(script, { timeoutMs: 15_000, maxOutputLength: 256_000 })
  if (!stdout.trim()) return map
  for (const entry of parseNdjsonOutput<{ familyName?: unknown; logo?: unknown }>(stdout)) {
    if (
      entry &&
      typeof entry.familyName === 'string' &&
      entry.familyName.trim().length > 0 &&
      typeof entry.logo === 'string' &&
      entry.logo.trim().length > 0
    ) {
      map.set(entry.familyName, entry.logo)
    }
  }
  return map
}

function applyAppxLogos(apps: AppIndexEntry[], logos: Map<string, string>): AppIndexEntry[] {
  if (logos.size === 0) return apps
  return apps.map((entry) => {
    if (entry.targetPath || entry.iconPath || !entry.appUserModelId?.includes('!')) return entry
    const logo = logos.get(entry.appUserModelId.split('!')[0])
    if (!logo) return entry
    const withLogo: AppIndexEntry = { ...entry, iconPath: logo }
    return { ...withLogo, iconKey: iconKeyFor(withLogo) }
  })
}

function platformDiscovery() {
  if (!isWindows() && process.platform === 'darwin') {
    return createPlatformDiscovery('macos', {
      native: collectMacApplications,
      shortcuts: collectMacApplications,
    })
  }
  return createPlatformDiscovery('windows', {
    native: queryNativeStartApps,
    shortcuts: collectShortcutApps,
    usage: queryUserAssistUsage,
  })
}

async function bootstrapAppsFromShortcuts(): Promise<boolean> {
  const shortcutApps = await platformDiscovery()
    .discoverShortcuts()
    .catch(() => [] as RawAppMatch[])
  if (shortcutApps.length === 0) return false
  memoryApps = mergeApps([], shortcutApps, memoryApps)
  diagnostics = {
    ok: true,
    stale: true,
    sourceCounts: sourceCounts(memoryApps),
    lastRefreshAt: diagnostics.lastRefreshAt,
  }
  return true
}

async function ensureAppsAvailable(): Promise<void> {
  await loadSnapshot()
  if (memoryApps.length > 0) {
    if (diagnostics.stale) {
      void refreshAppIndex()
    }
    return
  }
  const bootstrapped = await bootstrapAppsFromShortcuts()
  void refreshAppIndex()
  if (!bootstrapped) {
    await refreshAppIndex()
  }
}

export async function refreshAppIndex(): Promise<AppIndexDiagnostics> {
  if (refreshCoordinator.isDisposed()) return diagnostics
  if (!isWindows() && process.platform !== 'darwin') {
    diagnostics = {
      ok: false,
      stale: true,
      error: 'App index is only supported on Windows and macOS.',
      sourceCounts: {},
    }
    return diagnostics
  }
  await loadSnapshot()
  if (refreshRequest) return refreshRequest
  const generation = refreshCoordinator.capture()
  refreshRequest = (async () => {
    const startedAt = Date.now()
    const errors: string[] = []
    const discovery = platformDiscovery()
    if (!isWindows() && process.platform === 'darwin') {
      const freshApps = await discovery.discoverNative().catch((error) => {
        errors.push(`applications: ${error instanceof Error ? error.message : 'failed'}`)
        return [] as RawAppMatch[]
      })
      if (!refreshCoordinator.isCurrent(generation)) return diagnostics
      const updatedAt = Date.now()
      memoryApps = mergeApps(freshApps, [], memoryApps)
      await saveSnapshot(memoryApps, updatedAt).catch((error) => {
        errors.push(`snapshot: ${error instanceof Error ? error.message : 'failed'}`)
      })
      diagnostics = {
        ok: errors.length === 0,
        stale: errors.length > 0,
        error: errors.length ? errors.join('; ') : undefined,
        sourceCounts: sourceCounts(memoryApps),
        lastRefreshAt: updatedAt,
        refreshDurationMs: Date.now() - startedAt,
      }
      return diagnostics
    }
    let nativeFailed = false
    let shortcutsFailed = false
    const [freshNativeApps, freshShortcutApps, userAssistUsage] = await Promise.all([
      discovery.discoverNative().catch((error) => {
        nativeFailed = true
        errors.push(`windows-search: ${error instanceof Error ? error.message : 'failed'}`)
        return [] as RawAppMatch[]
      }),
      discovery.discoverShortcuts().catch((error) => {
        shortcutsFailed = true
        errors.push(`shortcuts: ${error instanceof Error ? error.message : 'failed'}`)
        return [] as RawAppMatch[]
      }),
      discovery.discoverUsage().catch(() => [] as UserAssistUsage[]),
    ])
    if (!refreshCoordinator.isCurrent(generation)) return diagnostics
    const nativeApps = nativeFailed
      ? memoryApps.filter((entry) => entry.source === 'windows-search').map(appEntryAsRaw)
      : freshNativeApps
    const shortcutApps = shortcutsFailed
      ? memoryApps.filter((entry) => entry.source !== 'windows-search').map(appEntryAsRaw)
      : freshShortcutApps
    const nextApps = mergeApps(nativeApps, shortcutApps, memoryApps)
    const updatedAt = Date.now()
    const rankedApps = applyUsageSignals(dedupeAppEntries(nextApps), userAssistUsage)
    // Best-effort UWP/Store icon enrichment: those apps have no on-disk exe, so
    // we resolve their package logo asset. Kept off the critical path (failures
    // are swallowed) and bounded to the packages we actually index.
    const appxLogos = await queryAppxLogos(uwpFamilyNamesFor(rankedApps)).catch(
      () => new Map<string, string>()
    )
    if (!refreshCoordinator.isCurrent(generation)) return diagnostics
    const dedupedApps = applyAppxLogos(rankedApps, appxLogos)
    if (dedupedApps.length > 0 || memoryApps.length === 0) {
      memoryApps = dedupedApps
      if (!nativeFailed && !shortcutsFailed) {
        await saveSnapshot(memoryApps, updatedAt).catch((error) => {
          errors.push(`snapshot: ${error instanceof Error ? error.message : 'failed'}`)
        })
      }
    }
    diagnostics = {
      ok: errors.length === 0,
      stale: errors.length > 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      sourceCounts: sourceCounts(memoryApps),
      lastRefreshAt: errors.length > 0 ? diagnostics.lastRefreshAt : updatedAt,
      refreshDurationMs: Date.now() - startedAt,
    }
    return diagnostics
  })().finally(() => {
    refreshRequest = null
  })
  return refreshRequest
}

export function warmAppIndex(): void {
  if (refreshCoordinator.isDisposed() || (!isWindows() && process.platform !== 'darwin')) return
  const generation = refreshCoordinator.capture()
  void (async () => {
    await loadSnapshot()
    if (!refreshCoordinator.isCurrent(generation)) return
    if (memoryApps.length === 0) {
      await bootstrapAppsFromShortcuts().catch(() => undefined)
    }
    if (diagnostics.stale || memoryApps.length === 0) {
      void refreshAppIndex()
    }
    if (!refreshCoordinator.isCurrent(generation)) return
    startShortcutWatchers()
  })()
}

function debounceRefresh(): void {
  if (refreshCoordinator.isDisposed()) return
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    void refreshAppIndex()
  }, 1_000)
}

function startShortcutWatchers(): void {
  if (
    refreshCoordinator.isDisposed() ||
    watchersStarted ||
    (!isWindows() && process.platform !== 'darwin')
  )
    return
  watchersStarted = true
  const roots =
    !isWindows() && process.platform === 'darwin'
      ? macApplicationRoots().map((root) => ({ path: root }))
      : shortcutRoots()
  for (const root of roots) {
    try {
      const watcher = watch(root.path, { recursive: true }, debounceRefresh)
      shortcutWatchers.add(watcher)
      watcher.on('error', () => {
        watcher.close()
        shortcutWatchers.delete(watcher)
      })
    } catch {
      // Watchers are opportunistic; missing shortcut roots are normal.
    }
  }
}

export async function listApps(
  limit = 300
): Promise<{ apps: RankedAppIndexEntry[]; diagnostics: AppIndexDiagnostics; count: number }> {
  await ensureAppsAvailable()
  const ranked = rankApps(memoryApps, '', limit)
  return { apps: ranked.slice(0, limit), diagnostics, count: memoryApps.length }
}

export async function findApps(
  query: string,
  limit = 40
): Promise<{ matches: RankedAppIndexEntry[]; diagnostics: AppIndexDiagnostics }> {
  await ensureAppsAvailable()
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return { matches: [], diagnostics }

  const rankMatches = () => rankApps(memoryApps, trimmedQuery, limit)

  let matches = rankMatches()
  if (isWindows() && matches.length === 0) {
    try {
      const nativeMatches = await queryNativeStartApps(trimmedQuery, 2_000)
      if (nativeMatches.length > 0) {
        memoryApps = mergeApps(
          nativeMatches,
          memoryApps.map((entry) => ({
            name: entry.name,
            source: entry.source,
            path: entry.shortcutPath,
            targetPath: entry.targetPath,
            iconPath: entry.iconPath,
            args: entry.args,
            workingDirectory: entry.workingDirectory,
            appUserModelId: entry.appUserModelId,
          })),
          memoryApps
        )
        diagnostics = { ...diagnostics, sourceCounts: sourceCounts(memoryApps) }
        matches = rankMatches()
        void saveSnapshot(memoryApps, Date.now()).catch((error) => {
          diagnostics = {
            ...diagnostics,
            ok: false,
            stale: true,
            error: `snapshot: ${error instanceof Error ? error.message : 'failed'}`,
          }
        })
      }
    } catch (error) {
      diagnostics = {
        ...diagnostics,
        ok: false,
        stale: true,
        error: `targeted-search: ${error instanceof Error ? error.message : 'failed'}`,
      }
    }
  }
  return { matches, diagnostics }
}

export async function resolveAppIndexEntry(
  itemId: string,
  query = ''
): Promise<AppIndexEntry | undefined> {
  const source = query.trim() ? (await findApps(query, 80)).matches : (await listApps(300)).apps
  return source.find((entry) => entry.id === itemId)
}

export async function recordAppLaunch(itemId: string): Promise<void> {
  await loadSnapshot()
  const target = memoryApps.find((entry) => entry.id === itemId)
  if (!target) return
  target.launchCount = (target.launchCount ?? 0) + 1
  target.lastLaunchedAt = Date.now()
  await saveSnapshot(memoryApps, diagnostics.lastRefreshAt ?? Date.now()).catch(() => undefined)
}

async function getImageFileDataUrl(candidatePath: string): Promise<string | undefined> {
  const ext = path.extname(candidatePath).toLowerCase()
  const mime =
    ext === '.ico'
      ? 'image/x-icon'
      : ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : null
  if (!mime) return undefined
  try {
    const data = await fs.readFile(candidatePath)
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return undefined
  }
}

async function loadIcon(iconKey: string): Promise<string | undefined> {
  for (const candidatePath of iconKey.split('|')) {
    // A real image asset (.ico/.png/.jpg): read it directly.
    const fileIcon = await getImageFileDataUrl(candidatePath)
    if (fileIcon) return fileIcon
    // Otherwise extract the native icon from the exe/shortcut. 'large' (48px)
    // keeps it crisp on high-DPI displays.
    try {
      const image = await app.getFileIcon(candidatePath, { size: 'large' })
      if (!image.isEmpty()) return image.toDataURL()
    } catch {
      // Continue to the next candidate.
    }
  }
  return undefined
}

const iconLifecycle = new AppIconLifecycle(ICON_CONCURRENCY, loadIcon)

/** Read a cached icon without starting extraction or touching the LRU. */
export function peekCachedAppIcon(iconKey: string | undefined): string | undefined {
  return iconLifecycle.peek(iconKey)
}

/** True while an icon extraction job is queued or in flight for this key. */
export function isAppIconPending(iconKey: string | undefined): boolean {
  return iconLifecycle.isPending(iconKey)
}

export function getCachedAppIcon(iconKey: string | undefined): string | undefined {
  return iconLifecycle.request(iconKey)
}

/** Drop in-memory app icon data-URLs (keeps the app index snapshot itself). */
export function clearAppIconCache(): void {
  iconLifecycle.clear()
}

export function disposeAppIndexRuntime(): void {
  refreshCoordinator.dispose()
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = undefined
  }
  for (const watcher of shortcutWatchers) watcher.close()
  shortcutWatchers.clear()
  watchersStarted = false
  iconLifecycle.dispose()
}

export function __resetAppIndexForTests(): void {
  disposeAppIndexRuntime()
  refreshCoordinator.reset()
  iconLifecycle.reset()
  memoryApps = []
  diagnostics = { ok: true, stale: true, sourceCounts: {} }
  loadedSnapshot = false
  refreshRequest = null
}
