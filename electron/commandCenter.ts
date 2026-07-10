import { clipboard, globalShortcut, ipcMain, shell } from 'electron'
import os from 'os'
import path from 'path'

import { COMMAND_CENTER_EMOJI_SET } from '../src/commandCenter/emojis'
import { scoreWindowSearch } from '../src/commandCenter/search'
import {
  clearAppIconCache,
  getCachedAppIcon,
  isAppIconPending,
  peekCachedAppIcon,
  refreshAppIndex,
  warmAppIndex,
} from './appIndexService'
import { getSessionMetadataAsync } from './chatStore'
import {
  deleteCommandCenterWorkflow,
  listCommandCenterWorkflows,
  markCommandCenterWorkflowRun,
  saveCommandCenterWorkflow,
  type CommandCenterWorkflow,
} from './commandCenterWorkflows'
import {
  createMainWindow,
  destroyCommandCenterWindow,
  getMainWindow,
  hideCommandCenterWindow,
  setCommandCenterWindowLayout,
  showCommandCenterWindow,
  toggleCommandCenterWindow,
} from './windows'
import {
  executeSystemActiveWindow,
  executeSystemOpenPath,
  executeSystemSettingsOpen,
  executeSystemStatus,
  executeWindowSnap,
} from './tools/os-integration'
import { performType } from './tools/computer-use/actions'
import { executeAppFind, executeAppLaunch, executeAppList } from './tools/app-management'
import { executeWindowClose, executeWindowFocus, executeWindowList } from './tools/window-management'

const COMMAND_CENTER_SHORTCUT = 'CommandOrControl+Shift+Space'
const COMMAND_CENTER_FALLBACK_SHORTCUT = 'CommandOrControl+Alt+Space'
const MAX_CLIPBOARD_CONTEXT_LENGTH = 4_000
const MAX_INDEX_QUERY_LENGTH = 120
const COMMAND_CENTER_ACTIONS = [
  { id: 'snap-left', label: 'Snap left', kind: 'window', aliases: ['tile left'] },
  { id: 'snap-right', label: 'Snap right', kind: 'window', aliases: ['tile right'] },
  {
    id: 'maximize-window',
    label: 'Maximize',
    kind: 'window',
    aliases: ['fullscreen', 'full screen'],
  },
  {
    id: 'system-status',
    label: 'System status',
    kind: 'system',
    aliases: ['battery', 'disk', 'network status'],
  },
  {
    id: 'clipboard-to-chat',
    label: 'Ask about clipboard',
    kind: 'clipboard',
    aliases: ['paste', 'copied text'],
  },
  { id: 'focus-zuraai', label: 'Focus ZuraAI', kind: 'app', aliases: ['show zura', 'open zura'] },
  {
    id: 'settings-display',
    label: 'Display settings',
    kind: 'settings',
    aliases: ['screen', 'monitor'],
  },
  {
    id: 'settings-sound',
    label: 'Sound settings',
    kind: 'settings',
    aliases: ['audio settings', 'speaker'],
  },
  {
    id: 'settings-network',
    label: 'Network settings',
    kind: 'settings',
    aliases: ['wifi', 'wi-fi', 'internet'],
  },
  { id: 'settings-bluetooth', label: 'Bluetooth settings', kind: 'settings', aliases: ['devices'] },
  {
    id: 'open-downloads',
    label: 'Open Downloads',
    kind: 'filesystem',
    aliases: ['downloads folder'],
  },
  {
    id: 'emoji-picker',
    label: 'Emojis',
    kind: 'additional',
    aliases: ['emoji', 'emoticon', 'smiley', 'symbols'],
  },
] as const

/**
 * Secondary per-item actions (Raycast-style Actions menu). Fixed allowlist only —
 * never accept freeform commands, shell strings, or renderer-supplied paths.
 * Paths always resolve from the last built index item in main.
 */
const COMMAND_CENTER_ITEM_ACTIONS = [
  'open',
  'focus-window',
  'show-in-folder',
  'copy-path',
  'copy-name',
  'reveal-shortcut',
  'copy-dir',
  'force-quit',
] as const

type CommandCenterItemActionId = (typeof COMMAND_CENTER_ITEM_ACTIONS)[number]

let extensionEnabled = false
let shortcutRegistered = false
let registeredShortcut: string | null = null

const INDEX_STATIC_CACHE_MS = 3_000
/** Serve a cached empty-query index for this long without rebuilding. */
const BROWSE_INDEX_FRESH_MS = 12_000
/**
 * If a browse index exists but is older than FRESH, still return it immediately
 * and rebuild in the background (stale-while-revalidate) until this age.
 * Beyond this, wait for a full rebuild so results cannot stay arbitrarily old.
 */
const BROWSE_INDEX_STALE_MAX_MS = 60_000

interface IndexStaticCache {
  at: number
  workflows: Awaited<ReturnType<typeof listCommandCenterWorkflows>>
  windows: WindowMatch[]
  chats: Awaited<ReturnType<typeof getSessionMetadataAsync>>
}

let indexStaticCache: IndexStaticCache | null = null

