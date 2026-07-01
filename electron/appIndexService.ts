import { app, shell } from 'electron'
import { watch } from 'fs'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { scoreAppSearch } from '../src/commandCenter/search'
import { writeFileAtomic } from './utils/atomicFile'
import {
  isWindows,
  MAX_APP_INDEX_OUTPUT_LENGTH,
  parseNdjsonOutput,
  runPowerShell,
} from './tools/native-common'

const SNAPSHOT_VERSION = 1
const SNAPSHOT_FILE = 'command-center-app-index.json'
const REFRESH_STALE_MS = 10 * 60_000
const ICON_CONCURRENCY = 4

export type AppIndexSource = 'windows-search' | 'start-menu' | 'desktop'
export type AppLaunchStrategy = 'appUserModelId' | 'shortcutPath'

export interface AppIndexEntry {
  id: string
  name: string
  normalizedName: string
  aliases: string[]
  source: AppIndexSource
  appUserModelId?: string
  shortcutPath?: string
  targetPath?: string
  iconPath?: string
  args?: string
  workingDirectory?: string
  launchStrategy: AppLaunchStrategy
  iconKey?: string
  lastSeenAt: number
  launchCount?: number
  lastLaunchedAt?: number
}

export interface AppIndexDiagnostics {
  ok: boolean
  stale: boolean
  error?: string
  sourceCounts: Record<string, number>
  lastRefreshAt?: number
  refreshDurationMs?: number
}

export interface RankedAppIndexEntry extends AppIndexEntry {
  rank: number
}

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

