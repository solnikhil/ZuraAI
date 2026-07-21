import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  getAllDisplays: vi.fn(() => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]),
  readText: vi.fn(() => 'previous clipboard'),
  writeText: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
  default: { execFile: mocks.execFile },
}))
vi.mock('node:util', () => {
  const promisify =
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (error: Error | null, stdout: string, stderr: string) => {
          if (error) reject(error)
          else resolve({ stdout, stderr })
        })
      })
  return { promisify, default: { promisify } }
})
vi.mock('electron', () => ({
  clipboard: { readText: mocks.readText, writeText: mocks.writeText },
  screen: { getAllDisplays: mocks.getAllDisplays },
}))

describe('verified targeted computer clicks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify({
          targeted: true,
          foregroundVerified: true,
          hitTestVerified: true,
          targetHwnd: 22,
        }),
        ''
      )
    })
  })

  it('focuses and hit-tests the exact captured app before sending mouse input', async () => {
    const { performClick } = await import('./actions')
    const result = await performClick(
      { screenshot_id: 'shot', x: 150, y: 130 },
      { hwnd: 22, capturedBounds: { x: 100, y: 80, width: 800, height: 600 } }
    )

    expect(result).toEqual({
      targeted: true,
      foregroundVerified: true,
      hitTestVerified: true,
      targetHwnd: 22,
    })
    const command = mocks.execFile.mock.calls[0]?.[1]?.at(-1) as string
    expect(command).toContain('SetForegroundWindow($target)')
    expect(command).toContain('AttachThreadInput')
    expect(command).toContain('WindowFromPoint')
    expect(command).toContain('GetAncestor($hitWindow, 2)')
    expect(command).toContain('Another window covers the requested point. No click was sent.')
    expect(command.indexOf('$hitWindow =')).toBeLessThan(command.lastIndexOf('::mouse_event'))
  })
})

describe('targeted keyboard input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify({
          mode: 'foreground_targeted',
          targeted: true,
          backgroundSafe: false,
          foregroundVerified: true,
          foregroundMaintained: true,
          targetHwnd: 22,
          previousForegroundHwnd: 44,
          restoredPreviousForeground: true,
        }),
        ''
      )
    })
  })

  it('focuses and verifies the captured HWND before sending a shortcut', async () => {
    const { performKeyPress } = await import('./actions')
    const result = await performKeyPress({ screenshot_id: 'shot', key: 'ctrl+k' }, { hwnd: 22 })

    expect(result).toMatchObject({
      mode: 'foreground_targeted',
      targeted: true,
      foregroundVerified: true,
      targetHwnd: 22,
      restoredPreviousForeground: true,
    })
    const command = mocks.execFile.mock.calls[0]?.[1]?.at(-1) as string
    expect(command).toContain('$target = [IntPtr]22')
    expect(command).toContain('Set-ZuraForeground $target')
    expect(command).toContain('No keyboard input was sent.')
    expect(command).toContain('$foregroundAfterInput =')
    expect(command).toContain('if ($foregroundMaintained')
    expect(command.indexOf('GetForegroundWindow() -ne $target')).toBeLessThan(
      command.indexOf('[ZuraTargetedKeyboard]::keybd_event')
    )
  })

  it('binds clipboard paste to the same target and restores clipboard contents', async () => {
    const { performType } = await import('./actions')
    const result = await performType({ screenshot_id: 'shot', text: 'hello' }, { hwnd: 22 })

    expect(result).toMatchObject({ targeted: true, targetHwnd: 22 })
    expect(mocks.writeText).toHaveBeenNthCalledWith(1, 'hello')
    expect(mocks.writeText).toHaveBeenLastCalledWith('previous clipboard')
    const command = mocks.execFile.mock.calls[0]?.[1]?.at(-1) as string
    expect(command).toContain('$target = [IntPtr]22')
    expect(command).toContain('[byte]17')
    expect(command).toContain('[byte]86')
  })
})
