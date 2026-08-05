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

type TaskType = 'reminder' | 'web_lookout' | 'ai_automation'

/** Minimal valid creation payload for each task type. */
const SEEDS: Record<TaskType, Record<string, unknown>> = {
  reminder: {
    type: 'reminder',
    title: 'Take a break',
    reminderText: 'Stand up and stretch.',
  },
  web_lookout: {
    type: 'web_lookout',
    title: 'Watch the changelog',
    urls: ['https://example.com/changelog'],
  },
  ai_automation: {
    type: 'ai_automation',
    title: 'Daily digest',
    prompt: 'Summarise my unread mail.',
  },
}

/** The field a given type cannot exist without. */
const REQUIRED_FIELD: Record<TaskType, string> = {
  reminder: 'reminderText',
  web_lookout: 'urls',
  ai_automation: 'prompt',
}

const ALL_TYPES: TaskType[] = ['reminder', 'web_lookout', 'ai_automation']

describe('scheduled task type transitions', () => {
  beforeEach(async () => {
    vi.resetModules()
    electronMock.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'zura-schedule-type-'))
  })

  afterEach(async () => {
    await rm(electronMock.userDataPath, { recursive: true, force: true })
  })

  // Every cross-type transition, both directions.
  for (const from of ALL_TYPES) {
    for (const to of ALL_TYPES) {
      if (from === to) continue

      it(`rejects ${from} -> ${to} when ${REQUIRED_FIELD[to]} is not supplied`, async () => {
        const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } =
          await import('./storage')

        const task = await createScheduledTask(sanitizeScheduledTaskInput(SEEDS[from]))

        // A partial patch only validates the fields it contains, so before the
        // fix this merged straight into a persisted task missing its required
        // field for the new type.
        const patch = sanitizeScheduledTaskInput({ type: to }, true)
        await expect(updateScheduledTask(task.id, patch)).rejects.toThrow()
      })

      it(`allows ${from} -> ${to} when the new type's required data is supplied`, async () => {
        const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } =
          await import('./storage')

        const task = await createScheduledTask(sanitizeScheduledTaskInput(SEEDS[from]))
        const { title: _title, ...targetFields } = SEEDS[to]
        const patch = sanitizeScheduledTaskInput({ ...targetFields }, true)

        const updated = await updateScheduledTask(task.id, patch)
        expect(updated?.type).toBe(to)
      })
    }
  }

  it('does not persist a rejected transition', async () => {
    const {
      createScheduledTask,
      updateScheduledTask,
      listScheduledTasks,
      sanitizeScheduledTaskInput,
    } = await import('./storage')

    const task = await createScheduledTask(sanitizeScheduledTaskInput(SEEDS.reminder))
    await expect(
      updateScheduledTask(task.id, sanitizeScheduledTaskInput({ type: 'web_lookout' }, true))
    ).rejects.toThrow()

    const [stored] = await listScheduledTasks()
    expect(stored.type).toBe('reminder')
    expect(stored.reminderText).toBe('Stand up and stretch.')
  })

  it('still allows same-type partial updates that omit required fields', async () => {
    const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } =
      await import('./storage')

    const task = await createScheduledTask(sanitizeScheduledTaskInput(SEEDS.reminder))
    const updated = await updateScheduledTask(
      task.id,
      sanitizeScheduledTaskInput({ enabled: false }, true)
    )

    expect(updated?.enabled).toBe(false)
    expect(updated?.reminderText).toBe('Stand up and stretch.')
  })

  it('rejects clearing a required field on the current type', async () => {
    const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } =
      await import('./storage')

    const task = await createScheduledTask(sanitizeScheduledTaskInput(SEEDS.web_lookout))

    // Sanitisation already rejects an empty URL list...
    expect(() => sanitizeScheduledTaskInput({ urls: [] }, true)).toThrow(
      /At least one URL is required/
    )
    // ...and the merged-candidate guard is defence in depth for any caller that
    // builds a patch without going through sanitisation.
    await expect(updateScheduledTask(task.id, { urls: [] })).rejects.toThrow(
      /At least one URL is required/
    )
  })

  it('rejects a blank title on update', async () => {
    const { createScheduledTask, updateScheduledTask, sanitizeScheduledTaskInput } =
      await import('./storage')

    const task = await createScheduledTask(sanitizeScheduledTaskInput(SEEDS.reminder))
    await expect(updateScheduledTask(task.id, { title: '   ' })).rejects.toThrow(
      /title is required/
    )
  })
})
