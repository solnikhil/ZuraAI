import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WCAG 1.4.3 regression guard for the shared theme text tokens.
 *
 * `--theme-text-muted` is used for meaningful, small (9-11px) status, budget,
 * usage, and response metadata (for example AgentRunTimeline, TokenUsageIndicator,
 * ResponseInfo), so it must reach AA contrast on every surface it renders on.
 *
 * `--theme-text-decorative` is the explicit opt-out for inert affordances and is
 * therefore not asserted against the AA threshold.
 */

const THEMES_CSS = readFileSync(join(__dirname, 'themes.css'), 'utf8')

const AA_NORMAL_TEXT = 4.5

type Rgb = { r: number; g: number; b: number }

function parseColor(value: string): Rgb & { a: number } {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff, a: 1 }
  }

  const rgba = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i)
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    }
  }

  throw new Error(`Unsupported color value in themes.css: ${value}`)
}

function composite(foreground: string, background: string): Rgb {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  return {
    r: bg.r + (fg.r - bg.r) * fg.a,
    g: bg.g + (fg.g - bg.g) * fg.a,
    b: bg.b + (fg.b - bg.b) * fg.a,
  }
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const c = raw / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(composite(foreground, background))
  const bg = relativeLuminance(parseColor(background))
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Reads a custom property from a specific selector block in themes.css. */
function readToken(selector: string, token: string): string {
  const blockStart = THEMES_CSS.indexOf(`${selector} {`)
  if (blockStart === -1) throw new Error(`Selector not found in themes.css: ${selector}`)
  const blockEnd = THEMES_CSS.indexOf('}', blockStart)
  const block = THEMES_CSS.slice(blockStart, blockEnd)
  const match = block.match(new RegExp(`${token}\\s*:\\s*([^;]+);`))
  if (!match) throw new Error(`Token ${token} not found in ${selector}`)
  return match[1].trim()
}

// Opaque surfaces that muted metadata text actually renders on top of.
const THEME_SURFACES = {
  ':root': ['--theme-background', '--theme-surface'],
  ':root:not(.dark)': [
    '--theme-background',
    '--theme-surface',
    '--theme-surface-hover',
    '--theme-surface-active',
  ],
} as const

describe('theme text token contrast', () => {
  for (const [selector, surfaceTokens] of Object.entries(THEME_SURFACES)) {
    const themeName = selector === ':root' ? 'dark' : 'light'

    for (const surfaceToken of surfaceTokens) {
      it(`${themeName}: --theme-text-muted meets AA on ${surfaceToken}`, () => {
        const muted = readToken(selector, '--theme-text-muted')
        const surface = readToken(selector, surfaceToken)
        const ratio = contrastRatio(muted, surface)
        expect(
          ratio,
          `${muted} on ${surface} is ${ratio.toFixed(2)}:1, below the ${AA_NORMAL_TEXT}:1 AA minimum`
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
      })
    }

    it(`${themeName}: secondary and tertiary text also meet AA on the base background`, () => {
      const background = readToken(selector, '--theme-background')
      for (const token of [
        '--theme-text-primary',
        '--theme-text-secondary',
        '--theme-text-tertiary',
      ]) {
        const ratio = contrastRatio(readToken(selector, token), background)
        expect(ratio, `${token} is ${ratio.toFixed(2)}:1 on ${background}`).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT
        )
      }
    })

    it(`${themeName}: exposes a decorative token that is documented as AA-exempt`, () => {
      expect(readToken(selector, '--theme-text-decorative')).toBeTruthy()
    })
  }

  it('keeps the muted token stronger than the decorative token in both themes', () => {
    for (const selector of [':root', ':root:not(.dark)']) {
      const background = readToken(selector, '--theme-background')
      const muted = contrastRatio(readToken(selector, '--theme-text-muted'), background)
      const decorative = contrastRatio(readToken(selector, '--theme-text-decorative'), background)
      expect(muted).toBeGreaterThan(decorative)
    }
  })

  it('preserves the primary > secondary > tertiary > muted emphasis ramp', () => {
    for (const selector of [':root', ':root:not(.dark)']) {
      const background = readToken(selector, '--theme-background')
      const ratios = [
        '--theme-text-primary',
        '--theme-text-secondary',
        '--theme-text-tertiary',
        '--theme-text-muted',
      ].map((token) => contrastRatio(readToken(selector, token), background))

      for (let index = 1; index < ratios.length; index += 1) {
        expect(ratios[index - 1]).toBeGreaterThan(ratios[index])
      }
    }
  })

  it('does not use the decorative token for text colour anywhere', () => {
    // Guard against the exempt token silently becoming a text colour again.
    const offenders = THEMES_CSS.match(/color:\s*var\(--theme-text-decorative\)/g)
    expect(offenders).toBeNull()
  })
})
