import { describe, expect, it } from 'vitest'

import { formatProviderStreamError } from './streamErrorUtils'

describe('formatProviderStreamError', () => {
  it('translates OpenRouter 502 gateway errors into an upstream warning', () => {
    const formatted = formatProviderStreamError(new Error('[502] Bad Gateway'), 'openrouter', {})

    expect(formatted).toEqual({
      message:
        'OpenRouter returned 502 Bad Gateway before streaming started. This is usually an upstream route/provider failure, not a token rendering issue. Retry, switch models, or disable tools/web search for this turn.',
      tone: 'warning',
    })
  })

  it('translates OpenRouter tool-routing errors into an actionable warning', () => {
    const formatted = formatProviderStreamError(
      new Error('[404] 404 No endpoints found that support tool use. Try disabling "web_search".'),
      'openrouter',
      {}
    )

    expect(formatted).toEqual({
      message:
        'This OpenRouter model route does not support tool calling. Switch to a model with Tool Calling support or disable Web Research/web_search for this chat.',
      tone: 'warning',
    })
  })
})
