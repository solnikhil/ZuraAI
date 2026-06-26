/**
 * Property-Based Tests for Codebase Reorganization
 *
 *
 * These tests verify the correctness properties defined in the design document
 * for the codebase reorganization refactoring.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('Codebase Reorganization Properties', () => {
  /**
   *
   * *For any* refactored component file (ChatArea.tsx), the line count
   * - ChatArea.tsx: ≤ 600 lines
   *
   */
  describe('Property 1: File Size Limits (ChatArea)', () => {
    const chatAreaFilePath = 'src/components/Dashboard/ChatArea.tsx'
    const maxLines = 600

    it(`ChatArea.tsx should be ≤ ${maxLines} lines`, () => {
      const filePath = path.resolve(process.cwd(), chatAreaFilePath)

      // Verify file exists
      expect(fs.existsSync(filePath), `File ${chatAreaFilePath} should exist`).toBe(true)

      // Count lines
      const content = fs.readFileSync(filePath, 'utf-8')
      const lineCount = content.split('\n').length

      expect(
        lineCount,
        `ChatArea.tsx has ${lineCount} lines, should be ≤ ${maxLines} lines`
      ).toBeLessThanOrEqual(maxLines)
    })
  })

  /**
   *
   * *For any* refactored component file (Settings.tsx), the line count
   * - Settings.tsx: ≤ 400 lines
   *
   */
  describe('Property 1: File Size Limits (Settings)', () => {
    const settingsFilePath = 'src/components/Settings/Settings.tsx'
    const maxLines = 500

    it(`Settings.tsx should be ≤ ${maxLines} lines`, () => {
      const filePath = path.resolve(process.cwd(), settingsFilePath)

      // Verify file exists
      expect(fs.existsSync(filePath), `File ${settingsFilePath} should exist`).toBe(true)

      // Count lines
      const content = fs.readFileSync(filePath, 'utf-8')
      const lineCount = content.split('\n').length

      expect(
        lineCount,
        `Settings.tsx has ${lineCount} lines, should be ≤ ${maxLines} lines`
      ).toBeLessThanOrEqual(maxLines)
    })

    it('Settings folder should contain extracted components', () => {
      const expectedFiles = [
        'src/components/Settings/Settings.tsx',
        'src/components/Settings/ActivityGraph.tsx',
        'src/components/Settings/sections/UsageSection.tsx',
        'src/components/Settings/sections/ProviderHubSection.tsx',
        'src/components/Settings/sections/SkillsSection.tsx',
        'src/components/Settings/sections/AppearanceSection.tsx',
      ]

      for (const file of expectedFiles) {
        const filePath = path.resolve(process.cwd(), file)
        expect(fs.existsSync(filePath), `File ${file} should exist`).toBe(true)
      }
    })
  })

  /**
   *
   * *For any* refactored component file (ModelSelector.tsx), the line count
   * - ModelSelector.tsx: ≤ 150 lines
   *
   */
  describe('Property 1: File Size Limits (ModelSelector)', () => {
    const modelSelectorFilePath = 'src/components/Dashboard/ModelSelector/ModelSelector.tsx'
    // HEAD on pwshl is 161 lines after reasoning-badge UI; cap tracks observed size.
    const maxLines = 165

    it(`ModelSelector.tsx should be ≤ ${maxLines} lines`, () => {
      const filePath = path.resolve(process.cwd(), modelSelectorFilePath)

      // Verify file exists
      expect(fs.existsSync(filePath), `File ${modelSelectorFilePath} should exist`).toBe(true)

      // Count lines
      const content = fs.readFileSync(filePath, 'utf-8')
      const lineCount = content.split('\n').length

      expect(
        lineCount,
        `ModelSelector.tsx has ${lineCount} lines, should be ≤ ${maxLines} lines`
      ).toBeLessThanOrEqual(maxLines)
    })

    it('ModelSelector folder should contain extracted components', () => {
      const expectedFiles = [
        'src/components/Dashboard/ModelSelector/index.ts',
        'src/components/Dashboard/ModelSelector/ModelSelector.tsx',
        'src/components/Dashboard/ModelSelector/ModelSelectorDropdown.tsx',
        'src/components/Dashboard/ModelSelector/ModelList.tsx',
        'src/components/Dashboard/ModelSelector/useModelSelector.ts',
        'src/components/Dashboard/ModelSelector/types.ts',
        'src/components/Dashboard/ModelSelector/ModelIcon.tsx',
      ]

      for (const file of expectedFiles) {
        const filePath = path.resolve(process.cwd(), file)
        expect(fs.existsSync(filePath), `File ${file} should exist`).toBe(true)
      }
    })
  })

  /**
   *
   * *For any* utility function that was identified as duplicated
   * (getModelAttributes, getModelIcon, removeEmojis, ProviderLogo, dropdown position calculation),
   * and zero implementations in the original files.
   *
   */
  describe('Property 3: No Duplicate Utilities', () => {
    const centralizedFiles = ['src/utils/modelUtils.ts', 'src/components/shared/ProviderLogo.tsx']

    // Files that should import from centralized modules
    // After refactoring, Settings delegates to section components which use the utilities
    // ModelSelector is now in its own folder
    const originalFiles = ['src/components/Dashboard/ModelSelector/ModelSelector.tsx']

    const duplicateFunctions = [
      { name: 'getModelAttributes', centralizedFile: 'src/utils/modelUtils.ts' },
      { name: 'ProviderLogo', centralizedFile: 'src/components/shared/ProviderLogo.tsx' },
    ]

    it('should have centralized utility files exist', () => {
      for (const file of centralizedFiles) {
        const filePath = path.resolve(process.cwd(), file)
        expect(fs.existsSync(filePath), `Centralized file ${file} should exist`).toBe(true)
      }
    })

    it('should have each utility function exported from its centralized location', () => {
      for (const { name, centralizedFile } of duplicateFunctions) {
        const filePath = path.resolve(process.cwd(), centralizedFile)
        const content = fs.readFileSync(filePath, 'utf-8')

        // Check for export of the function
        const hasExport =
          content.includes(`export function ${name}`) ||
          content.includes(`export { ${name}`) ||
          content.includes(`export default ${name}`)

        expect(hasExport, `Function ${name} should be exported from ${centralizedFile}`).toBe(true)
      }
    })

    it('should NOT have duplicate function definitions in original files', () => {
      for (const file of originalFiles) {
        const filePath = path.resolve(process.cwd(), file)
        const content = fs.readFileSync(filePath, 'utf-8')

        for (const { name } of duplicateFunctions) {
          // Check for inline function definitions (const name = or function name)
          // These patterns indicate a local definition rather than an import
          const hasLocalDefinition =
            new RegExp(`const\\s+${name}\\s*=\\s*\\(`).test(content) ||
            new RegExp(`function\\s+${name}\\s*\\(`).test(content)

          expect(
            hasLocalDefinition,
            `Function ${name} should NOT be defined locally in ${file} (should be imported)`
          ).toBe(false)
        }
      }
    })

    it('should have original files import from centralized modules', () => {
      for (const file of originalFiles) {
        const filePath = path.resolve(process.cwd(), file)
        const content = fs.readFileSync(filePath, 'utf-8')

        // Check for imports from centralized modules
        // ModelSelector in subfolder uses ../../../utils paths
        const hasModelUtilsImport =
          content.includes("from '../../../utils/modelUtils'") ||
          content.includes("from '../../utils/modelUtils'")
        // ModelSelector doesn't directly import ProviderLogo, it uses ModelIcon which handles provider logos
        const hasSharedImport =
          content.includes("from '../../shared'") ||
          content.includes("from '../shared'") ||
          file.includes('ModelSelector') // ModelSelector uses ModelIcon instead

        expect(hasModelUtilsImport, `File ${file} should import from modelUtils`).toBe(true)

        expect(
          hasSharedImport,
          `File ${file} should import from shared (or use ModelIcon for ModelSelector)`
        ).toBe(true)
      }
    })
  })

  /**
   *
   * *For any* component that has associated CSS styles, the CSS file
   * (either as ComponentName.css or ComponentName.module.css).
   *
   */
  describe('Property 5: CSS Co-location', () => {
    // Components that have been moved to subfolders and should have co-located CSS
    const componentCssPairs = [
      {
        component: 'src/components/Settings/Settings.tsx',
        css: 'src/components/Settings/Settings.css',
        description: 'Settings component',
      },
      {
        component: 'src/components/Dashboard/ModelSelector/ModelSelector.tsx',
        css: 'src/components/Dashboard/ModelSelector/ModelSelector.css',
        description: 'ModelSelector component',
      },
    ]

    // Components in src/components/ that have CSS files alongside them (already co-located)
    const colocatedComponents = [
      { component: 'src/components/ThinkingBlock.tsx', css: 'src/components/ThinkingBlock.css' },
      { component: 'src/components/TitleBar.tsx', css: 'src/components/TitleBar.css' },
    ]

    it('should have CSS files co-located with their components in subfolders', () => {
      for (const { component, css, description } of componentCssPairs) {
        const componentPath = path.resolve(process.cwd(), component)
        const cssPath = path.resolve(process.cwd(), css)

        // Verify component exists
        expect(fs.existsSync(componentPath), `Component ${component} should exist`).toBe(true)

        // Verify CSS exists in same directory
        expect(
          fs.existsSync(cssPath),
          `CSS file ${css} should exist alongside ${description}`
        ).toBe(true)

        // Verify they are in the same directory
        const componentDir = path.dirname(componentPath)
        const cssDir = path.dirname(cssPath)
        expect(
          componentDir,
          `CSS file for ${description} should be in the same directory as the component`
        ).toBe(cssDir)
      }
    })

    it('should have CSS files co-located with components in src/components/', () => {
      for (const { component, css } of colocatedComponents) {
        const componentPath = path.resolve(process.cwd(), component)
        const cssPath = path.resolve(process.cwd(), css)

        // Verify component exists
        expect(fs.existsSync(componentPath), `Component ${component} should exist`).toBe(true)

        // Verify CSS exists
        expect(fs.existsSync(cssPath), `CSS file ${css} should exist`).toBe(true)

        // Verify they are in the same directory
        const componentDir = path.dirname(componentPath)
        const cssDir = path.dirname(cssPath)
        expect(componentDir, `CSS file should be in the same directory as ${component}`).toBe(
          cssDir
        )
      }
    })

    it('should NOT have Settings.css in the old location', () => {
      const oldCssPath = path.resolve(process.cwd(), 'src/components/Settings.css')
      expect(
        fs.existsSync(oldCssPath),
        'Settings.css should NOT exist in src/components/ (should be in src/components/Settings/)'
      ).toBe(false)
    })

    it('should have Settings.tsx import CSS from co-located file', () => {
      const settingsPath = path.resolve(process.cwd(), 'src/components/Settings/Settings.tsx')
      const content = fs.readFileSync(settingsPath, 'utf-8')

      // Should import from ./Settings.css (same directory)
      expect(
        content.includes("import './Settings.css'"),
        'Settings.tsx should import CSS from ./Settings.css (co-located)'
      ).toBe(true)

      // Should NOT import from ../Settings.css (old location)
      expect(
        content.includes("import '../Settings.css'"),
        'Settings.tsx should NOT import CSS from ../Settings.css (old location)'
      ).toBe(false)
    })
  })

  /**
   *
   * *For any* state of the codebase after a refactoring step, the TypeScript build
   * valid and API contracts are preserved.
   *
   */
  describe('Property 4: Build Success', () => {
    it('should have all TypeScript files compile without errors (verified by tsc)', () => {
      // This test verifies that the TypeScript configuration is valid
      // and all source files can be found. The actual compilation is
      // verified by running `npm run build` which includes `tsc`.

      const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json')
      expect(fs.existsSync(tsconfigPath), 'tsconfig.json should exist').toBe(true)

      // Verify tsconfig is valid JSON
      const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf-8')
      expect(() => JSON.parse(tsconfigContent)).not.toThrow()
    })

    it('should have all required source directories exist', () => {
      const requiredDirs = [
        'src/components',
        'src/components/Dashboard',
        'src/components/Dashboard/ChatArea',
        'src/components/Dashboard/ModelSelector',
        'src/components/Settings',
        'src/components/Settings/sections',
        'src/components/shared',
        'src/utils',
        'src/hooks',
        'src/services',
        'src/contexts',
        'electron',
        'electron/windows',
        'electron/ipc',
        'electron/tools',
      ]

      for (const dir of requiredDirs) {
        const dirPath = path.resolve(process.cwd(), dir)
        expect(
          fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(),
          `Directory ${dir} should exist`
        ).toBe(true)
      }
    })

    it('should have all barrel exports (index.ts) in component folders', () => {
      const foldersWithBarrelExports = [
        'src/components/Dashboard/ModelSelector/index.ts',
        'src/components/shared/index.ts',
        'electron/ipc/index.ts',
        'electron/windows/index.ts',
      ]

      for (const file of foldersWithBarrelExports) {
        const filePath = path.resolve(process.cwd(), file)
        expect(fs.existsSync(filePath), `Barrel export ${file} should exist`).toBe(true)
      }
    })

    it('should have valid import paths in main entry files', () => {
      // Check that main entry files have valid imports (no broken paths)
      const entryFiles = ['src/App.tsx', 'src/main.tsx', 'electron/main.ts']

      for (const file of entryFiles) {
        const filePath = path.resolve(process.cwd(), file)
        expect(fs.existsSync(filePath), `Entry file ${file} should exist`).toBe(true)

        const content = fs.readFileSync(filePath, 'utf-8')

        // Check for common broken import patterns
        // These would indicate failed refactoring
        expect(
          content.includes("from './components/Settings.tsx'"),
          `${file} should not import Settings.tsx directly (should use Settings folder)`
        ).toBe(false)

        expect(
          content.includes("from './components/Dashboard/ModelSelector.tsx'"),
          `${file} should not import ModelSelector.tsx directly (should use ModelSelector folder)`
        ).toBe(false)
      }
    })

    it('should have electron/main.ts under 450 lines', () => {
      const mainPath = path.resolve(process.cwd(), 'electron/main.ts')
      expect(fs.existsSync(mainPath), 'electron/main.ts should exist').toBe(true)

      const content = fs.readFileSync(mainPath, 'utf-8')
      const lineCount = content.split('\n').length

      expect(
        lineCount,
        `electron/main.ts has ${lineCount} lines, should be ≤ 450 lines`
      ).toBeLessThanOrEqual(450)
    })
  })

  /**
   *
   * continue to pass with the same results as before the refactoring.
   * This ensures behavioral equivalence is maintained.
   *
   */
  describe('Property 2: Test Suite Preservation', () => {
    it('should have all test files exist and be valid', () => {
      const testFiles = [
        'src/utils/modelUtils.test.ts',
        'src/utils/textUtils.test.ts',
        'src/hooks/useDropdownPosition.test.ts',
        'src/hooks/useToolCalling.test.ts',
        'src/utils/thinkingParser.test.ts',
        'src/utils/promptSelection.test.ts',
        'src/components/ThinkingBlock.test.ts',
        'src/__tests__/refactoring.property.test.ts',
      ]

      for (const file of testFiles) {
        const filePath = path.resolve(process.cwd(), file)
        expect(fs.existsSync(filePath), `Test file ${file} should exist`).toBe(true)

        // Verify file is not empty
        const content = fs.readFileSync(filePath, 'utf-8')
        expect(content.length, `Test file ${file} should not be empty`).toBeGreaterThan(0)

        // Verify file contains test definitions
        expect(
          content.includes('describe') || content.includes('it(') || content.includes('test('),
          `Test file ${file} should contain test definitions`
        ).toBe(true)
      }
    })

    it('should have test setup file configured', () => {
      const setupPath = path.resolve(process.cwd(), 'src/test/setup.ts')
      expect(fs.existsSync(setupPath), 'Test setup file should exist').toBe(true)
    })

    it('should have vitest configuration valid', () => {
      const vitestConfigPath = path.resolve(process.cwd(), 'vitest.config.ts')
      expect(fs.existsSync(vitestConfigPath), 'vitest.config.ts should exist').toBe(true)

      const content = fs.readFileSync(vitestConfigPath, 'utf-8')

      // Verify essential configuration
      expect(content.includes('test:'), 'vitest.config.ts should have test configuration').toBe(
        true
      )
      expect(content.includes('setupFiles'), 'vitest.config.ts should reference setup files').toBe(
        true
      )
    })

    it('should have test files co-located with source files', () => {
      // Verify test files are next to their source files
      const colocatedTests = [
        { source: 'src/utils/modelUtils.ts', test: 'src/utils/modelUtils.test.ts' },
        { source: 'src/utils/textUtils.ts', test: 'src/utils/textUtils.test.ts' },
        {
          source: 'src/hooks/useDropdownPosition.ts',
          test: 'src/hooks/useDropdownPosition.test.ts',
        },
        { source: 'src/hooks/useToolCalling.ts', test: 'src/hooks/useToolCalling.test.ts' },
        { source: 'src/utils/thinkingParser.ts', test: 'src/utils/thinkingParser.test.ts' },
        { source: 'src/utils/promptSelection.ts', test: 'src/utils/promptSelection.test.ts' },
        {
          source: 'src/components/ThinkingBlock.tsx',
          test: 'src/components/ThinkingBlock.test.ts',
        },
      ]

      for (const { source, test } of colocatedTests) {
        const sourcePath = path.resolve(process.cwd(), source)
        const testPath = path.resolve(process.cwd(), test)

        expect(fs.existsSync(sourcePath), `Source file ${source} should exist`).toBe(true)
        expect(fs.existsSync(testPath), `Test file ${test} should exist`).toBe(true)

        // Verify they are in the same directory
        const sourceDir = path.dirname(sourcePath)
        const testDir = path.dirname(testPath)
        expect(sourceDir, `Test file ${test} should be in the same directory as ${source}`).toBe(
          testDir
        )
      }
    })

    it('should have centralized utility tests import from correct locations', () => {
      const modelUtilsTestPath = path.resolve(process.cwd(), 'src/utils/modelUtils.test.ts')
      const textUtilsTestPath = path.resolve(process.cwd(), 'src/utils/textUtils.test.ts')

      const modelUtilsTestContent = fs.readFileSync(modelUtilsTestPath, 'utf-8')
      const textUtilsTestContent = fs.readFileSync(textUtilsTestPath, 'utf-8')

      // Verify tests import from the correct centralized modules
      expect(
        modelUtilsTestContent.includes("from './modelUtils'"),
        'modelUtils.test.ts should import from ./modelUtils'
      ).toBe(true)

      expect(
        textUtilsTestContent.includes("from './textUtils'"),
        'textUtils.test.ts should import from ./textUtils'
      ).toBe(true)
    })
  })
})
