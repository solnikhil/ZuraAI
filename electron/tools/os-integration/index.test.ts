import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('os-integration tools', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('opens only allowlisted Windows Settings pages', async () => {
    const openExternal = vi.fn(async () => undefined)
    vi.doMock('electron', () => ({
      shell: {
        openExternal,
        openPath: vi.fn(),
      },
    }))

    const tools = await import('./index')

    await expect(
      tools.executeSystemSettingsOpen({ page: 'display', autoApprove: true })
    ).resolves.toEqual({
      success: true,
      data: { page: 'display' },
    })
    await expect(
      tools.executeSystemSettingsOpen({ page: 'ms-settings:privacy-webcam', autoApprove: true })
    ).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/^page must be one of:/),
    })
    await expect(
      tools.executeSystemSettingsOpen({ page: 'privacy-camera', autoApprove: true })
    ).resolves.toEqual({
      success: true,
      data: { page: 'privacy-camera' },
    })

    expect(openExternal).toHaveBeenCalledWith('ms-settings:display')
    expect(openExternal).toHaveBeenCalledWith('ms-settings:privacy-webcam')
    expect(openExternal).toHaveBeenCalledTimes(2)
  })

  it('opens Windows Copilot via the fixed protocol only', async () => {
    const openExternal = vi.fn(async () => undefined)
    vi.doMock('electron', () => ({
      shell: {
        openExternal,
        openPath: vi.fn(),
      },
    }))

    const tools = await import('./index')
    await expect(tools.executeWindowsCopilotOpen({ autoApprove: true })).resolves.toEqual({
      success: true,
      data: { opened: 'copilot' },
    })
    expect(openExternal).toHaveBeenCalledWith('ms-copilot:')
  })
})
