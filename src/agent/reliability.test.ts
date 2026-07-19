import { describe, expect, it } from 'vitest'

import {
  buildAgentVerificationPrompt,
  didVerificationSucceed,
  selectVerificationStrategy,
} from './reliability'

describe('agent reliability helpers', () => {
  it('selects file verification for successful file mutations', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: { id: 'move-1', name: 'file_move', arguments: { source: 'a', destination: 'b' } },
        result: { success: true },
      },
    ])

    expect(strategy).toEqual(
      expect.objectContaining({
        category: 'file',
        preferredTools: ['file_search', 'file_read'],
        mutatingToolNames: ['file_move'],
      })
    )
  })

  it('selects targeted visual verification for Computer Use input actions', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: { id: 'click-1', name: 'computer_click', arguments: { x: 10, y: 20 } },
        result: { success: true },
      },
    ])

    expect(strategy).toEqual(
      expect.objectContaining({
        category: 'visual',
        preferredTools: ['computer_screenshot'],
      })
    )
  })

  it('treats an unchanged physical action as explicitly unverified', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: {
          id: 'type-1',
          name: 'computer_type',
          arguments: { screenshot_id: 'shot-1', text: 'Punjabi' },
        },
        result: { success: true, data: { visualChange: 'unchanged' } },
      },
    ])

    expect(strategy).toEqual(
      expect.objectContaining({
        category: 'visual',
        reason: expect.stringContaining('unchanged'),
      })
    )
  })

  it('accepts only a preferred read-only tool as verification evidence', () => {
    const strategy = {
      category: 'visual' as const,
      reason: 'Verify the screen.',
      preferredTools: ['computer_screenshot'],
      mutatingToolNames: ['computer_click'],
    }

    expect(
      didVerificationSucceed(strategy, [
        {
          toolCall: { id: 'find-1', name: 'app_find', arguments: { query: 'Spotify' } },
          result: { success: true },
        },
      ])
    ).toBe(false)
    expect(
      didVerificationSucceed(strategy, [
        {
          toolCall: { id: 'shot-1', name: 'computer_screenshot', arguments: {} },
          result: { success: true },
        },
      ])
    ).toBe(true)
  })

  it('selects structured state verification for ui element actions', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: { id: 'ui-click-1', name: 'ui_click', arguments: { element_id: 'uie_123' } },
        result: { success: true },
      },
    ])

    expect(strategy).toEqual(
      expect.objectContaining({
        category: 'app-window',
        preferredTools: ['ui_get_app_state', 'ui_find', 'window_list'],
      })
    )
  })

  it('does not force verification for read-only inspection tools', () => {
    expect(
      selectVerificationStrategy([
        {
          toolCall: { id: 'search-1', name: 'ui_get_app_state', arguments: {} },
          result: { success: true },
        },
      ])
    ).toBeNull()
  })

  it('does not force mutation verification for explicitly read-only shell inspection', () => {
    expect(
      selectVerificationStrategy([
        {
          toolCall: {
            id: 'shell-1',
            name: 'system_shell',
            arguments: {
              command: 'Get-ComputerInfo',
              description: 'Check Windows version',
              mutatesState: false,
            },
          },
          result: { success: true },
        },
      ])
    ).toBeNull()
  })

  it('keeps shell commands conservative when mutation intent is missing', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: {
          id: 'shell-1',
          name: 'system_shell',
          arguments: {
            command: 'Set-Content example.txt hi',
            description: 'Write a file',
          },
        },
        result: { success: true },
      },
    ])

    expect(strategy).toEqual(
      expect.objectContaining({
        category: 'shell',
        mutatingToolNames: ['system_shell'],
      })
    )
  })

  it('builds a bounded recovery verification instruction', () => {
    const prompt = buildAgentVerificationPrompt(
      {
        category: 'file',
        reason: 'File changes were made and need a read-only filesystem check.',
        preferredTools: ['file_search', 'file_read'],
        mutatingToolNames: ['file_move'],
      },
      { recoveryAttempt: true }
    )

    expect(prompt).toContain('AGENT VERIFICATION RECOVERY REQUIRED')
    expect(prompt).toContain('Make exactly one more verification attempt')
    expect(prompt).toContain('file_search, file_read')
    expect(prompt).toContain('continuing blind')
  })
})
