import { randomUUID, createHash } from 'crypto'

import type { ToolResult } from '../types'
import {
  clampTimeoutMs,
  isRecord,
  isWindows,
  normalizeJsonArray,
  parseJsonOutput,
  requireApproval,
  runPowerShell,
  stringArg,
  unsupportedWindowsOnly,
} from '../native-common'
import { serializeCoordinateContext } from '../computer-use/coordinates'
import { captureScreenshot } from '../computer-use/screenshot'
import { extractOcrElements, type OcrExtraction } from '../computer-use/ocr'
import { ACTION_DELAY_MS } from '../computer-use/constants'
import type {
  UiAutomationActionOutcome,
  UiAppState,
  UiAutomationBounds,
  UiAutomationElement,
  UiAutomationWindow,
  UiBlock,
  UiFindArgs,
  UiWaitForArgs,
} from './types'
import { LEGACY_ACCESSIBILITY_HELPER } from './legacyAccessibility'

const DEFAULT_MAX_DEPTH = 4
const DEFAULT_MAX_ELEMENTS = 120
const MAX_ELEMENTS = 300
const STATE_TTL_MS = 120_000
const ELEMENT_TTL_MS = 120_000
const DEFAULT_WAIT_TIMEOUT_MS = 5_000
const MAX_WAIT_TIMEOUT_MS = 30_000
const DEFAULT_WAIT_INTERVAL_MS = 250

interface RawElement {
  runtimeId: string
  parentRuntimeId?: string
  name?: string
  value?: string
  acceleratorKey?: string
  accessKey?: string
  automationId?: string
  controlType?: string
  className?: string
  enabled?: boolean
  focused?: boolean
  selected?: boolean
  visible?: boolean
  bounds?: Partial<UiAutomationBounds>
  // PowerShell enumerates single-item function output unless explicitly wrapped.
  // Accept both shapes at the process boundary and normalize before iteration.
  supportedPatterns?: string | string[]
  source?: 'uia' | 'msaa'
}

interface RawWindow {
  hwnd?: number
  title?: string
  processId?: number
  processName?: string
  runtimeId?: string
  elements?: RawElement | RawElement[]
}

interface RawSnapshot {
  activeWindow?: {
    hwnd?: number
    title?: string
    processId?: number
    processName?: string
  }
  windows?: RawWindow[]
  elementCount?: number
  truncated?: boolean
}

interface ElementCacheEntry {
  elementId: string
  runtimeId: string
  hwnd: number
  processId: number
  role: string
  name: string
  automationId: string
  bounds: UiAutomationBounds
  supportedActions: string[]
  source: 'uia' | 'msaa'
  updatedAt: number
}

interface StateCacheEntry {
  state: UiAppState
  updatedAt: number
}

const elementCache = new Map<string, ElementCacheEntry>()
const stateCache = new Map<string, StateCacheEntry>()
let latestStateId = ''
let cachePruneTimer: ReturnType<typeof setTimeout> | null = null

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function scheduleCachePrune(): void {
  if (cachePruneTimer) return
  cachePruneTimer = setTimeout(
    () => {
      cachePruneTimer = null
      pruneCaches()
      // Keep pruning while caches still hold entries so screenshots don't linger
      // until the next UI tool call.
      if (elementCache.size > 0 || stateCache.size > 0) {
        scheduleCachePrune()
      }
    },
    Math.min(STATE_TTL_MS, ELEMENT_TTL_MS)
  )
}

function psString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function positiveIntArg(args: unknown, key: string, fallback: number, max: number): number {
  if (!isRecord(args)) return fallback
  const value = args[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.max(1, Math.floor(parsed)))
}

function boolFilterArg(args: unknown, key: string): boolean | undefined {
  return isRecord(args) && typeof args[key] === 'boolean' ? args[key] : undefined
}

function stableElementId(
  hwnd: number,
  raw: Pick<RawElement, 'runtimeId' | 'automationId' | 'controlType' | 'name'>
): string {
  const fingerprint = `${hwnd}|${raw.runtimeId}|${raw.automationId || ''}|${raw.controlType || ''}|${raw.name || ''}`
  return `uie_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 24)}`
}

function normalizeBounds(raw: RawElement['bounds']): UiAutomationBounds {
  return {
    x: typeof raw?.x === 'number' ? raw.x : 0,
    y: typeof raw?.y === 'number' ? raw.y : 0,
    width: typeof raw?.width === 'number' ? raw.width : 0,
    height: typeof raw?.height === 'number' ? raw.height : 0,
  }
}

function patternToAction(pattern: string): string | null {
  if (pattern === 'Invoke') return 'click'
  if (pattern === 'LegacyDefaultAction') return 'click'
  if (pattern === 'Value') return 'set_value'
  if (pattern === 'SelectionItem' || pattern === 'Toggle') return 'select'
  if (pattern === 'Scroll') return 'scroll'
  if (pattern === 'Text') return 'read_text'
  return null
}

