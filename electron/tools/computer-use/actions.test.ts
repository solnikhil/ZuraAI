import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  getAllDisplays: vi.fn(() => [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }]),
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
  clipboard: { readText: vi.fn(() => ''), writeText: vi.fn() },
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
