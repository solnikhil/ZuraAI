import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

function readImportSpecifiers(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const importSpecifiers: string[] = []
  const importRegex = /from\s+['"]([^'"]+)['"]/g

  let match: RegExpExecArray | null
  while (true) {
    match = importRegex.exec(content)
    if (!match) {
      break
    }
    importSpecifiers.push(match[1])
  }

  return importSpecifiers
}

describe('Context Import Boundaries', () => {
  it('ChatSessionManager does not import ChatHistoryContext', () => {
    const managerPath = path.resolve(process.cwd(), 'src/contexts/ChatSessionManager.ts')
    expect(fs.existsSync(managerPath)).toBe(true)

    const imports = readImportSpecifiers(managerPath)
    const hasBackEdge = imports.some((specifier) => specifier.includes('ChatHistoryContext'))

    expect(hasBackEdge).toBe(false)
  })
})
