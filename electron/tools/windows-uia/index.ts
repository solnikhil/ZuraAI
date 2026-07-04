import type { ToolResult } from '../types'
import {
  isRecord,
  isWindows,
  normalizeJsonArray,
  parseJsonOutput,
  requireApproval,
  runPowerShell,
  stringArg,
  unsupportedWindowsOnly,
} from '../native-common'

type UiaAction = 'invoke' | 'setValue' | 'select'

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function snapshotScript(args: unknown): string {
  const windowTitle = stringArg(args, 'windowTitle')
  const processName = stringArg(args, 'processName')
  const hwnd = isRecord(args) && typeof args.hwnd === 'number' ? Math.trunc(args.hwnd) : undefined

  return `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
$items = @()
foreach ($window in $windows) {
  $title = [string]$window.Current.Name
  $pid = [int]$window.Current.ProcessId
  $handle = [int64]$window.Current.NativeWindowHandle
  if (${hwnd !== undefined ? `$handle -ne ${hwnd}` : '$false'}) { continue }
  if (${windowTitle ? `$title -notlike ${psString(`*${windowTitle}*`)}` : '$false'}) { continue }
  if (${processName ? `((Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName -notlike ${psString(`*${processName}*`)})` : '$false'}) { continue }
  $children = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $elements = @()
  $count = 0
  foreach ($el in $children) {
    if ($count -ge 200) { break }
    $rid = ($el.GetRuntimeId() -join '.')
    $patterns = @()
    foreach ($pattern in $el.GetSupportedPatterns()) { $patterns += $pattern.ProgrammaticName.Replace('PatternIdentifiers.Pattern', '') }
    $rect = $el.Current.BoundingRectangle
    $elements += [pscustomobject]@{
      elementRef = "uia:$rid"
      name = [string]$el.Current.Name
      automationId = [string]$el.Current.AutomationId
      controlType = $el.Current.ControlType.ProgrammaticName.Replace('ControlType.', '')
      className = [string]$el.Current.ClassName
      enabled = [bool]$el.Current.IsEnabled
      focused = [bool]$el.Current.HasKeyboardFocus
      bounds = [pscustomobject]@{ x = [int]$rect.X; y = [int]$rect.Y; width = [int]$rect.Width; height = [int]$rect.Height }
      supportedPatterns = $patterns
    }
    $count += 1
  }
  $items += [pscustomobject]@{
    hwnd = $handle
    title = $title
    processId = $pid
    processName = [string](Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName
    elementRef = "hwnd:$handle"
    elements = $elements
  }
}
$items | ConvertTo-Json -Depth 8 -Compress
`
}

function actionScript(action: UiaAction, args: unknown): string {
  const elementRef = stringArg(args, 'elementRef')
  const value = stringArg(args, 'value')
  return `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$target = ${psString(elementRef)}
if (-not $target.StartsWith('uia:')) { throw "Invalid UIA elementRef." }
$wanted = $target.Substring(4)
$root = [System.Windows.Automation.AutomationElement]::RootElement
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
$element = $null
foreach ($el in $all) {
  if (($el.GetRuntimeId() -join '.') -eq $wanted) { $element = $el; break }
}
if ($null -eq $element) { throw "UI Automation element was not found." }
switch (${psString(action)}) {
  'invoke' {
    $pattern = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    if ($null -eq $pattern) { throw "Element does not support InvokePattern." }
    $pattern.Invoke()
  }
  'setValue' {
    $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($null -eq $pattern) { throw "Element does not support ValuePattern." }
    if ($pattern.Current.IsReadOnly) { throw "Element value is read-only." }
    $pattern.SetValue(${psString(value)})
  }
  'select' {
    try {
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      if ($null -ne $pattern) { $pattern.Select(); break }
    } catch {}
    try {
      $toggle = $element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
      if ($null -ne $toggle) { $toggle.Toggle(); break }
    } catch {}
    throw "Element does not support SelectionItemPattern or TogglePattern."
  }
}
@{ action = ${psString(action)}; elementRef = $target } | ConvertTo-Json -Compress
`
}

export async function executeWindowsUiaSnapshot(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('windows_uia_snapshot')
  try {
    const { stdout } = await runPowerShell(snapshotScript(args))
    return {
      success: true,
      data: { windows: normalizeJsonArray(parseJsonOutput<unknown | unknown[]>(stdout)) },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'UIA snapshot failed.',
    }
  }
}

async function executeUiaAction(action: UiaAction, args: unknown): Promise<ToolResult> {
  const toolName = action === 'setValue' ? 'windows_uia_set_value' : `windows_uia_${action}`
  if (!isWindows()) return unsupportedWindowsOnly(toolName)
  const approval = requireApproval(args, toolName)
  if (approval) return approval
  const elementRef = stringArg(args, 'elementRef')
  if (!elementRef) return { success: false, error: 'elementRef is required.' }
  if (action === 'setValue' && (!isRecord(args) || typeof args.value !== 'string')) {
    return { success: false, error: 'value is required.' }
  }
  try {
    const { stdout } = await runPowerShell(actionScript(action, args))
    return { success: true, data: parseJsonOutput<unknown>(stdout) }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : `UIA ${action} failed.`,
    }
  }
}

export function executeWindowsUiaInvoke(args: unknown): Promise<ToolResult> {
  return executeUiaAction('invoke', args)
}

export function executeWindowsUiaSetValue(args: unknown): Promise<ToolResult> {
  return executeUiaAction('setValue', args)
}

export function executeWindowsUiaSelect(args: unknown): Promise<ToolResult> {
  return executeUiaAction('select', args)
}
