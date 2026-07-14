import { createHmac, randomBytes } from 'crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

import {
  parseCommandCenterQuery,
  queryAllowsSource,
  type ParsedCommandCenterQuery,
} from '../src/commandCenter/search'

const MAX_RESULTS = 40
const QUERY_TIMEOUT_MS = 650
const RESULT_CACHE_TTL_MS = 5 * 60 * 1000
const MAX_QUERY_LENGTH = 120
const WINDOWS_SEARCH_IDLE_DISPOSE_MS = 2 * 60 * 1000

interface WindowsSearchItemBase {
  id: string
  title: string
  subtitle: string
  aliases: string[]
  extension?: string
  modifiedAt?: number
  size?: number
  score: number
  matchReasons: string[]
}

export type WindowsSearchItem =
  | (WindowsSearchItemBase & { type: 'file'; hint: 'File' })
  | (WindowsSearchItemBase & { type: 'folder'; hint: 'Folder' })

export interface WindowsSearchResponse {
  files: WindowsSearchItem[]
  diagnostics: {
    ok: boolean
    available: boolean
    disabled?: boolean
    error?: string
    durationMs?: number
  }
}

interface HelperRow {
  name?: unknown
  url?: unknown
  kind?: unknown
  extension?: unknown
  modified?: unknown
  size?: unknown
  rank?: unknown
}

