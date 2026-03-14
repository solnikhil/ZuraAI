import { describe, expect, it } from 'vitest'

import { executeWebsiteSmokeProposalTool } from './websiteSmokeProposalHandler'

describe('executeWebsiteSmokeProposalTool', () => {
  it('builds an approval-gated proposal result', async () => {
    const result = await executeWebsiteSmokeProposalTool({
      id: 'call-1',
      name: 'propose_website_smoke_test',
      arguments: {
        url: 'https://example.com',
        goal: 'Check the sign-in workflow',
        steps: [{ type: 'goto' }, { type: 'click', target: { by: 'role', value: 'button|Sign in' } }],
        assertions: [{ type: 'textVisible', text: 'Welcome' }],
      },
    })

    expect(result.result.success).toBe(true)
    expect(result.result.data).toEqual(
      expect.objectContaining({
        status: 'awaiting_approval',
        proposal: expect.objectContaining({
          url: 'https://example.com/',
          goal: 'Check the sign-in workflow',
        }),
      })
    )
  })

  it('rejects malformed proposal inputs', async () => {
    const result = await executeWebsiteSmokeProposalTool({
      id: 'call-2',
      name: 'propose_website_smoke_test',
      arguments: {
        url: 'javascript:alert(1)',
        goal: 'Bad proposal',
        steps: [{ type: 'goto' }],
      },
    })

    expect(result.result.success).toBe(false)
    expect(result.result.error).toMatch(/http or https/i)
  })
})
