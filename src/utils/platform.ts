export function isMacOSRuntime(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.platform.toLowerCase().includes('mac')
}