function normalizeActions(patterns: string | string[] | undefined): string[] {
  const actions = new Set<string>()
  for (const pattern of normalizeJsonArray(patterns)) {
    const action = patternToAction(pattern)
    if (action) actions.add(action)
  }
  return [...actions]
}

function cacheElement(entry: ElementCacheEntry): void {
  elementCache.set(entry.elementId, entry)
  scheduleCachePrune()
}

function pruneCaches(now = Date.now()): void {
  for (const [id, entry] of elementCache) {
    if (now - entry.updatedAt > ELEMENT_TTL_MS) elementCache.delete(id)
  }
  for (const [id, entry] of stateCache) {
    if (now - entry.updatedAt > STATE_TTL_MS) stateCache.delete(id)
  }
}

function flattenWindows(state: UiAppState): UiAutomationElement[] {
  const elements: UiAutomationElement[] = []
  const visit = (element: UiAutomationElement) => {
    elements.push(element)
    for (const child of element.children || []) visit(child)
  }
  for (const win of state.windows) {
    for (const element of win.elements) visit(element)
  }
  return elements
}

function buildUiBlocks(windows: UiAutomationWindow[], ocr?: OcrExtraction): UiBlock[] {
  const blocks: UiBlock[] = []
  const visit = (windowHwnd: number, element: UiAutomationElement) => {
    const text = [element.name, element.value].filter(Boolean).join(' — ').trim()
    if (element.visible && (text || element.supported_actions.length > 0)) {
      blocks.push({
        element_id: element.element_id,
        source: element.source,
        background_safe: element.background_safe,
        coordinate_space: 'desktop',
        window_hwnd: windowHwnd,
        role: element.role,
        text,
        accelerator_key: element.accelerator_key,
        access_key: element.access_key,
        bounds: element.bounds,
        supported_actions: element.supported_actions,
      })
    }
    for (const child of element.children || []) visit(windowHwnd, child)
  }
  for (const window of windows) {
    for (const element of window.elements) visit(window.hwnd, element)
  }
  if (ocr?.status === 'available') {
    for (const element of ocr.elements) {
      blocks.push({
        element_id: element.element_id,
        source: 'ocr',
        background_safe: false,
        coordinate_space: 'screenshot',
        role: element.role,
        text: element.text,
        bounds: element.bounds,
        supported_actions: [],
      })
    }
  }
  return blocks
}

function buildWindows(rawWindows: RawWindow[], now: number): UiAutomationWindow[] {
  const windows: UiAutomationWindow[] = []

  for (const rawWindow of rawWindows) {
    const hwnd = typeof rawWindow.hwnd === 'number' ? rawWindow.hwnd : 0
    const windowElementId = `uiw_${createHash('sha256').update(`hwnd:${hwnd}`).digest('hex').slice(0, 16)}`
    const byRuntime = new Map<string, UiAutomationElement>()
    const roots: UiAutomationElement[] = []

    const rawElements = normalizeJsonArray(rawWindow.elements)
    for (const raw of rawElements) {
      if (!raw.runtimeId) continue
      const bounds = normalizeBounds(raw.bounds)
      const supportedActions = normalizeActions(raw.supportedPatterns)
      const elementId = stableElementId(hwnd, raw)
      const element: UiAutomationElement = {
        element_id: elementId,
        source: raw.source === 'msaa' ? 'msaa' : 'uia',
        background_safe: supportedActions.length > 0,
        name: raw.name || '',
        value: raw.value || undefined,
        accelerator_key: raw.acceleratorKey || undefined,
        access_key: raw.accessKey || undefined,
        role: raw.controlType || 'Custom',
        automation_id: raw.automationId || '',
        class_name: raw.className || '',
        enabled: raw.enabled !== false,
        focused: raw.focused === true,
        selected: typeof raw.selected === 'boolean' ? raw.selected : undefined,
        visible: raw.visible !== false,
        bounds,
        supported_actions: supportedActions,
        children: [],
      }
      cacheElement({
        elementId,
        runtimeId: raw.runtimeId,
        hwnd,
        processId: typeof rawWindow.processId === 'number' ? rawWindow.processId : 0,
        role: element.role,
        name: element.name,
        automationId: element.automation_id,
        bounds,
        supportedActions,
        source: raw.source === 'msaa' ? 'msaa' : 'uia',
        updatedAt: now,
      })
      byRuntime.set(raw.runtimeId, element)
    }

    for (const raw of rawElements) {
      if (!raw.runtimeId) continue
      const element = byRuntime.get(raw.runtimeId)
      if (!element) continue
      const parent = raw.parentRuntimeId ? byRuntime.get(raw.parentRuntimeId) : undefined
      if (parent) {
        element.parent_element_id = parent.element_id
        parent.children?.push(element)
      } else {
        roots.push(element)
      }
    }

    windows.push({
      hwnd,
      title: rawWindow.title || '',
      process_id: typeof rawWindow.processId === 'number' ? rawWindow.processId : 0,
      process_name: rawWindow.processName || '',
      element_id: windowElementId,
      elements: roots,
    })
  }

  return windows
}