// Items from the most recently built index, keyed by id. The renderer rebuilds
// the index on every keystroke, so this is fresh for whatever the user can see.
// executeIndexItem reads from here to avoid rebuilding the entire index (which
// spawns PowerShell to re-enumerate windows/apps) just to run one action.
let indexItemCache = new Map<string, CommandCenterIndexItem>()

/** Last successful empty-query Command Center index (browse / default open). */
let browseIndexCache: { at: number; index: CommandCenterIndex } | null = null
let browseIndexInflight: Promise<CommandCenterIndex> | null = null

function clearCommandCenterRuntimeCaches(): void {
  indexStaticCache = null
  indexItemCache = new Map()
  browseIndexCache = null
  browseIndexInflight = null
  clearAppIconCache()
}

/** Re-attach icon data-URLs from the main icon cache without rebuilding the index. */
function withFreshBrowseIcons(index: CommandCenterIndex): CommandCenterIndex {
  return {
    ...index,
    apps: index.apps.map((app) => {
      if (app.type !== 'app' || !app.iconKey) return app
      const peeked = peekCachedAppIcon(app.iconKey)
      const iconDataUrl = peeked ?? app.iconDataUrl
      return {
        ...app,
        iconDataUrl,
        iconPending: isAppIconPending(app.iconKey),
      }
    }),
  }
}

function startBrowseIndexBuild(): Promise<CommandCenterIndex> {
  if (browseIndexInflight) return browseIndexInflight
  browseIndexInflight = buildCommandCenterIndex('')
    .then((index) => {
      browseIndexCache = { at: Date.now(), index }
      return index
    })
    .finally(() => {
      browseIndexInflight = null
    })
  return browseIndexInflight
}

/**
 * Empty-query index with a small in-memory SWR cache so reopen/show does not
 * always wait on PowerShell app/window enumeration.
 */
async function resolveBrowseIndex(): Promise<CommandCenterIndex> {
  const now = Date.now()
  const cached = browseIndexCache
  if (cached) {
    const age = now - cached.at
    if (age <= BROWSE_INDEX_FRESH_MS) {
      return withFreshBrowseIcons(cached.index)
    }
    if (age <= BROWSE_INDEX_STALE_MAX_MS) {
      // Return immediately; refresh in the background for the next caller.
      void startBrowseIndexBuild().catch(() => undefined)
      return withFreshBrowseIcons(cached.index)
    }
  }
  const index = await startBrowseIndexBuild()
  return withFreshBrowseIcons(index)
}

/** Kick off a browse-index build if missing/stale so show→getIndex often hits cache. */
function prefetchBrowseIndex(): void {
  const cached = browseIndexCache
  if (cached && Date.now() - cached.at <= BROWSE_INDEX_FRESH_MS) return
  if (browseIndexInflight) return
  void startBrowseIndexBuild().catch(() => undefined)
}

type CommandCenterActionId = (typeof COMMAND_CENTER_ACTIONS)[number]['id']

type CommandCenterIndexItem =
  | {
      id: string
      type: 'workflow'
      title: string
      subtitle?: string
      hint: 'Workflow'
      aliases: string[]
      workflow: CommandCenterWorkflow
    }
  | {
      id: string
      type: 'app'
      title: string
      subtitle?: string
      hint: 'Application'
      aliases: string[]
      appPath?: string
      shortcutPath?: string
      targetPath?: string
      source?: string
      launchStrategy?: 'appUserModelId' | 'shortcutPath'
      appUserModelId?: string
      iconKey?: string
      iconDataUrl?: string
      /** True while main is still extracting this app's icon. */
      iconPending?: boolean
      existingWindow?: WindowMatch
      rank?: number
    }
  | {
      id: string
      type: 'window'
      title: string
      subtitle?: string
      hint: 'Window'
      aliases: string[]
      hwnd: number
      processName: string
      processId: number
    }
  | {
      id: string
      type: 'action'
      title: string
      subtitle?: string
      hint: 'Action' | 'Command'
      aliases: string[]
      actionId: CommandCenterActionId
    }
  | {
      id: string
      type: 'chat'
      title: string
      subtitle?: string
      hint: 'Chat'
      aliases: string[]
      sessionId: string
    }

interface CommandCenterIndex {
  workflows: CommandCenterIndexItem[]
  apps: CommandCenterIndexItem[]
  windows: CommandCenterIndexItem[]
  actions: CommandCenterIndexItem[]
  chats: CommandCenterIndexItem[]
  diagnostics?: {
    apps?: {
      ok: boolean
      stale?: boolean
      error?: string
      sourceCounts?: Record<string, number>
      lastRefreshAt?: number
      refreshDurationMs?: number
    }
  }
}

interface WindowMatch {
  hwnd: number
  title: string
  processName: string
  processId: number
  path?: string
}

function compactText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function indexQuery(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_INDEX_QUERY_LENGTH) : ''
}

function compactExecutableName(value: string | undefined): string {
  if (!value) return ''
  return compactText(path.basename(value, path.extname(value)))
}

