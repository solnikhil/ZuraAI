import { describe, expect, it } from 'vitest'

import { requiresManualToolApproval } from './approvalPolicy'
import { getAllToolDefinitions } from './definitions'

const availableTools = getAllToolDefinitions()

describe('requiresManualToolApproval', () => {
  it('does not require approval for read-only Agent tools', () => {
    for (const name of [
      'computer_screenshot',
      'computer_list_windows',
      'file_search',
      'file_read',
      'app_find',
      'app_list',
      'window_list',
      'ui_get_app_state',
      'ui_find',
      'ui_wait_for',
      'background_window_status',
      'background_window_release',
      'web_search',
    ]) {
      expect(
        requiresManualToolApproval({ id: `${name}-1`, name, arguments: {} }, availableTools)
      ).toBe(false)
    }
  })

  it('requires approval for mutating/high-risk tools', () => {
    for (const name of [
      'computer_click',
      'computer_type',
      'computer_key',
      'computer_scroll',
      'computer_cursor_position',
      'system_shell',
      'file_write',
      'file_move',
      'app_launch',
      'app_install',
      'app_uninstall',
      'window_focus',
      'window_move',
      'window_close',
      'ui_click',
      'ui_type_text',
      'ui_set_value',
      'ui_select',
      'ui_scroll',
      'ui_focus',
      'ui_key',
      'background_window_attach',
      'code_execution',
      'mcp__filesystem__write_file',
    ]) {
      expect(
        requiresManualToolApproval({ id: `${name}-1`, name, arguments: {} }, availableTools)
      ).toBe(true)
    }
  })
})
