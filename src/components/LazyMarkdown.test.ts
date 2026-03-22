import { describe, expect, it } from 'vitest'

import { findMatchingWebSource } from './LazyMarkdown'

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
      ['https://developers.cloudflare.com/mcp', { title: 'Cloudflare Docs', url: 'https://developers.cloudflare.com/mcp' }],
    ])

    expect(findMatchingWebSource('https://www.npmjs.com/package/@modelcontextprotocol/inspector', webSources)).toBeUndefined()
  })
})
