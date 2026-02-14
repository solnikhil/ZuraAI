import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWebSearch } from './webSearch'

vi.mock('../secureStorage', () => ({
    getSecureValueAsync: vi.fn()
}))

vi.mock('duck-duck-scrape', () => ({
    search: vi.fn(),
    SafeSearchType: { MODERATE: -1, STRICT: 0, OFF: -2 }
}))

const { getSecureValueAsync } = await import('../secureStorage')
const { search: duckDuckScrapeSearch } = await import('duck-duck-scrape')

describe('executeWebSearch', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(getSecureValueAsync).mockResolvedValue('')
    })

    describe('argument handling', () => {
        it('returns error when query is missing', async () => {
            const result = await executeWebSearch({ query: '' })
            expect(result.success).toBe(false)
            expect(result.error).toContain('Search query')
        })

        it('returns error when query is not a string', async () => {
            const result = await executeWebSearch({ query: null as any })
            expect(result.success).toBe(false)
            expect(result.error).toContain('Search query')
        })

        it('coerces num_results from string to number', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [{ title: 'A', url: 'https://a.com', description: 'A' }],
                noResults: false,
                vqd: 'x'
            } as any)

            await executeWebSearch({ query: 'test', num_results: '7' as any })
            expect(duckDuckScrapeSearch).toHaveBeenCalledWith('test', expect.any(Object))
        })

        it('clamps num_results to 1-10', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [{ title: 'A', url: 'https://a.com', description: 'A' }],
                noResults: false,
                vqd: 'x'
            } as any)

            await executeWebSearch({ query: 'test', num_results: 0 })
            await executeWebSearch({ query: 'test', num_results: 100 })
            expect(duckDuckScrapeSearch).toHaveBeenCalledTimes(2)
        })

        it('coerces search_depth to basic or advanced', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [{ title: 'A', url: 'https://a.com', description: 'A' }],
                noResults: false,
                vqd: 'x'
            } as any)

            await executeWebSearch({ query: 'test', search_depth: 'advanced' as any })
            expect(duckDuckScrapeSearch).toHaveBeenCalled()
        })
    })

    describe('Tavily fallback chain', () => {
        it('uses Tavily when key is available and succeeds', async () => {
            vi.mocked(getSecureValueAsync).mockResolvedValue('tvly-test-key')

            const originalFetch = globalThis.fetch
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        results: [{ title: 'T', url: 'https://t.com', content: 'T' }],
                        answer: 'Answer',
                        images: []
                    })
            })

            const result = await executeWebSearch({ query: 'test' })
            expect(result.success).toBe(true)
            expect(result.data?.source).toBe('tavily')
            expect(duckDuckScrapeSearch).not.toHaveBeenCalled()

            globalThis.fetch = originalFetch
        })

        it('falls back to duck-duck-scrape when Tavily fails', async () => {
            vi.mocked(getSecureValueAsync).mockResolvedValue('tvly-bad-key')

            const originalFetch = globalThis.fetch
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: () => Promise.resolve('invalid key')
            })

            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [
                    { title: 'Fallback', url: 'https://fallback.com', description: 'Fallback result' }
                ],
                noResults: false,
                vqd: 'x'
            } as any)

            const result = await executeWebSearch({ query: 'test' })
            expect(result.success).toBe(true)
            expect(result.data?.source).toBe('duckduckgo')
            expect(duckDuckScrapeSearch).toHaveBeenCalledWith('test', expect.any(Object))

            globalThis.fetch = originalFetch
        })

        it('returns error when both Tavily and fallback fail', async () => {
            vi.mocked(getSecureValueAsync).mockResolvedValue('tvly-bad-key')

            const originalFetch = globalThis.fetch
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                text: () => Promise.resolve('invalid key')
            })

            vi.mocked(duckDuckScrapeSearch).mockRejectedValue(new Error('DDG failed'))

            const result = await executeWebSearch({ query: 'test' })
            expect(result.success).toBe(false)
            expect(result.error).toContain('Web search failed')
            expect(result.error).toContain('Tavily')

            globalThis.fetch = originalFetch
        })
    })

    describe('duck-duck-scrape fallback (no Tavily key)', () => {
        it('returns results when duck-duck-scrape succeeds', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [
                    { title: 'Result 1', url: 'https://r1.com', description: 'Desc 1' },
                    { title: 'Result 2', url: 'https://r2.com', description: 'Desc 2' }
                ],
                noResults: false,
                vqd: 'x'
            } as any)

            const result = await executeWebSearch({ query: 'test query' })
            expect(result.success).toBe(true)
            expect(result.data?.source).toBe('duckduckgo')
            expect(result.data?.results).toHaveLength(2)
            expect(result.data?.results?.[0].title).toBe('Result 1')
            expect(result.data?.results?.[0].url).toBe('https://r1.com')
            expect(result.data?.results?.[0].snippet).toBe('Desc 1')
        })

        it('returns empty hint when duck-duck-scrape returns no results', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [],
                noResults: true,
                vqd: 'x'
            } as any)

            const result = await executeWebSearch({ query: 'test' })
            expect(result.success).toBe(true)
            expect(result.data?.results).toHaveLength(0)
            expect(result.data?.message).toContain('Tavily')
            expect(result.data?.message).toContain('Settings')
        })

        it('returns error when duck-duck-scrape throws', async () => {
            vi.mocked(duckDuckScrapeSearch).mockRejectedValue(new Error('Network error'))

            const result = await executeWebSearch({ query: 'test' })
            expect(result.success).toBe(false)
            expect(result.error).toContain('Network error')
        })
    })

    describe('query sanitization', () => {
        it('trims query', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [{ title: 'A', url: 'https://a.com', description: 'A' }],
                noResults: false,
                vqd: 'x'
            } as any)

            await executeWebSearch({ query: '  trimmed  ' })
            expect(duckDuckScrapeSearch).toHaveBeenCalledWith('trimmed', expect.any(Object))
        })

        it('reformulates conversational query to keywords', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [{ title: 'A', url: 'https://a.com', description: 'A' }],
                noResults: false,
                vqd: 'x'
            } as any)

            await executeWebSearch({ query: 'Can you find the latest AI developments in 2025?' })
            expect(duckDuckScrapeSearch).toHaveBeenCalledWith(
                'the latest AI developments in 2025',
                expect.any(Object)
            )
        })

        it('clamps and reformulates long query to 400 chars (Tavily best practice)', async () => {
            vi.mocked(duckDuckScrapeSearch).mockResolvedValue({
                results: [],
                noResults: true,
                vqd: 'x'
            } as any)

            const longQuery = 'a'.repeat(600)
            await executeWebSearch({ query: longQuery })
            // Query is clamped to 500, then reformulated to 400 chars max
            expect(duckDuckScrapeSearch).toHaveBeenCalledWith(
                expect.stringMatching(/^a{397}\.\.\.$/),
                expect.any(Object)
            )
        })
    })
})