interface PendingRequest {
  resolve: (rows: HelperRow[]) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface CachedPath {
  path: string
  expiresAt: number
}

const HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$connection = $null
function Send-Result($value) {
  [Console]::Out.WriteLine(($value | ConvertTo-Json -Compress -Depth 5))
  [Console]::Out.Flush()
}
while (($line = [Console]::In.ReadLine()) -ne $null) {
  try {
    $request = $line | ConvertFrom-Json
    if ($request.type -eq 'stop') { break }
    if ($null -eq $connection) {
      $service = Get-Service -Name WSearch -ErrorAction SilentlyContinue
      if ($null -eq $service -or $service.Status -ne 'Running') {
        Send-Result @{ id = $request.id; ok = $false; disabled = $true; error = 'Windows Search indexing is disabled or stopped.' }
        continue
      }
      $connection = New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
      $connection.Open()
    }
    $command = $connection.CreateCommand()
    $command.CommandText = [string]$request.sql
    $reader = $command.ExecuteReader()
    $rows = @()
    while ($reader.Read()) {
      $rows += @{
        name = if ($reader.IsDBNull(0)) { $null } else { [string]$reader.GetValue(0) }
        url = if ($reader.IsDBNull(1)) { $null } else { [string]$reader.GetValue(1) }
        kind = if ($reader.IsDBNull(2)) { $null } else { [string]$reader.GetValue(2) }
        extension = if ($reader.IsDBNull(3)) { $null } else { [string]$reader.GetValue(3) }
        modified = if ($reader.IsDBNull(4)) { $null } else { ([DateTime]$reader.GetValue(4)).ToUniversalTime().ToString('o') }
        size = if ($reader.IsDBNull(5)) { $null } else { [long]$reader.GetValue(5) }
        rank = if ($reader.IsDBNull(6)) { 0 } else { [int]$reader.GetValue(6) }
      }
    }
    $reader.Close()
    Send-Result @{ id = $request.id; ok = $true; rows = $rows }
  } catch {
    Send-Result @{ id = $request.id; ok = $false; error = $_.Exception.Message }
    if ($null -ne $connection) { try { $connection.Close() } catch {}; $connection = $null }
  }
}
if ($null -ne $connection) { try { $connection.Close() } catch {} }
`

let helper: ChildProcessWithoutNullStreams | null = null
let helperSequence = 0
let helperDisabled = false
let helperError: string | undefined
let helperIdleTimer: ReturnType<typeof setTimeout> | null = null
const pending = new Map<number, PendingRequest>()
const resultPaths = new Map<string, CachedPath>()
const opaqueKey = randomBytes(32)

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  return path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function disposeHelper(error?: Error): void {
  if (helperIdleTimer) {
    clearTimeout(helperIdleTimer)
    helperIdleTimer = null
  }
  const active = helper
  helper = null
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject(error ?? new Error('Windows Search helper stopped.'))
  }
  pending.clear()
  if (active && !active.killed) active.kill()
}

function scheduleHelperIdleDispose(): void {
  if (helperIdleTimer) clearTimeout(helperIdleTimer)
  helperIdleTimer = setTimeout(() => {
    helperIdleTimer = null
    if (pending.size > 0) {
      scheduleHelperIdleDispose()
      return
    }
    disposeWindowsSearch()
  }, WINDOWS_SEARCH_IDLE_DISPOSE_MS)
}

function ensureHelper(): ChildProcessWithoutNullStreams {
  if (helper && !helper.killed) return helper
  const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64')
  const child = spawn(
    powershellPath(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  )
  helper = child
  const lines = readline.createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    let response: Record<string, unknown>
    try {
      response = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    const id = typeof response.id === 'number' ? response.id : -1
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    clearTimeout(request.timer)
    if (response.disabled === true) {
      helperDisabled = true
      helperError = typeof response.error === 'string' ? response.error : undefined
      request.reject(new Error(helperError || 'Windows Search indexing is disabled.'))
      return
    }
    if (response.ok !== true) {
      request.reject(new Error(typeof response.error === 'string' ? response.error : 'Windows Search failed.'))
      return
    }
    helperDisabled = false
    helperError = undefined
    request.resolve(Array.isArray(response.rows) ? (response.rows as HelperRow[]) : [])
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 2_000) stderr += String(chunk)
  })
  child.once('exit', () => {
    if (helper === child) disposeHelper(new Error(stderr.trim() || 'Windows Search helper exited.'))
  })
  child.once('error', (error) => {
    helperError = error.message
    if (helper === child) disposeHelper(error)
  })
  return child
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
}

function parseSizeFilter(value: string): string | undefined {
  const match = value.match(/^(<=|>=|<|>|=)?(\d{1,9})(b|kb|mb|gb)?$/i)
  if (!match) return undefined
  const multiplier = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[
    (match[3] || 'b').toLowerCase() as 'b'
  ]
  return `System.Size ${match[1] || '='} ${Number(match[2]) * multiplier}`
}

function parseModifiedFilter(value: string, now = new Date()): string | undefined {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (value === 'today') return `System.DateModified >= '${start.toISOString()}'`
  if (value === 'yesterday') {
    const end = new Date(start)
    start.setDate(start.getDate() - 1)
    return `System.DateModified >= '${start.toISOString()}' AND System.DateModified < '${end.toISOString()}'`
  }
  if (value === 'this-week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return `System.DateModified >= '${start.toISOString()}'`
  }
  if (value === 'this-month') {
    start.setDate(1)
    return `System.DateModified >= '${start.toISOString()}'`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) {
      const end = new Date(parsed)
      end.setDate(end.getDate() + 1)
      return `System.DateModified >= '${parsed.toISOString()}' AND System.DateModified < '${end.toISOString()}'`
    }
  }
  return undefined
}

export function compileWindowsSearchSql(
  value: string | ParsedCommandCenterQuery,
  limit = MAX_RESULTS
): string | null {
  const query = typeof value === 'string' ? parseCommandCenterQuery(value) : value
  if (!queryAllowsSource(query, 'file') && !queryAllowsSource(query, 'folder')) return null
  if (query.normalizedText.length < 2) return null
  const clauses = ["System.ItemUrl LIKE 'file:%'", 'System.ItemNameDisplay IS NOT NULL']
  for (const term of [...query.phrases, ...query.terms]) {
    const safe = escapeSqlLiteral(stripControlCharacters(term).slice(0, 80))
    if (safe) clauses.push(`FREETEXT(*, '${safe}')`)
  }
  for (const term of query.excluded) {
    const safe = escapeSqlLiteral(stripControlCharacters(term).slice(0, 80))
    if (safe) clauses.push(`NOT FREETEXT(*, '${safe}')`)
  }
  if (query.sources.length === 1 && query.sources[0] === 'folder') clauses.push("System.Kind = 'folder'")
  if (query.sources.length === 1 && query.sources[0] === 'file') clauses.push("System.Kind <> 'folder'")
  if (query.filters.kind) {
    const kinds: Record<string, string> = {
      document: 'document', picture: 'picture', music: 'music', video: 'video', folder: 'folder',
    }
    const kind = kinds[query.filters.kind]
    if (kind) clauses.push(`System.Kind = '${kind}'`)
  }
  if (query.filters.ext && /^[a-z0-9]{1,12}$/i.test(query.filters.ext.replace(/^\./, ''))) {
    clauses.push(`System.FileExtension = '.${query.filters.ext.replace(/^\./, '').toLowerCase()}'`)
  }
  if (query.filters.modified) {
    const modified = parseModifiedFilter(query.filters.modified)
    if (modified) clauses.push(modified)
  }
  if (query.filters.size) {
    const size = parseSizeFilter(query.filters.size)
    if (size) clauses.push(size)
  }
  const boundedLimit = Math.max(1, Math.min(MAX_RESULTS, Math.trunc(limit)))
  return `SELECT TOP ${boundedLimit} System.ItemNameDisplay, System.ItemUrl, System.Kind, System.FileExtension, System.DateModified, System.Size, System.Search.Rank FROM SystemIndex WHERE ${clauses.join(' AND ')} ORDER BY System.Search.Rank DESC, System.DateModified DESC`
}

function requestRows(sql: string): Promise<HelperRow[]> {
  const child = ensureHelper()
  scheduleHelperIdleDispose()
  const id = ++helperSequence
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Windows Search timed out.'))
    }, QUERY_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(`${JSON.stringify({ id, sql })}\n`)
  })
}

function filePathFromUrl(value: string): string | undefined {
  try {
    const resolved = fileURLToPath(value)
    if (!path.isAbsolute(resolved) || resolved.includes('\0')) return undefined
    return path.normalize(resolved)
  } catch {
    return undefined
  }
}

function opaqueId(filePath: string): string {
  return `native:${createHmac('sha256', opaqueKey).update(filePath.toLowerCase()).digest('base64url').slice(0, 24)}`
}

function cleanupResultCache(): void {
  const now = Date.now()
  for (const [id, entry] of resultPaths) if (entry.expiresAt <= now) resultPaths.delete(id)
}

export function resolveWindowsSearchPath(itemId: string): string | undefined {
  cleanupResultCache()
  return resultPaths.get(itemId)?.path
}

export async function searchWindowsIndex(queryValue: unknown): Promise<WindowsSearchResponse> {
  const startedAt = Date.now()
  if (process.platform !== 'win32') {
    return { files: [], diagnostics: { ok: false, available: false, error: 'Windows Search is only available on Windows.' } }
  }
  if (typeof queryValue !== 'string' || queryValue.length > MAX_QUERY_LENGTH) {
    return { files: [], diagnostics: { ok: false, available: false, error: 'Invalid Windows Search query.' } }
  }
  const parsed = parseCommandCenterQuery(queryValue)
  const sql = compileWindowsSearchSql(parsed)
  if (!sql) return { files: [], diagnostics: { ok: true, available: true, durationMs: 0 } }
  try {
    const rows = await requestRows(sql)
    cleanupResultCache()
    const files = rows.flatMap((row): WindowsSearchItem[] => {
      if (typeof row.name !== 'string' || typeof row.url !== 'string') return []
      const filePath = filePathFromUrl(row.url)
      if (!filePath) return []
      const isFolder = String(row.kind).toLowerCase().includes('folder')
      const id = opaqueId(filePath)
      resultPaths.set(id, { path: filePath, expiresAt: Date.now() + RESULT_CACHE_TTL_MS })
      const rank = typeof row.rank === 'number' && Number.isFinite(row.rank) ? row.rank : 0
      const base: WindowsSearchItemBase = {
        id,
        title: row.name,
        subtitle: path.basename(path.dirname(filePath)),
        aliases: [row.name, String(row.extension ?? '')].filter(Boolean),
        extension: typeof row.extension === 'string' ? row.extension : undefined,
        modifiedAt: typeof row.modified === 'string' ? Date.parse(row.modified) || undefined : undefined,
        size: typeof row.size === 'number' && Number.isFinite(row.size) ? row.size : undefined,
        score: Math.max(1, Math.min(1_000, rank)),
        matchReasons: ['windows-index'],
      }
      return [isFolder ? { ...base, type: 'folder', hint: 'Folder' } : { ...base, type: 'file', hint: 'File' }]
    })
    return { files, diagnostics: { ok: true, available: true, durationMs: Date.now() - startedAt } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Windows Search failed.'
    return {
      files: [],
      diagnostics: {
        ok: false,
        available: false,
        disabled: helperDisabled || /disabled|stopped/i.test(message),
        error: helperError || message,
        durationMs: Date.now() - startedAt,
      },
    }
  }
}

export function warmWindowsSearch(): void {
  if (process.platform !== 'win32') return
  try {
    ensureHelper()
    scheduleHelperIdleDispose()
  } catch {
    // Surfaced on the first query.
  }
}

export function disposeWindowsSearch(): void {
  if (helper?.stdin.writable) helper.stdin.write(`${JSON.stringify({ type: 'stop' })}\n`)
  disposeHelper()
  resultPaths.clear()
  helperDisabled = false
  helperError = undefined
}
