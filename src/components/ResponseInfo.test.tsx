import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ResponseInfo from './ResponseInfo'

describe('ResponseInfo', () => {
  it('shows cached token rows when cached usage is present', () => {
    render(
      <ResponseInfo
        model="openrouter/openai/gpt-4.1"
        latency={1200}
        usage={{
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
          cachedInputTokens: 40,
          cachedOutputTokens: 5,
        }}
        finishReason="stop"
      />
    )

    expect(screen.getByText('Cached input')).toBeInTheDocument()
    expect(screen.getByText('Cached output')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
  })

  it('hides cached token rows when cached usage is absent', () => {
    render(
      <ResponseInfo
        model="gpt-4.1"
        usage={{
          inputTokens: 10,
          outputTokens: 4,
          totalTokens: 14,
        }}
      />
    )

    expect(screen.queryByText('Cached input')).not.toBeInTheDocument()
    expect(screen.queryByText('Cached output')).not.toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})