interface RawAppMatch {
  name: string
  source: AppIndexSource
  path?: string
  targetPath?: string
  iconPath?: string
  args?: string
  workingDirectory?: string
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
const iconCache = new Map<string, string | undefined>()
const iconRequests = new Map<string, Promise<string | undefined>>()
const iconQueue: Array<() => void> = []
let activeIconJobs = 0
let watchersStarted = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function indexPath(): string {
  return path.join(app.getPath('userData'), SNAPSHOT_FILE)
}

function shortcutRoots(): Array<{ path: string; source: AppIndexSource }> {
  return [
    {
      path: path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      source: 'start-menu',
    },
    { path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs', source: 'start-menu' },
    { path: path.join(os.homedir(), 'Desktop'), source: 'desktop' },
    { path: 'C:\\Users\\Public\\Desktop', source: 'desktop' },
  ]
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
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
    ('shortcutPath' in app ? app.shortcutPath : undefined)
    ?? ('path' in app ? app.path : undefined)
    ?? ''
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

function preferAppEntry(current: AppIndexEntry | undefined, candidate: AppIndexEntry): AppIndexEntry {
  if (!current) return candidate
  return appEntryRichness(candidate) > appEntryRichness(current) ? candidate : current
}

function mergedEntryId(entry: Pick<AppIndexEntry, 'appUserModelId' | 'targetPath' | 'shortcutPath' | 'name'>): string {
  return entryIdFor({
    appUserModelId: entry.appUserModelId,
    targetPath: entry.targetPath,
    path: entry.shortcutPath,
    name: entry.name,
  })
}

function mergeAppEntries(current: AppIndexEntry | undefined, candidate: AppIndexEntry): AppIndexEntry {
  if (!current) return candidate
  const preferred = preferAppEntry(current, candidate)
  const merged: AppIndexEntry = {
    ...preferred,
    name: preferred.name || current.name || candidate.name,
    normalizedName: preferred.normalizedName || current.normalizedName || candidate.normalizedName,
    aliases: Array.from(new Set([
      ...current.aliases,
      ...candidate.aliases,
      current.appUserModelId ?? '',
      candidate.appUserModelId ?? '',
    ].filter((alias) => alias.trim().length > 0))),
    appUserModelId: current.appUserModelId ?? candidate.appUserModelId,
    shortcutPath: current.shortcutPath ?? candidate.shortcutPath,
    targetPath: current.targetPath ?? candidate.targetPath,
    iconPath: current.iconPath ?? candidate.iconPath,
    args: current.args ?? candidate.args,
    workingDirectory: current.workingDirectory ?? candidate.workingDirectory,
    launchStrategy: current.appUserModelId || candidate.appUserModelId ? 'appUserModelId' : 'shortcutPath',
    lastSeenAt: Math.max(current.lastSeenAt, candidate.lastSeenAt),
    launchCount: Math.max(current.launchCount ?? 0, candidate.launchCount ?? 0) || undefined,
    lastLaunchedAt: Math.max(current.lastLaunchedAt ?? 0, candidate.lastLaunchedAt ?? 0) || undefined,
  }
  return {
    ...merged,
    id: mergedEntryId(merged),
    iconKey: iconKeyFor(merged),
  }
}

function entryIdFor(raw: Pick<RawAppMatch, 'appUserModelId' | 'targetPath' | 'path' | 'name'>): string {
  const seed = raw.appUserModelId ?? raw.targetPath ?? raw.path ?? raw.name
  return `app:${Buffer.from(seed).toString('base64url')}`
}

function dedupeAppEntries(apps: AppIndexEntry[]): AppIndexEntry[] {
  const byKey = new Map<string, AppIndexEntry>()
  for (const app of apps) {
    const key = appDedupeKey(app)
    byKey.set(key, mergeAppEntries(byKey.get(key), app))
  }
  const byName = new Map<string, AppIndexEntry>()
  for (const app of byKey.values()) {
    const key = compact(app.name)
    if (!key) continue
    byName.set(key, mergeAppEntries(byName.get(key), app))
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
  return expandWindowsEnv(candidatePath.trim().replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, ''))
}

function iconCandidates(appEntry: Pick<AppIndexEntry, 'shortcutPath' | 'targetPath' | 'iconPath' | 'args' | 'workingDirectory'>): string[] {
  const processStartExe = parseProcessStartExe(appEntry.args)
  const candidates = [
    appEntry.iconPath,
    appEntry.workingDirectory && processStartExe ? path.join(appEntry.workingDirectory, processStartExe) : undefined,
    appEntry.targetPath ? path.join(path.dirname(appEntry.targetPath), 'app.ico') : undefined,
    appEntry.targetPath,
    appEntry.shortcutPath,
  ]
  return Array.from(new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)).map(normalizeIconCandidatePath)))
}

function iconKeyFor(appEntry: Pick<AppIndexEntry, 'appUserModelId' | 'shortcutPath' | 'targetPath' | 'iconPath' | 'args' | 'workingDirectory'>): string | undefined {
  const candidates = iconCandidates(appEntry)
  return candidates.length > 0 ? candidates.join('|') : appEntry.appUserModelId
}

function createEntry(raw: RawAppMatch, existing?: AppIndexEntry): AppIndexEntry {
  const shortcutPath = raw.path
  const launchStrategy: AppLaunchStrategy = raw.appUserModelId ? 'appUserModelId' : 'shortcutPath'
  const base: AppIndexEntry = {
    id: entryIdFor(raw),
    name: raw.name.trim(),
    normalizedName: normalizeName(raw.name),
    aliases: [raw.name, raw.appUserModelId ?? '', raw.targetPath ? path.basename(raw.targetPath, path.extname(raw.targetPath)) : '']
      .filter((alias) => alias.trim().length > 0),
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
  }
  return {
    ...base,
    iconKey: iconKeyFor(base),
  }
}

