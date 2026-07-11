import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import crypto from 'crypto'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { exec as execGit } from 'dugite'
import { getSecureValueAsync, setSecureValueAsync } from './secureStorage'
import { writeFileAtomic } from './utils/atomicFile'
import { getCommandCenterWindow } from './windows/commandCenterOverlay'
import {
  classifyGitHubDevicePoll,
  isGitHubDeviceFlowExpired,
  isValidGitHubDeviceUserCode,
  redactGitHubSecrets,
} from './githubWorkspaceSecurity'
import {
  buildGithubNetworkConfigArgs,
  classifyNetworkGitError,
  isNetworkGitTimeoutError,
  NETWORK_GIT_TIMEOUT_MS,
  parseGithubRemote,
  resolveChangePath,
  applyChangeSelection,
  isChangeSelected,
  selectCommitPaths,
  selectPushArgs,
} from './githubWorkspaceGit'
import type {
  GitHubWorkspaceAccount,
  GitHubWorkspaceCommit,
  GitHubWorkspaceFileChange,
  GitHubWorkspaceMutation,
  GitHubWorkspaceOpenRequest,
  GitHubWorkspaceOpenResult,
  GitHubWorkspaceRepositorySummary,
  GitHubWorkspaceState,
  GitHubWorkspaceWorktree,
} from '../src/electron/types'

const STORE_NAME = 'github-workspace-repositories.json'
const INSTALL_FILE = 'zura-store-products.json'
const TOKEN_KEY = 'github.workspace.oauthToken'
const MAX_REPOSITORIES = 200
const MAX_COMMIT_MESSAGE = 10_000
// OAuth client IDs are public identifiers. This ZuraAI-owned OAuth App has
// Device Flow enabled; no client secret is generated, shipped, or required.
const OAUTH_CLIENT_ID = process.env.ZURA_GITHUB_OAUTH_CLIENT_ID?.trim() || 'Ov23lia9o7CSXoWqom8M'

interface StoredRepository { id: string; path: string; alias?: string; lastOpenedAt: number }
let selectedRepositoryId: string | undefined
/** Paths the user unchecked (default is checked for every change). */
let deselectedChanges = new Map<string, Set<string>>()
let operation: Promise<unknown> = Promise.resolve()
let authAttempt = 0
/** Cached path to dugite's embedded Git directory (GitHub Desktop / dugite pattern). */
let embeddedGitDir: string | undefined

const storePath = () => path.join(app.getPath('userData'), STORE_NAME)
const installPath = () => path.join(app.getPath('userData'), INSTALL_FILE)
const encodeId = (value: string) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)

function gitBinaryPath(gitDir: string): string {
  return process.platform === 'win32'
    ? path.join(gitDir, 'cmd', 'git.exe')
    : path.join(gitDir, 'bin', 'git')
}

/**
 * Resolve dugite's embedded Git directory.
 *
 * Vite bundles the main process into `dist-electron/main.js`, so dugite's own
 * `resolveEmbeddedGitDir()` (relative to its `__dirname`) points at the wrong
 * place and spawns fail with ENOENT. GitHub Desktop / dugite fix this by setting
 * `LOCAL_GIT_DIRECTORY` to the real `node_modules/dugite/git` folder (or the
 * asar-unpacked copy in production).
 */
function resolveEmbeddedGitDirectory(): string {
  if (embeddedGitDir && existsSync(gitBinaryPath(embeddedGitDir))) return embeddedGitDir

  const candidates: string[] = []
  const envDir = process.env.LOCAL_GIT_DIRECTORY?.trim()
  if (envDir) candidates.push(path.resolve(envDir))

  try {
    const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'))
    candidates.push(path.join(path.dirname(requireFromApp.resolve('dugite/package.json')), 'git'))
  } catch {
    // ignore — fall through to packaged / cwd candidates
  }

  try {
    if (app.isPackaged) {
      candidates.push(
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'dugite', 'git')
      )
    } else {
      candidates.push(path.join(app.getAppPath(), 'node_modules', 'dugite', 'git'))
    }
  } catch {
    // app may be unavailable in pure unit tests
  }

  candidates.push(path.join(process.cwd(), 'node_modules', 'dugite', 'git'))

  for (const dir of candidates) {
    if (dir && existsSync(gitBinaryPath(dir))) {
      embeddedGitDir = dir
      return dir
    }
  }

  throw new Error(
    'Bundled Git was not found. Reinstall ZuraAI or set LOCAL_GIT_DIRECTORY to a dugite git folder.'
  )
}

