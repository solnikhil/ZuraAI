import { describe, expect, it } from 'vitest'

import { buildNotificationEmailHtml } from './template'

describe('buildNotificationEmailHtml', () => {
  it('renders the branded ZuraAI email shell with escaped content', () => {
    const html = buildNotificationEmailHtml({
      notificationType: 'Reminder',
      title: 'Review <launch>',
      summary: 'Check the launch notes.',
      notificationMessage: 'Message with <script>alert(1)</script>',
      detailTitle: 'What happened',
      detailItems: ['First <item>'],
      metadata: [
        { label: 'instance', value: 'Self-hosted' },
        { label: 'automation status', value: 'Triggered' },
        { label: 'notification', value: 'Email' },
      ],
    })

    expect(html).toContain('ZuraAI')
    expect(html).toContain('border-radius:999px')
    expect(html).toContain('Automation alert')
    expect(html).toContain('Review &lt;launch&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('Self-hosted automation')
    expect(html).not.toContain('Notification</div>')
  })
})