function sanitizeSnapshot(value: unknown): AppIndexSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.version !== SNAPSHOT_VERSION || typeof record.updatedAt !== 'number' || !Array.isArray(record.apps)) return null
  const updatedAt = record.updatedAt
  const apps = record.apps.flatMap((entry): AppIndexEntry[] => {
    if (!entry || typeof entry !== 'object') return []
    const appEntry = entry as Record<string, unknown>
    if (
      typeof appEntry.id !== 'string' ||
      typeof appEntry.name !== 'string' ||
      typeof appEntry.normalizedName !== 'string' ||
      (appEntry.source !== 'windows-search' && appEntry.source !== 'start-menu' && appEntry.source !== 'desktop') ||
      (appEntry.launchStrategy !== 'appUserModelId' && appEntry.launchStrategy !== 'shortcutPath')
    ) {
      return []
    }
    return [{
      id: appEntry.id,
      name: appEntry.name,
      normalizedName: appEntry.normalizedName,
      aliases: Array.isArray(appEntry.aliases) ? appEntry.aliases.filter((alias): alias is string => typeof alias === 'string') : [appEntry.name],
      source: appEntry.source,
      appUserModelId: typeof appEntry.appUserModelId === 'string' ? appEntry.appUserModelId : undefined,
      shortcutPath: typeof appEntry.shortcutPath === 'string' ? appEntry.shortcutPath : undefined,
      targetPath: typeof appEntry.targetPath === 'string' ? appEntry.targetPath : undefined,
      iconPath: typeof appEntry.iconPath === 'string' ? appEntry.iconPath : undefined,
      args: typeof appEntry.args === 'string' ? appEntry.args : undefined,
      workingDirectory: typeof appEntry.workingDirectory === 'string' ? appEntry.workingDirectory : undefined,
      launchStrategy: appEntry.launchStrategy,
      iconKey: typeof appEntry.iconKey === 'string' ? appEntry.iconKey : undefined,
      lastSeenAt: typeof appEntry.lastSeenAt === 'number' ? appEntry.lastSeenAt : updatedAt,
      launchCount: typeof appEntry.launchCount === 'number' ? appEntry.launchCount : undefined,
      lastLaunchedAt: typeof appEntry.lastLaunchedAt === 'number' ? appEntry.lastLaunchedAt : undefined,
    }]
  })
  return {
    version: SNAPSHOT_VERSION,
    updatedAt,
    apps,
    sourceCounts: sourceCounts(apps),
  }
}

async function loadSnapshot(): Promise<void> {
  if (loadedSnapshot) return
  loadedSnapshot = true
  try {
    const raw = await fs.readFile(indexPath(), 'utf-8')
    const snapshot = sanitizeSnapshot(JSON.parse(raw))
    if (!snapshot) throw new Error('App index snapshot is invalid.')
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
  await writeFileAtomic(indexPath(), JSON.stringify(snapshot, null, 2))
}

function readShortcutDetails(shortcutPath: string): Electron.ShortcutDetails | null {
  if (!isWindows()) return null
  try {
    return shell.readShortcutLink(shortcutPath)
  } catch {
    return null
  }
}

async function scanShortcutApps(root: string, source: AppIndexSource, results: RawAppMatch[]): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await scanShortcutApps(full, source, results)
      continue
    }
    if (path.extname(entry.name).toLowerCase() !== '.lnk') continue
    const name = path.basename(entry.name, '.lnk')
    const shortcut = readShortcutDetails(full)
    results.push({
      name,
      path: full,
      source,
      targetPath: shortcut?.target || undefined,
      iconPath: shortcut?.icon || undefined,
      args: shortcut?.args || undefined,
      workingDirectory: shortcut?.cwd || undefined,
      appUserModelId: shortcut?.appUserModelId || undefined,
    })
  }
}

async function collectShortcutApps(): Promise<RawAppMatch[]> {
  const apps: RawAppMatch[] = []
  await Promise.all(shortcutRoots().map((root) => scanShortcutApps(root.path, root.source, apps)))
  return apps
}

