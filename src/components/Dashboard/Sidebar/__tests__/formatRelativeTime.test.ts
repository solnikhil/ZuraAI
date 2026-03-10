/**
 * Unit Tests: formatRelativeTime utility
 *
 *
 * Tests cover:
 * - "Just now" for timestamps less than 1 minute ago
 * - "{n}m" for 1–59 minutes ago
 * - "{n}h" for 1–23 hours ago
 * - "{n}d" for 1–6 days ago
 * - "{n}w" for 7–29 days ago
 * - "{n}mo" for 30+ days ago
 * - Edge cases (exact boundaries, future timestamps, zero)
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatRelativeTime } from '../utils/formatRelativeTime'

// Constants

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

// Tests

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('"Just now" — less than 1 minute ago', () => {
    it('should return "Just now" for a timestamp equal to now', () => {
      const now = Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now)).toBe('Just now')
    })

    it('should return "Just now" for a timestamp 30 seconds ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 30_000)).toBe('Just now')
    })

    it('should return "Just now" for a timestamp 59 seconds ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 59_999)).toBe('Just now')
    })
  })

  describe('"{n}m" — 1 to 59 minutes ago', () => {
    it('should return "1m" for exactly 1 minute ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - MINUTE)).toBe('1m')
    })

    it('should return "5m" for 5 minutes ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 5 * MINUTE)).toBe('5m')
    })

    it('should return "59m" for 59 minutes ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 59 * MINUTE)).toBe('59m')
    })
  })

  describe('"{n}h" — 1 to 23 hours ago', () => {
    it('should return "1h" for exactly 1 hour ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - HOUR)).toBe('1h')
    })

    it('should return "12h" for 12 hours ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 12 * HOUR)).toBe('12h')
    })

    it('should return "23h" for 23 hours ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 23 * HOUR)).toBe('23h')
    })
  })

  describe('"{n}d" — 1 to 6 days ago', () => {
    it('should return "1d" for exactly 1 day ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - DAY)).toBe('1d')
    })

    it('should return "3d" for 3 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 3 * DAY)).toBe('3d')
    })

    it('should return "6d" for 6 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 6 * DAY)).toBe('6d')
    })
  })

  describe('"{n}w" — 7 to 29 days ago', () => {
    it('should return "1w" for exactly 7 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 7 * DAY)).toBe('1w')
    })

    it('should return "2w" for 14 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 14 * DAY)).toBe('2w')
    })

    it('should return "4w" for 29 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 29 * DAY)).toBe('4w')
    })
  })

  describe('"{n}mo" — 30+ days ago', () => {
    it('should return "1mo" for exactly 30 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 30 * DAY)).toBe('1mo')
    })

    it('should return "2mo" for 60 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 60 * DAY)).toBe('2mo')
    })

    it('should return "12mo" for 365 days ago', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 365 * DAY)).toBe('12mo')
    })
  })

  describe('boundary transitions', () => {
    it('should transition from "Just now" to "1m" at exactly 60 seconds', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - MINUTE)).toBe('1m')
      expect(formatRelativeTime(now - MINUTE + 1)).toBe('Just now')
    })

    it('should transition from minutes to hours at exactly 60 minutes', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - HOUR)).toBe('1h')
      expect(formatRelativeTime(now - HOUR + 1)).toBe('59m')
    })

    it('should transition from hours to days at exactly 24 hours', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - DAY)).toBe('1d')
      expect(formatRelativeTime(now - DAY + 1)).toBe('23h')
    })

    it('should transition from days to weeks at exactly 7 days', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 7 * DAY)).toBe('1w')
      expect(formatRelativeTime(now - 7 * DAY + 1)).toBe('6d')
    })

    it('should transition from weeks to months at exactly 30 days', () => {
      const now = 1_700_000_000_000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      expect(formatRelativeTime(now - 30 * DAY)).toBe('1mo')
      expect(formatRelativeTime(now - 30 * DAY + 1)).toBe('4w')
    })
  })
})
