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

  it('does not treat repeated domain failures as systemic', () => {
    const tracker = new SystemicToolFailureTracker()
    expect(
      tracker.record([
        failure('file_read', 'File not found.'),
        failure('system_open_path', 'File not found.'),
      ])
    ).toBeNull()
  })

  it('stops after the same tool repeats an internal runtime error', () => {
    const tracker = new SystemicToolFailureTracker()
    const runtimeError = 'object is not iterable (cannot read property Symbol(Symbol.iterator))'

    expect(tracker.record([failure('ui_get_app_state', runtimeError)])).toBeNull()
    expect(tracker.record([failure('ui_get_app_state', runtimeError)])).toEqual({
      error: runtimeError,
      toolNames: ['ui_get_app_state'],
      occurrenceCount: 2,
    })
  })

  it('does not classify user-code exceptions as desktop runtime failures', () => {
    const tracker = new SystemicToolFailureTracker()
    const userCodeError = "TypeError: Cannot read properties of undefined (reading 'name')"

    expect(tracker.record([failure('code_execution', userCodeError)])).toBeNull()
    expect(tracker.record([failure('code_execution', userCodeError)])).toBeNull()
    expect(tracker.record([failure('system_shell', 'value is not a function')])).toBeNull()
    expect(tracker.record([failure('system_shell', 'value is not a function')])).toBeNull()
  })

  it('clears transient evidence after that tool succeeds', () => {
    const tracker = new SystemicToolFailureTracker()
    const cspError = "Content Security Policy blocked 'unsafe-eval'"
    const success: ToolCallResult = {
      toolCall: { id: 'window-list-ok', name: 'window_list', arguments: {} },
      result: { success: true, data: { windows: [] } },
    }

    expect(tracker.record([failure('window_list', cspError)])).toBeNull()
    expect(tracker.record([success])).toBeNull()
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

  it('describes repeated failure in one tool accurately', () => {
    const message = buildSystemicToolFailureMessage({
      error: 'object is not iterable',
      toolNames: ['ui_get_app_state'],
      occurrenceCount: 2,
    })

    expect(message).toContain('failed repeatedly in ui_get_app_state')
    expect(message).not.toContain('across multiple tools')
  })
})