// An "installed" app is backed by a real executable/shortcut on disk. Native
// Windows/UWP/store surfaces (Settings, Store, etc.) only carry an
// appUserModelId with no target or shortcut path. We hide those from the default
// browse list; they still return via the live search path (executeAppFind).
function isInstalledApp(app: Record<string, unknown>): boolean {
  const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0
  return hasText(app.targetPath) || hasText(app.shortcutPath) || hasText(app.path)
}

function normalizeWindows(raw: unknown): WindowMatch[] {
  if (!raw || typeof raw !== 'object') return []
  const windows = (raw as Record<string, unknown>).windows
  if (!Array.isArray(windows)) return []
  return windows.flatMap((entry): WindowMatch[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    if (
      typeof record.hwnd !== 'number' ||
      typeof record.title !== 'string' ||
      typeof record.processName !== 'string' ||
      typeof record.processId !== 'number'
    ) {
      return []
    }
    return [
      {
        hwnd: record.hwnd,
        title: record.title,
        processName: record.processName,
        processId: record.processId,
        path: typeof record.path === 'string' && record.path.trim() ? record.path : undefined,
      },
    ]
  })
}

function publicWindowMatch(window: WindowMatch): Omit<WindowMatch, 'path'> {
  return {
    hwnd: window.hwnd,
    title: window.title,
    processName: window.processName,
    processId: window.processId,
  }
}

function findExistingAppWindow(
  appName: string,
  windows: WindowMatch[],
  executableNames: string[] = []
): WindowMatch | undefined {
  const appKey = compactText(appName)
  const candidateKeys = Array.from(
    new Set([appKey, ...executableNames.map(compactExecutableName)])
  ).filter((key) => key.length >= 3 && key !== 'update')

  return windows.find((window) => {
    const processKey = compactExecutableName(window.processName)
    if (processKey.length < 3) return false
    return candidateKeys.some((candidateKey) => {
      return (
        processKey === candidateKey ||
        processKey.includes(candidateKey) ||
        candidateKey.includes(processKey)
      )
    })
  })
}

async function getWindowMatches(): Promise<WindowMatch[]> {
  const result = await executeWindowList()
  return result.success ? normalizeWindows(result.data) : []
}

async function getIndexStaticInputs(): Promise<IndexStaticCache> {
  const stale = !indexStaticCache || Date.now() - indexStaticCache.at > INDEX_STATIC_CACHE_MS
  if (!stale && indexStaticCache) {
    return indexStaticCache
  }
  const [workflows, windows, chats] = await Promise.all([
    listCommandCenterWorkflows(),
    getWindowMatches(),
    getSessionMetadataAsync().catch(() => []),
  ])
  indexStaticCache = { at: Date.now(), workflows, windows, chats }
  return indexStaticCache
}

function parseProcessStartExe(args: string | undefined): string | undefined {
  const match = args?.match(/--processStart\s+(?:"([^"]+)"|([^\s]+))/i)
  return match?.[1] || match?.[2] || undefined
}

function appsFromToolResult(
  result: Awaited<ReturnType<typeof executeAppList | typeof executeAppFind>>
): Array<Record<string, unknown>> {
  if (!result.success || !result.data || typeof result.data !== 'object') return []
  const data = result.data as Record<string, unknown>
  if (Array.isArray(data.apps)) return data.apps as Array<Record<string, unknown>>
  if (Array.isArray(data.matches)) return data.matches as Array<Record<string, unknown>>
  return []
}

function appDiagnosticsFromToolResult(
  result: Awaited<ReturnType<typeof executeAppList | typeof executeAppFind>>
): CommandCenterIndex['diagnostics'] {
  if (!result.success) {
    console.warn('[CommandCenter] App index failed:', result.error)
    return {
      apps: {
        ok: false,
        error: result.error || 'App index failed.',
        sourceCounts: {},
      },
    }
  }
  if (!result.data || typeof result.data !== 'object') {
    return {
      apps: {
        ok: true,
        sourceCounts: {},
      },
    }
  }
  const diagnostics = (result.data as Record<string, unknown>).diagnostics
  if (!diagnostics || typeof diagnostics !== 'object') {
    return {
      apps: {
        ok: true,
        sourceCounts: {},
      },
    }
  }
  const record = diagnostics as Record<string, unknown>
  const sourceCounts =
    record.sourceCounts && typeof record.sourceCounts === 'object'
      ? (Object.fromEntries(
          Object.entries(record.sourceCounts as Record<string, unknown>).filter(
            ([, value]) => typeof value === 'number'
          )
        ) as Record<string, number>)
      : {}
  const ok = record.ok !== false
  const error = typeof record.error === 'string' ? record.error : undefined
  if (!ok || error) {
    console.warn('[CommandCenter] App index diagnostics:', error ?? 'partial failure')
  }
  return {
    apps: {
      ok,
      stale: record.stale === true,
      error,
      sourceCounts,
      lastRefreshAt: typeof record.lastRefreshAt === 'number' ? record.lastRefreshAt : undefined,
      refreshDurationMs:
        typeof record.refreshDurationMs === 'number' ? record.refreshDurationMs : undefined,
    },
  }
}

