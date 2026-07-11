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
export function buildGithubNetworkConfigArgs(
  remoteUrl: string,
  token: string | null | undefined
): string[] {
  const configArgs: string[] = ['-c', 'credential.helper=', '-c', 'credential.helper=!']
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

/** Choose push argv based on whether the branch already tracks a remote. */
export function selectPushArgs(branch: string, hasUpstream: boolean): string[] {
  const name = branch.trim()
  if (!name || name === 'HEAD') {
    throw new Error('Detached HEAD — check out a branch before pushing.')
  }
  if (hasUpstream) return ['push']
  return ['push', '-u', 'origin', name]
}

/** Paths to commit: checked files, or all changes when none are checked. */
export function selectCommitPaths(
  selectedPaths: Iterable<string>,
  allChangePaths: readonly string[]
): string[] {
  const selected = [...selectedPaths].map((p) => p.trim()).filter(Boolean)
  if (selected.length) return selected
  return allChangePaths.map((p) => p.trim()).filter(Boolean)
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
