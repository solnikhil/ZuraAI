export interface UiAutomationBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface UiAutomationElement {
  element_id: string
  parent_element_id?: string
  name: string
  value?: string
  role: string
  automation_id: string
  class_name: string
  enabled: boolean
  focused: boolean
  selected?: boolean
  visible: boolean
  bounds: UiAutomationBounds
  supported_actions: string[]
  children?: UiAutomationElement[]
}

export interface UiAutomationWindow {
  hwnd: number
  title: string
  process_id: number
  process_name: string
  element_id: string
  elements: UiAutomationElement[]
}

export interface UiAppState {
  state_id: string
  captured_at: number
  active_window?: {
    hwnd: number
    title: string
    process_id: number
    process_name: string
  }
  screenshot: {
    image: string
    screenWidth: number
    screenHeight: number
    coordinateContext: unknown
    target?: unknown
  }
  windows: UiAutomationWindow[]
  truncation: {
    max_depth: number
    max_elements: number
    element_count: number
    truncated: boolean
  }
}

export interface UiFindArgs {
  state_id?: string
  query?: string
  role?: string
  name?: string
  value?: string
  text?: string
  enabled?: boolean
  visible?: boolean
  focused?: boolean
  parent_element_id?: string
  limit?: number
}

export interface UiWaitForArgs extends UiFindArgs {
  timeout_ms?: number
  interval_ms?: number
  condition?: 'element' | 'text' | 'focus' | 'window'
}