function snapshotScript(args: unknown, maxDepth: number, maxElements: number): string {
  const windowTitle = stringArg(args, 'windowTitle')
  const processName = stringArg(args, 'processName')
  const hwnd = isRecord(args) && typeof args.hwnd === 'number' ? Math.trunc(args.hwnd) : undefined
  const legacyHelper = hwnd !== undefined ? LEGACY_ACCESSIBILITY_HELPER : ''

  return `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
${legacyHelper}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
$root = [System.Windows.Automation.AutomationElement]::RootElement
$activeHwnd = [int64][NativeWin]::GetForegroundWindow()
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
$items = @()
$total = 0
$truncated = $false

function Get-PatternNames($el) {
  $patterns = @()
  foreach ($pattern in $el.GetSupportedPatterns()) {
    $patterns += $pattern.ProgrammaticName.Replace('PatternIdentifiers.Pattern', '')
  }
  return $patterns
}

function Get-Value($el) {
  try {
    $pattern = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($null -ne $pattern) { return [string]$pattern.Current.Value }
  } catch {}
  return ''
}

function Get-Selected($el) {
  try {
    $pattern = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    if ($null -ne $pattern) { return [bool]$pattern.Current.IsSelected }
  } catch {}
  try {
    $pattern = $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
    if ($null -ne $pattern) { return $pattern.Current.ToggleState.ToString() -eq 'On' }
  } catch {}
  return $null
}

function Walk($el, $parentRuntimeId, $depth) {
  if ($script:total -ge ${maxElements}) { $script:truncated = $true; return @() }
  if ($depth -gt ${maxDepth}) { $script:truncated = $true; return @() }
  $children = $el.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  $out = @()
  foreach ($child in $children) {
    if ($script:total -ge ${maxElements}) { $script:truncated = $true; break }
    $rid = ($child.GetRuntimeId() -join '.')
    $rect = $child.Current.BoundingRectangle
    $isOffscreen = [bool]$child.Current.IsOffscreen
    $selected = Get-Selected $child
    $out += [pscustomobject]@{
      runtimeId = $rid
      parentRuntimeId = $parentRuntimeId
      name = [string]$child.Current.Name
      value = Get-Value $child
      acceleratorKey = [string]$child.Current.AcceleratorKey
      accessKey = [string]$child.Current.AccessKey
      automationId = [string]$child.Current.AutomationId
      controlType = $child.Current.ControlType.ProgrammaticName.Replace('ControlType.', '')
      className = [string]$child.Current.ClassName
      enabled = [bool]$child.Current.IsEnabled
      focused = [bool]$child.Current.HasKeyboardFocus
      selected = $selected
      visible = (-not $isOffscreen) -and ([double]$rect.Width -gt 0) -and ([double]$rect.Height -gt 0)
      bounds = [pscustomobject]@{ x = [int]$rect.X; y = [int]$rect.Y; width = [int]$rect.Width; height = [int]$rect.Height }
      supportedPatterns = @(Get-PatternNames $child)
      source = 'uia'
    }
    $script:total += 1
    $out += Walk $child $rid ($depth + 1)
  }
  return $out
}

foreach ($window in $windows) {
  $title = [string]$window.Current.Name
  $windowProcessId = [int]$window.Current.ProcessId
  $handle = [int64]$window.Current.NativeWindowHandle
  if (${hwnd !== undefined ? `$handle -ne ${hwnd}` : '$false'}) { continue }
  if (${windowTitle ? `$title -notlike ${psString(`*${windowTitle}*`)}` : '$false'}) { continue }
  if (${processName ? `((Get-Process -Id $windowProcessId -ErrorAction SilentlyContinue).ProcessName -notlike ${psString(`*${processName}*`)})` : '$false'}) { continue }
  if ($total -ge ${maxElements}) { $truncated = $true; break }
  $windowRuntimeId = ($window.GetRuntimeId() -join '.')
  $elements = @(Walk $window $null 1)
  $hasActionableUia = @($elements | Where-Object { @($_.supportedPatterns).Count -gt 0 }).Count -gt 0
  if (-not $hasActionableUia -and ${hwnd !== undefined ? '$true' : '$false'} -and $total -lt ${maxElements}) {
    $remaining = ${maxElements} - $total
    $legacyElements = @([ZuraLegacyAccessibility]::Capture($handle, ${maxDepth}, $remaining))
    if ($legacyElements.Count -gt 0) {
      $elements += $legacyElements
      $total += $legacyElements.Count
      if ($total -ge ${maxElements}) { $truncated = $true }
    }
  }
  $items += [pscustomobject]@{
    hwnd = $handle
    title = $title
    processId = $windowProcessId
    processName = [string](Get-Process -Id $windowProcessId -ErrorAction SilentlyContinue).ProcessName
    runtimeId = $windowRuntimeId
    elements = @($elements)
  }
}

$activeProcess = $null
try { $activeProcess = Get-Process -Id (($windows | Where-Object { [int64]$_.Current.NativeWindowHandle -eq $activeHwnd } | Select-Object -First 1).Current.ProcessId) -ErrorAction SilentlyContinue } catch {}
$activeWindow = $windows | Where-Object { [int64]$_.Current.NativeWindowHandle -eq $activeHwnd } | Select-Object -First 1
$active = $null
if ($null -ne $activeWindow) {
  $active = [pscustomobject]@{
    hwnd = $activeHwnd
    title = [string]$activeWindow.Current.Name
    processId = [int]$activeWindow.Current.ProcessId
    processName = if ($null -ne $activeProcess) { [string]$activeProcess.ProcessName } else { '' }
  }
}

[pscustomobject]@{
  activeWindow = $active
  windows = $items
  elementCount = $total
  truncated = $truncated
} | ConvertTo-Json -Depth 12 -Compress
`
}

