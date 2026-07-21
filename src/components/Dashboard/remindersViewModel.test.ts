import { describe, expect, it } from 'vitest'
import {
  automationModeLabel,
  formatSchedule,
  formatWeekdays,
  notifyPolicyLabel,
  runStatusLabel,
  summarizeLastRun,
  validateForm,
  emptyFormState,
  buildCreateInput,
} from './remindersViewModel'
import type { ScheduledTaskDefinition, ScheduledTaskRun } from '@/electron/types'

describe('remindersViewModel', () => {
  it('formats human-readable schedules and labels', () => {
    expect(formatWeekdays([1, 3, 5])).toBe('Mon, Wed, Fri')
    expect(automationModeLabel('prompt')).toBe('Prompt only')
    expect(notifyPolicyLabel('meaningful_change')).toBe('Notify only on change')
    expect(
      formatSchedule({
        id: '1',
        type: 'ai_automation',
        title: 'x',
        enabled: true,
        urls: [],
        instructions: '',
        intervalPreset: '30m',
        schedule: { kind: 'weekly', timeOfDay: '08:00', weekdays: [1, 2, 3, 4, 5] },
        createdAt: 1,
        updatedAt: 1,
        nextRunAt: 2,
      } as ScheduledTaskDefinition)
    ).toBe('Weekly Mon, Tue, Wed, Thu, Fri at 08:00')
  })

  it('uses type-aware run status labels', () => {
    expect(runStatusLabel('unchanged', 'web_lookout')).toBe('No change')
    expect(runStatusLabel('changed', 'web_lookout')).toBe('Changed')
    expect(runStatusLabel('unchanged', 'ai_automation')).toBe('Done')
    expect(runStatusLabel('error', 'reminder')).toBe('Failed')
    expect(runStatusLabel('changed', 'reminder')).toBe('Delivered')
  })

  it('summarizes last run output', () => {
    const run: ScheduledTaskRun = {
      id: 'r1',
      taskId: 't1',
      startedAt: 1,
      finishedAt: 2,
      status: 'unchanged',
      logs: [],
      outputText: 'Hello world from automation',
    }
    expect(summarizeLastRun(run, 'ai_automation')).toBe(
      'Last: Done — Hello world from automation'
    )
  })

  it('validates and builds create payloads', () => {
    const form = emptyFormState('ai_automation')
    form.title = 'Brief'
    form.prompt = 'Summarize news'
    form.scheduleKind = 'agent'
    expect(validateForm(form)).toBeNull()
    const payload = buildCreateInput(form)
    expect(payload.schedule).toEqual({ kind: 'agent', intervalPreset: '30m' })
    expect(payload.prompt).toBe('Summarize news')
  })
})
