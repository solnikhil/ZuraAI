import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { isValidNotificationBridgePayload } from '../notifications'

const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
}

describe('NotificationBridge Property Tests', () => {
  describe('Property 12: Notification payload validation', () => {
    it('accepts valid payloads with required fields', () => {
      const validTypeArb = fc.constantFrom('success', 'error', 'warning', 'info')
      const validPriorityArb = fc.constantFrom('low', 'normal', 'high', 'critical')

      fc.assert(
        fc.property(
          validTypeArb,
          validPriorityArb,
          fc.string({ minLength: 1, maxLength: 120 }),
          fc.string({ minLength: 1, maxLength: 1000 }),
          (type, priority, title, body) => {
            const payload = {
              type,
              priority,
              title,
              body,
              action: { label: 'Open' },
            }

            expect(isValidNotificationBridgePayload(payload)).toBe(true)
          },
        ),
        PROPERTY_TEST_CONFIG,
      )
    })

    it('rejects payloads missing required fields', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          if (typeof value === 'object' && value !== null) {
            const candidate = value as Record<string, unknown>
            if (
              typeof candidate.type === 'string' &&
              typeof candidate.title === 'string' && candidate.title.trim().length > 0 &&
              typeof candidate.body === 'string' && candidate.body.trim().length > 0 &&
              ['success', 'error', 'warning', 'info'].includes(candidate.type)
            ) {
              return true
            }
          }

          expect(isValidNotificationBridgePayload(value)).toBe(false)
        }),
        PROPERTY_TEST_CONFIG,
      )
    })
  })
})