function runtimeActionScript(
  action: 'invoke' | 'setValue' | 'select' | 'scroll',
  entry: ElementCacheEntry,
  value?: string,
  direction?: string,
  amount?: number
): string {
  if (entry.source === 'msaa') {
    if (action !== 'invoke') {
      return `throw "Element does not support the requested legacy accessibility action."`
    }
    return `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
${LEGACY_ACCESSIBILITY_HELPER}
$root = [System.Windows.Automation.AutomationElement]::RootElement
$windowCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty, ${entry.hwnd})
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $windowCondition)
if ($null -eq $window) { throw "ZURA_UIA_TARGET_LOST: Target window is no longer available." }
if ([int]$window.Current.ProcessId -ne ${entry.processId}) { throw "ZURA_UIA_TARGET_CHANGED: Target window identity changed." }
[ZuraLegacyAccessibility]::Invoke(${entry.hwnd}, ${psString(entry.runtimeId)}, ${psString(entry.name)}, ${psString(entry.role)})
@{ action = 'legacyInvoke'; element_id = ${psString(entry.elementId)} } | ConvertTo-Json -Compress
`
  }

  return `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$wanted = ${psString(entry.runtimeId)}
$root = [System.Windows.Automation.AutomationElement]::RootElement
$windowCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty, ${entry.hwnd})
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $windowCondition)
if ($null -eq $window) { throw "ZURA_UIA_TARGET_LOST: Target window is no longer available." }
if ([int]$window.Current.ProcessId -ne ${entry.processId}) { throw "ZURA_UIA_TARGET_CHANGED: Target window identity changed." }
$all = $window.FindAll([System.Windows.Automation.TreeScope]::Subtree, [System.Windows.Automation.Condition]::TrueCondition)
$element = $null
foreach ($el in $all) {
  if (($el.GetRuntimeId() -join '.') -eq $wanted) { $element = $el; break }
}
if ($null -eq $element) { throw "ZURA_UIA_TARGET_LOST: UI element is stale or was not found under its target window." }
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
    $pattern.SetValue(${psString(value || '')})
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
  'scroll' {
    $pattern = $element.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern)
    if ($null -eq $pattern) { throw "Element does not support ScrollPattern." }
    $horizontal = [System.Windows.Automation.ScrollAmount]::NoAmount
    $vertical = [System.Windows.Automation.ScrollAmount]::NoAmount
    switch (${psString(direction || 'down')}) {
      'up' { $vertical = [System.Windows.Automation.ScrollAmount]::SmallDecrement }
      'down' { $vertical = [System.Windows.Automation.ScrollAmount]::SmallIncrement }
      'left' { $horizontal = [System.Windows.Automation.ScrollAmount]::SmallDecrement }
      'right' { $horizontal = [System.Windows.Automation.ScrollAmount]::SmallIncrement }
    }
    for ($i = 0; $i -lt ${Math.max(1, Math.min(20, Math.round(amount || 1)))}; $i++) { $pattern.Scroll($horizontal, $vertical) }
  }
}
@{ action = ${psString(action)}; element_id = ${psString(entry.elementId)} } | ConvertTo-Json -Compress
`
}

