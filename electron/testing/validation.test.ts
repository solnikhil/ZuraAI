import { describe, expect, it } from 'vitest'

import { validateWebsiteSmokeTestInput } from './validation'

describe('validateWebsiteSmokeTestInput', () => {
  it('normalizes valid smoke test input with defaults', () => {
    const result = validateWebsiteSmokeTestInput({
      url: 'https://example.com',
      goal: 'Check the welcome state',
      steps: [
        { type: 'click', target: { by: 'role', value: 'button|Continue' } },
        { type: 'waitForText', text: 'Welcome' },
      ],
    })

    expect(result.url).toBe('https://example.com/')
    expect(result.assertions).toEqual([])
    expect(result.options.headless).toBe(true)
    expect(result.options.screenshots).toBe('final-only')
    expect(result.options.trace).toBe('on-failure')
  })

  it('rejects unsupported URL protocols', () => {
    expect(() =>
      validateWebsiteSmokeTestInput({
        url: 'javascript:alert(1)',
        goal: 'Nope',
        steps: [{ type: 'goto' }],
      })
    ).toThrow(/http or https/i)
  })

  it('rejects too many steps', () => {
    expect(() =>
      validateWebsiteSmokeTestInput({
        url: 'https://example.com',
        goal: 'Too many',
        steps: Array.from({ length: 11 }, () => ({ type: 'goto' })),
      })
    ).toThrow(/steps cannot exceed 10/i)
  })

  it('rejects malformed target selectors', () => {
    expect(() =>
      validateWebsiteSmokeTestInput({
        url: 'https://example.com',
        goal: 'Bad target',
        steps: [{ type: 'click', target: { by: 'xpath', value: '//button' } }],
      })
    ).toThrow(/must be one of/i)
  })
})
