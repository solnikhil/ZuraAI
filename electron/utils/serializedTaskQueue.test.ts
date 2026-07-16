// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { RecoverableSerializedTaskQueue } from './serializedTaskQueue'

describe('RecoverableSerializedTaskQueue', () => {
  it('continues executing work after a rejected task', async () => {
    const queue = new RecoverableSerializedTaskQueue()
    const calls: string[] = []

    await expect(
      queue.run(async () => {
        calls.push('failed')
        throw new Error('disk full')
      })
    ).rejects.toThrow('disk full')

    await expect(
      queue.run(async () => {
        calls.push('recovered')
        return 42
      })
    ).resolves.toBe(42)
    expect(calls).toEqual(['failed', 'recovered'])
  })

  it('runs overlapping tasks strictly in submission order', async () => {
    const queue = new RecoverableSerializedTaskQueue()
    const calls: number[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = queue.run(async () => {
      calls.push(1)
      await firstGate
      calls.push(2)
    })
    const second = queue.run(() => {
      calls.push(3)
    })

    await Promise.resolve()
    expect(calls).toEqual([1])
    releaseFirst()
    await Promise.all([first, second])
    expect(calls).toEqual([1, 2, 3])
  })
})
