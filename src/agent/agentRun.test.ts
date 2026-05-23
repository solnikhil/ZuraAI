import { describe, expect, it, vi } from 'vitest'

import {
  buildAgentCapabilities,
  completeAgentToolStep,
  createAgentRun,
  upsertAgentToolStep,
} from './agentRun'

describe('agentRun helpers', () => {
  it('marks Computer Use unavailable outside Windows', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 Macintosh',
    })

    expect(buildAgentCapabilities('agent').computer).toBe('unavailable')

    vi.unstubAllGlobals()
  })

  it('creates and completes tool steps', () => {
    const run = createAgentRun('agent')
    const toolCall = {
      id: 'call-1',
      name: 'web_search',
      arguments: { query: 'zura ai' },
    }

    const awaitingApproval = upsertAgentToolStep(run, toolCall, {
      status: 'awaiting-approval',
      approvalState: 'pending',
    })

    expect(awaitingApproval.steps.at(-1)).toEqual(
      expect.objectContaining({
        kind: 'web',
        status: 'awaiting-approval',
        approvalState: 'pending',
      })
    )

    const completed = completeAgentToolStep(awaitingApproval, {
      toolCall,
      result: {
        success: true,
        data: { results: [] },
        executionTime: 123,
      },
    })

    expect(completed.steps.at(-1)).toEqual(
      expect.objectContaining({
        status: 'completed',
        durationMs: 123,
      })
    )
  })
})
