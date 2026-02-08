/**
 * Property-Based Test: Relative time formatting produces correct labels
 *
 * Feature: sidebar-redesign, Property 4: Relative time formatting produces correct labels
 * Validates: Requirements 6.3
 *
 * For any timestamp between 0 and Date.now(), formatRelativeTime(timestamp) should return
 * a string matching one of the expected patterns: "Just now" (< 1 min), "{n}m" (1-59 min),
 * "{n}h" (1-23 hours), "{n}d" (1-6 days), "{n}w" (1-4 weeks), "{n}mo" (1+ months),
 * where n is a positive integer consistent with the actual time difference.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { formatRelativeTime } from '../utils/formatRelativeTime'

// ============================================================================
// Property 4: Relative time formatting produces correct labels
// ============================================================================

describe('Property 4: Relative time formatting produces correct labels', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('always returns a string matching one of the expected patterns', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: fixedNow }),
                (timestamp) => {
                    const result = formatRelativeTime(timestamp)
                    const validPatterns = /^(Just now|\d+m|\d+h|\d+d|\d+w|\d+mo)$/
                    expect(result).toMatch(validPatterns)
                }
            ),
            { numRuns: 200 }
        )
    })

    it('timestamps < 1 minute ago return "Just now"', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 59999 }), // 0 to 59.999 seconds
                (diffMs) => {
                    const timestamp = fixedNow - diffMs
                    const result = formatRelativeTime(timestamp)
                    expect(result).toBe('Just now')
                }
            ),
            { numRuns: 100 }
        )
    })

    it('timestamps 1-59 minutes ago return "{n}m" with correct n', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 59 }), // minutes
                (minutes) => {
                    const timestamp = fixedNow - minutes * 60000
                    const result = formatRelativeTime(timestamp)
                    expect(result).toBe(`${minutes}m`)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('timestamps 1-23 hours ago return "{n}h" with correct n', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 23 }), // hours
                (hours) => {
                    const timestamp = fixedNow - hours * 3600000
                    const result = formatRelativeTime(timestamp)
                    expect(result).toBe(`${hours}h`)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('timestamps 1-6 days ago return "{n}d" with correct n', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 6 }), // days
                (days) => {
                    const timestamp = fixedNow - days * 86400000
                    const result = formatRelativeTime(timestamp)
                    expect(result).toBe(`${days}d`)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('timestamps 7-29 days ago return "{n}w" with correct n', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 7, max: 29 }), // days
                (days) => {
                    const timestamp = fixedNow - days * 86400000
                    const result = formatRelativeTime(timestamp)
                    const expectedWeeks = Math.floor(days / 7)
                    expect(result).toBe(`${expectedWeeks}w`)
                }
            ),
            { numRuns: 100 }
        )
    })

    it('timestamps 30+ days ago return "{n}mo" with correct n', () => {
        const fixedNow = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow)

        fc.assert(
            fc.property(
                fc.integer({ min: 30, max: 365 }), // days
                (days) => {
                    const timestamp = fixedNow - days * 86400000
                    const result = formatRelativeTime(timestamp)
                    const expectedMonths = Math.floor(days / 30)
                    expect(result).toBe(`${expectedMonths}mo`)
                }
            ),
            { numRuns: 100 }
        )
    })
})
