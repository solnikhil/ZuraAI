import { describe, expect, it } from 'vitest'

import {
  advanceAgentVerificationCheckpoint,
  assessVerificationEvidence,
  buildAgentVerificationPrompt,
  createAgentVerificationCheckpoint,
  didVerificationSucceed,
  hasFreshMutationEvidence,
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
        postconditions: [
          { kind: 'file-exists', path: 'b' },
          { kind: 'file-absent', path: 'a' },
        ],
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

  it('requires an explicit semantic verdict when no typed postcondition is available', () => {
    const strategy = {
      category: 'visual' as const,
      reason: 'Verify the screen.',
      preferredTools: ['computer_screenshot'],
      mutatingToolNames: ['computer_click'],
      postconditions: [],
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
          toolCall: { id: 'shot-unverified', name: 'computer_screenshot', arguments: {} },
          result: {
            success: true,
            data: { screenshotId: 'shot-1', ocr: { status: 'available', elements: [] } },
          },
        },
      ])
    ).toBe(false)
    expect(
      didVerificationSucceed(strategy, [
        {
          toolCall: { id: 'shot-1', name: 'computer_screenshot', arguments: {} },
          result: {
            success: true,
            data: {
              screenshotId: 'shot-1',
              ocr: { status: 'available', elements: [] },
              semanticOutcome: 'verified',
            },
          },
        },
      ])
    ).toBe(true)
  })

  it('recognizes fresh post-action screenshots as intermediate UI evidence', () => {
    expect(
      hasFreshMutationEvidence([
        {
          toolCall: {
            id: 'type-1',
            name: 'computer_type',
            arguments: { screenshot_id: 'before-1', text: 'punjabi' },
          },
          result: {
            success: true,
            data: {
              visualChange: 'changed',
              screenshotId: 'after-1',
              ocr: { status: 'available', elements: [{ text: 'punjabi' }] },
            },
          },
        },
      ])
    ).toBe(true)
  })

  it('does not treat unchanged or screenshot-free mutations as fresh evidence', () => {
    expect(
      hasFreshMutationEvidence([
        {
          toolCall: { id: 'click-1', name: 'computer_click', arguments: {} },
          result: { success: true, data: { visualChange: 'unchanged' } },
        },
      ])
    ).toBe(false)
  })

  it('does not treat unverified background dispatch as semantic progress', () => {
    expect(
      hasFreshMutationEvidence([
        {
          toolCall: {
            id: 'click-1',
            name: 'computer_click',
            arguments: { screenshot_id: 'before-1', x: 10, y: 20 },
          },
          result: {
            success: true,
            data: {
              visualChange: 'changed',
              screenshotId: 'after-1',
              delivery: {
                mode: 'background_automation',
                semanticOutcome: 'unverified',
              },
            },
          },
        },
      ])
    ).toBe(false)
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
        preferredTools: ['ui_get_app_state', 'ui_find', 'ui_wait_for', 'window_list'],
      })
    )
  })

  it('accepts ui_wait_for as app launch verification evidence', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: { id: 'launch-1', name: 'app_launch', arguments: { appUserModelId: 'Notepad' } },
        result: { success: true },
      },
    ])

    expect(strategy).not.toBeNull()
    expect(
      didVerificationSucceed(strategy!, [
        {
          toolCall: { id: 'wait-1', name: 'ui_wait_for', arguments: { query: 'Notepad' } },
          result: {
            success: true,
            data: {
              semanticOutcome: 'verified',
              state: { state_id: 'state-1', title: 'Untitled - Notepad' },
              matches: [{ name: 'Untitled - Notepad' }],
            },
          },
        },
      ])
    ).toBe(true)
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
        postconditions: [
          { kind: 'file-exists', path: 'b' },
          { kind: 'file-absent', path: 'a' },
        ],
      },
      { recoveryAttempt: true }
    )

    expect(prompt).toContain('AGENT VERIFICATION RECOVERY REQUIRED')
    expect(prompt).toContain('Make exactly one more read-only verification attempt')
    expect(prompt).toContain('file_search, file_read')
    expect(prompt).toContain('call only one of the preferred read-only tools')
    expect(prompt).toContain('continuing blind')
  })

  it('classifies failed and irrelevant evidence as inconclusive', () => {
    const strategy = {
      category: 'file' as const,
      reason: 'Verify the destination.',
      preferredTools: ['file_search', 'file_read'],
      mutatingToolNames: ['file_move'],
      postconditions: [{ kind: 'file-exists', path: 'Desktop/Images/a.png' }],
    }

    expect(
      assessVerificationEvidence(strategy, [
        {
          toolCall: { id: 'failed', name: 'file_search', arguments: {} },
          result: { success: false, error: 'Access denied.' },
        },
      ])
    ).toBe('inconclusive')
    expect(
      assessVerificationEvidence(strategy, [
        {
          toolCall: { id: 'irrelevant', name: 'app_find', arguments: {} },
          result: { success: true, data: { results: ['Notepad'] } },
        },
      ])
    ).toBe('inconclusive')
  })

  it('classifies an empty preferred search as contradictory evidence', () => {
    expect(
      assessVerificationEvidence(
        {
          category: 'file',
          reason: 'Verify the destination.',
          preferredTools: ['file_search'],
          mutatingToolNames: ['file_move'],
          postconditions: [{ kind: 'file-exists', path: 'Desktop/Images/a.png' }],
        },
        [
          {
            toolCall: {
              id: 'search',
              name: 'file_search',
              arguments: { root: 'Desktop/Images', query: 'a.png' },
            },
            result: {
              success: true,
              data: { root: 'Desktop/Images', query: 'a.png', results: [] },
            },
          },
        ]
      )
    ).toBe('contradicted')
  })

  it('verifies file writes only when file_read matches the exact path and content', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: {
          id: 'write',
          name: 'file_write',
          arguments: { path: 'Desktop/note.txt', content: 'expected contents' },
        },
        result: { success: true },
      },
    ])

    expect(strategy?.postconditions).toEqual([
      { kind: 'file-content', path: 'Desktop/note.txt', expectedContent: 'expected contents' },
    ])
    expect(
      assessVerificationEvidence(strategy!, [
        {
          toolCall: {
            id: 'read',
            name: 'file_read',
            arguments: { path: 'Desktop/note.txt' },
          },
          result: {
            success: true,
            data: { path: 'C:/Users/test/Desktop/note.txt', content: 'expected contents' },
          },
        },
      ])
    ).toBe('verified')
    expect(
      assessVerificationEvidence(strategy!, [
        {
          toolCall: {
            id: 'read',
            name: 'file_read',
            arguments: { path: 'Desktop/note.txt' },
          },
          result: {
            success: true,
            data: { path: 'C:/Users/test/Desktop/note.txt', content: 'different contents' },
          },
        },
      ])
    ).toBe('contradicted')
    expect(
      assessVerificationEvidence(strategy!, [
        {
          toolCall: {
            id: 'read',
            name: 'file_read',
            arguments: { path: 'Desktop/note.txt' },
          },
          result: {
            success: true,
            data: {
              path: 'C:/Users/test/Desktop/note.txt',
              content: 'different contents',
              semanticOutcome: 'verified',
            },
          },
        },
      ])
    ).toBe('contradicted')
  })

  it('requires evidence that a move destination exists and its source is absent', () => {
    const strategy = selectVerificationStrategy([
      {
        toolCall: {
          id: 'move',
          name: 'file_move',
          arguments: { source: 'Desktop/a.png', destination: 'Desktop/Images/a.png' },
        },
        result: { success: true },
      },
    ])!
    const destinationEvidence = {
      toolCall: {
        id: 'destination',
        name: 'file_search',
        arguments: { root: 'Desktop/Images', query: 'a.png' },
      },
      result: {
        success: true,
        data: {
          root: 'Desktop/Images',
          query: 'a.png',
          results: [{ path: 'C:/Users/test/Desktop/Images/a.png', type: 'file' }],
        },
      },
    }

    expect(assessVerificationEvidence(strategy, [destinationEvidence])).toBe('inconclusive')
    expect(
      assessVerificationEvidence(strategy, [
        destinationEvidence,
        {
          toolCall: {
            id: 'source',
            name: 'file_search',
            arguments: { root: 'Desktop', query: 'a.png' },
          },
          result: {
            success: true,
            data: { root: 'Desktop', query: 'a.png', results: [] },
          },
        },
      ])
    ).toBe('verified')
  })

  it('checks fresh UI state against set-value and selection postconditions', () => {
    const setValueStrategy = selectVerificationStrategy([
      {
        toolCall: {
          id: 'set',
          name: 'ui_set_value',
          arguments: { element_id: 'uie-name', value: 'Nikhil' },
        },
        result: { success: true },
      },
    ])!
    const selectStrategy = selectVerificationStrategy([
      {
        toolCall: {
          id: 'select',
          name: 'ui_select',
          arguments: { element_id: 'uie-enabled' },
        },
        result: {
          success: true,
          data: {
            status: 'completed',
            state: {
              state_id: 'post-select',
              elements: [{ element_id: 'uie-enabled', selected: true }],
            },
          },
        },
      },
    ])!
    const uiState = [
      {
        toolCall: { id: 'state', name: 'ui_get_app_state', arguments: {} },
        result: {
          success: true,
          data: {
            state: {
              state_id: 'state-1',
              windows: [
                {
                  elements: [
                    { element_id: 'uie-name', value: 'Nikhil' },
                    { element_id: 'uie-enabled', selected: true },
                  ],
                },
              ],
            },
          },
        },
      },
    ]

    expect(assessVerificationEvidence(setValueStrategy, uiState)).toBe('verified')
    expect(assessVerificationEvidence(selectStrategy, uiState)).toBe('verified')
  })

  it('allows exactly one recovery for every non-verifying outcome', () => {
    for (const outcome of ['contradicted', 'inconclusive'] as const) {
      const recovery = advanceAgentVerificationCheckpoint(
        createAgentVerificationCheckpoint(),
        outcome
      )
      expect(recovery).toEqual({ phase: 'recovery', outcome })
      expect(advanceAgentVerificationCheckpoint(recovery, 'inconclusive')).toEqual({
        phase: 'failed',
        outcome,
      })
    }
  })

  it('makes a verifying recovery terminal and idempotent', () => {
    const recovery = advanceAgentVerificationCheckpoint(
      createAgentVerificationCheckpoint(),
      'inconclusive'
    )
    const verified = advanceAgentVerificationCheckpoint(recovery, 'verified')

    expect(verified).toEqual({ phase: 'verified', outcome: 'verified' })
    expect(advanceAgentVerificationCheckpoint(verified, 'contradicted')).toBe(verified)
  })
})
