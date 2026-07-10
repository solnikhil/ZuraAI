import { describe, expect, it } from 'vitest'

import { compileWindowsSearchSql } from './windowsSearchService'

describe('Windows Search SQL compiler', () => {
  it('compiles the allowlisted filters into a bounded SystemIndex query', () => {
    const sql = compileWindowsSearchSql(
      'file:budget kind:document ext:pdf modified:this-week size:<10mb',
      500
    )
    expect(sql).toContain('SELECT TOP 40')
    expect(sql).toContain("System.ItemUrl LIKE 'file:%'")
    expect(sql).toContain("FREETEXT(*, 'budget')")
    expect(sql).toContain("System.Kind = 'document'")
    expect(sql).toContain("System.FileExtension = '.pdf'")
    expect(sql).toContain('System.Size < 10485760')
  })

  it('escapes literals and never accepts renderer-provided SQL structure', () => {
    const sql = compileWindowsSearchSql("file:o'hare scope:c:\\private unknown:drop")
    expect(sql).toContain("o''hare")
    expect(sql).not.toContain('C:\\private')
    expect(sql).not.toContain('DROP TABLE')
  })

  it('does not query files for an app-only scope or a one-character query', () => {
    expect(compileWindowsSearchSql('app:notepad')).toBeNull()
    expect(compileWindowsSearchSql('a')).toBeNull()
  })

  it('compiles negative terms and folder-only scope', () => {
    const sql = compileWindowsSearchSql('folder:project -archive')
    expect(sql).toContain("System.Kind = 'folder'")
    expect(sql).toContain("NOT FREETEXT(*, 'archive')")
  })
})
