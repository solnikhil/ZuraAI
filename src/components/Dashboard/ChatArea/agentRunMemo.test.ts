import { describe, expect, it } from 'vitest'
import type { AgentRun } from '@/chat/types'
import { getAgentRunMemoKey } from './agentRunMemo'

function makeRun(): AgentRun {
  return {
    id: 'agent-run',
    mode: 'agent',
    status: 'running',
    verification: 'pending',
    startedAt: 1,
    capabilities: {
      web: 'approval-required',
      code: 'approval-required',
      mcp: 'approval-required',
      computer: 'approval-required',
    },
    steps: [
      {
        id: 'step-1',
        kind: 'tool',
        status: 'pending',
        title: 'Run tool',
        summary: 'Queued',
      },
    ],
  }
}

describe('getAgentRunMemoKey', () => {
  it('invalidates when a legacy run step changes without deep serialization', () => {
    const run = makeRun()
    const updated = {
      ...run,
      steps: [{ ...run.steps[0], status: 'running' as const, startedAt: 2 }],
    }

    expect(getAgentRunMemoKey(updated)).not.toBe(getAgentRunMemoKey(run))
  })

  it('uses a monotonic revision when present', () => {
    const run = makeRun() as AgentRun & { revision: number }
    run.revision = 3
    const updated = { ...run, revision: 4 }

    expect(getAgentRunMemoKey(updated)).not.toBe(getAgentRunMemoKey(run))
  })
})
