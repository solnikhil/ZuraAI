import { describe, expect, it } from 'vitest'

import { extractWorkspaceArtifacts } from './WorkspaceArtifactsPanel'
import type { Message } from '@/chat/types'

function assistantMessage(content: string, id = 'assistant-1'): Message {
  return {
    id,
    role: 'assistant',
    content,
    timestamp: 1_700_000_000_000,
  }
}

describe('extractWorkspaceArtifacts', () => {
  it('extracts substantial fenced code blocks', () => {
    const code = [
      '```tsx',
      'export function Demo() {',
      '  return <section aria-label="Demo artifact">This is enough code to become useful in the workspace panel.</section>',
      '}',
      '```',
    ].join('\n')

    const artifacts = extractWorkspaceArtifacts([assistantMessage(code)])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      kind: 'code',
      language: 'tsx',
      title: 'React TSX snippet',
      content: expect.stringContaining('export function Demo'),
    })
  })

  it('extracts long structured markdown while ignoring short replies', () => {
    const longReport = [
      '# Launch Notes',
      '',
      '1. Tighten release checks before publishing.',
      '2. Keep provider setup explicit.',
      '',
      '| Area | Status |',
      '| --- | --- |',
      '| Tests | Needs work |',
      '',
      'This paragraph simulates a longer generated report. '.repeat(30),
    ].join('\n')

    const artifacts = extractWorkspaceArtifacts([
      assistantMessage('Short answer only.', 'assistant-short'),
      assistantMessage(longReport, 'assistant-report'),
    ])

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      kind: 'markdown',
      messageId: 'assistant-report',
      title: 'Launch Notes',
    })
  })
})
