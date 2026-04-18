export interface CodeExecutionArgs {
  code: string
  language: 'javascript' | 'python'
  autoApprove?: boolean
}

export interface OnlineCompilerResponse {
  output: string
  error: string
  status: 'success' | 'error'
  exit_code: number | null
  signal: number | null
  time: string
  total: string
  memory: string
}
