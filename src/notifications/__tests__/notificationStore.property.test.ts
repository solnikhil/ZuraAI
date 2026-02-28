/**
 * Property-Based Tests for NotificationStore
 *
 * Feature: notification-system, Property 1: Notification creation invariants
 *
 * For any notification payload (with any combination of type, title, body, and
 * optional priority), creating a notification should produce an object with:
 * a unique string ID, the specified type/title/body, a numeric timestamp,
 * `read` set to `false`, and `priority` defaulting to `'normal'` when not
 * specified. Furthermore, for any set of N notifications created, all N IDs
 * should be distinct.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'
import { NotificationProvider, useNotificationStore } from '../../contexts/NotificationContext'
import type { NotificationPayload, NotificationType, NotificationPriority } from '../types'

// ============================================================================
// Test Configuration
// ============================================================================

const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
}

// ============================================================================
// Generators
// ============================================================================

const notificationTypeArb: fc.Arbitrary<NotificationType> = fc.constantFrom(
  'success', 'error', 'warning', 'info'
)

const notificationPriorityArb: fc.Arbitrary<NotificationPriority> = fc.constantFrom(
  'low', 'normal', 'high', 'critical'
)

/** Generate a non-empty string for title/body fields */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })

/** Generate a notification payload with explicit priority */
const payloadWithPriorityArb: fc.Arbitrary<NotificationPayload> = fc.record({
  type: notificationTypeArb,
  priority: notificationPriorityArb,
  title: nonEmptyStringArb,
  body: nonEmptyStringArb,
})

/** Generate a notification payload without priority (should default to 'normal') */
const payloadWithoutPriorityArb: fc.Arbitrary<Omit<NotificationPayload, 'priority'>> = fc.record({
  type: notificationTypeArb,
  title: nonEmptyStringArb,
  body: nonEmptyStringArb,
})

/** Generate a payload where priority is optionally present */
const payloadArb: fc.Arbitrary<NotificationPayload> = fc.oneof(
  payloadWithPriorityArb,
  payloadWithoutPriorityArb.map(p => p as NotificationPayload)
)

// ============================================================================
// Wrapper for renderHook
// ============================================================================

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(NotificationProvider, null, children)
}

// ============================================================================
// Property 1: Notification creation invariants
// ============================================================================

