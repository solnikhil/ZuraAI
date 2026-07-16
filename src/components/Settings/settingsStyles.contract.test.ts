import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const settingsDir = path.resolve(process.cwd(), 'src/components/Settings')
const orderedSheets = [
  'base.css',
  'usage.css',
  'shared.css',
  'provider.css',
  'appearance.css',
  'mcp.css',
  'memory.css',
]

describe('Settings stylesheet ownership contract', () => {
  it('imports section sheets in the original cascade order', () => {
    const entrypoint = fs.readFileSync(path.join(settingsDir, 'Settings.css'), 'utf8').trim()
    expect(entrypoint.split(/\r?\n/)).toEqual(
      orderedSheets.map((sheet) => `@import './styles/${sheet}';`)
    )
  })

  it('keeps distinctive section selectors in their owned sheets', () => {
    const read = (sheet: string) => fs.readFileSync(path.join(settingsDir, 'styles', sheet), 'utf8')
    expect(read('usage.css')).toContain('.usage-stats-row')
    expect(read('provider.css')).toContain('.provider-hub-base-card')
    expect(read('appearance.css')).toContain('.appearance-mode-picker')
    expect(read('mcp.css')).toContain('.mcp-section-card')
    expect(read('memory.css')).toContain('.memory-library-panel')
  })

  it('leaves the flat menu primitive with the global shared stylesheet', () => {
    const globalShared = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/shared.css'),
      'utf8'
    )
    expect(globalShared).toMatch(/^\.zura-menu-surface\s*{/m)

    for (const sheet of orderedSheets) {
      const content = fs.readFileSync(path.join(settingsDir, 'styles', sheet), 'utf8')
      expect(content).not.toMatch(/^\.zura-menu-surface\s*{/m)
    }
  })
})