async function runSnapshot(
  args: unknown,
  maxDepth: number,
  maxElements: number
): Promise<RawSnapshot> {
  const { stdout } = await runPowerShell(snapshotScript(args, maxDepth, maxElements), {
    maxOutputLength: 512_000,
  })
  return parseJsonOutput<RawSnapshot>(stdout)
}

async function buildAppState(args: unknown = {}): Promise<UiAppState> {
  if (!isWindows()) throw new Error('ui_get_app_state is only supported on Windows.')
  const now = Date.now()
  pruneCaches(now)

  const maxDepth = positiveIntArg(args, 'max_depth', DEFAULT_MAX_DEPTH, 8)
  const maxElements = positiveIntArg(args, 'max_elements', DEFAULT_MAX_ELEMENTS, MAX_ELEMENTS)
  const raw = await runSnapshot(args, maxDepth, maxElements)
  const windows = buildWindows(normalizeJsonArray(raw.windows), now)

  const requestedHwnd =
    isRecord(args) && typeof args.hwnd === 'number' && Number.isSafeInteger(args.hwnd)
      ? Math.trunc(args.hwnd)
      : undefined
  if (requestedHwnd !== undefined && !windows.some((window) => window.hwnd === requestedHwnd)) {
    throw new Error('ZURA_UIA_TARGET_LOST: Target window is no longer available.')
  }
  const screenshotTarget =
    requestedHwnd !== undefined
      ? { windowId: `window:${requestedHwnd}:0` }
      : {
          windowTitle: stringArg(args, 'windowTitle') || undefined,
          appName: stringArg(args, 'appName') || stringArg(args, 'processName') || undefined,
        }
  const isTargetedScreenshot = Boolean(
    screenshotTarget.windowId || screenshotTarget.windowTitle || screenshotTarget.appName
  )
  let screenshot: UiAppState['screenshot']
  let ocr: OcrExtraction | undefined
  try {
    const captured = await captureScreenshot(screenshotTarget)
    ocr = await extractOcrElements(captured.image, captured.width, captured.height)
    screenshot = {
      status: 'available',
      image: captured.image,
      screenWidth: captured.width,
      screenHeight: captured.height,
      coordinateContext: serializeCoordinateContext(captured.coordinateContext),
      ocr:
        ocr.status === 'available'
          ? { status: 'available', element_count: ocr.elements.length }
          : { status: 'unavailable', error: ocr.error, element_count: 0 },
      ...(captured.target ? { target: captured.target } : {}),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Target screenshot is unavailable.'
    if (!isTargetedScreenshot || message !== 'No matching window source available for capture') {
      throw error
    }
    screenshot = {
      status: 'unavailable',
      reason: 'screenshot_unavailable',
      message:
        'Windows did not expose a capturable surface for this target. The accessibility tree remains valid for element_id UI Automation actions; coordinate actions require a separate successful screenshot.',
    }
  }

  const state: UiAppState = {
    state_id: `uis_${randomUUID()}`,
    captured_at: now,
    active_window: raw.activeWindow
      ? {
          hwnd: typeof raw.activeWindow.hwnd === 'number' ? raw.activeWindow.hwnd : 0,
          title: raw.activeWindow.title || '',
          process_id:
            typeof raw.activeWindow.processId === 'number' ? raw.activeWindow.processId : 0,
          process_name: raw.activeWindow.processName || '',
        }
      : undefined,
    screenshot,
    windows,
    ui_blocks: buildUiBlocks(windows, ocr),
    truncation: {
      max_depth: maxDepth,
      max_elements: maxElements,
      element_count:
        typeof raw.elementCount === 'number'
          ? raw.elementCount
          : flattenWindows({
              state_id: '',
              captured_at: now,
              screenshot: {} as UiAppState['screenshot'],
              windows,
              ui_blocks: [],
              truncation: {} as UiAppState['truncation'],
            }).length,
      truncated: raw.truncated === true,
    },
  }

  stateCache.set(state.state_id, { state, updatedAt: now })
  latestStateId = state.state_id
  scheduleCachePrune()
  return state
}

function getState(stateId?: string): UiAppState | null {
  pruneCaches()
  const id = stateId || latestStateId
  if (!id) return null
  return stateCache.get(id)?.state || null
}

function textMatches(value: string | undefined, query: string | undefined): boolean {
  if (!query) return true
  return (value || '').toLowerCase().includes(query.toLowerCase())
}

function matchElement(element: UiAutomationElement, args: UiFindArgs): boolean {
  if (args.role && element.role.toLowerCase() !== args.role.toLowerCase()) return false
  if (args.name && !textMatches(element.name, args.name)) return false
  if (args.value && !textMatches(element.value, args.value)) return false
  if (args.accelerator_key && !textMatches(element.accelerator_key, args.accelerator_key))
    return false
  if (args.access_key && !textMatches(element.access_key, args.access_key)) return false
  const text = args.text || args.query
  if (
    text &&
    ![
      element.name,
      element.value,
      element.automation_id,
      element.role,
      element.accelerator_key,
      element.access_key,
    ].some((candidate) => textMatches(candidate, text))
  )
    return false
  if (typeof args.enabled === 'boolean' && element.enabled !== args.enabled) return false
  if (typeof args.visible === 'boolean' && element.visible !== args.visible) return false
  if (typeof args.focused === 'boolean' && element.focused !== args.focused) return false
  return true
}

export function findElementsInState(state: UiAppState, args: UiFindArgs): UiAutomationElement[] {
  const limit = Math.min(Math.max(1, Math.floor(args.limit || 20)), 50)
  const results: UiAutomationElement[] = []
  const allElements = flattenWindows(state)
  const searchElements = args.parent_element_id
    ? allElements.filter((element) => {
        let current: UiAutomationElement | undefined = element
        while (current?.parent_element_id) {
          if (current.parent_element_id === args.parent_element_id) return true
          current = allElements.find(
            (candidate) => candidate.element_id === current?.parent_element_id
          )
        }
        return false
      })
    : allElements
  for (const element of searchElements) {
    if (matchElement(element, args)) {
      results.push(element)
      if (results.length >= limit) break
    }
  }
  return results
}

function parseFindArgs(args: unknown): UiFindArgs {
  const r = isRecord(args) ? args : {}
  return {
    state_id: typeof r.state_id === 'string' ? r.state_id : undefined,
    query: typeof r.query === 'string' ? r.query : undefined,
    role: typeof r.role === 'string' ? r.role : undefined,
    name: typeof r.name === 'string' ? r.name : undefined,
    value: typeof r.value === 'string' ? r.value : undefined,
    accelerator_key: typeof r.accelerator_key === 'string' ? r.accelerator_key : undefined,
    access_key: typeof r.access_key === 'string' ? r.access_key : undefined,
    text: typeof r.text === 'string' ? r.text : undefined,
    enabled: boolFilterArg(args, 'enabled'),
    visible: boolFilterArg(args, 'visible'),
    focused: boolFilterArg(args, 'focused'),
    parent_element_id: typeof r.parent_element_id === 'string' ? r.parent_element_id : undefined,
    limit: typeof r.limit === 'number' ? r.limit : undefined,
  }
}

function getElementEntry(args: unknown): ElementCacheEntry | null {
  const elementId = stringArg(args, 'element_id')
  if (!elementId) return null
  pruneCaches()
  return elementCache.get(elementId) || null
}

/** Main-only ownership check used to bind element actions to a reserved HWND. */
export function getUiAutomationElementTarget(
  args: unknown
): { hwnd: number; processId: number } | null {
  const entry = getElementEntry(args)
  return entry ? { hwnd: entry.hwnd, processId: entry.processId } : null
}

export type BackgroundPointActivationResult =
  | {
      status: 'activated'
      element_id: string
      source: 'uia' | 'msaa'
      action: 'click' | 'select'
      role: string
      name: string
    }
  | { status: 'unsupported'; reason: string }

function boundsContainPoint(bounds: UiAutomationBounds, x: number, y: number): boolean {
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    x >= bounds.x &&
    x < bounds.x + bounds.width &&
    y >= bounds.y &&
    y < bounds.y + bounds.height
  )
}

