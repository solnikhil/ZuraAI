import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

const electronMock = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath),
  },
}))

describe('scheduled task storage', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-16T12:00:00.000Z'))
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-scheduled-tasks-'))
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  it('defaults the repeat interval when a concrete dueAt is provided', async () => {
    const { createScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')
    const dueAt = Date.now() + 60_000
    const input = sanitizeScheduledTaskInput({
      type: 'reminder',
      title: 'One minute test',
      reminderText: 'This should fire in one minute.',
      dueAt,
    })

    const task = await createScheduledTask(input)

    expect(task.intervalPreset).toBe('30m')
    expect(task.nextRunAt).toBe(dueAt)
  })

  it('normalizes epoch-second dueAt values to milliseconds', async () => {
    const { sanitizeScheduledTaskInput } = await import('./storage')
    const dueAtSeconds = Math.floor((Date.now() + 60_000) / 1000)

    const input = sanitizeScheduledTaskInput({
      type: 'reminder',
      title: 'Epoch seconds test',
      reminderText: 'This should normalize.',
      dueAt: dueAtSeconds,
    })

    expect(input.dueAt).toBe(dueAtSeconds * 1000)
  })

  it('accepts one-minute recurring intervals for lookouts', async () => {
    const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } = await import('./storage')

    const task = await createScheduledTask(sanitizeScheduledTaskInput({
      type: 'web_lookout',
      title: 'Fast lookout',
      urls: ['https://example.com/status'],
      instructions: 'Watch for status changes.',
      intervalPreset: '1m',
    }))

    expect(task.intervalPreset).toBe('1m')
    expect(task.nextRunAt).toBe(Date.now() + 60_000)

    const updated = await updateScheduledTask(
      task.id,
      sanitizeScheduledTaskInput({ intervalPreset: '30m' }, true)
    )

    expect(updated?.intervalPreset).toBe('30m')
  })
})
