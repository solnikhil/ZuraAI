// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { McpTransitionQueue } from './mcpTransitionQueue'

describe('McpTransitionQueue', () => {
  it('serializes transitions for one server but not unrelated servers', async () => {
    const queue = new McpTransitionQueue()
    const calls: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const first = queue.run('one', async () => {
      calls.push('one:start')
      await gate
      calls.push('one:end')
    })
    const second = queue.run('one', async () => calls.push('one:second'))
    await queue.run('two', async () => calls.push('two'))
    expect(calls).toEqual(['one:start', 'two'])
    release()
    await Promise.all([first, second])
    expect(calls).toEqual(['one:start', 'two', 'one:end', 'one:second'])
  })

  it('continues after a failed transition', async () => {
    const queue = new McpTransitionQueue()
    await expect(
      queue.run('one', async () => Promise.reject(new Error('failed')))
    ).rejects.toThrow()
    await expect(queue.run('one', async () => 'recovered')).resolves.toBe('recovered')
  })
})
