import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ThinkingBlock from './ThinkingBlock'

describe('ThinkingBlock behavior', () => {
  it('stays expanded when thinking text changes for the same message', async () => {
    const { rerender } = render(
      <ThinkingBlock
        messageId="message-1"
        thinking="Initial reasoning"
        isThinking={true}
        completedBlocks={[]}
      />
    )

    expect(await screen.findByText('Initial reasoning')).toBeInTheDocument()

    rerender(
      <ThinkingBlock
        messageId="message-1"
        thinking={"Initial reasoning\n\n---\n\nFollow-up reasoning"}
        isThinking={false}
        completedBlocks={[]}
      />
    )

    expect(await screen.findByText(/Follow-up reasoning/)).toBeInTheDocument()
  })
})
