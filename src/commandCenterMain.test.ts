// @vitest-environment node

import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dedicated Command Center renderer entry', () => {
  it('mounts Command Center directly without the dashboard application bootstrap', () => {
    const source = fs.readFileSync(new URL('./commandCenterMain.tsx', import.meta.url), 'utf8')
    expect(source).toContain("import CommandCenterApp from './components/CommandCenterApp'")
    expect(source).toContain('<CommandCenterApp />')
    expect(source).not.toContain("from './App'")
    expect(source).not.toContain('DashboardApp')
    expect(source).not.toContain("from './main'")
  })

  it('is loaded only by the dedicated HTML entry', () => {
    const commandCenterHtml = fs.readFileSync(
      new URL('../command-center.html', import.meta.url),
      'utf8'
    )
    const dashboardHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    expect(commandCenterHtml).toContain('/src/commandCenterMain.tsx')
    expect(dashboardHtml).not.toContain('commandCenterMain')
  })
})