describe('NotificationStore Property Tests', () => {
  afterEach(() => {
    cleanup()
  })

  // Feature: notification-system, Property 1: Notification creation invariants
  describe('Property 1: Notification creation invariants', () => {
    it('each notification has a unique string ID', () => {
      // Validates: Requirements 1.1, 1.2
      fc.assert(
        fc.property(payloadArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload)
          })

          const notification = result.current.notifications[0]
          expect(typeof notification.id).toBe('string')
          expect(notification.id.length).toBeGreaterThan(0)

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    it('type, title, and body match the input payload', () => {
      // Validates: Requirements 1.1, 2.2
      fc.assert(
        fc.property(payloadWithPriorityArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload)
          })

          const notification = result.current.notifications[0]
          expect(notification.type).toBe(payload.type)
          expect(notification.title).toBe(payload.title)
          expect(notification.body).toBe(payload.body)

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    it('read defaults to false', () => {
      // Validates: Requirements 1.4
      fc.assert(
        fc.property(payloadArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload)
          })

          const notification = result.current.notifications[0]
          expect(notification.read).toBe(false)

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    it('priority defaults to normal when not specified', () => {
      // Validates: Requirements 1.3
      fc.assert(
        fc.property(payloadWithoutPriorityArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload as NotificationPayload)
          })

          const notification = result.current.notifications[0]
          expect(notification.priority).toBe('normal')

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    it('priority matches input when explicitly specified', () => {
      // Validates: Requirements 1.1, 1.3
      fc.assert(
        fc.property(payloadWithPriorityArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload)
          })

          const notification = result.current.notifications[0]
          expect(notification.priority).toBe(payload.priority)

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    it('timestamp is a number', () => {
      // Validates: Requirements 1.1
      fc.assert(
        fc.property(payloadArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload)
          })

          const notification = result.current.notifications[0]
          expect(typeof notification.timestamp).toBe('number')
          expect(notification.timestamp).toBeGreaterThan(0)

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })

    it('for N notifications created, all N IDs are distinct', () => {
      // Validates: Requirements 1.2, 2.2
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 2, maxLength: 20 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const ids = result.current.notifications.map(n => n.id)
            const uniqueIds = new Set(ids)
            expect(uniqueIds.size).toBe(ids.length)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // ============================================================================
  // Feature: notification-system, Property 2: Store ordering invariant
  // ============================================================================

  // Feature: notification-system, Property 2: Store ordering invariant
  describe('Property 2: Store ordering invariant — always sorted by timestamp descending', () => {
    /**
     * **Validates: Requirements 2.1**
     *
     * For any sequence of notifications added to the store (with arbitrary
     * timestamps), the store's notification list should always be sorted by
     * timestamp in descending order (newest first).
     */

    it('notifications are sorted by timestamp descending after adding multiple notifications', () => {
      // Validates: Requirements 2.1
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const timestamps = result.current.notifications.map(n => n.timestamp)

            // Verify descending order: each timestamp >= the next
            for (let i = 0; i < timestamps.length - 1; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1])
            }

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('ordering is maintained after interleaved add and dismiss operations', () => {
      // Validates: Requirements 2.1
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 3, maxLength: 20 }),
          fc.nat({ max: 2 }),
          (payloads, dismissIndex) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            // Add first batch
            act(() => {
              for (const payload of payloads.slice(0, Math.ceil(payloads.length / 2))) {
                result.current.addNotification(payload)
              }
            })

            // Dismiss one notification if available
            const currentNotifications = result.current.notifications
            if (currentNotifications.length > 0) {
              const targetIndex = dismissIndex % currentNotifications.length
              act(() => {
                result.current.dismissNotification(currentNotifications[targetIndex].id)
              })
            }

            // Add remaining batch
            act(() => {
              for (const payload of payloads.slice(Math.ceil(payloads.length / 2))) {
                result.current.addNotification(payload)
              }
            })

            // Verify descending order still holds
            const timestamps = result.current.notifications.map(n => n.timestamp)
            for (let i = 0; i < timestamps.length - 1; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1])
            }

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('single notification trivially satisfies ordering', () => {
      // Validates: Requirements 2.1
      fc.assert(
        fc.property(payloadArb, (payload) => {
          const { result } = renderHook(() => useNotificationStore(), { wrapper })

          act(() => {
            result.current.addNotification(payload)
          })

          // A single-element list is always sorted
          expect(result.current.notifications).toHaveLength(1)
          expect(typeof result.current.notifications[0].timestamp).toBe('number')

          cleanup()
        }),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // ============================================================================
  // Feature: notification-system, Property 3: Dismiss removes exactly one notification
  // ============================================================================

  // Feature: notification-system, Property 3: Dismiss removes exactly one notification
  describe('Property 3: Dismiss removes exactly one notification — size N-1, target absent, others unchanged', () => {
    /**
     * **Validates: Requirements 2.3**
     *
     * For any store containing N notifications and any valid notification ID
     * present in the store, calling `dismissNotification(id)` should result
     * in a store of size N-1 where the dismissed notification is absent and
     * all other notifications remain unchanged.
     */

    it('dismiss reduces store size by exactly one', () => {
      // Validates: Requirements 2.3
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          fc.nat(),
          (payloads, indexSeed) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const before = result.current.notifications
            const targetIndex = indexSeed % before.length
            const targetId = before[targetIndex].id

            act(() => {
              result.current.dismissNotification(targetId)
            })

            expect(result.current.notifications).toHaveLength(before.length - 1)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('dismissed notification is absent from the store', () => {
      // Validates: Requirements 2.3
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          fc.nat(),
          (payloads, indexSeed) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const before = result.current.notifications
            const targetIndex = indexSeed % before.length
            const targetId = before[targetIndex].id

            act(() => {
              result.current.dismissNotification(targetId)
            })

            const afterIds = result.current.notifications.map(n => n.id)
            expect(afterIds).not.toContain(targetId)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('all other notifications remain unchanged after dismiss', () => {
      // Validates: Requirements 2.3
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 2, maxLength: 30 }),
          fc.nat(),
          (payloads, indexSeed) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const before = result.current.notifications
            const targetIndex = indexSeed % before.length
            const targetId = before[targetIndex].id
            const expectedRemaining = before.filter(n => n.id !== targetId)

            act(() => {
              result.current.dismissNotification(targetId)
            })

            const after = result.current.notifications

            // Each remaining notification should be identical to its before state
            expect(after).toHaveLength(expectedRemaining.length)
            for (let i = 0; i < after.length; i++) {
              expect(after[i].id).toBe(expectedRemaining[i].id)
              expect(after[i].type).toBe(expectedRemaining[i].type)
              expect(after[i].title).toBe(expectedRemaining[i].title)
              expect(after[i].body).toBe(expectedRemaining[i].body)
              expect(after[i].priority).toBe(expectedRemaining[i].priority)
              expect(after[i].timestamp).toBe(expectedRemaining[i].timestamp)
              expect(after[i].read).toBe(expectedRemaining[i].read)
            }

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // ============================================================================
  // Feature: notification-system, Property 4: Mark-as-read correctness
  // ============================================================================

  // Feature: notification-system, Property 4: Mark-as-read correctness
  describe('Property 4: Mark-as-read correctness — single mark and mark-all behavior', () => {
    /**
     * **Validates: Requirements 2.4, 2.5**
     *
     * For any store state, calling `markAsRead(id)` should set the `read`
     * field of exactly that notification to `true` without modifying any
     * other notification. Calling `markAllAsRead()` should set the `read`
     * field of every notification to `true`.
     */

    it('markAsRead sets exactly the targeted notification to read', () => {
      // Validates: Requirements 2.4
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          fc.nat(),
          (payloads, indexSeed) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const before = result.current.notifications
            const targetIndex = indexSeed % before.length
            const targetId = before[targetIndex].id

            act(() => {
              result.current.markAsRead(targetId)
            })

            const after = result.current.notifications
            const target = after.find(n => n.id === targetId)
            expect(target).toBeDefined()
            expect(target!.read).toBe(true)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('markAsRead does not modify any other notification', () => {
      // Validates: Requirements 2.4
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 2, maxLength: 30 }),
          fc.nat(),
          (payloads, indexSeed) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const before = result.current.notifications
            const targetIndex = indexSeed % before.length
            const targetId = before[targetIndex].id
            const othersBefore = before.filter(n => n.id !== targetId)

            act(() => {
              result.current.markAsRead(targetId)
            })

            const after = result.current.notifications
            const othersAfter = after.filter(n => n.id !== targetId)

            expect(othersAfter).toHaveLength(othersBefore.length)
            for (let i = 0; i < othersAfter.length; i++) {
              expect(othersAfter[i].id).toBe(othersBefore[i].id)
              expect(othersAfter[i].type).toBe(othersBefore[i].type)
              expect(othersAfter[i].title).toBe(othersBefore[i].title)
              expect(othersAfter[i].body).toBe(othersBefore[i].body)
              expect(othersAfter[i].priority).toBe(othersBefore[i].priority)
              expect(othersAfter[i].timestamp).toBe(othersBefore[i].timestamp)
              expect(othersAfter[i].read).toBe(othersBefore[i].read)
            }

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('markAsRead preserves store size', () => {
      // Validates: Requirements 2.4
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          fc.nat(),
          (payloads, indexSeed) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const sizeBefore = result.current.notifications.length
            const targetIndex = indexSeed % sizeBefore
            const targetId = result.current.notifications[targetIndex].id

            act(() => {
              result.current.markAsRead(targetId)
            })

            expect(result.current.notifications).toHaveLength(sizeBefore)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('markAllAsRead sets every notification to read', () => {
      // Validates: Requirements 2.5
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            act(() => {
              result.current.markAllAsRead()
            })

            const after = result.current.notifications
            for (const notification of after) {
              expect(notification.read).toBe(true)
            }

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('markAllAsRead preserves store size and notification data', () => {
      // Validates: Requirements 2.5
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const before = result.current.notifications

            act(() => {
              result.current.markAllAsRead()
            })

            const after = result.current.notifications
            expect(after).toHaveLength(before.length)

            for (let i = 0; i < after.length; i++) {
              expect(after[i].id).toBe(before[i].id)
              expect(after[i].type).toBe(before[i].type)
              expect(after[i].title).toBe(before[i].title)
              expect(after[i].body).toBe(before[i].body)
              expect(after[i].priority).toBe(before[i].priority)
              expect(after[i].timestamp).toBe(before[i].timestamp)
            }

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // ============================================================================
  // Feature: notification-system, Property 5: Clear all empties the store
  // ============================================================================

  // Feature: notification-system, Property 5: Clear all empties the store
  describe('Property 5: Clear all empties the store — results in zero notifications', () => {
    /**
     * **Validates: Requirements 2.6**
     *
     * For any store containing N notifications (where N >= 0), calling
     * `clearAll()` should result in an empty store with zero notifications.
     */

    it('clearAll results in zero notifications for any non-empty store', () => {
      // Validates: Requirements 2.6
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            // Verify store is non-empty before clearing
            expect(result.current.notifications.length).toBeGreaterThan(0)

            act(() => {
              result.current.clearAll()
            })

            expect(result.current.notifications).toHaveLength(0)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('clearAll on an empty store results in zero notifications', () => {
      // Validates: Requirements 2.6
      const { result } = renderHook(() => useNotificationStore(), { wrapper })

      // Store starts empty
      expect(result.current.notifications).toHaveLength(0)

      act(() => {
        result.current.clearAll()
      })

      expect(result.current.notifications).toHaveLength(0)

      cleanup()
    })

    it('clearAll resets unreadCount to zero', () => {
      // Validates: Requirements 2.6
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            act(() => {
              result.current.clearAll()
            })

            expect(result.current.unreadCount).toBe(0)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // ============================================================================
  // Feature: notification-system, Property 6: Unread count accuracy
  // ============================================================================

  // Feature: notification-system, Property 6: Unread count accuracy
  describe('Property 6: Unread count accuracy — equals count of read === false', () => {
    /**
     * **Validates: Requirements 2.7**
     *
     * For any store state, the `unreadCount` value should equal the number
     * of notifications in the store where `read === false`.
     */

    it('unreadCount equals count of read === false after initial creation (all unread)', () => {
      // Validates: Requirements 2.7
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            const unreadManual = result.current.notifications.filter(n => n.read === false).length
            expect(result.current.unreadCount).toBe(unreadManual)
            // All freshly created notifications are unread
            expect(result.current.unreadCount).toBe(result.current.notifications.length)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('unreadCount equals count of read === false after marking some as read', () => {
      // Validates: Requirements 2.7
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 2, maxLength: 30 }),
          fc.array(fc.nat(), { minLength: 1, maxLength: 10 }),
          (payloads, readIndices) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            // Mark a subset as read using the generated indices
            act(() => {
              const notifications = result.current.notifications
              const indicesToMark = new Set(
                readIndices.map(i => i % notifications.length)
              )
              for (const idx of indicesToMark) {
                result.current.markAsRead(notifications[idx].id)
              }
            })

            const unreadManual = result.current.notifications.filter(n => n.read === false).length
            expect(result.current.unreadCount).toBe(unreadManual)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('unreadCount is zero after markAllAsRead', () => {
      // Validates: Requirements 2.7
      fc.assert(
        fc.property(
          fc.array(payloadArb, { minLength: 1, maxLength: 30 }),
          (payloads) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (const payload of payloads) {
                result.current.addNotification(payload)
              }
            })

            act(() => {
              result.current.markAllAsRead()
            })

            const unreadManual = result.current.notifications.filter(n => n.read === false).length
            expect(result.current.unreadCount).toBe(0)
            expect(unreadManual).toBe(0)

            cleanup()
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // ============================================================================
  // Feature: notification-system, Property 7: Store cap at 100 entries
  // ============================================================================

  // Feature: notification-system, Property 7: Store cap at 100 entries
  describe('Property 7: Store cap at 100 entries — never exceeds 100, oldest removed on overflow', () => {
    /**
     * **Validates: Requirements 2.8**
     *
     * For any sequence of notification additions, the store should never
     * contain more than 100 notifications. When the 101st notification is
     * added, the oldest notification (by timestamp) should be removed.
     */

    const STORE_CAP = 100

    /** Lower numRuns for cap tests since adding 100+ notifications per iteration is expensive */
    const CAP_TEST_CONFIG = { numRuns: 10 }

    it('store never exceeds 100 notifications regardless of how many are added', () => {
      // Validates: Requirements 2.8
      fc.assert(
        fc.property(
          fc.integer({ min: STORE_CAP + 1, max: STORE_CAP + 50 }),
          (totalToAdd) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (let i = 0; i < totalToAdd; i++) {
                result.current.addNotification({
                  type: 'info',
                  title: `Notification ${i}`,
                  body: `Body ${i}`,
                })
              }
            })

            expect(result.current.notifications.length).toBeLessThanOrEqual(STORE_CAP)

            cleanup()
          }
        ),
        CAP_TEST_CONFIG
      )
    })

    it('adding the 101st notification removes the oldest notification by timestamp', () => {
      // Validates: Requirements 2.8
      fc.assert(
        fc.property(
          payloadArb,
          (overflowPayload) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            // Fill the store to exactly 100
            act(() => {
              for (let i = 0; i < STORE_CAP; i++) {
                result.current.addNotification({
                  type: 'info',
                  title: `Notification ${i}`,
                  body: `Body ${i}`,
                })
              }
            })

            expect(result.current.notifications).toHaveLength(STORE_CAP)

            // Capture the oldest notification (last in desc-sorted list) before overflow
            const oldestBefore = result.current.notifications[result.current.notifications.length - 1]

            // Add the 101st notification
            act(() => {
              result.current.addNotification(overflowPayload)
            })

            // Store should still be capped at 100
            expect(result.current.notifications).toHaveLength(STORE_CAP)

            // The previously oldest notification should have been evicted
            const idsAfter = result.current.notifications.map(n => n.id)
            expect(idsAfter).not.toContain(oldestBefore.id)

            cleanup()
          }
        ),
        CAP_TEST_CONFIG
      )
    })

    it('store remains sorted by timestamp descending after overflow eviction', () => {
      // Validates: Requirements 2.8
      fc.assert(
        fc.property(
          fc.integer({ min: STORE_CAP + 1, max: STORE_CAP + 20 }),
          (totalToAdd) => {
            const { result } = renderHook(() => useNotificationStore(), { wrapper })

            act(() => {
              for (let i = 0; i < totalToAdd; i++) {
                result.current.addNotification({
                  type: 'info',
                  title: `Notification ${i}`,
                  body: `Body ${i}`,
                })
              }
            })

            const timestamps = result.current.notifications.map(n => n.timestamp)
            for (let i = 0; i < timestamps.length - 1; i++) {
              expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1])
            }

            cleanup()
          }
        ),
        CAP_TEST_CONFIG
      )
    })
  })
})
