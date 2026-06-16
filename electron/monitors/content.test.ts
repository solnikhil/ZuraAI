// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  buildChangedExcerpt,
  fetchMonitorPage,
  hashNormalizedContent,
  normalizePageContent,
  validateMonitorUrl,
} from './content'

describe('monitor content helpers', () => {
  it('accepts public and loopback monitor URLs', () => {
    expect(validateMonitorUrl('http://localhost:3000')).toBe('http://localhost:3000/')
    expect(validateMonitorUrl('http://127.0.0.1:8000/index.html#section')).toBe(
      'http://127.0.0.1:8000/index.html'
    )
    expect(validateMonitorUrl('http://[::1]:8000/index.html')).toBe('http://[::1]:8000/index.html')
    expect(validateMonitorUrl('https://example.com/docs#section')).toBe('https://example.com/docs')
  })

  it('rejects unsupported and private-network monitor URLs', () => {
    expect(() => validateMonitorUrl('file:///tmp/x')).toThrow(/http/)
    expect(() => validateMonitorUrl('http://0.0.0.0:3000')).toThrow(/local/)
    expect(() => validateMonitorUrl('http://192.168.1.10')).toThrow(/private/)
    expect(() => validateMonitorUrl('http://printer.local')).toThrow(/local/)
  })

  it('normalizes HTML into stable monitor text', () => {
    const normalized = normalizePageContent(`
      <html>
        <body>
          <nav>This should not be tracked</nav>
          <script>window.noise = true</script>
          <main>
            <h1>Release notes</h1>
            <p>Version 2.0 adds a new pricing API for enterprise customers.</p>
            <p>Updated at 2026-06-15T10:30:00Z.</p>
          </main>
        </body>
      </html>
    `)
    expect(normalized).toContain('Version 2')
    expect(normalized).not.toContain('window.noise')
    expect(normalized).not.toContain('This should not be tracked')
  })

  it('builds changed excerpts from new lines', () => {
    expect(buildChangedExcerpt('Alpha line\nBeta line', 'Alpha line\nGamma line')).toContain('Gamma line')
  })

  it('hashes equal normalized content consistently', () => {
    expect(hashNormalizedContent('same')).toBe(hashNormalizedContent('same'))
    expect(hashNormalizedContent('same')).not.toBe(hashNormalizedContent('different'))
  })

  it('fetches and normalizes supported pages', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('<main><p>This public changelog has meaningful monitorable text.</p></main>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    ) as unknown as typeof fetch

    const result = await fetchMonitorPage('https://example.com/changelog', fetchImpl)
    expect(fetchImpl).toHaveBeenCalled()
    expect(result.normalizedText).toContain('meaningful monitorable text')
    expect(result.contentHash).toHaveLength(64)
  })
})
