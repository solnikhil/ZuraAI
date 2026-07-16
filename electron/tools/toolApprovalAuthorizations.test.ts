import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearToolApprovalAuthorizations,
  consumeToolApprovalAuthorization,
  issueToolApprovalAuthorization,
} from './toolApprovalAuthorizations'

describe('tool approval authorizations', () => {
  beforeEach(clearToolApprovalAuthorizations)

  it('is one-use and bound to sender, tool name, and exact arguments', () => {
    const args = { path: 'C:\\demo.txt', content: 'hello' }
    const token = issueToolApprovalAuthorization(17, 'file_write', args)

    expect(consumeToolApprovalAuthorization(token, 18, 'file_write', args)).toBe(false)

    const exactToken = issueToolApprovalAuthorization(17, 'file_write', args)
    expect(
      consumeToolApprovalAuthorization(exactToken, 17, 'file_write', {
        ...args,
        content: 'changed',
      })
    ).toBe(false)

    const validToken = issueToolApprovalAuthorization(17, 'file_write', args)
    expect(consumeToolApprovalAuthorization(validToken, 17, 'file_write', args)).toBe(true)
    expect(consumeToolApprovalAuthorization(validToken, 17, 'file_write', args)).toBe(false)
  })
})
