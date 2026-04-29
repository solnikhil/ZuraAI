/**
 * Property-Based Test: Bug Condition — Build Configuration Bloat Detection
 *
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 *
 * This test encodes the EXPECTED (fixed) state for eight build-configuration
 * defects. On unfixed code it MUST FAIL — failure confirms the bugs exist.
 * After the fix is applied, the same test validates correctness.
 *
 * For each defect the test reads actual project files and asserts the desired
 * post-fix condition. fast-check is used to generate arbitrary valid variants
 * where appropriate (e.g. dependency names, file-glob patterns) while the core
 * assertions inspect the real project state.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

// ── Helpers ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..')

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
}

function readJSON(relativePath: string): Record<string, unknown> {
  return JSON.parse(readProjectFile(relativePath))
}

// ── Shared project state (read once) ───────────────────────────────────────

const pkg = readJSON('package.json') as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  build?: {
    files?: string[]
    electronLanguages?: string[]
    [key: string]: unknown
  }
}

const viteConfigSource = readProjectFile('vite.config.ts')
const markdownPreloaderSource = readProjectFile('src/utils/markdownPreloader.ts')
const alertDialogSource = readProjectFile('src/components/ui/alert-dialog.tsx')
const dropdownMenuSource = readProjectFile('src/components/ui/dropdown-menu.tsx')
const buttonSource = readProjectFile('src/components/ui/button.tsx')

// ── Property test config ───────────────────────────────────────────────────

const PBT_CONFIG = { numRuns: 50, seed: 42 }

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Property 1: Bug Condition — Build Configuration Bloat Detection', () => {

  // ── (a) radix-ui umbrella package does NOT exist in dependencies ──────────

  it('(a) radix-ui umbrella package should NOT exist in package.json dependencies', () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * For any arbitrary dependency name that matches the radix-ui umbrella
     * pattern, the package.json dependencies must NOT contain it. Only
     * individual @radix-ui/react-* scoped packages should be present.
     */
    const deps = pkg.dependencies ?? {}

    // Direct assertion: the umbrella "radix-ui" key must not exist
    expect(deps).not.toHaveProperty('radix-ui')

    // Property: for any generated radix-ui scoped package name that IS in
    // deps, it must be a @radix-ui/react-* scoped package, never the umbrella
    const radixDeps = Object.keys(deps).filter(
      (d) => d === 'radix-ui' || d.startsWith('@radix-ui/')
    )

    fc.assert(
      fc.property(
        fc.constantFrom(...(radixDeps.length > 0 ? radixDeps : ['@radix-ui/react-slot'])),
        (depName: string) => {
          // Every radix-related dependency must be a scoped @radix-ui/react-* package
          expect(depName).toMatch(/^@radix-ui\/react-/)
          expect(depName).not.toBe('radix-ui')
        }
      ),
      PBT_CONFIG
    )
  })

  // ── (b) UI files import from @radix-ui/react-*, NOT from "radix-ui" ──────

  it('(b) UI component files should import from @radix-ui/react-* not from "radix-ui"', () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * For each of the three UI files that previously imported from the
     * radix-ui umbrella, assert they now import from scoped packages.
     */
    const uiFiles = [
      { name: 'alert-dialog.tsx', source: alertDialogSource },
      { name: 'dropdown-menu.tsx', source: dropdownMenuSource },
      { name: 'button.tsx', source: buttonSource },
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...uiFiles),
        (file: { name: string; source: string }) => {
          // Must NOT contain a bare import from "radix-ui"
          const hasBareRadixImport = /from\s+["']radix-ui["']/.test(file.source)
          expect(hasBareRadixImport).toBe(false)

          // Must contain at least one import from @radix-ui/react-*
          const hasScopedImport = /from\s+["']@radix-ui\/react-/.test(file.source)
          expect(hasScopedImport).toBe(true)
        }
      ),
      PBT_CONFIG
    )
  })

  // ── (c) markdownPreloader imports prism-light build ───────────────────────

  it('(c) markdownPreloader.ts should import prism-light build, not full react-syntax-highlighter', () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * The import path must reference the lighter prism-light build rather
     * than the full react-syntax-highlighter entry point.
     */
    fc.assert(
      fc.property(fc.constant(markdownPreloaderSource), (source: string) => {
        // Must NOT import from the full react-syntax-highlighter entry
        const hasFullImport =
          /import\(\s*['"]react-syntax-highlighter['"]\s*\)/.test(source)
        expect(hasFullImport).toBe(false)

        // Must import from the prism-light build
        const hasLightImport =
          /react-syntax-highlighter\/dist\/esm\/prism-light/.test(source)
        expect(hasLightImport).toBe(true)
      }),
      PBT_CONFIG
    )
  })

  // ── (d) duck-duck-scrape IS in rollupOptions.external ─────────────────────

  it('(d) duck-duck-scrape should be in rollupOptions.external for the main process build', () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * The vite.config.ts main-process build must externalize duck-duck-scrape
     * so it is resolved from node_modules at runtime instead of being bundled.
     */
    fc.assert(
      fc.property(fc.constant(viteConfigSource), (source: string) => {
        // The external array must include 'duck-duck-scrape'
        const externalMatch = source.match(
          /external\s*:\s*\[([^\]]*)\]/
        )
        expect(externalMatch).not.toBeNull()

        const externalContent = externalMatch![1]
        expect(externalContent).toContain('duck-duck-scrape')
      }),
      PBT_CONFIG
    )
  })

  // ── (e) lucide-react does NOT exist as a production dependency ────────────

  it('(e) lucide-react should NOT exist as a production dependency in package.json', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * The lucide-react npm package is unnecessary because the Vite alias
     * redirects all imports to the @phosphor-icons barrel file.
     */
    const deps = pkg.dependencies ?? {}

    fc.assert(
      fc.property(
        fc.constant(Object.keys(deps)),
        (depNames: string[]) => {
          expect(depNames).not.toContain('lucide-react')
        }
      ),
      PBT_CONFIG
    )
  })

  // ── (f) electronLanguages config EXISTS in package.json#build ─────────────

  it('(f) electronLanguages config should exist in package.json#build', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * The electron-builder config must specify electronLanguages to strip
     * unused locale .pak files from the distribution.
     */
    fc.assert(
      fc.property(fc.constant(pkg.build), (buildConfig: typeof pkg.build) => {
        expect(buildConfig).toBeDefined()
        expect(buildConfig!.electronLanguages).toBeDefined()
        expect(Array.isArray(buildConfig!.electronLanguages)).toBe(true)
        expect(buildConfig!.electronLanguages!.length).toBeGreaterThan(0)
        expect(buildConfig!.electronLanguages).toContain('en-US')
      }),
      PBT_CONFIG
    )
  })

  // ── (g) stale renderer/build compatibility config is absent ──────────────

  it('(g) vite.config.ts should not keep ignored esbuild or renderer shim config', () => {
    /**
     * **Validates: Requirements 1.7**
     *
     * Vite 8 uses OXC by default. Keeping esbuild.drop in this config is now
     * ignored and emits a misleading warning. The renderer also does not import
     * Electron/Node modules, so vite-plugin-electron-renderer should not be
     * wired into the renderer build.
     */
    fc.assert(
      fc.property(fc.constant(viteConfigSource), (source: string) => {
        expect(/esbuild\s*:\s*\{[^}]*drop\s*:/.test(source)).toBe(false)
        expect(source).not.toContain('vite-plugin-electron-renderer')
      }),
      PBT_CONFIG
    )
  })

  // ── (h) files glob excludes .map, .test.*, .spec.*, .d.ts, test dirs ─────

  it('(h) files glob in package.json#build should include exclusion patterns', () => {
    /**
     * **Validates: Requirements 1.8**
     *
     * The electron-builder files glob must exclude development artifacts
     * (source maps, test files, declaration files, test directories).
     */
    const filesGlob = pkg.build?.files as string[] | undefined

    // Required exclusion patterns
    const requiredExclusions = [
      '!**/*.map',
      '!**/*.test.*',
      '!**/*.spec.*',
      '!**/*.d.ts',
    ]

    // Required test directory exclusions (at least one of these patterns)
    const testDirExclusions = [
      '!**/test/**',
      '!**/tests/**',
      '!**/__tests__/**',
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...requiredExclusions),
        (exclusionPattern: string) => {
          expect(filesGlob).toBeDefined()
          expect(Array.isArray(filesGlob)).toBe(true)
          expect(filesGlob).toContain(exclusionPattern)
        }
      ),
      PBT_CONFIG
    )

    // At least one test directory exclusion must be present
    fc.assert(
      fc.property(
        fc.constant(filesGlob),
        (glob: string[] | undefined) => {
          expect(glob).toBeDefined()
          const hasTestDirExclusion = testDirExclusions.some((pattern) =>
            glob!.includes(pattern)
          )
          expect(hasTestDirExclusion).toBe(true)
        }
      ),
      PBT_CONFIG
    )
  })
})
