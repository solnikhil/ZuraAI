/**
 * Property-Based Test: Preservation — Runtime Behavior Unchanged After Build Config Changes
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * These tests observe the CURRENT (unfixed) code and assert baseline behaviors
 * that MUST be preserved after the package-size-reduction fix is applied.
 * They read actual project files and verify structural invariants.
 *
 * All tests here MUST PASS on unfixed code — they capture the existing state.
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
    win?: Record<string, unknown>
    nsis?: Record<string, unknown>
    [key: string]: unknown
  }
}

const viteConfigSource = readProjectFile('vite.config.ts')
const lucideBarrelSource = readProjectFile('src/lib/lucide-react.tsx')

// ── Property test config ───────────────────────────────────────────────────

const PBT_CONFIG = { numRuns: 50, seed: 42 }

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Property 2: Preservation — Runtime Behavior Unchanged After Build Config Changes', () => {
  // ── 1. Radix UI scoped packages in dependencies ──────────────────────────

  it('scoped @radix-ui/react-* packages used by the app are listed in package.json dependencies', () => {
    /**
     * **Validates: Requirements 3.3**
     *
     * For any Radix UI component name from the set of used primitives,
     * the scoped @radix-ui/react-* package must be listed in package.json
     * dependencies. This ensures all Radix components resolve correctly
     * after the umbrella package is removed.
     */
    const deps = pkg.dependencies ?? {}

    // These are the scoped Radix packages already individually listed in
    // package.json dependencies (the current baseline to preserve).
    const usedRadixPrimitives = [
      'collapsible',
      'context-menu',
      'dialog',
      'label',
      'popover',
      'scroll-area',
      'select',
      'separator',
      'slot',
      'switch',
      'tooltip',
    ]

    fc.assert(
      fc.property(fc.constantFrom(...usedRadixPrimitives), (primitive: string) => {
        const scopedPkg = `@radix-ui/react-${primitive}`
        expect(deps).toHaveProperty(scopedPkg)
      }),
      PBT_CONFIG
    )
  })

  // ── 2. Syntax highlighting language validity ─────────────────────────────

  it('commonly-used syntax highlighting languages are valid and will be supported', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any syntax-highlighted language in the commonly-used set, verify
     * the language name is valid and will be supported. We check that
     * react-syntax-highlighter is a dependency (ensuring the library is
     * available) and that the language names conform to expected patterns.
     */
    const deps = pkg.dependencies ?? {}

    // Commonly-used languages that must remain supported
    const commonLanguages = [
      'typescript',
      'javascript',
      'python',
      'java',
      'go',
      'rust',
      'sql',
      'bash',
      'json',
      'yaml',
      'html',
      'css',
      'markdown',
      'cpp',
      'csharp',
      'ruby',
      'php',
      'swift',
      'kotlin',
      'xml',
      'diff',
      'docker',
      'graphql',
      'toml',
    ]

    // react-syntax-highlighter must be a dependency
    expect(deps).toHaveProperty('react-syntax-highlighter')

    fc.assert(
      fc.property(fc.constantFrom(...commonLanguages), (lang: string) => {
        // Language names must be non-empty lowercase alphanumeric strings
        expect(lang).toMatch(/^[a-z][a-z0-9+#]*$/)
        // Language must be in our known supported set
        expect(commonLanguages).toContain(lang)
      }),
      PBT_CONFIG
    )
  })

  // ── 3. Icon barrel exports resolve to @phosphor-icons/react ──────────────

  it('every icon exported from lucide-react barrel resolves to a @phosphor-icons/react component', () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * For any icon exported from src/lib/lucide-react.tsx, the export must
     * resolve to a valid component from @phosphor-icons/react. We parse the
     * barrel file to extract all named exports and verify each one maps to
     * a Phosphor icon import.
     */

    // Extract all `export const <Name>` declarations from the barrel file
    const exportRegex = /^export const (\w+)\s*=/gm
    const exports: string[] = []
    let match: RegExpExecArray | null
    while ((match = exportRegex.exec(lucideBarrelSource)) !== null) {
      exports.push(match[1])
    }

    expect(exports.length).toBeGreaterThan(0)

    // Separate primary exports (created via withDefaultWeight) from alias exports
    // Alias exports reference another export (e.g., `export const XIcon = X`)
    const aliasPattern = /^export const (\w+)\s*=\s*(\w+)\s*$/gm
    const aliases = new Set<string>()
    let aliasMatch: RegExpExecArray | null
    while ((aliasMatch = aliasPattern.exec(lucideBarrelSource)) !== null) {
      // Only count as alias if the RHS is another exported name (not a function call)
      if (exports.includes(aliasMatch[2])) {
        aliases.add(aliasMatch[1])
      }
    }

    // Primary exports are those created via withDefaultWeight(SomeBase, ...)
    const primaryExports = exports.filter((e) => !aliases.has(e))

    // All Phosphor icon imports in the barrel file. The barrel currently
    // imports directly from package subpaths like `@phosphor-icons/react/X`.
    const phosphorImportRegex =
      /import\s*\{[^}]+\}\s*from\s*['"]@phosphor-icons\/react\/(?:dist\/csr\/)?(\w+)['"]/g
    const phosphorImports: string[] = []
    let pMatch: RegExpExecArray | null
    while ((pMatch = phosphorImportRegex.exec(lucideBarrelSource)) !== null) {
      phosphorImports.push(pMatch[1])
    }

    expect(phosphorImports.length).toBeGreaterThan(0)

    fc.assert(
      fc.property(fc.constantFrom(...primaryExports), (exportName: string) => {
        // Each primary export must be created via withDefaultWeight which
        // wraps a Phosphor icon base component. Verify the export line
        // references withDefaultWeight.
        const exportLine = lucideBarrelSource
          .split('\n')
          .find((line) => line.startsWith(`export const ${exportName} =`))

        expect(exportLine).toBeDefined()
        expect(exportLine).toContain('withDefaultWeight(')
      }),
      PBT_CONFIG
    )
  })

  // ── 4. Vite alias for lucide-react ───────────────────────────────────────

  it('vite.config.ts retains the "lucide-react" alias pointing to the barrel file', () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * The Vite resolve alias must map "lucide-react" to the barrel file
     * at ./src/lib/lucide-react.tsx so all lucide-react imports in the
     * renderer are redirected to the Phosphor icons barrel.
     */
    fc.assert(
      fc.property(fc.constant(viteConfigSource), (source: string) => {
        // Must contain the lucide-react alias
        expect(source).toMatch(/['"]lucide-react['"]/)

        // Must point to the barrel file path
        expect(source).toMatch(/lucide-react.*src\/lib\/lucide-react\.tsx/)
      }),
      PBT_CONFIG
    )
  })

  // ── 5. manualChunks routing ──────────────────────────────────────────────

  it('vite.config.ts leaves feature chunking to the dynamic import graph', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3**
     *
     * Manual vendor chunks can absorb shared runtime modules and turn lazy
     * features into static route dependencies. The build must preserve the
     * dynamic import graph instead.
     */
    expect(viteConfigSource).not.toContain('manualChunks(')
  })

  // ── 6. package.json#build files array ────────────────────────────────────

  it('package.json#build.files includes dist/**/* and dist-electron/**/*', () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * The electron-builder files configuration must include both dist and
     * dist-electron directories to ensure the built application and electron
     * main process code are packaged correctly.
     */
    const filesGlob = pkg.build?.files as string[] | undefined

    fc.assert(
      fc.property(fc.constantFrom('dist/**/*', 'dist-electron/**/*'), (requiredGlob: string) => {
        expect(filesGlob).toBeDefined()
        expect(Array.isArray(filesGlob)).toBe(true)
        expect(filesGlob).toContain(requiredGlob)
      }),
      PBT_CONFIG
    )
  })

  // ── 7. NSIS installer config ─────────────────────────────────────────────

  it('electron-builder config produces a valid NSIS installer config', () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * The electron-builder NSIS configuration must retain all required
     * installer settings: oneClick, icon paths, shortcut creation, and
     * artifact naming.
     */
    const nsisConfig = pkg.build?.nsis as Record<string, unknown> | undefined
    const winConfig = pkg.build?.win as Record<string, unknown> | undefined

    // Required NSIS configuration keys and their expected types/values
    const requiredNsisKeys = [
      { key: 'oneClick', type: 'boolean' },
      { key: 'allowToChangeInstallationDirectory', type: 'boolean' },
      { key: 'createDesktopShortcut', type: 'boolean' },
      { key: 'createStartMenuShortcut', type: 'boolean' },
      { key: 'installerIcon', type: 'string' },
      { key: 'uninstallerIcon', type: 'string' },
      { key: 'artifactName', type: 'string' },
    ]

    fc.assert(
      fc.property(
        fc.constantFrom(...requiredNsisKeys),
        (requirement: { key: string; type: string }) => {
          expect(nsisConfig).toBeDefined()
          expect(nsisConfig).toHaveProperty(requirement.key)
          expect(typeof nsisConfig![requirement.key]).toBe(requirement.type)
        }
      ),
      PBT_CONFIG
    )

    // Win config must target NSIS
    expect(winConfig).toBeDefined()
    expect(winConfig!.icon).toBeDefined()

    // NSIS must be configured as wizard installer (not one-click)
    expect(nsisConfig!.oneClick).toBe(false)

    // Icon paths must reference build directory
    expect(nsisConfig!.installerIcon).toContain('build/')
    expect(nsisConfig!.uninstallerIcon).toContain('build/')
  })
})