async function queryNativeStartApps(query = '', timeoutMs = 10_000): Promise<RawAppMatch[]> {
  const trimmedQuery = query.trim()
  const nameFilter = trimmedQuery ? ` -Name ${powershellSingleQuotedString(`*${trimmedQuery}*`)}` : ''
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
    .filter((nativeApp): nativeApp is Required<Pick<NativeStartApp, 'name' | 'appUserModelId'>> => (
      typeof nativeApp.name === 'string' &&
      nativeApp.name.trim().length > 0 &&
      typeof nativeApp.appUserModelId === 'string' &&
      nativeApp.appUserModelId.trim().length > 0
    ))
    .map((nativeApp) => ({
      name: nativeApp.name.trim(),
      source: 'windows-search' as const,
      appUserModelId: nativeApp.appUserModelId.trim(),
    }))
}

function mergeApps(nativeApps: RawAppMatch[], shortcutApps: RawAppMatch[], previousApps: AppIndexEntry[]): AppIndexEntry[] {
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
  }

  const rawByKey = new Map<string, RawAppMatch>()
  const addRaw = (raw: RawAppMatch) => {
    const key = appDedupeKey(raw)
    if (!key) return
    rawByKey.set(key, preferRawAppMatch(rawByKey.get(key), raw))
  }

  for (const nativeApp of nativeApps) {
    const nativeNameKey = compact(nativeApp.name)
    const shortcut = shortcutsByName.get(nativeNameKey)
    if (shortcut?.path) {
      consumedShortcutPaths.add(compact(shortcut.path))
    }
    if (shortcut) {
      consumedShortcutNames.add(nativeNameKey)
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
    .map((raw) => createEntry(raw, previousByDedupeKey.get(appDedupeKey(raw)) ?? previousByName.get(compact(raw.name))))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function bootstrapAppsFromShortcuts(): Promise<boolean> {
  const shortcutApps = await collectShortcutApps().catch(() => [] as RawAppMatch[])
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
  if (!isWindows()) {
    diagnostics = { ok: false, stale: true, error: 'App index is only supported on Windows.', sourceCounts: {} }
    return diagnostics
  }
  await loadSnapshot()
  if (refreshRequest) return refreshRequest
  refreshRequest = (async () => {
    const startedAt = Date.now()
    const errors: string[] = []
    const [nativeApps, shortcutApps] = await Promise.all([
      queryNativeStartApps().catch((error) => {
        errors.push(`windows-search: ${error instanceof Error ? error.message : 'failed'}`)
        return [] as RawAppMatch[]
      }),
      collectShortcutApps().catch((error) => {
        errors.push(`shortcuts: ${error instanceof Error ? error.message : 'failed'}`)
        return [] as RawAppMatch[]
      }),
    ])
    const nextApps = mergeApps(nativeApps, shortcutApps, memoryApps)
    const updatedAt = Date.now()
    const dedupedApps = dedupeAppEntries(nextApps)
    if (dedupedApps.length > 0 || memoryApps.length === 0) {
      memoryApps = dedupedApps
      await saveSnapshot(memoryApps, updatedAt).catch((error) => {
        errors.push(`snapshot: ${error instanceof Error ? error.message : 'failed'}`)
      })
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
  if (!isWindows()) return
  void (async () => {
    await loadSnapshot()
    if (memoryApps.length === 0) {
      await bootstrapAppsFromShortcuts().catch(() => undefined)
    }
    if (diagnostics.stale || memoryApps.length === 0) {
      void refreshAppIndex()
    }
    startShortcutWatchers()
  })()
}

function debounceRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    void refreshAppIndex()
  }, 1_000)
}

function startShortcutWatchers(): void {
  if (watchersStarted || !isWindows()) return
  watchersStarted = true
  for (const root of shortcutRoots()) {
    try {
      const watcher = watch(root.path, { recursive: true }, debounceRefresh)
      watcher.on('error', () => undefined)
    } catch {
      // Watchers are opportunistic; missing shortcut roots are normal.
    }
  }
}

function scoreApp(appEntry: AppIndexEntry, query: string): number {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) return (appEntry.lastLaunchedAt ? 20 : 0) + Math.min(appEntry.launchCount ?? 0, 10)
  let score = scoreAppSearch(appEntry.name, appEntry.aliases, normalizedQuery)
  if (score === 0) return 0
  if (appEntry.lastLaunchedAt) score += 25
  score += Math.min(appEntry.launchCount ?? 0, 10)
  return score
}

export async function listApps(limit = 300): Promise<{ apps: RankedAppIndexEntry[]; diagnostics: AppIndexDiagnostics; count: number }> {
  await ensureAppsAvailable()
  const ranked = memoryApps
    .map((entry) => ({ ...entry, rank: scoreApp(entry, '') }))
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
  return { apps: ranked.slice(0, limit), diagnostics, count: memoryApps.length }
}

export async function findApps(query: string, limit = 40): Promise<{ matches: RankedAppIndexEntry[]; diagnostics: AppIndexDiagnostics }> {
  await ensureAppsAvailable()
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return { matches: [], diagnostics }

  void queryNativeStartApps(trimmedQuery, 1_000)
    .then((nativeMatches) => {
      if (nativeMatches.length === 0) return
      memoryApps = mergeApps(nativeMatches, memoryApps.map((entry) => ({
        name: entry.name,
        source: entry.source,
        path: entry.shortcutPath,
        targetPath: entry.targetPath,
        iconPath: entry.iconPath,
        args: entry.args,
        workingDirectory: entry.workingDirectory,
        appUserModelId: entry.appUserModelId,
      })), memoryApps)
      diagnostics = {
        ...diagnostics,
        sourceCounts: sourceCounts(memoryApps),
      }
      void saveSnapshot(memoryApps, Date.now())
    })
    .catch(() => undefined)

  const matches = memoryApps
    .map((entry) => ({ ...entry, rank: scoreApp(entry, trimmedQuery) }))
    .filter((entry) => entry.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
  return { matches, diagnostics }
}

export async function resolveAppIndexEntry(itemId: string, query = ''): Promise<AppIndexEntry | undefined> {
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

function runIconJob<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeIconJobs += 1
      job()
        .then(resolve, reject)
        .finally(() => {
          activeIconJobs -= 1
          const next = iconQueue.shift()
          if (next) next()
        })
    }
    if (activeIconJobs < ICON_CONCURRENCY) {
      start()
    } else {
      iconQueue.push(start)
    }
  })
}

