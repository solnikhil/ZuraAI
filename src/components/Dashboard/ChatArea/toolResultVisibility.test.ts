import { describe, expect, it } from 'vitest'

import { shouldShowLiveToolResultCard, shouldSuppressNoisyToolUi } from './toolResultVisibility'

describe('shouldShowLiveToolResultCard', () => {
  it('hides all generic agent/OS/MCP tool cards by default', () => {
    for (const toolName of [
      'window_list',
      'window_focus',
      'web_search',
      'system_shell',
      'computer_screenshot',
      'ui_get_app_state',
      'app_launch',
      'file_read',
      'code_execution',
      'mcp__seqthnk__sequentialthinking',
      'demo_tool',
    ]) {
      expect(shouldShowLiveToolResultCard(toolName)).toBe(false)
    }
  })

  it('shows only allowlisted product-surface tools', () => {
    for (const toolName of [
      'artifact_create',
      'artifact_update',
      'mcp_request_add',
      'scheduled_task_create',
      'scheduled_task_update',
      'scheduled_task_delete',
      'scheduled_task_list',
      'scheduled_task_get_logs',
    ]) {
      expect(shouldShowLiveToolResultCard(toolName)).toBe(true)
    }
  })
})

describe('shouldSuppressNoisyToolUi', () => {
  it('suppresses high-churn tools from the thinking timeline', () => {
    expect(shouldSuppressNoisyToolUi('code_execution')).toBe(true)
  })

  it('keeps schedule tools visible so agent schedule work is obvious', () => {
    for (const toolName of [
      'scheduled_task_create',
      'scheduled_task_update',
      'scheduled_task_delete',
      'scheduled_task_list',
      'scheduled_task_get_logs',
    ]) {
      expect(shouldSuppressNoisyToolUi(toolName)).toBe(false)
    }
  })

  it('does not suppress normal agent tools from the thinking timeline', () => {
    expect(shouldSuppressNoisyToolUi('window_list')).toBe(false)
    expect(shouldSuppressNoisyToolUi('artifact_create')).toBe(false)
    expect(shouldSuppressNoisyToolUi(undefined)).toBe(false)
  })
})
