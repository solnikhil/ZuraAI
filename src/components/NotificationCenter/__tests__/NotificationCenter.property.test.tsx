import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import { SettingsUIProvider } from '../../../contexts/SettingsUIContext'
import { NotificationProvider } from '../../../contexts/NotificationContext'
import { useNotifications } from '../../../hooks/useNotifications'
import BannerStack from '../../BannerStack/BannerStack'
import NotificationItem from '../NotificationItem'
import type { Notification, NotificationPayload, NotificationPriority, NotificationType } from '../../../notifications/types'

const PROPERTY_TEST_CONFIG = {
  numRuns: 100,
}

const notificationTypeArb: fc.Arbitrary<NotificationType> = fc.constantFrom('success', 'error', 'warning', 'info')
const highPriorityArb: fc.Arbitrary<NotificationPriority> = fc.constantFrom('high', 'critical')

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsUIProvider>
      <NotificationProvider>{children}</NotificationProvider>
    </SettingsUIProvider>
  )
}

function NotificationSeeder({ payloads }: { payloads: NotificationPayload[] }) {
  const { addNotification } = useNotifications()

  useEffect(() => {
    payloads.forEach((payload) => addNotification(payload))
  }, [addNotification, payloads])

  return null
}

describe('NotificationCenter Property Tests', () => {
  afterEach(() => {
    cleanup()
  })

  describe('Property 13: Banner stacking limits', () => {
    it('visible banner count is min(N, 3), overflow shows N-3', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 12 }),
          notificationTypeArb,
          highPriorityArb,
          async (count, type, priority) => {
            const payloads: NotificationPayload[] = Array.from({ length: count }, (_, index) => ({
              type,
              priority,
              title: `Alert ${index}`,
              body: `Body ${index}`,
            }))

            const { container, unmount } = render(
              <>
                <NotificationSeeder payloads={payloads} />
                <BannerStack />
              </>,
              { wrapper: Providers },
            )

            const expectedVisible = Math.min(count, 3)
            const expectedOverflow = Math.max(0, count - 3)

            await waitFor(() => {
              expect(container.querySelectorAll('.notification-banner')).toHaveLength(expectedVisible)
            })

            if (expectedOverflow > 0) {
              expect(screen.getByText(`+${expectedOverflow} more alert(s)`)).toBeInTheDocument()
            } else {
              expect(screen.queryByText(/more alert/)).not.toBeInTheDocument()
            }

            unmount()
          },
        ),
        PROPERTY_TEST_CONFIG,
      )
    })
  })

  describe('Property 14: Banner content completeness', () => {
    it('banner always renders title and body text', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 80 }),
          fc.string({ minLength: 1, maxLength: 240 }),
          notificationTypeArb,
          highPriorityArb,
          async (title, body, type, priority) => {
            const payload: NotificationPayload = { type, priority, title, body }

            const { unmount } = render(
              <>
                <NotificationSeeder payloads={[payload]} />
                <BannerStack />
              </>,
              { wrapper: Providers },
            )

            await waitFor(() => {
              expect(document.querySelectorAll('.notification-banner')).toHaveLength(1)
            })

            const banner = document.querySelector('.notification-banner')
            const bannerTitle = banner?.querySelector('.notification-banner__title')
            const bannerBody = banner?.querySelector('.notification-banner__body')

            expect(bannerTitle?.textContent).toBe(title)
            expect(bannerBody?.textContent).toBe(body)

            unmount()
          },
        ),
        PROPERTY_TEST_CONFIG,
      )
    }, 30000)
  })

  describe('Property 15: Notification item content completeness', () => {
    it('notification item renders icon, title, body, and relative timestamp', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: notificationTypeArb,
            priority: fc.constantFrom('low', 'normal', 'high', 'critical'),
            title: fc.string({ minLength: 1, maxLength: 80 }),
            body: fc.string({ minLength: 1, maxLength: 240 }),
            timestamp: fc.integer({ min: 1, max: 2_000_000_000_000 }),
            read: fc.boolean(),
          }),
          (notification) => {
            const typedNotification = notification as Notification
            const { container, unmount } = render(
              <NotificationItem
                notification={typedNotification}
                onDismiss={() => {}}
              />,
            )

            const scoped = within(container)

            expect(scoped.getByTestId('notification-item-icon')).toBeInTheDocument()

            const titleEl = container.querySelector('.notification-center__item-title')
            const bodyEl = container.querySelector('.notification-center__item-text')
            expect(titleEl?.textContent).toBe(typedNotification.title)
            expect(bodyEl?.textContent).toBe(typedNotification.body)

            const timeEl = container.querySelector('.notification-center__item-time')
            expect(timeEl).not.toBeNull()
            expect((timeEl?.textContent ?? '').trim().length).toBeGreaterThan(0)

            unmount()
          },
        ),
        PROPERTY_TEST_CONFIG,
      )
    })
  })
})
