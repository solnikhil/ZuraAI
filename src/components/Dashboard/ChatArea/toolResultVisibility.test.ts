import { describe, expect, it } from 'vitest'

import { shouldHideGenericToolResultCard } from './toolResultVisibility'
import type { ToolCallResult } from '../../../chat/types'
import type { ToolCall, ToolResult } from '../../../tools/types'

function buildToolResult(overrides: {
  toolCall?: Partial<ToolCall>
  result?: Partial<ToolResult>
}): ToolCallResult {
  return {
    toolCall: {
      id: 'tool-1',
      name: 'demo_tool',
      arguments: {},
      ...overrides.toolCall,
    },
    result: {
      success: true,
      data: {},
      ...overrides.result,
    },
  }
}

describe('shouldHideGenericToolResultCard', () => {
  it('hides web search results', () => {
    expect(
      shouldHideGenericToolResultCard(
        buildToolResult({
          toolCall: { name: 'web_search' },
        })
      )
    ).toBe(true)
  })

  it('hides namespaced MCP results', () => {
    expect(
      shouldHideGenericToolResultCard(
        buildToolResult({
          toolCall: { name: 'mcp__seqthnk__sequentialthinking' },
        })
      )
    ).toBe(true)
  })

  it('hides MCP results when metadata lost the explicit origin flag', () => {
    expect(
      shouldHideGenericToolResultCard(
        buildToolResult({
          toolCall: { name: 'sequentialthinking' },
          result: {
            metadata: {
              origin: 'mcp',
              serverId: 'server-1',
              namespacedToolName: 'mcp__seqthnk__sequentialthinking',
              serverName: 'seqthnk',
              originalToolName: 'sequentialthinking',
              trusted: true,
              approvalState: 'not-required',
              durationMs: 12,
              outcome: 'success',
            },
          },
        })
      )
    ).toBe(true)
  })

  it('keeps normal non-MCP tool results visible', () => {
    expect(
      shouldHideGenericToolResultCard(
        buildToolResult({
          toolCall: { name: 'image_resize' },
          result: {
            metadata: {
              origin: 'builtin-main',
            },
          },
        })
      )
    ).toBe(false)
  })
})
