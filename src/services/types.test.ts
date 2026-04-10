import { describe, expect, it } from 'vitest'

import { extractErrorMessage } from './types'

describe('extractErrorMessage', () => {
  it('formats OpenRouter upstream metadata without mojibake separators', () => {
    const message = extractErrorMessage(
      {
        error: {
          message: 'Bad gateway',
          metadata: {
            provider_name: 'OpenAI',
            raw: 'Upstream timeout',
          },
        },
      },
      '',
      502,
      'Bad Gateway'
    )

    expect(message).toBe('502 Bad gateway (provider: OpenAI) - Upstream timeout')
    expect(message).not.toContain('â€”')
  })
})
