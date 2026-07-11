import { app, clipboard, dialog, ipcMain, shell } from 'electron'
import crypto from 'crypto'
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
import type {
  GitHubWorkspaceAccount,
  GitHubWorkspaceCommit,
  GitHubWorkspaceFileChange,
  GitHubWorkspaceMutation,
  GitHubWorkspaceRepositorySummary,
  GitHubWorkspaceState,
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
let selectedChanges = new Map<string, Set<string>>()
let operation: Promise<unknown> = Promise.resolve()
let authAttempt = 0

const storePath = () => path.join(app.getPath('userData'), STORE_NAME)
const installPath = () => path.join(app.getPath('userData'), INSTALL_FILE)
const encodeId = (value: string) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)

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
  const result = await execGit(args, repositoryPath)
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `Git exited with ${result.exitCode}.`)
  return result.stdout
}

async function networkGit(repositoryPath: string, args: string[]) {
  const remote = await git(repositoryPath, ['remote', 'get-url', 'origin']).catch(() => '')
  const token = remote.includes('github.com') ? await getSecureValueAsync(TOKEN_KEY) : ''
  if (remote.includes('github.com') && !token) throw new Error('Sign in to GitHub before syncing this repository.')
  const helperPath = path.join(app.getPath('userData'), 'github-workspace-askpass.cmd')
  await fs.writeFile(
    helperPath,
    '@echo off\r\necho %~1 | findstr /I "Username" >nul && (echo x-access-token& exit /b 0)\r\necho %ZURA_GITHUB_TOKEN%\r\n',
    { encoding: 'utf8', mode: 0o700 }
  )
  try {
    const result = await execGit(['-c', 'credential.helper=', ...args], repositoryPath, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: helperPath,
        ZURA_GITHUB_TOKEN: token || undefined,
      },
    })
    if (result.exitCode !== 0) throw new Error(redactGitHubSecrets(result.stderr.trim()) || `Git exited with ${result.exitCode}.`)
    return result.stdout
  } finally {
    await fs.rm(helperPath, { force: true }).catch(() => undefined)
  }
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

async function repositorySummary(repo: StoredRepository): Promise<GitHubWorkspaceRepositorySummary> {
  try {
    const status = await git(repo.path, ['status', '--porcelain=v1', '--branch'])
    const lines = status.split(/\r?\n/).filter(Boolean)
    const header = lines.shift() ?? ''
    const branch = header.match(/^## ([^.\s]+)/)?.[1]
    const ahead = Number(header.match(/ahead (\d+)/)?.[1] ?? 0)
    const behind = Number(header.match(/behind (\d+)/)?.[1] ?? 0)
    const remoteUrl = (await git(repo.path, ['remote', 'get-url', 'origin']).catch(() => '')).trim() || undefined
    return { ...repo, name: path.basename(repo.path), missing: false, branch, ahead, behind, changedFiles: lines.length, remoteUrl }
  } catch { return { ...repo, name: path.basename(repo.path), missing: true, ahead: 0, behind: 0, changedFiles: 0 } }
}

async function selectedDetails(repository?: StoredRepository) {
  if (!repository) return { changes: [] as GitHubWorkspaceFileChange[], history: [] as GitHubWorkspaceCommit[] }
  const rawStatus = await git(repository.path, ['status', '--porcelain=v1', '-z']).catch(() => '')
  const selected = selectedChanges.get(repository.id) ?? new Set<string>()
  const changes = rawStatus.split('\0').filter(Boolean).map((entry) => {
    const filePath = entry.slice(3)
    return { id: encodeId(filePath), path: filePath, status: entry.slice(0, 2), selected: selected.has(filePath) }
  })
  const rawLog = await git(repository.path, ['log', '-50', '--date=unix', '--pretty=format:%H%x1f%s%x1f%an%x1f%at%x1e']).catch(() => '')
  const history = rawLog.split('\x1e').filter(Boolean).map((entry) => {
    const [id, summary, author, authoredAt] = entry.trim().split('\x1f')
    return { id, summary, author, authoredAt: Number(authoredAt) * 1000 }
  })
  return { changes, history }
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
    const selected = selectedChanges.get(repository!.id) ?? new Set<string>()
    mutation.selected ? selected.add(change.path) : selected.delete(change.path)
    selectedChanges.set(repository!.id, selected)
  }
  if (mutation.type === 'commit') {
    const summary = mutation.summary.trim()
    if (!summary || summary.length > MAX_COMMIT_MESSAGE) throw new Error('Commit summary is required.')
    const selected = selectedChanges.get(repository!.id) ?? new Set<string>()
    if (!selected.size) throw new Error('Select at least one changed file.')
    await git(repository!.path, ['add', '--', ...selected])
    const message = mutation.description?.trim() ? `${summary}\n\n${mutation.description.trim()}` : summary
    await git(repository!.path, ['commit', '-m', message])
    selected.clear()
  }
  if (mutation.type === 'fetch') await networkGit(repository!.path, ['fetch', '--prune'])
  if (mutation.type === 'pull') await networkGit(repository!.path, ['pull', '--ff-only'])
  if (mutation.type === 'push') await networkGit(repository!.path, ['push'])
  return getGitHubWorkspaceState()
}

export function registerGitHubWorkspaceHandlers() {
  ipcMain.handle('github-workspace:get-installed', () => isGitHubWorkspaceInstalled())
  ipcMain.handle('github-workspace:install', async () => { await setGitHubWorkspaceInstalled(true); return true })
  ipcMain.handle('github-workspace:uninstall', async () => { authAttempt += 1; await setGitHubWorkspaceInstalled(false); await setSecureValueAsync(TOKEN_KEY, ''); selectedRepositoryId = undefined; selectedChanges.clear(); await shell.openExternal('https://github.com/settings/connections/applications/' + OAUTH_CLIENT_ID); return true })
  ipcMain.handle('github-workspace:get-state', () => getGitHubWorkspaceState())
  ipcMain.handle('github-workspace:add-repository', async () => {
    await requireInstalled()
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Add a Git repository' })
    if (result.canceled || !result.filePaths[0]) return getGitHubWorkspaceState()
    const repoPath = path.resolve(result.filePaths[0])
    await git(repoPath, ['rev-parse', '--git-dir'])
    const repositories = await readStore()
    const id = encodeId(repoPath.toLowerCase())
    if (!repositories.some((item) => item.id === id)) repositories.unshift({ id, path: repoPath, lastOpenedAt: Date.now() })
    selectedRepositoryId = id
    await writeStore(repositories)
    const state = await getGitHubWorkspaceState(); emitChanged(state); return state
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
}

export function unregisterGitHubWorkspaceHandlers() {
  authAttempt += 1
  for (const channel of ['get-installed','install','uninstall','get-state','add-repository','start-sign-in','sign-out','disconnect','copy-user-code','mutate','select-diff']) ipcMain.removeHandler(`github-workspace:${channel}`)
}
