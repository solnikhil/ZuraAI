// @vitest-environment node

import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  captureCommandCenterReturnTarget,
  shouldIgnoreWindowsForegroundTarget,
  warmCommandCenterFocusCapture,
} from './commandCenterFocus'

describe('Command Center native focus capture', () => {
  it('excludes ZuraAI-owned Windows targets', () => {
    expect(
      shouldIgnoreWindowsForegroundTarget(
        { processId: 100, processName: 'ZuraAI.exe', title: 'Dashboard' },
        200
      )
    ).toBe(true)
    expect(
      shouldIgnoreWindowsForegroundTarget(
        { processId: 100, processName: 'electron.exe', title: 'ZuraAI Command Center' },
        200
      )
    ).toBe(true)
    expect(
      shouldIgnoreWindowsForegroundTarget(
        { processId: 200, processName: 'anything.exe', title: 'Anything' },
        200
      )
    ).toBe(true)
    expect(
      shouldIgnoreWindowsForegroundTarget(
        { processId: 100, processName: 'notepad.exe', title: 'Notes' },
        200
      )
    ).toBe(false)
  })

  it('contains no synchronous subprocess capture path', () => {
    const source = fs.readFileSync(new URL('./commandCenterFocus.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('execFileSync')
  })

  it('warms and captures without throwing on the current platform', () => {
    expect(() => warmCommandCenterFocusCapture()).not.toThrow()
    const target = captureCommandCenterReturnTarget()
    expect(target === null || (Number.isSafeInteger(target) && target > 0)).toBe(true)
  })
})
