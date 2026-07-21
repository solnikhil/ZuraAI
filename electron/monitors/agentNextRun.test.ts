import { describe, expect, it } from 'vitest'
import {
  clampAgentNextRunAt,
  parseAgentNextRunDecision,
  resolveAgentOwnedNextRunAt,
  stripAgentNextRunMarkers,
  AGENT_NEXT_RUN_MIN_MS,
  AGENT_NEXT_RUN_MAX_MS,
} from './agentNextRun'

describe('agentNextRun', () => {
  const fromMs = Date.parse('2026-06-16T12:00:00.000Z')

  it('parses relative and absolute next_run markers', () => {
    expect(parseAgentNextRunDecision('hello\n[[next_run:+30m]]', fromMs)).toEqual({
      kind: 'delay',
      nextRunAt: fromMs + 30 * 60 * 1000,
    })
    expect(parseAgentNextRunDecision('[[next_run:2h]]', fromMs)).toEqual({
      kind: 'delay',
      nextRunAt: fromMs + 2 * 60 * 60 * 1000,
    })
    expect(parseAgentNextRunDecision('[[next_run:done]]', fromMs)).toEqual({ kind: 'done' })
    expect(
      parseAgentNextRunDecision('[[next_run:2026-06-16T15:00:00.000Z]]', fromMs)
    ).toEqual({
      kind: 'delay',
      nextRunAt: Date.parse('2026-06-16T15:00:00.000Z'),
    })
  })

  it('clamps agent next runs between 1 minute and 7 days', () => {
    expect(clampAgentNextRunAt(fromMs, fromMs + 1000)).toBe(fromMs + AGENT_NEXT_RUN_MIN_MS)
    expect(clampAgentNextRunAt(fromMs, fromMs + AGENT_NEXT_RUN_MAX_MS + 10_000)).toBe(
      fromMs + AGENT_NEXT_RUN_MAX_MS
    )
  })

  it('strips markers and falls back to interval when missing', () => {
    expect(stripAgentNextRunMarkers('News summary\n[[next_run:+1h]]\n')).toBe('News summary')
    const resolved = resolveAgentOwnedNextRunAt({
      fromMs,
      intervalPreset: '30m',
      outputText: 'No marker here',
    })
    expect(resolved.nextRunAt).toBe(fromMs + 30 * 60 * 1000)
    expect(resolved.enabled).toBe(true)
  })

  it('honors structured nextRunInMs over missing markers', () => {
    const resolved = resolveAgentOwnedNextRunAt({
      fromMs,
      intervalPreset: '30m',
      nextRunInMs: 90 * 60 * 1000,
    })
    expect(resolved.nextRunAt).toBe(fromMs + 90 * 60 * 1000)
  })
})