/** Ensure process + dugite exec env can find the embedded git binary. */
function dugiteEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const localGitDirectory = resolveEmbeddedGitDirectory()
  // dugite reads LOCAL_GIT_DIRECTORY from the merged env map on each exec.
  process.env.LOCAL_GIT_DIRECTORY = localGitDirectory
  return {
    ...process.env,
    LOCAL_GIT_DIRECTORY: localGitDirectory,
    ...extra,
  }
}

export async function isGitHubWorkspaceInstalled(): Promise<boolean> {
  try {
    const parsed = JSON.parse(await fs.readFile(installPath(), 'utf8'))
    return Array.isArray(parsed.installed) && parsed.installed.includes('github')
  } catch { return false }
}

async function setGitHubWorkspaceInstalled(installed: boolean): Promise<void> {
  await writeFileAtomic(installPath(), JSON.stringify({ installed: installed ? ['github'] : [] }, null, 2))
}

async function requireInstalled(): Promise<void> {
  if (!(await isGitHubWorkspaceInstalled())) throw new Error('Install GitHub from Zura Store first.')
}

async function readStore(): Promise<StoredRepository[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath(), 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value): StoredRepository[] => {
      if (!value || typeof value.path !== 'string' || typeof value.id !== 'string') return []
      return [{ id: value.id, path: path.resolve(value.path), alias: typeof value.alias === 'string' ? value.alias : undefined, lastOpenedAt: Number(value.lastOpenedAt) || 0 }]
    }).slice(0, MAX_REPOSITORIES)
  } catch { return [] }
}

async function writeStore(repositories: StoredRepository[]) {
  await writeFileAtomic(storePath(), JSON.stringify(repositories.slice(0, MAX_REPOSITORIES), null, 2))
}

