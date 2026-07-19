import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openPath: vi.fn(async () => ''),
  resolveAppIndexEntry: vi.fn(),
  recordAppLaunch: vi.fn(async () => undefined),
}))

vi.mock('electron', () => ({ shell: { openPath: mocks.openPath } }))
vi.mock('../../appIndexService', () => ({
  findApps: vi.fn(),
  listApps: vi.fn(),
  refreshAppIndex: vi.fn(async () => undefined),
  warmAppIndex: vi.fn(),
  resolveAppIndexEntry: mocks.resolveAppIndexEntry,
  recordAppLaunch: mocks.recordAppLaunch,
}))

describe('app_launch indexed targets', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves an opaque itemId in main instead of trusting a model-built path', async () => {
    mocks.resolveAppIndexEntry.mockResolvedValue({
      id: 'app:spotify',
      launchStrategy: 'shortcutPath',
      shortcutPath: 'C:\\ProgramData\\Spotify.lnk',
    })
    const { executeAppLaunch } = await import('./index')

    await expect(
      executeAppLaunch({ itemId: 'app:spotify', autoApprove: true })
    ).resolves.toMatchObject({
      success: true,
      data: { status: 'launch_requested', itemId: 'app:spotify' },
    })
    expect(mocks.openPath).toHaveBeenCalledWith('C:\\ProgramData\\Spotify.lnk')
    expect(mocks.recordAppLaunch).toHaveBeenCalledWith('app:spotify')
  })
})
