import { describe, expect, it } from 'vitest'
import { SystemicToolFailureTracker, buildSystemicToolFailureMessage } from './systemicToolFailure'
import type { ToolCallResult } from './types'

function failure(name: string, error: string): ToolCallResult {
  return {
    toolCall: { id: `${name}-id`, name, arguments: {} },
    result: { success: false, error },
  }
}

describe('SystemicToolFailureTracker', () => {
  it('detects an identical infrastructure failure from two distinct tools across batches', () => {
    const tracker = new SystemicToolFailureTracker()
    const error =
      "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not allowed by Content Security Policy"

    expect(tracker.record([failure('window_list', error)])).toBeNull()
    expect(tracker.record([failure('app_find', error)])).toEqual({
      error,
      toolNames: ['window_list', 'app_find'],
      occurrenceCount: 2,
    })
  })

  it('does not treat repeated domain failures or retries of one tool as systemic', () => {
    const tracker = new SystemicToolFailureTracker()
    expect(
      tracker.record([
        failure('file_read', 'File not found.'),
        failure('system_open_path', 'File not found.'),
      ])
    ).toBeNull()

    const cspError = "Content Security Policy blocked 'unsafe-eval'"
    expect(tracker.record([failure('window_list', cspError)])).toBeNull()
    expect(tracker.record([failure('window_list', cspError)])).toBeNull()
  })

  it('builds a grounded message that disclaims observations and actions', () => {
    const message = buildSystemicToolFailureMessage({
      error: "Content Security Policy blocked 'unsafe-eval'",
      toolNames: ['window_list', 'app_find'],
      occurrenceCount: 2,
    })

    expect(message).toContain('stopped instead of retrying or making assumptions')
    expect(message).toContain('cannot confirm whether the application is running')
    expect(message).toContain('whether any requested action occurred')
  })
})
