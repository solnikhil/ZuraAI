import { describe, expect, it } from 'vitest'
import path from 'path'
import {
  buildGithubNetworkConfigArgs,
  classifyNetworkGitError,
  parseGithubRemote,
  resolveChangePath,
  selectCommitPaths,
  selectPushArgs,
} from './githubWorkspaceGit'

describe('GitHub Workspace git helpers', () => {
  describe('parseGithubRemote', () => {
    it('parses https remotes', () => {
      expect(parseGithubRemote('https://github.com/solnikhil/ZuraAI.git')).toEqual({
        owner: 'solnikhil',
        name: 'ZuraAI',
      })
      expect(parseGithubRemote('https://github.com/solnikhil/ZuraAI')).toEqual({
        owner: 'solnikhil',
        name: 'ZuraAI',
      })
    })

    it('parses ssh remotes', () => {
      expect(parseGithubRemote('git@github.com:solnikhil/ZuraAI.git')).toEqual({
        owner: 'solnikhil',
        name: 'ZuraAI',
      })
      expect(parseGithubRemote('ssh://git@github.com/solnikhil/ZuraAI.git')).toEqual({
        owner: 'solnikhil',
        name: 'ZuraAI',
      })
    })

    it('rejects non-GitHub remotes', () => {
      expect(parseGithubRemote('https://gitlab.com/org/repo.git')).toBeNull()
      expect(parseGithubRemote('')).toBeNull()
    })
  })

  describe('resolveChangePath', () => {
    const root = path.resolve('/repo/root')

    it('resolves relative paths inside the repo', () => {
      expect(resolveChangePath(root, 'src/App.tsx')).toBe(path.resolve(root, 'src/App.tsx'))
    })

    it('uses the destination side of rename paths', () => {
      expect(resolveChangePath(root, 'old.ts -> new.ts')).toBe(path.resolve(root, 'new.ts'))
    })

    it('rejects absolute and traversal paths', () => {
      expect(() => resolveChangePath(root, path.resolve('/etc/passwd'))).toThrow(/Invalid file path/)
      expect(() => resolveChangePath(root, '../outside.txt')).toThrow(/outside the repository/)
      expect(() => resolveChangePath(root, '')).toThrow(/Invalid file path/)
    })
  })

  describe('buildGithubNetworkConfigArgs', () => {
    it('disables credential helpers even without a token', () => {
      const args = buildGithubNetworkConfigArgs('https://example.com/r.git', null)
      expect(args).toEqual(['-c', 'credential.helper=', '-c', 'credential.helper=!'])
    })

    it('injects GitHub basic auth header without rewriting https remotes', () => {
      const token = 'gho_testtoken_for_unit_test_only'
      const args = buildGithubNetworkConfigArgs('https://github.com/solnikhil/ZuraAI.git', token)
      const joined = args.join('\n')
      expect(joined).toContain('http.https://github.com/.extraheader=AUTHORIZATION: basic ')
      expect(joined).not.toContain(token)
      expect(joined).not.toContain('insteadOf')
      const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
      expect(joined).toContain(basic)
    })

    it('rewrites ssh remotes to https only for the invocation', () => {
      const args = buildGithubNetworkConfigArgs('git@github.com:solnikhil/ZuraAI.git', 'gho_token')
      const joined = args.join('\n')
      expect(joined).toContain('url.https://github.com/solnikhil/ZuraAI.git.insteadOf=git@github.com:solnikhil/ZuraAI.git')
      expect(joined).toContain('AUTHORIZATION: basic ')
    })
  })

  describe('selectPushArgs', () => {
    it('uses plain push when upstream exists', () => {
      expect(selectPushArgs('pwshl', true)).toEqual(['push'])
    })

    it('sets upstream on first push', () => {
      expect(selectPushArgs('pwshl', false)).toEqual(['push', '-u', 'origin', 'pwshl'])
    })

    it('rejects detached HEAD', () => {
      expect(() => selectPushArgs('HEAD', false)).toThrow(/Detached HEAD/)
      expect(() => selectPushArgs('', true)).toThrow(/Detached HEAD/)
    })
  })

  describe('selectCommitPaths', () => {
    it('prefers explicitly selected paths', () => {
      expect(selectCommitPaths(['a.ts', 'b.ts'], ['a.ts', 'b.ts', 'c.ts'])).toEqual(['a.ts', 'b.ts'])
    })

    it('falls back to all changes when nothing is selected', () => {
      expect(selectCommitPaths([], ['a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts'])
    })
  })

  describe('classifyNetworkGitError', () => {
    it('maps auth failures to a reconnect hint', () => {
      expect(classifyNetworkGitError('Authentication failed for https://github.com/x/y.git')).toMatch(
        /sign in again/i
      )
      expect(classifyNetworkGitError('could not read Username for')).toMatch(/sign in again/i)
    })

    it('passes through other errors', () => {
      expect(classifyNetworkGitError('remote rejected')).toBe('remote rejected')
    })
  })
})
