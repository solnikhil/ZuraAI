/**
 * Exact names accepted by the generic `execute-tool` IPC boundary.
 *
 * Keep this module deliberately small: it is imported by the renderer,
 * preload, and main process. Model-facing schemas remain in `builtinTools.ts`.
 */
export const BUILTIN_MAIN_TOOL_NAMES = [
  'web_search',
  'code_execution',
  'activate_skill',
  'mcp_request_add',
  'background_window_attach',
  'background_window_status',
  'background_window_release',
  'computer_screenshot',
  'computer_click',
  'computer_type',
  'computer_key',
  'computer_scroll',
  'computer_cursor_position',
  'computer_list_windows',
  'ui_get_app_state',
  'ui_find',
  'ui_wait_for',
  'ui_click',
  'ui_type_text',
  'ui_set_value',
  'ui_select',
  'ui_scroll',
  'ui_focus',
  'ui_key',
  'windows_uia_snapshot',
  'windows_uia_invoke',
  'windows_uia_set_value',
  'windows_uia_select',
  'system_shell',
  'file_read',
  'file_write',
  'file_search',
  'file_move',
  'app_find',
  'app_launch',
  'app_list',
  'app_install',
  'app_uninstall',
  'scheduled_task_create',
  'scheduled_task_update',
  'scheduled_task_delete',
  'scheduled_task_list',
  'scheduled_task_get_logs',
  'window_list',
  'window_focus',
  'window_move',
  'window_close',
  'system_active_window',
  'system_status',
  'system_settings_open',
  'system_open_path',
  'window_snap',
] as const

export type BuiltinMainToolName = (typeof BUILTIN_MAIN_TOOL_NAMES)[number]

const BUILTIN_MAIN_TOOL_NAME_SET: ReadonlySet<string> = new Set(BUILTIN_MAIN_TOOL_NAMES)

export function isBuiltinMainToolName(name: unknown): name is BuiltinMainToolName {
  return typeof name === 'string' && BUILTIN_MAIN_TOOL_NAME_SET.has(name)
}
