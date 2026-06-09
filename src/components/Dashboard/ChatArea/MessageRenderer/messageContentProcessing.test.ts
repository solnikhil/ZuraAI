import { describe, expect, it } from 'vitest'

import { stripReferencesSection } from './messageContentProcessing'

describe('stripReferencesSection', () => {
  it('removes newline-delimited source sections', () => {
    const content = [
      'Answer with a citation [[1]](https://example.com/a).',
      '',
      'Sources:',
      '[1] Example A',
      '[2] Example B',
    ].join('\n')

    expect(stripReferencesSection(content)).toBe(
      'Answer with a citation [[1]](https://example.com/a).'
    )
  })

  it('removes inline source sections generated as one paragraph', () => {
    const content =
      'Answer with a citation [[1]](https://example.com/a).\n\nSources: [[1]](https://example.com/a) Example A, [[2]](https://example.com/b) Example B'

    expect(stripReferencesSection(content)).toBe(
      'Answer with a citation [[1]](https://example.com/a).'
    )
  })

  it('removes title-based source sections generated without numeric citations', () => {
    const content = [
      'These web results informed the architectural decisions.',
      '',
      'Sources:',
      '',
      'GitHub - Z1Code/glass-refraction: Liquid Glass design system — SVG filter architecture, CSS custom properties',
      '',
      'GitHub - deadcoder0904/electron-transparent-window-guide — Electron click-through overlay pattern',
      '',
      'How I Made a Desktop App Invisible to Screen Sharing — Production Electron overlay window configuration',
    ].join('\n')

    expect(stripReferencesSection(content)).toBe(
      'These web results informed the architectural decisions.'
    )
  })
})