/**
 * Main-only background-first activation for an already approved targeted computer click.
 * It never emits shared mouse input and returns unsupported when no provider action owns the point.
 */
export async function tryBackgroundActivateAtPoint(args: {
  hwnd: number
  x: number
  y: number
}): Promise<BackgroundPointActivationResult> {
  if (!isWindows())
    return { status: 'unsupported', reason: 'Windows UI automation is unavailable.' }
  if (
    !Number.isSafeInteger(args.hwnd) ||
    args.hwnd <= 0 ||
    !Number.isFinite(args.x) ||
    !Number.isFinite(args.y)
  ) {
    return { status: 'unsupported', reason: 'The targeted point is invalid.' }
  }

  const now = Date.now()
  pruneCaches(now)
  const raw = await runSnapshot({ hwnd: args.hwnd }, 8, MAX_ELEMENTS)
  const targetWindow = buildWindows(normalizeJsonArray(raw.windows), now).find(
    (window) => window.hwnd === args.hwnd
  )
  if (!targetWindow) throw new Error('ZURA_UIA_TARGET_LOST: Target window is no longer available.')

  const targetElements: UiAutomationElement[] = []
  const collect = (element: UiAutomationElement) => {
    targetElements.push(element)
    for (const child of element.children || []) collect(child)
  }
  for (const element of targetWindow.elements) collect(element)
  const candidates = targetElements
    .filter(
      (element) =>
        element.enabled &&
        element.visible &&
        element.background_safe &&
        (element.supported_actions.includes('click') ||
          element.supported_actions.includes('select')) &&
        boundsContainPoint(element.bounds, args.x, args.y)
    )
    .sort((a, b) => a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height)

  const element = candidates[0]
  if (!element) {
    return {
      status: 'unsupported',
      reason: 'No background-safe UIA or MSAA action owns the requested point.',
    }
  }
  const entry = elementCache.get(element.element_id)
  if (!entry) throw new Error('The resolved accessibility element expired before activation.')
  const action = element.supported_actions.includes('click') ? 'click' : 'select'
  await runUiaAction(action === 'click' ? 'invoke' : 'select', entry)
  return {
    status: 'activated',
    element_id: element.element_id,
    source: element.source,
    action,
    role: element.role,
    name: element.name.slice(0, 160),
  }
}

