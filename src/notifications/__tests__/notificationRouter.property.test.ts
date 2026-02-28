/**
 * Property-Based Tests for NotificationRouter
 *
 * Feature: notification-system, Property 8: Priority-based routing
 *
 * For any notification with preferences where `notificationsEnabled` is `true`
 * and `doNotDisturb` is `false`:
 * - If priority is `low` or `normal`: showToast=true, showBanner=false, showNative=false
 * - If priority is `high`: showToast=false, showBanner=true, showNative=false
 * - If priority is `critical` and window is focused: showToast=true, showBanner=true, showNative=false
 * - If priority is `critical` and window is not focused: showToast=true, showBanner=true, showNative=true
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 7.1**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { routeNotification, clampToastDuration } from '../router'
import type {
  Notification,
  NotificationPreferences,
  NotificationType,
  NotificationPriority,
} from '../types'

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

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 })

/** Generate a full Notification object with a specific priority */
function notificationWithPriority(priority: NotificationPriority): fc.Arbitrary<Notification> {
  return fc.record({
    id: fc.uuid(),
    type: notificationTypeArb,
    priority: fc.constant(priority),
    title: nonEmptyStringArb,
    body: nonEmptyStringArb,
    timestamp: fc.nat({ max: 2_000_000_000_000 }),
    read: fc.boolean(),
  })
}

/** Base preferences: notifications enabled, DND off, native on, valid duration */
const enabledPreferencesArb: fc.Arbitrary<NotificationPreferences> = fc.record({
  notificationsEnabled: fc.constant(true),
  nativeNotificationsEnabled: fc.constant(true),
  toastDuration: fc.integer({ min: 2000, max: 10000 }),
  doNotDisturb: fc.constant(false),
})

// ============================================================================
// Feature: notification-system, Property 8: Priority-based routing
// ============================================================================