async function buildCommandCenterIndex(query: unknown = ''): Promise<CommandCenterIndex> {
  const appQuery = indexQuery(query)
  const [staticInputs, appsResult] = await Promise.all([
    getIndexStaticInputs(),
    appQuery ? executeAppFind({ query: appQuery }) : executeAppList(),
  ])
  const { workflows, windows, chats } = staticInputs

  const dedupedApps = new Map<string, Record<string, unknown>>()
  for (const app of appsFromToolResult(appsResult)) {
    if (typeof app.name !== 'string') continue
    if (
      typeof app.path !== 'string' &&
      typeof app.appUserModelId !== 'string' &&
      typeof app.shortcutPath !== 'string'
    )
      continue
    const appUserModelId = typeof app.appUserModelId === 'string' ? app.appUserModelId : undefined
    const targetPath = typeof app.targetPath === 'string' ? app.targetPath : undefined
    const shortcutPath =
      typeof app.shortcutPath === 'string'
        ? app.shortcutPath
        : typeof app.path === 'string'
          ? app.path
          : undefined
    const dedupeKey = appUserModelId ?? targetPath ?? shortcutPath ?? String(app.name)
    if (!dedupedApps.has(dedupeKey)) {
      dedupedApps.set(dedupeKey, app)
    }
  }

  // Default browse list shows installed apps only; a live query keeps native
  // Windows/UWP results so the user can still find them by searching.
  const candidateApps = Array.from(dedupedApps.values())
  const browsableApps = appQuery ? candidateApps : candidateApps.filter(isInstalledApp)

  // Rank first, then warm icons only for the rows the overlay is likely to show.
  // Extracting icons for the full catalogue on every poll thrashes the LRU cache
  // and makes app icons blink as entries fall in and out.
  const rankedAppRows = (
    await Promise.all(
      browsableApps
        .slice(0, appQuery ? 40 : 120)
        .map(async (app) => {
          const name = String(app.name)
          const shortcutPath =
            typeof app.shortcutPath === 'string'
              ? String(app.shortcutPath)
              : typeof app.path === 'string'
                ? String(app.path)
                : undefined
          const appPath = shortcutPath
          const appUserModelId =
            typeof app.appUserModelId === 'string' ? String(app.appUserModelId) : undefined
          const targetPath = typeof app.targetPath === 'string' ? app.targetPath : undefined
          const args = typeof app.args === 'string' ? app.args : undefined
          const source = typeof app.source === 'string' ? app.source : undefined
          const indexedIconKey = typeof app.iconKey === 'string' ? app.iconKey : undefined
          const rank = typeof app.rank === 'number' ? app.rank : undefined
          const id =
            typeof app.id === 'string'
              ? app.id
              : `app:${Buffer.from(appPath ?? appUserModelId ?? name).toString('base64url')}`
          const processStartExe = parseProcessStartExe(args)
          const existingWindow = findExistingAppWindow(name, windows, [
            targetPath ?? '',
            processStartExe ?? '',
          ])
          const iconKey = indexedIconKey ?? targetPath ?? existingWindow?.path
          const launchStrategy: 'appUserModelId' | 'shortcutPath' = appUserModelId
            ? 'appUserModelId'
            : 'shortcutPath'
          return {
            id,
            type: 'app' as const,
            title: name,
            subtitle: existingWindow ? existingWindow.title : undefined,
            hint: 'Application' as const,
            aliases: [name, appUserModelId ?? ''].filter(Boolean),
            appPath,
            shortcutPath,
            targetPath,
            source,
            launchStrategy,
            appUserModelId,
            iconKey,
            iconDataUrl: undefined as string | undefined,
            iconPending: false,
            existingWindow: existingWindow ? publicWindowMatch(existingWindow) : undefined,
            rank,
          }
        })
    )
  ).sort((a, b) => {
    const rankA = (a.rank ?? 0) + (a.existingWindow ? 50 : 0)
    const rankB = (b.rank ?? 0) + (b.existingWindow ? 50 : 0)
    return rankB - rankA || a.title.localeCompare(b.title)
  })

  // Browse shows ~8 apps; search lists up to 40. Warm a little past the
  // visible window so scrolling/search handoff still has icons ready.
  const iconWarmCount = appQuery ? rankedAppRows.length : Math.min(rankedAppRows.length, 32)
  const appRows = rankedAppRows.map((row, index) => {
    if (!row.iconKey) return row
    if (index < iconWarmCount) {
      const iconDataUrl = getCachedAppIcon(row.iconKey)
      return {
        ...row,
        iconDataUrl,
        iconPending: isAppIconPending(row.iconKey),
      }
    }
    // Already-cached icons may still surface for lower-ranked rows without
    // starting new extraction work that would thrash the cache.
    return {
      ...row,
      iconDataUrl: peekCachedAppIcon(row.iconKey),
      iconPending: false,
    }
  })

  // Any live window that already belongs to an installed-app row is folded into
  // that app entry (which focuses the window on click and is boosted to the top).
  // Drop those windows from the standalone "Windows" group so a running app is
  // shown once, prioritized as the app row, instead of duplicated here.
  const appMatchedHwnds = new Set<number>(
    appRows
      .map((row) => row.existingWindow?.hwnd)
      .filter((hwnd): hwnd is number => typeof hwnd === 'number')
  )
  const unmatchedWindows = windows.filter((window) => !appMatchedHwnds.has(window.hwnd))

  const index: CommandCenterIndex = {
    workflows: workflows
      .slice()
      .sort((a, b) => (b.lastRunAt ?? b.updatedAt) - (a.lastRunAt ?? a.updatedAt))
      .map((workflow) => ({
        id: `workflow:${workflow.id}`,
        type: 'workflow' as const,
        title: workflow.name,
        subtitle:
          workflow.description ??
          `${workflow.steps.length} step${workflow.steps.length === 1 ? '' : 's'}`,
        hint: 'Workflow' as const,
        aliases: workflow.aliases,
        workflow,
      })),
    apps: appRows,
    windows: (appQuery
      ? unmatchedWindows
          .map((window) => ({
            window,
            rank: scoreWindowSearch(window.title, window.processName, appQuery),
          }))
          .filter((entry) => entry.rank > 0)
          .sort((a, b) => b.rank - a.rank || a.window.title.localeCompare(b.window.title))
          .map((entry) => entry.window)
      : unmatchedWindows
    )
      .slice(0, appQuery ? 20 : 80)
      .map((window) => ({
        id: `window:${window.hwnd}`,
        type: 'window' as const,
        title: window.title,
        subtitle: window.processName,
        hint: 'Window' as const,
        aliases: [window.title, window.processName],
        hwnd: window.hwnd,
        processName: window.processName,
        processId: window.processId,
      })),
    actions: COMMAND_CENTER_ACTIONS.map((action) => ({
      id: `action:${action.id}`,
      type: 'action' as const,
      title: action.label,
      subtitle: action.id === 'emoji-picker' ? 'Search and paste emoji' : action.kind,
      hint: action.id === 'emoji-picker' ? ('Command' as const) : ('Action' as const),
      aliases: [...(action.aliases ?? []), action.kind],
      actionId: action.id,
    })),
    chats: chats.slice(0, 40).map((chat) => ({
      id: `chat:${chat.id}`,
      type: 'chat' as const,
      title: chat.title,
      subtitle: `${chat.messageCount} message${chat.messageCount === 1 ? '' : 's'}`,
      hint: 'Chat' as const,
      aliases: [chat.title, ...(chat.tags ?? [])],
      sessionId: chat.id,
    })),
    diagnostics: appDiagnosticsFromToolResult(appsResult),
  }

  indexItemCache = new Map(flattenIndex(index).map((entry) => [entry.id, entry]))
  return index
}

