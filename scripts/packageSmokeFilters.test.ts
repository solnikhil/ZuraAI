// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards issue #133: the Package Smoke path filter included `package.json` but
 * omitted `bun.lock`, so a lockfile-only transitive/native resolution change
 * could alter shipped contents without ever running electron-builder.
 */

const repoRoot = path.resolve(__dirname, '..')
const workflowPath = path.join(repoRoot, '.github/workflows/ci-package-smoke.yml')
const workflow = readFileSync(workflowPath, 'utf8')

/** Extracts the quoted globs from the `paths:` list of the trigger block. */
function triggerPaths(): string[] {
  const block = workflow.match(/\n {4}paths:\n((?: {6}- '[^']+'\n)+)/)
  expect(block, 'could not find a paths: list in ci-package-smoke.yml').toBeTruthy()
  return Array.from(block![1].matchAll(/- '([^']+)'/g)).map((match) => match[1])
}

/** Minimal GitHub-Actions-style glob match, sufficient for these patterns. */
function matchesGlob(pattern: string, filePath: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .split('**')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
      .join('.*')}$`
  )
  return regex.test(filePath)
}

function isTriggered(filePath: string): boolean {
  return triggerPaths().some((pattern) => matchesGlob(pattern, filePath))
}

describe('Package Smoke path filters', () => {
  it('triggers on a lockfile-only change', () => {
    // The regression: this was the one packaging input that could change alone.
    expect(isTriggered('bun.lock')).toBe(true)
  })

  it('triggers on every packaging-relevant input', () => {
    for (const file of [
      'package.json',
      'bun.lock',
      'bunfig.toml',
      'vite.config.ts',
      'tsconfig.json',
      'electron/main.ts',
      'installer/installer.nsh',
      'build/icon.ico',
      'packages/zuraai/package.json',
      'packages/provider-core/src/index.ts',
      'scripts/generate-icons.mjs',
      'scripts/generate-release-checksums.mjs',
      '.github/workflows/ci-package-smoke.yml',
      '.github/actions/setup-bun/action.yml',
    ]) {
      expect(isTriggered(file), `${file} should trigger Package Smoke`).toBe(true)
    }
  })

  it('does not trigger on unrelated changes', () => {
    for (const file of [
      'README.md',
      'docs/CI.md',
      'src/components/Dashboard/ChatArea.tsx',
      '.github/workflows/lint.yml',
    ]) {
      expect(isTriggered(file), `${file} should not trigger Package Smoke`).toBe(false)
    }
  })

  it('lists every referenced local path that actually exists', () => {
    // Catches typos and stale entries in the filter list.
    const literalPaths = triggerPaths().filter((pattern) => !pattern.includes('*'))
    for (const literal of literalPaths) {
      expect(() => readFileSync(path.join(repoRoot, literal))).not.toThrow()
    }
  })
})