describe('NotificationRouter Property Tests', () => {
  // Feature: notification-system, Property 8: Priority-based routing
  describe('Property 8: Priority-based routing — correct showToast/showBanner/showNative for each priority level', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 7.1**
     */

    it('low priority → showToast=true, showBanner=false, showNative=false', () => {
      // Validates: Requirements 3.1
      fc.assert(
        fc.property(
          notificationWithPriority('low'),
          enabledPreferencesArb,
          fc.boolean(),
          (notification, preferences, isWindowFocused) => {
            const decision = routeNotification(notification, preferences, isWindowFocused)

            expect(decision.showToast).toBe(true)
            expect(decision.showBanner).toBe(false)
            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('normal priority → showToast=true, showBanner=false, showNative=false', () => {
      // Validates: Requirements 3.1
      fc.assert(
        fc.property(
          notificationWithPriority('normal'),
          enabledPreferencesArb,
          fc.boolean(),
          (notification, preferences, isWindowFocused) => {
            const decision = routeNotification(notification, preferences, isWindowFocused)

            expect(decision.showToast).toBe(true)
            expect(decision.showBanner).toBe(false)
            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('high priority → showToast=false, showBanner=true, showNative=false', () => {
      // Validates: Requirements 3.2
      fc.assert(
        fc.property(
          notificationWithPriority('high'),
          enabledPreferencesArb,
          fc.boolean(),
          (notification, preferences, isWindowFocused) => {
            const decision = routeNotification(notification, preferences, isWindowFocused)

            expect(decision.showToast).toBe(false)
            expect(decision.showBanner).toBe(true)
            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('critical + focused → showToast=true, showBanner=true, showNative=false', () => {
      // Validates: Requirements 3.3, 7.1
      fc.assert(
        fc.property(
          notificationWithPriority('critical'),
          enabledPreferencesArb,
          (notification, preferences) => {
            const decision = routeNotification(notification, preferences, true)

            expect(decision.showToast).toBe(true)
            expect(decision.showBanner).toBe(true)
            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('critical + unfocused → showToast=true, showBanner=true, showNative=true', () => {
      // Validates: Requirements 3.3, 7.1
      fc.assert(
        fc.property(
          notificationWithPriority('critical'),
          enabledPreferencesArb,
          (notification, preferences) => {
            const decision = routeNotification(notification, preferences, false)

            expect(decision.showToast).toBe(true)
            expect(decision.showBanner).toBe(true)
            expect(decision.showNative).toBe(true)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // Feature: notification-system, Property 9: Do Not Disturb suppresses rendering
  describe('Property 9: Do Not Disturb suppresses rendering — toast and banner false, store still receives', () => {
    /**
     * **Validates: Requirements 8.5, 8.6**
     *
     * For any notification (of any priority) when `doNotDisturb` is `true`,
     * the routing decision should have `showToast=false` and `showBanner=false`.
     * The store still receives the notification, but that is handled by the context,
     * not the router — the router just returns the render decision.
     */

    const priorityArb: fc.Arbitrary<NotificationPriority> = fc.constantFrom(
      'low', 'normal', 'high', 'critical'
    )

    const notificationArb: fc.Arbitrary<Notification> = fc.record({
      id: fc.uuid(),
      type: notificationTypeArb,
      priority: priorityArb,
      title: nonEmptyStringArb,
      body: nonEmptyStringArb,
      timestamp: fc.nat({ max: 2_000_000_000_000 }),
      read: fc.boolean(),
    })

    /** Preferences with DND enabled; other flags vary freely */
    const dndPreferencesArb: fc.Arbitrary<NotificationPreferences> = fc.record({
      notificationsEnabled: fc.boolean(),
      nativeNotificationsEnabled: fc.boolean(),
      toastDuration: fc.integer({ min: 2000, max: 10000 }),
      doNotDisturb: fc.constant(true),
    })

    it('DND suppresses toast and banner for any priority', () => {
      // Validates: Requirements 8.5, 8.6
      fc.assert(
        fc.property(
          notificationArb,
          dndPreferencesArb,
          fc.boolean(),
          (notification, preferences, isWindowFocused) => {
            const decision = routeNotification(notification, preferences, isWindowFocused)

            expect(decision.showToast).toBe(false)
            expect(decision.showBanner).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // Feature: notification-system, Property 10: Notifications disabled suppresses non-critical
  describe('Property 10: Notifications disabled suppresses non-critical — only critical passes through', () => {
    /**
     * **Validates: Requirements 8.7**
     *
     * For any notification with priority other than `critical` when `notificationsEnabled`
     * is `false`, all render flags should be false (showToast=false, showBanner=false,
     * showNative=false). For critical notifications when `notificationsEnabled` is `false`,
     * the notification should still be processed normally (routing based on priority rules).
     */

    const nonCriticalPriorityArb: fc.Arbitrary<NotificationPriority> = fc.constantFrom(
      'low', 'normal', 'high'
    )

    const nonCriticalNotificationArb: fc.Arbitrary<Notification> = fc.record({
      id: fc.uuid(),
      type: notificationTypeArb,
      priority: nonCriticalPriorityArb,
      title: nonEmptyStringArb,
      body: nonEmptyStringArb,
      timestamp: fc.nat({ max: 2_000_000_000_000 }),
      read: fc.boolean(),
    })

    /** Preferences with notifications disabled, DND off, other flags vary */
    const disabledPreferencesArb: fc.Arbitrary<NotificationPreferences> = fc.record({
      notificationsEnabled: fc.constant(false),
      nativeNotificationsEnabled: fc.boolean(),
      toastDuration: fc.integer({ min: 2000, max: 10000 }),
      doNotDisturb: fc.constant(false),
    })

    it('non-critical notifications are fully suppressed when notifications disabled', () => {
      // Validates: Requirements 8.7
      fc.assert(
        fc.property(
          nonCriticalNotificationArb,
          disabledPreferencesArb,
          fc.boolean(),
          (notification, preferences, isWindowFocused) => {
            const decision = routeNotification(notification, preferences, isWindowFocused)

            expect(decision.showToast).toBe(false)
            expect(decision.showBanner).toBe(false)
            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('critical notifications still route normally when notifications disabled + focused', () => {
      // Validates: Requirements 8.7
      fc.assert(
        fc.property(
          notificationWithPriority('critical'),
          disabledPreferencesArb,
          (notification, preferences) => {
            const decision = routeNotification(notification, preferences, true)

            expect(decision.showToast).toBe(true)
            expect(decision.showBanner).toBe(true)
            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('critical notifications still route normally when notifications disabled + unfocused', () => {
      // Validates: Requirements 8.7
      fc.assert(
        fc.property(
          notificationWithPriority('critical'),
          disabledPreferencesArb,
          (notification, preferences) => {
            const decision = routeNotification(notification, preferences, false)

            // Native depends on nativeNotificationsEnabled preference
            expect(decision.showToast).toBe(true)
            expect(decision.showBanner).toBe(true)
            // showNative follows nativeNotificationsEnabled when critical + unfocused
            expect(decision.showNative).toBe(preferences.nativeNotificationsEnabled)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // Feature: notification-system, Property 11: Native notifications preference
  describe('Property 11: Native notifications preference — showNative false when disabled', () => {
    /**
     * **Validates: Requirements 7.4**
     *
     * For any notification when `nativeNotificationsEnabled` is `false`,
     * the routing decision should have `showNative=false` regardless of
     * priority or window focus state.
     */

    const priorityArb: fc.Arbitrary<NotificationPriority> = fc.constantFrom(
      'low', 'normal', 'high', 'critical'
    )

    const anyNotificationArb: fc.Arbitrary<Notification> = fc.record({
      id: fc.uuid(),
      type: notificationTypeArb,
      priority: priorityArb,
      title: nonEmptyStringArb,
      body: nonEmptyStringArb,
      timestamp: fc.nat({ max: 2_000_000_000_000 }),
      read: fc.boolean(),
    })

    /** Preferences with native notifications disabled; other flags vary freely */
    const nativeDisabledPreferencesArb: fc.Arbitrary<NotificationPreferences> = fc.record({
      notificationsEnabled: fc.boolean(),
      nativeNotificationsEnabled: fc.constant(false),
      toastDuration: fc.integer({ min: 2000, max: 10000 }),
      doNotDisturb: fc.boolean(),
    })

    it('showNative is always false when nativeNotificationsEnabled is false', () => {
      // Validates: Requirements 7.4
      fc.assert(
        fc.property(
          anyNotificationArb,
          nativeDisabledPreferencesArb,
          fc.boolean(),
          (notification, preferences, isWindowFocused) => {
            const decision = routeNotification(notification, preferences, isWindowFocused)

            expect(decision.showNative).toBe(false)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })

  // Feature: notification-system, Property 16: Toast duration clamping
  describe('Property 16: Toast duration clamping — effective duration clamped to [2000, 10000]', () => {
    /**
     * **Validates: Requirements 8.4**
     *
     * For any `toastDuration` value, the effective duration returned by
     * `clampToastDuration` should be clamped to the range [2000, 10000] ms.
     * Values below 2000 → 2000, values above 10000 → 10000, values within range → unchanged.
     */

    it('any duration is clamped to [2000, 10000]', () => {
      // Validates: Requirements 8.4
      fc.assert(
        fc.property(
          fc.double({ min: -1e9, max: 1e9, noNaN: true }),
          (duration) => {
            const clamped = clampToastDuration(duration)

            expect(clamped).toBeGreaterThanOrEqual(2000)
            expect(clamped).toBeLessThanOrEqual(10000)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('values below 2000 are clamped to 2000', () => {
      // Validates: Requirements 8.4
      fc.assert(
        fc.property(
          fc.double({ min: -1e9, max: 1999.99, noNaN: true }),
          (duration) => {
            const clamped = clampToastDuration(duration)

            expect(clamped).toBe(2000)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('values above 10000 are clamped to 10000', () => {
      // Validates: Requirements 8.4
      fc.assert(
        fc.property(
          fc.double({ min: 10000.01, max: 1e9, noNaN: true }),
          (duration) => {
            const clamped = clampToastDuration(duration)

            expect(clamped).toBe(10000)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })

    it('values within [2000, 10000] are unchanged', () => {
      // Validates: Requirements 8.4
      fc.assert(
        fc.property(
          fc.double({ min: 2000, max: 10000, noNaN: true }),
          (duration) => {
            const clamped = clampToastDuration(duration)

            expect(clamped).toBe(duration)
          }
        ),
        PROPERTY_TEST_CONFIG
      )
    })
  })
})