async function getActiveWindowContext(): Promise<unknown | undefined> {
  const result = await executeSystemActiveWindow()
  return result.success ? result.data : undefined
}

async function sendCommandToMainWindow(text: string, sessionId?: string): Promise<void> {
  const win = getMainWindow() ?? createMainWindow()
  const payload = {
    text,
    receivedAt: Date.now(),
    activeWindow: await getActiveWindowContext(),
    sessionId,
  }

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('command-center:command', payload)
      }
    })
  } else {
    win.webContents.send('command-center:command', payload)
  }

  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
}

function registerShortcut(): boolean {
  if (shortcutRegistered) return true
  const onShortcut = () => {
    if (!extensionEnabled) return
    // Prefetch index in parallel with window show so the renderer's first
    // getIndex often hits the browse SWR cache.
    prefetchBrowseIndex()
    toggleCommandCenterWindow()
    warmAppIndex()
  }
  const shortcuts = [COMMAND_CENTER_SHORTCUT, COMMAND_CENTER_FALLBACK_SHORTCUT]
  for (const shortcut of shortcuts) {
    if (globalShortcut.register(shortcut, onShortcut)) {
      registeredShortcut = shortcut
      shortcutRegistered = true
      return true
    }
  }
  registeredShortcut = null
  shortcutRegistered = false
  return shortcutRegistered
}

function isCommandCenterActionId(value: unknown): value is CommandCenterActionId {
  return typeof value === 'string' && COMMAND_CENTER_ACTIONS.some((action) => action.id === value)
}

