import { describe, expect, it } from 'vitest'
import { assertNoDuplicatePreloadChannels, PRELOAD_CHANNEL_MANIFEST } from './ipcChannelManifest'

describe('preload IPC channel manifest', () => {
  it('has one owner for every invoke and subscription channel', () => {
    expect(() => assertNoDuplicatePreloadChannels()).not.toThrow()
  })

  it('keeps privileged dedicated channels out of the generic invoke bridge', () => {
    const generic = new Set<string>(PRELOAD_CHANNEL_MANIFEST.generic.invoke)
    expect(generic.has('mcp:execute-tool')).toBe(false)
    expect(generic.has('provider-runtime:start')).toBe(false)
    expect(generic.has('agent-approval:request')).toBe(false)
  })
})
