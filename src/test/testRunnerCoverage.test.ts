// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards issue #128: two committed test files were silently excluded from CI.
 *
 * `vitest.config.ts` uses an include allowlist, and the root `test` script only
 * ran Vitest, so `scripts/**` suites and the `.cjs` Node-test suite never
 * executed. This test asserts that every committed test file is claimed by one
 * of the configured runners, so adding a suite in a new location fails loudly
 * instead of quietly never running.
 */

const repoRoot = path.resolve(__dirname, '../..')

function gitFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Converts a simple glob (`*`, `**`) into an anchored regular expression. */
function globToRegExp(glob: string): RegExp {
  let pattern = ''
  let index = 0
  while (index < glob.length) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        // `**/` matches any number of leading directories, `**` matches the rest.
        if (glob.slice(index + 2, index + 3) === '/') {
          pattern += '(?:.*/)?'
          index += 3
          continue
        }
        pattern += '.*'
        index += 2
        continue
      }
      pattern += '[^/]*'
      index += 1
      continue
    }
    pattern += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    index += 1
  }
  return new RegExp(`^${pattern}$`)
}

/** Reads the `include` array out of vitest.config.ts. */
function vitestIncludePatterns(): string[] {
  const config = readFileSync(path.join(repoRoot, 'vitest.config.ts'), 'utf8')
  const block = config.match(/include:\s*\[([\s\S]*?)\]/)
  expect(block, 'could not find the include array in vitest.config.ts').toBeTruthy()
  return Array.from(block![1].matchAll(/'([^']+)'/g)).map((match) => match[1])
}

/**
 * Patterns covered by `node --test`.
 *
 * The root `test:node` script `cd`s into a workspace and runs a bare
 * `node --test`. Node then recursively scans that directory using its own
 * default test-file patterns (*.test.{js,cjs,mjs} etc.), so the covered set
 * is "any Node-runner test file under that workspace".
 */
function nodeTestPatterns(): string[] {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const script = pkg.scripts['test:node']
  expect(script, 'root package.json must define a test:node script').toBeTruthy()

  // Match `cd <dir> && ...` or `cd <dir> &&` patterns.
  const cdMatch = script.match(/cd\s+(\S+)/)
  if (cdMatch) {
    const workspace = cdMatch[1].replace(/\/+$/, '')
    return [`${workspace}/**/*.test.js`, `${workspace}/**/*.test.cjs`, `${workspace}/**/*.test.mjs`]
  }

  const delegated = script.match(/--cwd\s+(\S+)/)
  if (delegated) {
    const workspace = delegated[1].replace(/\/+$/, '')
    return [`${workspace}/**/*.test.js`, `${workspace}/**/*.test.cjs`, `${workspace}/**/*.test.mjs`]
  }

  // Fall back to explicit paths/globs passed straight to `node --test`.
  return script
    .split(/\s+/)
    .filter((token) => token !== 'node' && token !== '--test' && !token.startsWith('-'))
    .map((token) => token.replace(/^["']|["']$/g, ''))
}

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/

describe('test runner coverage', () => {
  const committedTestFiles = gitFiles().filter((file) => TEST_FILE_PATTERN.test(file))

  it('finds committed test files to check', () => {
    expect(committedTestFiles.length).toBeGreaterThan(100)
  })

  it('claims every committed test file with a configured runner', () => {
    const matchers = [...vitestIncludePatterns(), ...nodeTestPatterns()].map(globToRegExp)

    const orphans = committedTestFiles.filter(
      (file) => !matchers.some((matcher) => matcher.test(file))
    )

    expect(
      orphans,
      'these committed test files are not run by Vitest or by node --test; add them to vitest.config.ts include or to the test:node glob'
    ).toEqual([])
  })

  it('runs both runners from the root test script', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    // `bun run test` must fail if either runner fails.
    expect(pkg.scripts.test).toContain('test:vitest')
    expect(pkg.scripts.test).toContain('test:node')
    expect(pkg.scripts.test).toContain('&&')
  })

  it('exposes a test script on the launcher package', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, 'packages/zuraai/package.json'), 'utf8')
    ) as { scripts?: Record<string, string> }
    expect(pkg.scripts?.test).toBeTruthy()
  })

  it('matches the two suites that issue #128 found missing', () => {
    const matchers = [...vitestIncludePatterns(), ...nodeTestPatterns()].map(globToRegExp)
    for (const file of [
      'scripts/inspect-chat-session.test.ts',
      'packages/zuraai/bin/zuraai.test.cjs',
    ]) {
      expect(committedTestFiles, `${file} should be committed`).toContain(file)
      expect(
        matchers.some((matcher) => matcher.test(file)),
        `${file} must be claimed by a runner`
      ).toBe(true)
    }
  })
})