async function executeCommandCenterAction(actionId: CommandCenterActionId) {
  switch (actionId) {
    case 'snap-left':
      return executeWindowSnap({ preset: 'left', autoApprove: true })
    case 'snap-right':
      return executeWindowSnap({ preset: 'right', autoApprove: true })
    case 'maximize-window':
      return executeWindowSnap({ preset: 'maximize', autoApprove: true })
    case 'system-status':
      return executeSystemStatus()
    case 'clipboard-to-chat': {
      const text = clipboard.readText().trim()
      if (!text) {
        return { success: false, error: 'Clipboard does not contain text.' }
      }
      const clipped =
        text.length > MAX_CLIPBOARD_CONTEXT_LENGTH
          ? `${text.slice(0, MAX_CLIPBOARD_CONTEXT_LENGTH)}\n...[clipboard truncated]`
          : text
      await sendCommandToMainWindow(`Help me with this clipboard text:\n\n${clipped}`)
      hideCommandCenterWindow()
      return { success: true, data: { queued: true, characterCount: text.length } }
    }
    case 'focus-zuraai': {
      const win = getMainWindow() ?? createMainWindow()
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      hideCommandCenterWindow()
      return { success: true, data: { focused: true } }
    }
    case 'settings-display':
      return executeSystemSettingsOpen({ page: 'display', autoApprove: true })
    case 'settings-sound':
      return executeSystemSettingsOpen({ page: 'sound', autoApprove: true })
    case 'settings-network':
      return executeSystemSettingsOpen({ page: 'network', autoApprove: true })
    case 'settings-bluetooth':
      return executeSystemSettingsOpen({ page: 'bluetooth', autoApprove: true })
    case 'open-downloads':
      return executeSystemOpenPath({
        path: path.join(os.homedir(), 'Downloads'),
        autoApprove: true,
      })
    case 'emoji-picker':
      return { success: true, data: { interactiveCommand: 'emoji-picker' } }
  }
}

async function insertEmoji(value: unknown) {
  if (typeof value !== 'string' || !COMMAND_CENTER_EMOJI_SET.has(value)) {
    return { success: false, error: 'A supported emoji is required.' }
  }
  hideCommandCenterWindow()
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    await performType({ text: value })
    return { success: true, data: { inserted: true } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to insert the emoji.',
    }
  }
}

function flattenIndex(index: CommandCenterIndex): CommandCenterIndexItem[] {
  return [...index.workflows, ...index.apps, ...index.windows, ...index.actions, ...index.chats]
}

async function executeWorkflow(workflowId: unknown) {
  if (typeof workflowId !== 'string' || !workflowId.trim()) {
    return { success: false, error: 'Workflow id is required.' }
  }

  const workflow = (await listCommandCenterWorkflows()).find((entry) => entry.id === workflowId)
  if (!workflow) return { success: false, error: 'Workflow was not found.' }

  for (const step of workflow.steps) {
    if (step.type === 'action') {
      if (!isCommandCenterActionId(step.actionId)) {
        return { success: false, error: `Workflow action "${step.actionId}" is not allowed.` }
      }
      const result = await executeCommandCenterAction(step.actionId)
      if (!result.success) return result
    } else if (step.type === 'app') {
      const result = await executeAppLaunch({ nameOrPath: step.appPath, autoApprove: true })
      if (!result.success) return result
    } else if (step.type === 'window') {
      const result = await executeWindowFocus({ hwnd: step.hwnd, autoApprove: true })
      if (!result.success) return result
    } else if (step.type === 'ai') {
      await markCommandCenterWorkflowRun(workflow.id)
      return { success: true, aiPrompt: step.prompt }
    }
  }

  await markCommandCenterWorkflowRun(workflow.id)
  return { success: true, data: { workflowId: workflow.id } }
}

function isCommandCenterItemActionId(value: unknown): value is CommandCenterItemActionId {
  return (
    typeof value === 'string' &&
    (COMMAND_CENTER_ITEM_ACTIONS as readonly string[]).includes(value)
  )
}

/** Absolute filesystem path from a cached app row (never trust renderer paths). */
function appFilesystemPath(item: Extract<CommandCenterIndexItem, { type: 'app' }>): string | undefined {
  const candidates = [item.targetPath, item.shortcutPath, item.appPath]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed || trimmed.includes('\0')) continue
    // Only accept real paths — not AUMIDs or bare names.
    if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith('\\\\')) {
      return path.normalize(trimmed)
    }
  }
  return undefined
}

async function resolveIndexItem(
  itemId: unknown,
  query: unknown = ''
): Promise<CommandCenterIndexItem | undefined> {
  if (typeof itemId !== 'string' || !itemId.trim()) return undefined
  return (
    indexItemCache.get(itemId) ??
    flattenIndex(await buildCommandCenterIndex(query)).find((candidate) => candidate.id === itemId)
  )
}

async function executeIndexItem(itemId: unknown, query: unknown = '') {
  const item = await resolveIndexItem(itemId, query)
  if (!item) {
    if (typeof itemId !== 'string' || !itemId.trim()) {
      return { success: false, error: 'Command Center item id is required.' }
    }
    return { success: false, error: 'Command Center item was not found.' }
  }

  if (item.type === 'workflow') return executeWorkflow(item.workflow.id)
  if (item.type === 'app') {
    // Launch straight from the cached item via the native open path. We no
    // longer re-resolve the entry (extra snapshot scan + background PowerShell)
    // nor route running apps through SetForegroundWindow (which pays for a
    // PowerShell spawn + runtime C# compile + full process enumeration). A
    // native launch of a single-instance app activates its existing window,
    // so this is both faster and behaves the same for the common case.
    return executeAppLaunch({
      nameOrPath: item.shortcutPath ?? item.appPath,
      appUserModelId: item.appUserModelId,
      itemId: item.id,
      autoApprove: true,
    })
  }
  if (item.type === 'window') return executeWindowFocus({ hwnd: item.hwnd, autoApprove: true })
  if (item.type === 'action') return executeCommandCenterAction(item.actionId)
  if (item.type === 'chat') {
    await sendCommandToMainWindow('', item.sessionId)
    hideCommandCenterWindow()
    return { success: true, sessionId: item.sessionId }
  }

  return { success: false, error: 'Unsupported Command Center item.' }
}

