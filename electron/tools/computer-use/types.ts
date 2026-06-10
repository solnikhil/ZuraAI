export type ComputerActionType = 'screenshot' | 'click' | 'type' | 'key' | 'scroll' | 'cursor_position'

export interface ScreenshotArgs {
  display_id?: string
  window_id?: string
  window_title?: string
  app_name?: string
}

export interface ClickArgs {
  x: number
  y: number
  button?: 'left' | 'right' | 'middle'
}

export interface TypeArgs {
  text: string
}

export interface KeyArgs {
  key: string
}

export interface ScrollArgs {
  x: number
  y: number
  direction: 'up' | 'down' | 'left' | 'right'
  amount?: number
}

export interface CursorPositionArgs {
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
