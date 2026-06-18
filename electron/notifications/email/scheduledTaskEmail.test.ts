import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskDefinition, ScheduledTaskRun } from '../../monitors/types'

const settingsMock = vi.hoisted(() => ({
  getEmailNotificationSettings: vi.fn(() => ({
    enabled: true,
    senderName: 'ZuraAI',
    senderEmail: 'reminders@example.com',
    recipientEmail: 'user@example.com',
  })),
}))

const secureStorageMock = vi.hoisted(() => ({
  getSecureValueAsync: vi.fn(async () => 'xkeysib-demo'),
}))

const serviceMock = vi.hoisted(() => ({
  sendBrevoEmail: vi.fn(async () => ({ ok: true })),
}))

vi.mock('./settings', () => settingsMock)
vi.mock('../../secureStorage', () => secureStorageMock)
vi.mock('./service', () => serviceMock)

describe('sendScheduledTaskEmail', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('sends reminder emails with the branded HTML template', async () => {
    const { sendScheduledTaskEmail } = await import('./scheduledTaskEmail')
    const task = createTask({
      type: 'reminder',
      reminderText: 'Review launch notes',
    })
    const run = createRun()

    await expect(sendScheduledTaskEmail(task, run)).resolves.toEqual({ ok: true })

    expect(serviceMock.sendBrevoEmail).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'xkeysib-demo',
      subject: 'Reminder: Review weekly launches',
      textContent: expect.stringContaining('Review launch notes'),
      htmlContent: expect.stringContaining('ZuraAI'),
    }))
    const payload = serviceMock.sendBrevoEmail.mock.calls[0]?.[0] as { htmlContent: string }
    expect(payload.htmlContent).toContain('border-radius:999px')
    expect(payload.htmlContent).toContain('Automation alert')
    expect(payload.htmlContent).not.toContain('Self-hosted automation')
  })

  it('sends changed lookout emails with changed URLs in HTML', async () => {
    const { sendScheduledTaskEmail } = await import('./scheduledTaskEmail')
    const task = createTask({
      type: 'web_lookout',
      urls: ['https://example.com/pricing'],
    })
    const run = createRun({
      status: 'changed',
      aiSummary: 'Pricing changed.',
      logs: [
        {
          url: 'https://example.com/pricing',
          status: 'changed',
        },
      ],
    })

    await expect(sendScheduledTaskEmail(task, run)).resolves.toEqual({ ok: true })

    const payload = serviceMock.sendBrevoEmail.mock.calls[0]?.[0] as { htmlContent: string; subject: string }
    expect(payload.subject).toBe('Lookout changed: Review weekly launches')
    expect(payload.htmlContent).toContain('Lookout changed')
    expect(payload.htmlContent).toContain('https://example.com/pricing')
  })
})

function createTask(patch: Partial<ScheduledTaskDefinition>): ScheduledTaskDefinition {
  return {
    id: 'task-1',
    type: 'reminder',
    title: 'Review weekly launches',
    enabled: true,
    urls: [],
    instructions: '',
    intervalPreset: 'daily',
    createdAt: 0,
    updatedAt: 0,
    nextRunAt: 0,
    ...patch,
  }
}

function createRun(patch: Partial<ScheduledTaskRun> = {}): ScheduledTaskRun {
  return {
    id: 'run-1',
    taskId: 'task-1',
    startedAt: 1,
    finishedAt: 2,
    status: 'unchanged',
    logs: [],
    ...patch,
  }
}
