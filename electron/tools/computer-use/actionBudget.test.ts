// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_ACTIONS_PER_SESSION } from './constants'
import {
  consumeActionBudget,
  getActionBudgetUsage,
  initializeActionBudget,
  releaseActionBudget,
  releaseAllActionBudgets,
} from './actionBudget'

/** Charges `count` actions and returns the first over-budget error, if any. */
function spend(sessionKey: string, count: number): string | null {
  let firstError: string | null = null
  for (let index = 0; index < count; index += 1) {
    const error = consumeActionBudget(sessionKey)
    if (error && !firstError) firstError = error
  }
  return firstError
}

describe('Computer Use action budget', () => {
  beforeEach(() => {
    releaseAllActionBudgets()
  })

  it('allows exactly MAX_ACTIONS_PER_SESSION actions in one session', () => {
    initializeActionBudget('run-a')

    expect(spend('run-a', MAX_ACTIONS_PER_SESSION)).toBeNull()
    expect(getActionBudgetUsage('run-a')).toBe(MAX_ACTIONS_PER_SESSION)

    const overBudget = consumeActionBudget('run-a')
    expect(overBudget).toContain(`Action limit reached (${MAX_ACTIONS_PER_SESSION})`)
  })

  it('keeps two independent runs within their own budgets past the aggregate limit', () => {
    // The regression: a single process-wide counter meant these two runs shared
    // one allowance, so the second run failed even though it had barely acted.
    initializeActionBudget('sender-1:run-a')
    initializeActionBudget('sender-1:run-b')

    expect(spend('sender-1:run-a', MAX_ACTIONS_PER_SESSION)).toBeNull()
    expect(spend('sender-1:run-b', MAX_ACTIONS_PER_SESSION)).toBeNull()

    // Aggregate is now double the limit, yet each run stayed inside its budget.
    expect(getActionBudgetUsage('sender-1:run-a')).toBe(MAX_ACTIONS_PER_SESSION)
    expect(getActionBudgetUsage('sender-1:run-b')).toBe(MAX_ACTIONS_PER_SESSION)
  })

  it('isolates budgets across different senders', () => {
    expect(spend('sender-1:run-a', MAX_ACTIONS_PER_SESSION)).toBeNull()
    expect(consumeActionBudget('sender-2:run-a')).toBeNull()
    expect(getActionBudgetUsage('sender-2:run-a')).toBe(1)
  })

  it('does not reset an in-progress budget when the session is seen again', () => {
    initializeActionBudget('run-a')
    spend('run-a', 10)

    // A fresh screenshot mid-run must not hand back a full allowance.
    initializeActionBudget('run-a')
    expect(getActionBudgetUsage('run-a')).toBe(10)

    expect(spend('run-a', MAX_ACTIONS_PER_SESSION - 10)).toBeNull()
    expect(consumeActionBudget('run-a')).toContain('Action limit reached')
  })

  it('starts a released session from zero again', () => {
    spend('run-a', MAX_ACTIONS_PER_SESSION)
    expect(consumeActionBudget('run-a')).toContain('Action limit reached')

    releaseActionBudget('run-a')
    initializeActionBudget('run-a')

    expect(getActionBudgetUsage('run-a')).toBe(0)
    expect(consumeActionBudget('run-a')).toBeNull()
  })

  it('releasing one session leaves the others untouched', () => {
    spend('run-a', 5)
    spend('run-b', 7)

    releaseActionBudget('run-a')

    expect(getActionBudgetUsage('run-a')).toBe(0)
    expect(getActionBudgetUsage('run-b')).toBe(7)
  })

  it('clears every budget on emergency abort', () => {
    spend('run-a', 5)
    spend('run-b', 7)

    releaseAllActionBudgets()

    expect(getActionBudgetUsage('run-a')).toBe(0)
    expect(getActionBudgetUsage('run-b')).toBe(0)
  })

  it('charges an unscoped caller its own budget rather than a shared global one', () => {
    spend('unscoped', MAX_ACTIONS_PER_SESSION)
    expect(consumeActionBudget('unscoped')).toContain('Action limit reached')
    // A properly scoped run is unaffected by the unscoped caller's exhaustion.
    expect(consumeActionBudget('sender-1:run-a')).toBeNull()
  })
})
