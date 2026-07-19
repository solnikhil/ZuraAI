import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }))

vi.mock('child_process', () => ({
  execFile: mocks.execFile,
  default: { execFile: mocks.execFile },
}))

describe('system_shell exit status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a failed tool result for a non-zero PowerShell exit', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(Object.assign(new Error('failed'), { code: 1 }), '', 'bad command')
    })
    const { executeSystemShell } = await import('./index')

    await expect(
      executeSystemShell({
        command: 'exit 1',
        description: 'Exercise a failing command',
        autoApprove: true,
      })
    ).resolves.toEqual({
      success: false,
      error: 'Terminal command exited with code 1.',
      data: expect.objectContaining({ exitCode: 1, stderr: 'bad command' }),
    })
  })
})