async function returnFreshState(entry: ElementCacheEntry): Promise<ToolResult> {
  await delay(ACTION_DELAY_MS)
  const state = await buildAppState({ hwnd: entry.hwnd })
  const outcome: UiAutomationActionOutcome = { status: 'completed', state }
  return { success: true, data: outcome }
}

function foregroundRequired(action: string, reason: string, entry?: ElementCacheEntry): ToolResult {
  const outcome: UiAutomationActionOutcome = {
    status: 'foreground_required',
    action,
    reason,
    ...(entry ? { hwnd: entry.hwnd } : {}),
  }
  return { success: false, error: reason, data: outcome }
}

function actionFailure(
  error: unknown,
  fallback: string,
  entry?: ElementCacheEntry,
  foregroundAction?: string
): ToolResult {
  const message = error instanceof Error ? error.message : fallback
  if (foregroundAction && message.includes('does not support')) {
    return foregroundRequired(foregroundAction, message, entry)
  }
  if (message.includes('No matching window source available for capture')) {
    const outcome: UiAutomationActionOutcome = {
      status: 'blocked',
      reason: 'screenshot_unavailable',
      message: 'The target window cannot currently be captured for verification.',
      ...(entry ? { hwnd: entry.hwnd } : {}),
    }
    return { success: false, error: outcome.message, data: outcome }
  }
  const marker = message.includes('ZURA_UIA_TARGET_CHANGED')
    ? 'target_changed'
    : message.includes('ZURA_UIA_TARGET_LOST')
      ? 'target_lost'
      : null
  if (marker) {
    const outcome: UiAutomationActionOutcome = {
      status: 'blocked',
      reason: marker,
      message: message.replace(/.*ZURA_UIA_[A-Z_]+:\s*/, ''),
      ...(entry ? { hwnd: entry.hwnd } : {}),
    }
    return { success: false, error: outcome.message, data: outcome }
  }
  return { success: false, error: message }
}

async function runUiaAction(
  action: 'invoke' | 'setValue' | 'select' | 'scroll',
  entry: ElementCacheEntry,
  value?: string,
  direction?: string,
  amount?: number
): Promise<void> {
  await runPowerShell(runtimeActionScript(action, entry, value, direction, amount))
}

export async function executeUiGetAppState(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_get_app_state')
  try {
    const state = await buildAppState(args)
    return { success: true, data: { state } }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ui_get_app_state failed.',
    }
  }
}

export async function executeUiFind(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_find')
  try {
    const findArgs = parseFindArgs(args)
    const hasExactTarget =
      isRecord(args) && typeof args.hwnd === 'number' && Number.isFinite(args.hwnd)
    const state = hasExactTarget
      ? await buildAppState(args)
      : getState(findArgs.state_id) || (await buildAppState(args))
    return {
      success: true,
      data: { state_id: state.state_id, matches: findElementsInState(state, findArgs) },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'ui_find failed.' }
  }
}

export async function executeUiWaitFor(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_wait_for')
  const waitArgs = parseFindArgs(args) as UiWaitForArgs
  const timeoutMs = Math.min(
    clampTimeoutMs(isRecord(args) ? args.timeout_ms : undefined, DEFAULT_WAIT_TIMEOUT_MS),
    MAX_WAIT_TIMEOUT_MS
  )
  const intervalMs = Math.min(
    Math.max(
      100,
      Math.floor(
        isRecord(args) && typeof args.interval_ms === 'number'
          ? args.interval_ms
          : DEFAULT_WAIT_INTERVAL_MS
      )
    ),
    2_000
  )
  const startedAt = Date.now()

  try {
    while (Date.now() - startedAt <= timeoutMs) {
      const state = await buildAppState(args)
      const matches = findElementsInState(state, waitArgs)
      if (matches.length > 0) {
        return { success: true, data: { state, matches, waited_ms: Date.now() - startedAt } }
      }
      await delay(intervalMs)
    }
    return { success: false, error: `Timed out after ${timeoutMs}ms waiting for UI condition.` }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'ui_wait_for failed.' }
  }
}