/**
 * Secondary Actions-menu handlers for a selected index item. Apps only for now.
 * Returns `dismiss: true` when the overlay should hide after success.
 */
async function executeItemAction(
  itemId: unknown,
  actionId: unknown,
  query: unknown = ''
): Promise<{ success: boolean; error?: string; dismiss?: boolean; status?: string }> {
  if (!isCommandCenterItemActionId(actionId)) {
    return { success: false, error: 'Command Center item action is not allowed.' }
  }

  const item = await resolveIndexItem(itemId, query)
  if (!item) {
    return { success: false, error: 'Command Center item was not found.' }
  }

  // App actions only in this pass (matches the footer Actions menu).
  if (item.type !== 'app') {
    return { success: false, error: 'Actions are only available for applications.' }
  }

  switch (actionId) {
    case 'open': {
      const result = await executeAppLaunch({
        nameOrPath: item.shortcutPath ?? item.appPath,
        appUserModelId: item.appUserModelId,
        itemId: item.id,
        autoApprove: true,
      })
      return {
        success: Boolean(result.success),
        error: result.success ? undefined : result.error || 'Unable to open the application.',
        dismiss: Boolean(result.success),
      }
    }
    case 'focus-window': {
      const hwnd = item.existingWindow?.hwnd
      if (typeof hwnd !== 'number') {
        return { success: false, error: 'No open window is available for this app.' }
      }
      const result = await executeWindowFocus({ hwnd, autoApprove: true })
      return {
        success: Boolean(result.success),
        error: result.success ? undefined : result.error || 'Unable to focus the window.',
        dismiss: Boolean(result.success),
      }
    }
    case 'show-in-folder': {
      const filePath = appFilesystemPath(item)
      if (!filePath) {
        return { success: false, error: 'No folder path is available for this app.' }
      }
      try {
        shell.showItemInFolder(filePath)
        return { success: true, dismiss: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unable to show in File Explorer.',
        }
      }
    }
    case 'reveal-shortcut': {
      const shortcutPath = item.shortcutPath
      if (!shortcutPath || typeof shortcutPath !== 'string') {
        return { success: false, error: 'No shortcut path is available for this app.' }
      }
      try {
        shell.showItemInFolder(shortcutPath)
        return { success: true, dismiss: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unable to show shortcut in File Explorer.',
        }
      }
    }
    case 'copy-path': {
      const filePath = appFilesystemPath(item)
      if (!filePath) {
        return { success: false, error: 'No path is available for this app.' }
      }
      clipboard.writeText(filePath)
      return { success: true, dismiss: false }
    }
    case 'copy-dir': {
      const filePath = appFilesystemPath(item)
      if (!filePath) {
        return { success: false, error: 'No path is available for this app.' }
      }
      const dirPath = path.dirname(filePath)
      clipboard.writeText(dirPath)
      return { success: true, dismiss: false }
    }
    case 'copy-name': {
      clipboard.writeText(item.title)
      return { success: true, dismiss: false }
    }
    case 'force-quit': {
      const hwnd = item.existingWindow?.hwnd
      const pid = item.existingWindow?.processId
      if (typeof hwnd === 'number') {
        const result = await executeWindowClose({ hwnd, autoApprove: true })
        if (result.success) {
          return { success: true, dismiss: false, status: 'Application closed.' }
        }
      }
      if (typeof pid === 'number') {
        try {
          process.kill(pid, 'SIGKILL')
          return { success: true, dismiss: false, status: 'Application terminated.' }
        } catch (killErr) {
          try {
            const { execSync } = require('child_process')
            execSync(`taskkill /F /PID ${pid}`)
            return { success: true, dismiss: false, status: 'Application terminated.' }
          } catch (execErr) {
            // ignore
          }
        }
      }
      return { success: false, error: 'No running process/window is available for this app.' }
    }
    default:
      return { success: false, error: 'Command Center item action is not allowed.' }
  }
}

function unregisterShortcut(): void {
  if (!shortcutRegistered) return
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
  }
  registeredShortcut = null
  shortcutRegistered = false
}

export function setCommandCenterExtensionEnabled(enabled: boolean): {
  enabled: boolean
  shortcut: string
  shortcutRegistered: boolean
} {
  extensionEnabled = enabled
  if (enabled) {
    registerShortcut()
  } else {
    unregisterShortcut()
    // Destroy (not just hide) so the second renderer process exits immediately
    // when the user leaves Agent Mode / disables Command Center.
    destroyCommandCenterWindow()
    clearCommandCenterRuntimeCaches()
  }

  return {
    enabled: extensionEnabled,
    shortcut: registeredShortcut ?? COMMAND_CENTER_SHORTCUT,
    shortcutRegistered,
  }
}

