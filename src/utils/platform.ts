export function isMacOSRuntime(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toLowerCase().includes('mac')
}

export function isWindowsRuntime(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  return platform.includes('win') || userAgent.includes('windows')
}
