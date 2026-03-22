import { describe, expect, it } from 'vitest'

import {
  extractTextFromResourceRead,
  formatPromptForComposer,
  formatResourceForComposer,
  stringifyPromptContent,
} from './content'

describe('MCP content helpers', () => {
  it('extracts text resources for composer insertion', () => {
    expect(
      extractTextFromResourceRead({
        contents: [
          { uri: 'file:///tmp/demo.txt', text: 'Hello world' },
          { uri: 'file:///tmp/second.txt', text: 'Second block' },
        ],
      })
    ).toBe('Hello world\n\nSecond block')

    expect(
      formatResourceForComposer('Filesystem', 'file:///tmp/demo.txt', {
        contents: [{ uri: 'file:///tmp/demo.txt', text: 'Hello world' }],
      })
    ).toContain('MCP resource from Filesystem')
  })

  it('flattens prompt result content into composer-safe text', () => {
    expect(
      stringifyPromptContent([
        { type: 'text', text: 'First line' },
        { type: 'text', text: 'Second line' },
      ])
    ).toBe('First line\nSecond line')

    expect(
      formatPromptForComposer('GitHub', 'triage_issue', {
        description: 'Prompt preview',
        messages: [
          {
            role: 'user',
            content: 'Triage the issue',
          },
        ],
      })
    ).toContain('Prompt: triage_issue')
  })
})
