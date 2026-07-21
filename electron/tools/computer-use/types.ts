export type ComputerActionType =
  | 'screenshot'
  | 'click'
  | 'type'
  | 'key'
  | 'scroll'
  | 'cursor_position'

export interface ScreenshotArgs {
  display_id?: string
  window_id?: string
  window_title?: string
  app_name?: string
  reserve_background?: boolean
}

export interface ClickArgs {
  screenshot_id: string
  x: number
  y: number
  button?: 'left' | 'right' | 'middle'
}

export interface TypeArgs {
  screenshot_id: string
  text: string
}

export interface KeyArgs {
  screenshot_id: string
  key: string
}

export interface ScrollArgs {
  screenshot_id: string
  x: number
  y: number
  direction: 'up' | 'down' | 'left' | 'right'
  amount?: number
}

export interface CursorPositionArgs {
  screenshot_id: string
  x: number
  y: number
}

export interface ComputerActionResult {
  action: ComputerActionType
  success: boolean
  screenshot?: string // base64 PNG
  error?: string
  screenWidth?: number
  screenHeight?: number
}