async function git(repositoryPath: string, args: string[]) {
  const result = await execGit(args, repositoryPath, { env: dugiteEnv() })
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Git exited with ${result.exitCode}.`)
  return result.stdout
}

/**
 * Run a network Git command (fetch/pull/push) with GitHub HTTPS auth.
 *
 * Prefer `http.*.extraheader` basic auth over GIT_ASKPASS: askpass helpers are
 * unreliable with dugite on Windows (empty password prompts → failed push).
 * Never rewrite the stored remote URL; only inject credentials for this process.
 */
async function networkGit(repositoryPath: string, args: string[]) {
  const remote = (await git(repositoryPath, ['remote', 'get-url', 'origin']).catch(() => '')).trim()
  if (!remote) throw new Error('This repository has no origin remote to sync with.')

  const github = parseGithubRemote(remote)
  const token = github ? await getSecureValueAsync(TOKEN_KEY) : ''
  if (github && !token) throw new Error('Sign in to GitHub before syncing this repository.')

  const configArgs = buildGithubNetworkConfigArgs(remote, token || null)
  const operation = args[0] || 'sync'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NETWORK_GIT_TIMEOUT_MS)
  try {
    const result = await execGit([...configArgs, ...args], repositoryPath, {
      env: dugiteEnv({
        GIT_TERMINAL_PROMPT: '0',
        // Prevent Windows Git Credential Manager from blocking on a UI prompt.
        GCM_INTERACTIVE: 'Never',
        GCM_PROVIDER: '',
      }),
      signal: controller.signal,
      killSignal: 'SIGTERM',
    })
    if (result.exitCode !== 0) {
      const detail =
        redactGitHubSecrets((result.stderr || result.stdout || '').trim()) ||
        `Git exited with ${result.exitCode}.`
      throw new Error(classifyNetworkGitError(detail))
    }
    return result.stdout
  } catch (error) {
    if (controller.signal.aborted || isNetworkGitTimeoutError(error)) {
      throw new Error(
        `Git ${operation} timed out after ${Math.round(NETWORK_GIT_TIMEOUT_MS / 1000)}s. ` +
          'Check your network, or try again if the repository is large.'
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function pushRepository(repositoryPath: string) {
  const branch = (await git(repositoryPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const hasUpstream = await git(repositoryPath, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])
    .then(() => true)
    .catch(() => false)
  await networkGit(repositoryPath, selectPushArgs(branch, hasUpstream))
}

async function accountState(): Promise<GitHubWorkspaceAccount> {
  const token = await getSecureValueAsync(TOKEN_KEY)
  if (!token) return { status: 'signed_out', setupRequired: !OAUTH_CLIENT_ID }
  try {
    const response = await fetch('https://api.github.com/user', { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'ZuraAI' } })
    if (!response.ok) return { status: 'signed_out', error: response.status === 401 ? 'GitHub authorization expired. Sign in again.' : `GitHub returned ${response.status}.` }
    const user = await response.json() as { login: string; name?: string; avatar_url?: string }
    return { status: 'signed_in', login: user.login, name: user.name, avatarUrl: user.avatar_url }
  } catch (error) { return { status: 'signed_out', error: error instanceof Error ? redactGitHubSecrets(error.message) : 'Unable to reach GitHub.' } }
}

function ownerFromRemote(remoteUrl?: string): string | undefined {
  if (!remoteUrl) return undefined
  // Match github.com/owner/repo, git@github.com:owner/repo.git, and ssh:// forms.
  const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/i)
  return match?.[1] || undefined
}

async function repositorySummary(repo: StoredRepository): Promise<GitHubWorkspaceRepositorySummary> {
  try {
    const status = await git(repo.path, ['status', '--porcelain=v1', '--branch'])
    const lines = status.split(/\r?\n/).filter(Boolean)
    const header = lines.shift() ?? ''
    // Branch can include remote tracking info after "..." — capture name before that.
    const branch = header.match(/^## ([^\s.]+)/)?.[1]
    const ahead = Number(header.match(/ahead (\d+)/)?.[1] ?? 0)
    const behind = Number(header.match(/behind (\d+)/)?.[1] ?? 0)
    const remoteUrl = (await git(repo.path, ['remote', 'get-url', 'origin']).catch(() => '')).trim() || undefined
    return {
      ...repo,
      name: path.basename(repo.path),
      missing: false,
      branch,
      ahead,
      behind,
      changedFiles: lines.length,
      remoteUrl,
      owner: ownerFromRemote(remoteUrl),
    }
  } catch {
    return { ...repo, name: path.basename(repo.path), missing: true, ahead: 0, behind: 0, changedFiles: 0 }
  }
}

async function selectedDetails(repository?: StoredRepository) {
  if (!repository) {
    return {
      changes: [] as GitHubWorkspaceFileChange[],
      history: [] as GitHubWorkspaceCommit[],
      branches: [] as string[],
      worktrees: [] as GitHubWorkspaceWorktree[],
    }
  }
  const rawStatus = await git(repository.path, ['status', '--porcelain=v1', '-z']).catch(() => '')
  const deselected = deselectedChanges.get(repository.id) ?? new Set<string>()
  const changes = rawStatus.split('\0').filter(Boolean).map((entry) => {
    // Rename entries can be longer; path always starts at index 3 for standard status.
    const filePath = entry.slice(3)
    return {
      id: encodeId(filePath),
      path: filePath,
      status: entry.slice(0, 2),
      // Checked by default; only unchecked paths live in `deselected`.
      selected: isChangeSelected(filePath, deselected),
    }
  })
  // Drop deselected entries that no longer appear in the working tree.
  if (deselected.size) {
    const live = new Set(changes.map((change) => change.path))
    for (const path of [...deselected]) {
      if (!live.has(path)) deselected.delete(path)
    }
  }
  // One commit per line — avoids fragile multi-record \x1e parsing in porcelain-ish logs.
  const rawLog = await git(
    repository.path,
    ['log', '-50', '--date=unix', '--pretty=format:%H%x1f%s%x1f%an%x1f%at']
  ).catch(() => '')
  const history = rawLog
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id = '', summary = '', author = '', authoredAt = '0'] = entry.split('\x1f')
      return {
        id,
        summary: summary || '(no message)',
        author: author || 'Unknown',
        authoredAt: Number(authoredAt) * 1000 || 0,
      }
    })
    .filter((commit) => commit.id.length >= 7)

  const branchOut = await git(repository.path, ['branch', '--format=%(refname:short)']).catch(() => '')
  const branches = branchOut
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 200)

  const wtOut = await git(repository.path, ['worktree', 'list', '--porcelain']).catch(() => '')
  const worktrees: GitHubWorkspaceWorktree[] = []
  let current: { path?: string; branch?: string; bare?: boolean } = {}
  const flush = () => {
    if (!current.path) return
    const wtPath = path.resolve(current.path)
    worktrees.push({
      id: encodeId(wtPath.toLowerCase()),
      path: wtPath,
      branch: current.branch,
      isCurrent: path.resolve(repository.path) === wtPath,
    })
    current = {}
  }
  for (const line of wtOut.split(/\r?\n/)) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (line.startsWith('worktree ')) current.path = line.slice('worktree '.length).trim()
    else if (line.startsWith('branch ')) {
      const ref = line.slice('branch '.length).trim()
      current.branch = ref.replace(/^refs\/heads\//, '')
    } else if (line === 'bare') current.bare = true
    else if (line.startsWith('HEAD ') || line === 'detached') {
      // keep path; branch may be absent when detached
    }
  }
  flush()
  if (!worktrees.length) {
    worktrees.push({
      id: encodeId(path.resolve(repository.path).toLowerCase()),
      path: path.resolve(repository.path),
      branch: branches[0],
      isCurrent: true,
    })
  }

  return { changes, history, branches, worktrees }
}

export async function getGitHubWorkspaceState(): Promise<GitHubWorkspaceState> {
  await requireInstalled()
  const stored = await readStore()
  if (!selectedRepositoryId && stored[0]) selectedRepositoryId = stored[0].id
  const repositories = await Promise.all(stored.map(repositorySummary))
  const selected = stored.find((repo) => repo.id === selectedRepositoryId)
  return { account: await accountState(), repositories, selectedRepositoryId, ...(await selectedDetails(selected)) }
}

function emitChanged(state: GitHubWorkspaceState) { getCommandCenterWindow()?.webContents.send('github-workspace:changed', state) }

async function emitAccount(account: GitHubWorkspaceAccount): Promise<void> {
  const stored = await readStore()
  if (!selectedRepositoryId && stored[0]) selectedRepositoryId = stored[0].id
  const repositories = await Promise.all(stored.map(repositorySummary))
  const selected = stored.find((repo) => repo.id === selectedRepositoryId)
  emitChanged({ account, repositories, selectedRepositoryId, ...(await selectedDetails(selected)) })
}

async function pollDeviceAuthorization(
  attempt: number,
  deviceCode: string,
  intervalSeconds: number,
  expiresAt: number
): Promise<void> {
  if (attempt !== authAttempt) return
  if (isGitHubDeviceFlowExpired(Date.now(), expiresAt)) {
    await emitAccount({ status: 'signed_out', error: 'The GitHub sign-in code expired. Try again.' })
    return
  }
  const body = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ZuraAI' },
      body,
    })
    const result = await response.json() as { access_token?: string; error?: string; error_description?: string }
    if (attempt !== authAttempt) return
    const decision = classifyGitHubDevicePoll(result, intervalSeconds)
    if (decision.kind === 'authorized') {
      if (!(await setSecureValueAsync(TOKEN_KEY, decision.token))) {
        await emitAccount({ status: 'signed_out', error: 'Secure storage is unavailable. GitHub was not connected.' })
        return
      }
      emitChanged(await getGitHubWorkspaceState())
      return
    }
    if (decision.kind === 'retry') {
      setTimeout(() => void pollDeviceAuthorization(attempt, deviceCode, decision.intervalSeconds, expiresAt), decision.intervalSeconds * 1000)
      return
    }
    await emitAccount({ status: 'signed_out', error: decision.message })
  } catch (error) {
    await emitAccount({ status: 'signed_out', error: error instanceof Error ? redactGitHubSecrets(error.message) : 'Unable to reach GitHub.' })
  }
}

async function performMutation(mutation: GitHubWorkspaceMutation): Promise<GitHubWorkspaceState> {
  const repositories = await readStore()
  const repository = 'repositoryId' in mutation ? repositories.find((item) => item.id === mutation.repositoryId) : undefined
  if ('repositoryId' in mutation && !repository) throw new Error('Repository was not found.')
  if (mutation.type === 'select-repository') { selectedRepositoryId = mutation.repositoryId; repository!.lastOpenedAt = Date.now(); await writeStore(repositories) }
  if (mutation.type === 'select-change') {
    const details = await selectedDetails(repository)
    const change = details.changes.find((item) => item.id === mutation.changeId)
    if (!change) throw new Error('Changed file was not found.')
    const deselected = deselectedChanges.get(repository!.id) ?? new Set<string>()
    applyChangeSelection(deselected, change.path, mutation.selected)
    deselectedChanges.set(repository!.id, deselected)
  }
  if (mutation.type === 'commit') {
    const summary = mutation.summary.trim()
    if (!summary || summary.length > MAX_COMMIT_MESSAGE) throw new Error('Commit summary is required.')
    const details = await selectedDetails(repository)
    // Only checked files — never commit unchecked paths.
    const paths = selectCommitPaths(
      details.changes.filter((change) => change.selected).map((change) => change.path)
    )
    if (!paths.length) throw new Error('Select at least one changed file to commit.')
    await git(repository!.path, ['add', '--', ...paths])
    const message = mutation.description?.trim() ? `${summary}\n\n${mutation.description.trim()}` : summary
    await git(repository!.path, ['commit', '-m', message])
    // Clear deselection bookkeeping for committed (and remaining) paths after success.
    deselectedChanges.delete(repository!.id)
  }
  if (mutation.type === 'fetch') await networkGit(repository!.path, ['fetch', '--prune'])
  if (mutation.type === 'pull') {
    await networkGit(repository!.path, ['pull', '--ff-only'])
  }
  if (mutation.type === 'push') {
    await pushRepository(repository!.path)
  }
  if (mutation.type === 'checkout-branch') {
    const branch = mutation.branch.trim()
    if (!branch || branch.includes('..') || /[\s\\]/.test(branch)) {
      throw new Error('Invalid branch name.')
    }
    await git(repository!.path, ['checkout', branch])
  }
  if (mutation.type === 'open-worktree') {
    const details = await selectedDetails(repository)
    const worktree = details.worktrees.find((item) => item.id === mutation.worktreeId)
    if (!worktree) throw new Error('Worktree was not found.')
    await git(worktree.path, ['rev-parse', '--is-inside-work-tree'])
    const id = encodeId(worktree.path.toLowerCase())
    const existing = repositories.find((item) => item.id === id)
    if (existing) {
      existing.lastOpenedAt = Date.now()
      repositories.splice(repositories.indexOf(existing), 1)
      repositories.unshift(existing)
    } else {
      repositories.unshift({ id, path: worktree.path, lastOpenedAt: Date.now() })
    }
    selectedRepositoryId = id
    await writeStore(repositories)
  }
  return getGitHubWorkspaceState()
}

export function registerGitHubWorkspaceHandlers() {
  ipcMain.handle('github-workspace:get-installed', () => isGitHubWorkspaceInstalled())
  ipcMain.handle('github-workspace:install', async () => { await setGitHubWorkspaceInstalled(true); return true })
  ipcMain.handle('github-workspace:uninstall', async () => { authAttempt += 1; await setGitHubWorkspaceInstalled(false); await setSecureValueAsync(TOKEN_KEY, ''); selectedRepositoryId = undefined; deselectedChanges.clear(); await shell.openExternal('https://github.com/settings/connections/applications/' + OAUTH_CLIENT_ID); return true })
  ipcMain.handle('github-workspace:get-state', () => getGitHubWorkspaceState())
  ipcMain.handle('github-workspace:add-repository', async () => {
    await requireInstalled()
    // Parent to the Command Center overlay so the folder picker is not buried
    // under the always-on-top workspace window (common "won't open" failure).
    const parent = getCommandCenterWindow()
    const result = parent
      ? await dialog.showOpenDialog(parent, {
          properties: ['openDirectory'],
          title: 'Add a Git repository',
          buttonLabel: 'Add repository',
        })
      : await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Add a Git repository',
          buttonLabel: 'Add repository',
        })
    if (result.canceled || !result.filePaths[0]) return getGitHubWorkspaceState()
    const repoPath = path.resolve(result.filePaths[0])
    try {
      await git(repoPath, ['rev-parse', '--is-inside-work-tree'])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/ENOENT|Git failed to execute|Bundled Git/i.test(message)) {
        throw new Error(message)
      }
      throw new Error('That folder is not a Git repository. Choose the folder that contains a .git directory.')
    }
    const repositories = await readStore()
    const id = encodeId(repoPath.toLowerCase())
    const existing = repositories.find((item) => item.id === id)
    if (existing) {
      existing.lastOpenedAt = Date.now()
      repositories.splice(repositories.indexOf(existing), 1)
      repositories.unshift(existing)
    } else {
      repositories.unshift({ id, path: repoPath, lastOpenedAt: Date.now() })
    }
    selectedRepositoryId = id
    await writeStore(repositories)
    const state = await getGitHubWorkspaceState()
    emitChanged(state)
    return state
  })
  ipcMain.handle('github-workspace:start-sign-in', async () => {
    await requireInstalled()
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ZuraAI' },
      body: new URLSearchParams({ client_id: OAUTH_CLIENT_ID, scope: 'repo read:user workflow' }),
    })
    const result = await response.json() as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; error_description?: string }
    if (!response.ok || !result.device_code || !result.user_code || !result.verification_uri) {
      return { status: 'signed_out', error: result.error_description || 'GitHub did not start device authorization.' }
    }
    const attempt = ++authAttempt
    const expiresAt = Date.now() + Math.max(60, result.expires_in ?? 900) * 1000
    const account: GitHubWorkspaceAccount = { status: 'signing_in', verificationUrl: result.verification_uri, userCode: result.user_code, expiresAt }
    await shell.openExternal(result.verification_uri)
    setTimeout(() => void pollDeviceAuthorization(attempt, result.device_code!, Math.max(5, result.interval ?? 5), expiresAt), Math.max(5, result.interval ?? 5) * 1000)
    return account
  })
  ipcMain.handle('github-workspace:sign-out', async () => { authAttempt += 1; await setSecureValueAsync(TOKEN_KEY, ''); return { status: 'signed_out' } })
  ipcMain.handle('github-workspace:disconnect', async () => { authAttempt += 1; await setSecureValueAsync(TOKEN_KEY, ''); await shell.openExternal('https://github.com/settings/connections/applications/' + OAUTH_CLIENT_ID); return { status: 'signed_out' } })
  ipcMain.handle('github-workspace:copy-user-code', (_event, userCode: unknown) => {
    if (!isValidGitHubDeviceUserCode(userCode)) return false
    clipboard.writeText(userCode)
    return true
  })
  ipcMain.handle('github-workspace:mutate', async (_event, mutation: GitHubWorkspaceMutation) => {
    await requireInstalled()
    operation = operation.then(() => performMutation(mutation)); const state = await operation as GitHubWorkspaceState; emitChanged(state); return state
  })
  ipcMain.handle('github-workspace:select-diff', async (_event, repositoryId: unknown, changeId: unknown) => {
    await requireInstalled()
    if (typeof repositoryId !== 'string' || typeof changeId !== 'string') throw new Error('Invalid diff request.')
    const repository = (await readStore()).find((item) => item.id === repositoryId)
    if (!repository) throw new Error('Repository was not found.')
    const change = (await selectedDetails(repository)).changes.find((item) => item.id === changeId)
    if (!change) throw new Error('Changed file was not found.')
    return git(repository.path, ['diff', '--no-ext-diff', '--', change.path])
  })
  ipcMain.handle('github-workspace:open', async (_event, request: unknown): Promise<GitHubWorkspaceOpenResult> => {
    await requireInstalled()
    try {
      return await openWorkspaceTarget(request)
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? redactGitHubSecrets(error.message) : 'Unable to open.',
      }
    }
  })
}

async function openWorkspaceTarget(request: unknown): Promise<GitHubWorkspaceOpenResult> {
  if (!request || typeof request !== 'object') throw new Error('Invalid open request.')
  const body = request as GitHubWorkspaceOpenRequest
  if (body.target !== 'file' && body.target !== 'reveal' && body.target !== 'repository') {
    throw new Error('Invalid open target.')
  }
  if (typeof body.repositoryId !== 'string' || !body.repositoryId) {
    throw new Error('Repository was not found.')
  }
  const repository = (await readStore()).find((item) => item.id === body.repositoryId)
  if (!repository) throw new Error('Repository was not found.')
  if (!existsSync(repository.path)) throw new Error('Repository folder is missing on disk.')

  if (body.target === 'repository') {
    const openError = await shell.openPath(repository.path)
    if (openError) throw new Error(openError)
    return { ok: true }
  }

  if (typeof body.changeId !== 'string' || !body.changeId) {
    throw new Error('Changed file was not found.')
  }
  const change = (await selectedDetails(repository)).changes.find((item) => item.id === body.changeId)
  if (!change) throw new Error('Changed file was not found.')
  const filePath = resolveChangePath(repository.path, change.path)
  if (!existsSync(filePath)) {
    throw new Error('That file is not on disk (deleted or not checked out).')
  }

  if (body.target === 'reveal') {
    shell.showItemInFolder(filePath)
    return { ok: true }
  }

  const openError = await shell.openPath(filePath)
  if (openError) throw new Error(openError)
  return { ok: true }
}

export function unregisterGitHubWorkspaceHandlers() {
  authAttempt += 1
  for (const channel of [
    'get-installed',
    'install',
    'uninstall',
    'get-state',
    'add-repository',
    'start-sign-in',
    'sign-out',
    'disconnect',
    'copy-user-code',
    'mutate',
    'select-diff',
    'open',
  ]) {
    ipcMain.removeHandler(`github-workspace:${channel}`)
  }
}
