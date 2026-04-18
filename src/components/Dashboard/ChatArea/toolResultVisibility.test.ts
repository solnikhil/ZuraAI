import { describe, expect, it } from 'vitest'

import { shouldHideGenericToolResultCard, shouldHideMessageToolResultCard } from './toolResultVisibility'
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

describe('shouldHideMessageToolResultCard', () => {
  it('hides code execution card when thinking block already contains completed code_execution tool', () => {
    const result = buildToolResult({
      toolCall: { name: 'code_execution' },
      result: {
        success: false,
        error: 'Piston API error',
      },
    })

    expect(
      shouldHideMessageToolResultCard(result, [
        {
          type: 'tool',
          timestamp: Date.now(),
          toolName: 'code_execution',
          toolInput: { code: 'print(2 + 2)', language: 'python' },
          toolOutput: {
            success: false,
            error: 'Piston API error',
          },
        },
      ])
    ).toBe(true)
  })

  it('keeps code execution card when no matching thinking block exists', () => {
    const result = buildToolResult({
      toolCall: { name: 'code_execution' },
    })

    expect(
      shouldHideMessageToolResultCard(result, [
        {
          type: 'tool',
          timestamp: Date.now(),
          toolName: 'some_other_tool',
        },
      ])
    ).toBe(false)
  })
})
