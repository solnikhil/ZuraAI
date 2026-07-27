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

  it('kills an in-flight command when its Agent run is cancelled', async () => {
    let callback: ((error: Error, stdout: string, stderr: string) => void) | undefined
    const kill = vi.fn(() => {
      callback?.(Object.assign(new Error('cancelled'), { killed: true }), '', '')
    })
    mocks.execFile.mockImplementation((_file, _args, _options, next) => {
      callback = next
      return { kill }
    })
    const { executeSystemShell } = await import('./index')
    const controller = new AbortController()
    const execution = executeSystemShell(
      { command: 'Start-Sleep 30', description: 'Long task', autoApprove: true },
      { senderWebContentsId: 7, runId: 'run-1', signal: controller.signal }
    )

    controller.abort('user-stop')

    await expect(execution).resolves.toEqual({
      success: false,
      error: 'Terminal command cancelled with the Agent run.',
      data: expect.objectContaining({ exitCode: null }),
    })
    expect(kill).toHaveBeenCalledOnce()
  })

  it('does not spawn PowerShell for an already-cancelled run', async () => {
    const { executeSystemShell } = await import('./index')
    const controller = new AbortController()
    controller.abort('cancel-before-tool')

    await expect(
      executeSystemShell(
        { command: 'Start-Sleep 30', description: 'Long task', autoApprove: true },
        { senderWebContentsId: 7, runId: 'run-1', signal: controller.signal }
      )
    ).resolves.toEqual({
      success: false,
      error: 'Terminal command cancelled with the Agent run.',
    })
    expect(mocks.execFile).not.toHaveBeenCalled()
  })
})
