/**
 * Real dugite smoke tests — verifies embedded Git resolution and local commit
 * workflow without network / GitHub OAuth.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { exec as execGit } from 'dugite'

function resolveEmbeddedGitDir(): string {
  if (process.env.LOCAL_GIT_DIRECTORY && existsSync(process.env.LOCAL_GIT_DIRECTORY)) {
    return path.resolve(process.env.LOCAL_GIT_DIRECTORY)
  }
  const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'))
  const gitDir = path.join(path.dirname(requireFromApp.resolve('dugite/package.json')), 'git')
  if (!existsSync(gitDir)) {
    throw new Error(`dugite git not found at ${gitDir}`)
  }
  return gitDir
}

async function git(repo: string, args: string[], gitDir: string) {
  const result = await execGit(args, repo, {
    env: {
      ...process.env,
      LOCAL_GIT_DIRECTORY: gitDir,
      GIT_TERMINAL_PROMPT: '0',
      // Keep commit tests hermetic / non-interactive.
      GIT_AUTHOR_NAME: 'ZuraAI Test',
      GIT_AUTHOR_EMAIL: 'test@zuraai.local',
      GIT_COMMITTER_NAME: 'ZuraAI Test',
      GIT_COMMITTER_EMAIL: 'test@zuraai.local',
    },
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} failed`)
  }
  return result.stdout
}

describe('GitHub Workspace dugite smoke', () => {
  let gitDir = ''
  let tempRoot = ''
  const temps: string[] = []

  beforeAll(() => {
    gitDir = resolveEmbeddedGitDir()
    process.env.LOCAL_GIT_DIRECTORY = gitDir
  })

  afterEach(async () => {
    await Promise.all(
      temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => undefined))
    )
  })

  async function makeTempRepo() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'zura-gw-'))
    temps.push(tempRoot)
    await git(tempRoot, ['init'], gitDir)
    await git(tempRoot, ['checkout', '-b', 'main'], gitDir)
    await fs.writeFile(path.join(tempRoot, 'readme.md'), '# test\n', 'utf8')
    await git(tempRoot, ['add', 'readme.md'], gitDir)
    await git(tempRoot, ['commit', '-m', 'initial'], gitDir)
    return tempRoot
  }

  it('finds the embedded git binary', () => {
    const binary =
      process.platform === 'win32'
        ? path.join(gitDir, 'cmd', 'git.exe')
        : path.join(gitDir, 'bin', 'git')
    expect(existsSync(binary)).toBe(true)
  })

  it('runs git --version through dugite', async () => {
    const out = await git(process.cwd(), ['--version'], gitDir)
    expect(out).toMatch(/git version/i)
  })

  it('commits a local change with dugite (commit path)', async () => {
    const repo = await makeTempRepo()
    await fs.writeFile(path.join(repo, 'note.txt'), 'hello\n', 'utf8')
    const statusBefore = await git(repo, ['status', '--porcelain=v1'], gitDir)
    expect(statusBefore).toMatch(/note\.txt/)

    await git(repo, ['add', '--', 'note.txt'], gitDir)
    await git(repo, ['commit', '-m', 'add note'], gitDir)

    const statusAfter = await git(repo, ['status', '--porcelain=v1'], gitDir)
    expect(statusAfter.trim()).toBe('')

    const log = await git(repo, ['log', '-1', '--pretty=%s'], gitDir)
    expect(log.trim()).toBe('add note')
  })

  it('reports ahead after a local commit without upstream', async () => {
    const repo = await makeTempRepo()
    // Simulate a remote tracking branch that we are ahead of (local-only remote).
    const bare = path.join(path.dirname(repo), 'remote.git')
    temps.push(bare)
    await git(path.dirname(repo), ['init', '--bare', bare], gitDir)
    await git(repo, ['remote', 'add', 'origin', bare], gitDir)
    await git(repo, ['push', '-u', 'origin', 'main'], gitDir)

    await fs.writeFile(path.join(repo, 'ahead.txt'), 'x\n', 'utf8')
    await git(repo, ['add', 'ahead.txt'], gitDir)
    await git(repo, ['commit', '-m', 'ahead commit'], gitDir)

    const status = await git(repo, ['status', '--porcelain=v1', '--branch'], gitDir)
    expect(status).toMatch(/ahead 1/)
  })

  it('pushes an ahead commit to a local bare origin (push path without GitHub)', async () => {
    const repo = await makeTempRepo()
    const bare = path.join(path.dirname(repo), 'origin.git')
    temps.push(bare)
    await git(path.dirname(repo), ['init', '--bare', bare], gitDir)
    await git(repo, ['remote', 'add', 'origin', bare], gitDir)
    await git(repo, ['push', '-u', 'origin', 'main'], gitDir)

    await fs.writeFile(path.join(repo, 'push-me.txt'), 'push\n', 'utf8')
    await git(repo, ['add', 'push-me.txt'], gitDir)
    await git(repo, ['commit', '-m', 'ready to push'], gitDir)

    // Same args selectPushArgs(hasUpstream=true) produces.
    await git(repo, ['push'], gitDir)

    const status = await git(repo, ['status', '--porcelain=v1', '--branch'], gitDir)
    expect(status).not.toMatch(/ahead/)
  })
})
