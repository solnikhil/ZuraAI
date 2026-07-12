import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcMainMocks = {
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    ipcMainMocks.handlers.set(channel, handler)
  }),
  removeHandler: vi.fn(),
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}

const emailMocks = vi.hoisted(() => ({
  settings: {
    enabled: false,
    senderName: '',
    senderEmail: '',
    recipientEmail: '',
  },
  applyEmailNotificationSettings: vi.fn((settings: unknown) => {
    emailMocks.settings = settings as typeof emailMocks.settings
    return emailMocks.settings
  }),
  getEmailNotificationSettings: vi.fn(() => emailMocks.settings),
  sendTestEmail: vi.fn(async () => ({ ok: true })),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainMocks.handle,
    removeHandler: ipcMainMocks.removeHandler,
  },
}))

vi.mock('./trustedIpc', () => ({
  trustedIpcMain: {
    handle: ipcMainMocks.handle,
    removeHandler: ipcMainMocks.removeHandler,
  },
}))

vi.mock('../notifications/email', () => emailMocks)

describe('email notification IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules()
    ipcMainMocks.handlers.clear()
    ipcMainMocks.handle.mockClear()
    ipcMainMocks.removeHandler.mockClear()
    emailMocks.applyEmailNotificationSettings.mockClear()
    emailMocks.getEmailNotificationSettings.mockClear()
    emailMocks.sendTestEmail.mockClear()
  })

  it('applies settings and sends only a fixed test email from main', async () => {
    const { registerEmailNotificationHandlers } = await import('./emailNotificationHandlers')
    registerEmailNotificationHandlers()

    const apply = ipcMainMocks.handlers.get('email-notifications:apply-settings')
    const sendTest = ipcMainMocks.handlers.get('email-notifications:send-test')

    expect(apply?.({}, { enabled: true, senderName: 'ZuraAI' })).toEqual({
      enabled: true,
      senderName: 'ZuraAI',
    })
    await expect(sendTest?.()).resolves.toEqual({ ok: true })

    expect(emailMocks.sendTestEmail).toHaveBeenCalledWith({
      enabled: true,
      senderName: 'ZuraAI',
    })
  })
})
