import path from 'path'

/** Parse owner/repo from any common GitHub remote form. */
export function parseGithubRemote(remoteUrl: string): { owner: string; name: string } | null {
  const match = remoteUrl.trim().match(/github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/i)
  if (!match) return null
  return { owner: match[1], name: match[2].replace(/\.git$/i, '') }
}

/**
 * Resolve a change path relative to the repository and ensure it stays inside
 * the repo root (no renderer-supplied absolute paths).
 */
export function resolveChangePath(repositoryPath: string, changePath: string): string {
  // Porcelain rename lines may look like "old -> new"; open the working-tree side.
  const relative = changePath.includes(' -> ')
    ? changePath.split(' -> ').at(-1)!.trim()
    : changePath.trim()
  if (!relative || path.isAbsolute(relative) || relative.includes('\0')) {
    throw new Error('Invalid file path.')
  }
  const root = path.resolve(repositoryPath)
  const resolved = path.resolve(root, relative)
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error('File is outside the repository.')
  }
  return resolved
}

/**
 * Build dugite/Git `-c` config args for a single network invocation.
 * Never rewrites the stored remote; credentials only live in process config.
 */
/** Abort hung fetch/pull/push so the UI never sits on “Fetching…” forever. */
export const NETWORK_GIT_TIMEOUT_MS = 90_000

export function buildGithubNetworkConfigArgs(
  remoteUrl: string,
  token: string | null | undefined
): string[] {
  // Disable credential helpers (do NOT use `credential.helper=!` — that can hang
  // on Windows by treating `!` as an external helper command).
  const configArgs: string[] = [
    '-c',
    'credential.helper=',
    // Abort transfers that stall (bytes/sec floor for N seconds).
    '-c',
    'http.lowSpeedLimit=1000',
    '-c',
    'http.lowSpeedTime=45',
  ]
  const github = parseGithubRemote(remoteUrl)
  if (!github || !token) return configArgs

  const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
  configArgs.push('-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`)

  // SSH origin → force HTTPS for this process only so the token can authenticate.
  if (!/^https?:\/\//i.test(remoteUrl.trim())) {
    const httpsRemote = `https://github.com/${github.owner}/${github.name}.git`
    configArgs.push('-c', `url.${httpsRemote}.insteadOf=${remoteUrl.trim()}`)
  }
  return configArgs
}

export function isNetworkGitTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; message?: string; code?: string }
  if (err.name === 'AbortError') return true
  if (err.code === 'ABORT_ERR') return true
  const message = typeof err.message === 'string' ? err.message : ''
  return /aborted|abort/i.test(message)
}

/** Choose push argv based on whether the branch already tracks a remote. */
export function selectPushArgs(branch: string, hasUpstream: boolean): string[] {
  const name = branch.trim()
  if (!name || name === 'HEAD') {
    throw new Error('Detached HEAD — check out a branch before pushing.')
  }
  if (hasUpstream) return ['push']
  return ['push', '-u', 'origin', name]
}

/**
 * Paths to commit: only explicitly selected (checked) files.
 * Empty selection means commit nothing — never falls back to all changes.
 */
export function selectCommitPaths(selectedPaths: Iterable<string>): string[] {
  return [...selectedPaths].map((p) => p.trim()).filter(Boolean)
}

/**
 * Default-checked model: every current change is selected unless the user has
 * unchecked it (path present in `deselected`).
 */
export function isChangeSelected(path: string, deselected: ReadonlySet<string>): boolean {
  return !deselected.has(path)
}

export function applyChangeSelection(
  deselected: Set<string>,
  path: string,
  selected: boolean
): void {
  if (selected) deselected.delete(path)
  else deselected.add(path)
}

export function classifyNetworkGitError(detail: string): string {
  if (/could not read Username|Authentication failed|Invalid username or token|403|401/i.test(detail)) {
    return 'GitHub authentication failed. Disconnect and sign in again, then retry push.'
  }
  if (/no upstream|has no upstream branch|set-upstream/i.test(detail)) {
    return 'This branch has no upstream. Push will set origin as upstream automatically — try again.'
  }
  return detail
}
