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

  it('removes compact pipe-separated title source sections', () => {
    const content = [
      'Here is the answer with inline support [[1]](https://example.com/a).',
      '',
      'Sources: Forbes - Prompt Engineering 2026 | Nature - AMIE Conversational AI for Disease Management | ScienceDaily - JUNO Neutrino Breakthrough | CNET - Android 17 Features',
    ].join('\n')

    expect(stripReferencesSection(content)).toBe(
      'Here is the answer with inline support [[1]](https://example.com/a).'
    )
  })

  it('removes compact pipe-separated markdown-link source sections', () => {
    const content = [
      'Here is the answer with inline support [[1]](https://example.com/a).',
      '',
      'References: [Example A](https://example.com/a) | [Example B](https://example.com/b)',
    ].join('\n')

    expect(stripReferencesSection(content)).toBe(
      'Here is the answer with inline support [[1]](https://example.com/a).'
    )
  })

  it('preserves normal prose that mentions sources', () => {
    const content =
      'The available sources are mixed, so I would treat this as a tentative conclusion.'

    expect(stripReferencesSection(content)).toBe(content)
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

  it('removes title-based source blocks that appear before final prose', () => {
    const content = [
      'Sources:',
      '',
      'GitHub - Z1Code/glass-refraction: Liquid Glass design system — SVG filter architecture, CSS custom properties, chromatic edge',
      '',
      'GitHub - deadcoder0904/electron-transparent-window-guide — Electron click-through overlay pattern with global shortcuts',
      '',
      'How I Made a Desktop App Invisible to Screen Sharing (Electron + OS-Level Tricks) — Production Electron overlay window configuration, alwaysOnTop levels, contentProtection',
      '',
      'These web results informed the architectural decisions, SVG filter pipeline, and Electron window configuration.',
      'The specific code is my synthesis.',
    ].join('\n')

    expect(stripReferencesSection(content)).toBe(
      [
        'These web results informed the architectural decisions, SVG filter pipeline, and Electron window configuration.',
        'The specific code is my synthesis.',
      ].join('\n')
    )
  })
})
