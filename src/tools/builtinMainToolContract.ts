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

export type ToolApprovalClass = 'none' | 'always'
export type ToolMutationClass = 'read-only' | 'mutating' | 'declared'
export type ToolRiskClass = 'standard' | 'elevated' | 'high'
export type ToolVerificationCategory = 'file' | 'app-window' | 'visual' | 'shell' | 'generic'
export type ToolConcurrencyClass = 'parallel' | 'serial'

export interface ToolSecurityProfile {
  approval: ToolApprovalClass
  mutation: ToolMutationClass
  risk: ToolRiskClass
  verification: ToolVerificationCategory | null
  concurrency: ToolConcurrencyClass
}

const readOnly = (): ToolSecurityProfile => ({
  approval: 'none',
  mutation: 'read-only',
  risk: 'standard',
  verification: null,
  concurrency: 'parallel',
})

const mutation = (
  verification: ToolVerificationCategory,
  risk: ToolRiskClass = 'elevated'
): ToolSecurityProfile => ({
  approval: 'always',
  mutation: 'mutating',
  risk,
  verification,
  concurrency: 'serial',
})

/**
 * Main-owned security semantics for every built-in tool. The exhaustive record prevents a newly
 * registered privileged tool from silently missing approval, mutation-budget, verification, or
 * scheduling policy.
 */
export const BUILTIN_TOOL_SECURITY_PROFILES = {
  web_search: readOnly(),
  code_execution: mutation('shell', 'high'),
  activate_skill: { ...mutation('generic'), approval: 'none' },
  mcp_request_add: mutation('generic'),
  background_window_attach: mutation('app-window'),
  background_window_status: readOnly(),
  background_window_release: {
    ...mutation('app-window'),
    approval: 'none',
  },
  computer_screenshot: readOnly(),
  computer_click: mutation('visual', 'high'),
  computer_type: mutation('visual', 'high'),
  computer_key: mutation('visual', 'high'),
  computer_scroll: mutation('visual', 'high'),
  computer_cursor_position: mutation('visual', 'high'),
  computer_list_windows: readOnly(),
  ui_get_app_state: readOnly(),
  ui_find: readOnly(),
  ui_wait_for: readOnly(),
  ui_click: mutation('app-window', 'high'),
  ui_type_text: mutation('app-window', 'high'),
  ui_set_value: mutation('app-window', 'high'),
  ui_select: mutation('app-window', 'high'),
  ui_scroll: mutation('app-window', 'high'),
  ui_focus: mutation('app-window', 'high'),
  ui_key: mutation('app-window', 'high'),
  windows_uia_snapshot: readOnly(),
  windows_uia_invoke: mutation('app-window', 'high'),
  windows_uia_set_value: mutation('app-window', 'high'),
  windows_uia_select: mutation('app-window', 'high'),
  system_shell: {
    approval: 'always',
    mutation: 'declared',
    risk: 'high',
    verification: 'shell',
    concurrency: 'serial',
  },
  file_read: readOnly(),
  file_write: mutation('file'),
  file_search: readOnly(),
  file_move: mutation('file'),
  app_find: readOnly(),
  app_launch: mutation('app-window'),
  app_list: readOnly(),
  app_install: mutation('app-window', 'high'),
  app_uninstall: mutation('app-window', 'high'),
  scheduled_task_create: { ...mutation('generic'), approval: 'none' },
  scheduled_task_update: { ...mutation('generic'), approval: 'none' },
  scheduled_task_delete: { ...mutation('generic'), approval: 'none' },
  scheduled_task_list: readOnly(),
  scheduled_task_get_logs: readOnly(),
  window_list: readOnly(),
  window_focus: mutation('app-window'),
  window_move: mutation('app-window'),
  window_close: mutation('app-window'),
  system_active_window: readOnly(),
  system_status: readOnly(),
  system_settings_open: mutation('app-window'),
  system_open_path: mutation('app-window'),
  window_snap: mutation('app-window'),
} satisfies Record<BuiltinMainToolName, ToolSecurityProfile>

const BUILTIN_RENDERER_TOOL_SECURITY_PROFILES = {
  artifact_create: {
    approval: 'none',
    mutation: 'mutating',
    risk: 'standard',
    verification: null,
    concurrency: 'serial',
  },
  artifact_update: {
    approval: 'none',
    mutation: 'mutating',
    risk: 'standard',
    verification: null,
    concurrency: 'serial',
  },
} satisfies Record<string, ToolSecurityProfile>

const BUILTIN_MAIN_TOOL_NAME_SET: ReadonlySet<string> = new Set(BUILTIN_MAIN_TOOL_NAMES)

export function isBuiltinMainToolName(name: unknown): name is BuiltinMainToolName {
  return typeof name === 'string' && BUILTIN_MAIN_TOOL_NAME_SET.has(name)
}

export function getBuiltinToolSecurityProfile(
  name: BuiltinMainToolName,
  args: Record<string, unknown> = {}
): ToolSecurityProfile {
  const profile = BUILTIN_TOOL_SECURITY_PROFILES[name]
  if (profile.mutation !== 'declared') return profile
  const mutating = args.mutatesState !== false
  return {
    ...profile,
    mutation: mutating ? 'mutating' : 'read-only',
    verification: mutating ? profile.verification : null,
    concurrency: mutating ? 'serial' : 'parallel',
  }
}

export function getToolSecurityProfile(
  name: string,
  args: Record<string, unknown> = {}
): ToolSecurityProfile | undefined {
  if (isBuiltinMainToolName(name)) return getBuiltinToolSecurityProfile(name, args)
  if (name in BUILTIN_RENDERER_TOOL_SECURITY_PROFILES) {
    return BUILTIN_RENDERER_TOOL_SECURITY_PROFILES[
      name as keyof typeof BUILTIN_RENDERER_TOOL_SECURITY_PROFILES
    ]
  }
  if (/^mcp__([a-z0-9_]+)__([a-z0-9_]+)$/.test(name)) {
    return mutation('generic')
  }
  return undefined
}