async function getImageFileDataUrl(candidatePath: string): Promise<string | undefined> {
  const ext = path.extname(candidatePath).toLowerCase()
  const mime = ext === '.ico' ? 'image/x-icon' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null
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
    const fileIcon = await getImageFileDataUrl(candidatePath)
    if (fileIcon) return fileIcon
    try {
      const image = await app.getFileIcon(candidatePath, { size: 'normal' })
      if (!image.isEmpty()) return image.toDataURL()
    } catch {
      // Continue to the next candidate.
    }
  }
  return undefined
}

export function getCachedAppIcon(iconKey: string | undefined): string | undefined {
  if (!iconKey) return undefined
  if (iconCache.has(iconKey)) return iconCache.get(iconKey)
  if (!iconRequests.has(iconKey)) {
    const request = runIconJob(() => loadIcon(iconKey))
      .then((iconDataUrl) => {
        iconCache.set(iconKey, iconDataUrl)
        return iconDataUrl
      })
      .catch(() => {
        iconCache.set(iconKey, undefined)
        return undefined
      })
      .finally(() => {
        iconRequests.delete(iconKey)
      })
    iconRequests.set(iconKey, request)
  }
  return undefined
}

export function __resetAppIndexForTests(): void {
  memoryApps = []
  diagnostics = { ok: true, stale: true, sourceCounts: {} }
  loadedSnapshot = false
  refreshRequest = null
  iconCache.clear()
  iconRequests.clear()
  iconQueue.splice(0, iconQueue.length)
  activeIconJobs = 0
  watchersStarted = false
  if (refreshTimer) clearTimeout(refreshTimer)
}
