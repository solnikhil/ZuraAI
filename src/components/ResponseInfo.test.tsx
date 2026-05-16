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
          thinkingTokens: 12,
          cachedInputTokens: 40,
          cachedOutputTokens: 5,
          cacheWriteInputTokens: 9,
        }}
        finishReason="stop"
      />
    )

    expect(screen.getByText('Reasoning')).toBeInTheDocument()
    expect(screen.getByText('Cache hit input')).toBeInTheDocument()
    expect(screen.getByText('Cache write input')).toBeInTheDocument()
    expect(screen.getByText('Cached output')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
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

    expect(screen.queryByText('Reasoning')).not.toBeInTheDocument()
    expect(screen.queryByText('Cache hit input')).not.toBeInTheDocument()
    expect(screen.queryByText('Cached output')).not.toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows DeepSeek cache hit and miss token rows when present', () => {
    render(
      <ResponseInfo
        model="deepseek/deepseek-reasoner"
        usage={{
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          thinkingTokens: 20,
          cachedInputTokens: 70,
          cacheMissInputTokens: 30,
        }}
      />
    )

    expect(screen.getByText('Reasoning')).toBeInTheDocument()
    expect(screen.getByText('Cache hit input')).toBeInTheDocument()
    expect(screen.getByText('Cache miss input')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })
})