export async function executeUiClick(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_click')
  const approval = requireApproval(args, 'ui_click')
  if (approval) return approval
  try {
    const entry = getElementEntry(args)
    if (!entry) return foregroundRequired('click', 'Background click requires an element_id.')
    const button = isRecord(args) && typeof args.button === 'string' ? args.button : 'left'
    if (button !== 'left') {
      return foregroundRequired(
        'click',
        `${button}-button clicks require foreground control.`,
        entry
      )
    }
    if (!entry.supportedActions.includes('click')) {
      return foregroundRequired('click', 'Element does not support background invocation.', entry)
    }
    await runUiaAction('invoke', entry)
    return returnFreshState(entry)
  } catch (error) {
    return actionFailure(error, 'ui_click failed.', getElementEntry(args) || undefined, 'click')
  }
}

export async function executeUiTypeText(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_type_text')
  const approval = requireApproval(args, 'ui_type_text')
  if (approval) return approval
  const text = stringArg(args, 'text')
  if (!text) return { success: false, error: 'text is required.' }
  const entry = getElementEntry(args)
  if (!entry)
    return foregroundRequired('type_text', 'Background text entry requires an element_id.')
  if (!entry.supportedActions.includes('set_value')) {
    return foregroundRequired(
      'type_text',
      'Element does not support background ValuePattern text entry.',
      entry
    )
  }
  try {
    await runUiaAction('setValue', entry, text)
    return returnFreshState(entry)
  } catch (error) {
    return actionFailure(error, 'ui_type_text failed.', entry, 'type_text')
  }
}

export async function executeUiSetValue(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_set_value')
  const approval = requireApproval(args, 'ui_set_value')
  if (approval) return approval
  const entry = getElementEntry(args)
  const value = stringArg(args, 'value')
  if (!entry) return { success: false, error: 'element_id is required.' }
  if (!entry.supportedActions.includes('set_value')) {
    return foregroundRequired(
      'set_value',
      'Element does not support background ValuePattern updates.',
      entry
    )
  }
  try {
    await runUiaAction('setValue', entry, value)
    return returnFreshState(entry)
  } catch (error) {
    return actionFailure(error, 'ui_set_value failed.', entry, 'set_value')
  }
}

export async function executeUiSelect(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_select')
  const approval = requireApproval(args, 'ui_select')
  if (approval) return approval
  const entry = getElementEntry(args)
  if (!entry) return { success: false, error: 'element_id is required.' }
  if (!entry.supportedActions.includes('select')) {
    return foregroundRequired(
      'select',
      'Element does not support background selection or toggling.',
      entry
    )
  }
  try {
    await runUiaAction('select', entry)
    return returnFreshState(entry)
  } catch (error) {
    return actionFailure(error, 'ui_select failed.', entry, 'select')
  }
}

export async function executeUiScroll(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_scroll')
  const approval = requireApproval(args, 'ui_scroll')
  if (approval) return approval
  const direction =
    isRecord(args) && ['up', 'down', 'left', 'right'].includes(String(args.direction))
      ? (String(args.direction) as 'up' | 'down' | 'left' | 'right')
      : 'down'
  const amount = isRecord(args) && typeof args.amount === 'number' ? args.amount : 3
  try {
    const entry = getElementEntry(args)
    if (!entry) return foregroundRequired('scroll', 'Background scroll requires an element_id.')
    if (!entry.supportedActions.includes('scroll')) {
      return foregroundRequired('scroll', 'Element does not support background scrolling.', entry)
    }
    await runUiaAction('scroll', entry, undefined, direction, amount)
    return returnFreshState(entry)
  } catch (error) {
    return actionFailure(error, 'ui_scroll failed.', getElementEntry(args) || undefined, 'scroll')
  }
}

export async function executeUiFocus(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_focus')
  const approval = requireApproval(args, 'ui_focus')
  if (approval) return approval
  const entry = getElementEntry(args)
  if (!entry) return { success: false, error: 'element_id is required.' }
  return foregroundRequired(
    'focus',
    'Keyboard focus is shared desktop state and requires foreground control.',
    entry
  )
}

export async function executeUiKey(args: unknown): Promise<ToolResult> {
  if (!isWindows()) return unsupportedWindowsOnly('ui_key')
  const approval = requireApproval(args, 'ui_key')
  if (approval) return approval
  const key = stringArg(args, 'key')
  if (!key) return { success: false, error: 'key is required.' }
  return foregroundRequired(
    'key',
    'Keyboard input is shared desktop state and requires foreground control.'
  )
}