export function disposeCommandCenter(): void {
  unregisterShortcut()
  extensionEnabled = false
  destroyCommandCenterWindow()
  clearCommandCenterRuntimeCaches()
}

export function registerCommandCenterHandlers(): void {
  ipcMain.handle('command-center:set-extension-enabled', (_event, enabled: unknown) => {
    return setCommandCenterExtensionEnabled(enabled === true)
  })

  ipcMain.handle('command-center:show', () => {
    if (!extensionEnabled) return false
    prefetchBrowseIndex()
    showCommandCenterWindow()
    warmAppIndex()
    return true
  })

  ipcMain.handle('command-center:hide', () => {
    hideCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:get-context', async () => {
    return executeSystemActiveWindow()
  })

  ipcMain.handle('command-center:list-actions', () => {
    return [...COMMAND_CENTER_ACTIONS]
  })

  ipcMain.handle('command-center:get-index', async (_event, query: unknown) => {
    const appQuery = indexQuery(query)
    if (!appQuery) {
      return resolveBrowseIndex()
    }
    return buildCommandCenterIndex(query)
  })

  ipcMain.handle('command-center:refresh-app-index', async () => {
    if (!extensionEnabled) {
      return { ok: false, stale: true, sourceCounts: {}, error: 'Command Center is disabled.' }
    }
    return refreshAppIndex()
  })

  ipcMain.handle('command-center:save-workflow', async (_event, workflow: unknown) => {
    return saveCommandCenterWorkflow(workflow)
  })

  ipcMain.handle('command-center:delete-workflow', async (_event, id: unknown) => {
    return deleteCommandCenterWorkflow(id)
  })

  ipcMain.handle('command-center:execute-action', async (_event, actionId: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    if (!isCommandCenterActionId(actionId)) {
      return { success: false, error: 'Command Center action is not allowed.' }
    }
    return executeCommandCenterAction(actionId)
  })

  ipcMain.handle('command-center:insert-emoji', async (_event, emoji: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    return insertEmoji(emoji)
  })

  ipcMain.handle(
    'command-center:execute-index-item',
    async (_event, itemId: unknown, query: unknown) => {
      if (!extensionEnabled) {
        return { success: false, error: 'Command Center is disabled.' }
      }
      return executeIndexItem(itemId, query)
    }
  )

  ipcMain.handle(
    'command-center:execute-item-action',
    async (_event, itemId: unknown, actionId: unknown, query: unknown) => {
      if (!extensionEnabled) {
        return { success: false, error: 'Command Center is disabled.' }
      }
      return executeItemAction(itemId, actionId, query)
    }
  )

  ipcMain.handle('command-center:execute-workflow', async (_event, workflowId: unknown) => {
    if (!extensionEnabled) {
      return { success: false, error: 'Command Center is disabled.' }
    }
    return executeWorkflow(workflowId)
  })

  ipcMain.handle('command-center:open-chat-session', async (_event, sessionId: unknown) => {
    if (!extensionEnabled || typeof sessionId !== 'string' || !sessionId.trim()) {
      return false
    }
    await sendCommandToMainWindow('', sessionId.trim())
    hideCommandCenterWindow()
    return true
  })

  ipcMain.handle('command-center:set-layout', (_event, layout: unknown) => {
    if (layout !== 'search' && layout !== 'chat') {
      throw new Error('Invalid Command Center layout.')
    }
    setCommandCenterWindowLayout(layout)
    return true
  })

  ipcMain.handle('command-center:submit-command', async (_event, text: unknown) => {
    if (!extensionEnabled || typeof text !== 'string') {
      return { accepted: false, reason: 'Command Center is disabled.' }
    }

    const trimmed = text.trim()
    if (!trimmed) {
      return { accepted: false, reason: 'Command text is required.' }
    }

    await sendCommandToMainWindow(trimmed)
    hideCommandCenterWindow()
    return { accepted: true }
  })
}

export function unregisterCommandCenterHandlers(): void {
  ipcMain.removeHandler('command-center:set-extension-enabled')
  ipcMain.removeHandler('command-center:show')
  ipcMain.removeHandler('command-center:hide')
  ipcMain.removeHandler('command-center:get-context')
  ipcMain.removeHandler('command-center:list-actions')
  ipcMain.removeHandler('command-center:get-index')
  ipcMain.removeHandler('command-center:refresh-app-index')
  ipcMain.removeHandler('command-center:save-workflow')
  ipcMain.removeHandler('command-center:delete-workflow')
  ipcMain.removeHandler('command-center:execute-action')
  ipcMain.removeHandler('command-center:insert-emoji')
  ipcMain.removeHandler('command-center:execute-index-item')
  ipcMain.removeHandler('command-center:execute-item-action')
  ipcMain.removeHandler('command-center:execute-workflow')
  ipcMain.removeHandler('command-center:open-chat-session')
  ipcMain.removeHandler('command-center:set-layout')
  ipcMain.removeHandler('command-center:submit-command')
}
