// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// @ts-expect-error -- plain JS helper module, intentionally untyped.
import { compareFindings, formatRatchetReport, tallyFindings } from './qualityRatchet.mjs'

const repoRoot = path.resolve(__dirname, '..')

describe('quality ratchet comparison', () => {
  it('reports no regression when findings match the baseline', () => {
    const result = compareFindings({ 'a.ts': 1, 'b.ts': 2 }, { 'a.ts': 1, 'b.ts': 2 }, 'prettier')

    expect(result.regressions).toEqual([])
    expect(result.improvements).toEqual([])
    expect(formatRatchetReport([result]).ok).toBe(true)
  })

  it('fails on a brand new finding', () => {
    const result = compareFindings({ 'a.ts': 1 }, { 'a.ts': 1, 'new.ts': 1 }, 'prettier')

    expect(result.regressions).toEqual([{ key: 'new.ts', baseline: 0, current: 1 }])
    expect(formatRatchetReport([result]).ok).toBe(false)
  })

  it('fails when an existing finding gets worse', () => {
    const result = compareFindings({ 'a.ts::rule': 2 }, { 'a.ts::rule': 5 }, 'eslint')

    expect(result.regressions).toEqual([{ key: 'a.ts::rule', baseline: 2, current: 5 }])
    expect(formatRatchetReport([result]).ok).toBe(false)
  })

  it('passes and reports progress when findings are fixed', () => {
    const result = compareFindings({ 'a.ts': 1, 'b.ts': 3 }, { 'b.ts': 1 }, 'eslint')

    expect(result.regressions).toEqual([])
    expect(result.improvements).toEqual([
      { key: 'a.ts', baseline: 1, current: 0 },
      { key: 'b.ts', baseline: 3, current: 1 },
    ])

    const { ok, report } = formatRatchetReport([result])
    expect(ok).toBe(true)
    expect(report).toContain('baseline finding(s) fixed')
  })

  it('treats an empty baseline as zero tolerance', () => {
    const result = compareFindings({}, { 'a.ts': 1 }, 'knip')
    expect(formatRatchetReport([result]).ok).toBe(false)
  })

  it('fails the whole run when any single check regresses', () => {
    const clean = compareFindings({ 'a.ts': 1 }, { 'a.ts': 1 }, 'prettier')
    const dirty = compareFindings({}, { 'b.ts::rule': 1 }, 'eslint')
    expect(formatRatchetReport([clean, dirty]).ok).toBe(false)
  })

  it('tallies duplicate keys into counts', () => {
    expect(tallyFindings(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 })
    expect(tallyFindings([])).toEqual({})
  })

  it('names the offending findings in the report', () => {
    const result = compareFindings({}, { 'src/new.ts::no-explicit-any': 1 }, 'eslint')
    const { report } = formatRatchetReport([result])

    expect(report).toContain('src/new.ts::no-explicit-any')
    expect(report).toContain('NEW findings introduced by this change')
    expect(report).toContain('Do not add them to the baseline')
  })
})

describe('committed quality baseline', () => {
  const baseline = JSON.parse(
    readFileSync(path.join(repoRoot, 'quality-baseline.json'), 'utf8')
  ) as {
    checks: Record<string, Record<string, number>>
  }

  it('covers each ratcheted check', () => {
    expect(Object.keys(baseline.checks).sort()).toEqual(['eslint', 'knip', 'prettier'])
  })

  it('records positive counts only', () => {
    for (const [check, findings] of Object.entries(baseline.checks)) {
      for (const [key, count] of Object.entries(findings)) {
        expect(count, `${check} ${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('is wired into both quality gates without continue-on-error', () => {
    for (const workflow of ['lint.yml', 'knip.yml']) {
      const contents = readFileSync(path.join(repoRoot, '.github/workflows', workflow), 'utf8')

      const ratchetStep = contents.match(
        /- name: Block newly introduced[^\n]*\n(?: +[^\n]*\n)*? +run: bun run quality:ratchet[^\n]*/
      )
      expect(ratchetStep, `${workflow} must run the ratchet`).toBeTruthy()
      // The gating step itself must not be allowed to fail.
      expect(ratchetStep![0]).not.toContain('continue-on-error')
    }
  })

  it('exposes the ratchet and baseline scripts', () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['quality:ratchet']).toBeTruthy()
    expect(pkg.scripts['quality:baseline']).toContain('--update')
  })
})
