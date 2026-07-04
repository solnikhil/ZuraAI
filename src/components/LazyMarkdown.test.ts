import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

import { findMatchingWebSource, normalizeHighlightLanguage } from './LazyMarkdown'
import WebSourceCitation from './Dashboard/ChatArea/WebSourceCitation'

describe('findMatchingWebSource', () => {
  it('matches exact URLs from the web source map', () => {
    const source = { title: 'Cloudflare Docs', url: 'https://developers.cloudflare.com/mcp' }
    const webSources = new Map([[source.url, source]])

    expect(findMatchingWebSource(source.url, webSources)).toBe(source)
  })

  it('matches the same URL when the rendered link omits a trailing slash', () => {
    const source = { title: 'Cloudflare Docs', url: 'https://developers.cloudflare.com/mcp' }
    const webSources = new Map([[source.url, source]])

    expect(findMatchingWebSource(`${source.url}/`, webSources)).toBe(source)
  })

  it('does not treat ordinary markdown links as citations when no web source exists', () => {
    const webSources = new Map([
      [
        'https://developers.cloudflare.com/mcp',
        { title: 'Cloudflare Docs', url: 'https://developers.cloudflare.com/mcp' },
      ],
    ])

    expect(
      findMatchingWebSource(
        'https://www.npmjs.com/package/@modelcontextprotocol/inspector',
        webSources
      )
    ).toBeUndefined()
  })
})

describe('normalizeHighlightLanguage', () => {
  it('maps common aliases to registered prism languages', () => {
    expect(normalizeHighlightLanguage('py')).toBe('python')
    expect(normalizeHighlightLanguage('js')).toBe('javascript')
    expect(normalizeHighlightLanguage('ts')).toBe('typescript')
    expect(normalizeHighlightLanguage('yml')).toBe('yaml')
    expect(normalizeHighlightLanguage('csharp')).toBe('csharp')
    expect(normalizeHighlightLanguage('cpp')).toBe('cpp')
  })

  it('normalizes case and keeps canonical names unchanged', () => {
    expect(normalizeHighlightLanguage('Python')).toBe('python')
    expect(normalizeHighlightLanguage('javascript')).toBe('javascript')
    expect(normalizeHighlightLanguage('bash')).toBe('bash')
  })
})

describe('WebSourceCitation', () => {
  it('renders numeric citations without markdown brackets', () => {
    render(
      React.createElement(
        WebSourceCitation,
        {
          href: 'https://example.com/source',
          source: { title: 'Example Source', url: 'https://example.com/source' },
        },
        '[5]'
      )
    )

    expect(screen.getByRole('link', { name: /source 5/i })).toHaveTextContent('5')
    expect(screen.getByRole('link', { name: /source 5/i })).not.toHaveTextContent('[5]')
  })
})
