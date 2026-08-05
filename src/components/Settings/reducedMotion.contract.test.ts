import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WCAG 2.3.3 regression guard.
 *
 * Every Settings selector that runs a named keyframe animation must also be
 * suppressed under `prefers-reduced-motion: reduce`. State feedback has to stay
 * visible, so the reduce block is expected to set `animation: none` rather than
 * hide the element.
 */

const stylesDir = path.resolve(process.cwd(), 'src/components/Settings/styles')

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Strips `@media (prefers-reduced-motion: reduce) { ... }` blocks from a sheet. */
function splitReducedMotion(source: string): { outside: string; reduced: string } {
  const css = stripComments(source)
  const marker = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/g
  let outside = ''
  let reduced = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = marker.exec(css)) !== null) {
    outside += css.slice(cursor, match.index)

    // Walk braces to find the matching close of the media block.
    let depth = 1
    let index = match.index + match[0].length
    const bodyStart = index
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1
      else if (css[index] === '}') depth -= 1
      index += 1
    }
    reduced += css.slice(bodyStart, index - 1)
    cursor = index
    marker.lastIndex = index
  }

  outside += css.slice(cursor)
  return { outside, reduced }
}

/** Returns the selectors of rule blocks that declare a non-`none` animation. */
function animatedSelectors(css: string): string[] {
  const selectors: string[] = []
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g
  let match: RegExpExecArray | null

  while ((match = rulePattern.exec(css)) !== null) {
    const selectorList = match[1]
    const body = match[2]

    // Skip keyframe step selectors (`0%`, `from`, `to`) and at-rule preludes.
    if (/^\s*(?:\d+%|from|to)\s*$/.test(selectorList)) continue
    if (selectorList.trimStart().startsWith('@')) continue

    const animation = body.match(/(?:^|[\s;])animation\s*:\s*([^;]+)/)
    if (!animation) continue
    if (/^\s*none\b/.test(animation[1])) continue

    for (const selector of selectorList.split(',')) {
      const trimmed = selector.trim()
      if (trimmed) selectors.push(trimmed)
    }
  }

  return selectors
}

const sheets = fs
  .readdirSync(stylesDir)
  .filter((file) => file.endsWith('.css'))
  .sort()

describe('Settings reduced-motion contract', () => {
  it('has stylesheets to check', () => {
    expect(sheets.length).toBeGreaterThan(0)
  })

  for (const sheet of sheets) {
    const css = fs.readFileSync(path.join(stylesDir, sheet), 'utf8')
    const { outside, reduced } = splitReducedMotion(css)
    const animated = animatedSelectors(outside)

    if (animated.length === 0) continue

    it(`${sheet} disables every animated selector under prefers-reduced-motion`, () => {
      const suppressed = new Set(animatedSelectors(reduced))
      const reducedRules = reduced

      const missing = animated.filter((selector) => {
        if (suppressed.has(selector)) return false
        // The selector must appear in a reduce rule whose body sets animation: none.
        const pattern = new RegExp(
          `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*\\{[^{}]*animation\\s*:\\s*none`
        )
        return !pattern.test(reducedRules)
      })

      expect(
        missing,
        `these selectors animate without a prefers-reduced-motion override in ${sheet}`
      ).toEqual([])
    })
  }

  it('keeps the provider toggle state visible while its animation is suppressed', () => {
    const provider = fs.readFileSync(path.join(stylesDir, 'provider.css'), 'utf8')
    const { reduced } = splitReducedMotion(provider)

    expect(reduced).toContain("[data-slot='switch-thumb']")
    expect(reduced).toContain('animation: none')
    // Reduced motion must not hide the control or collapse its state colours.
    expect(reduced).not.toMatch(/display\s*:\s*none/)
    expect(reduced).not.toMatch(/visibility\s*:\s*hidden/)
    expect(reduced).not.toMatch(/opacity\s*:\s*0\s*[;}]/)
  })
})
