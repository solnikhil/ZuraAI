import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  buildCodexMessages,
  createCodexTransportFetch,
  extractCodexAccountId,
  getCodexAuthStatus,
  getFreshCodexCredentials,
  listCodexModels,
  signInToCodex,
  signOutOfCodex,
  streamCodexProviderEvents,
} from './codexProvider'
import type { ProviderRuntimeStreamRequest } from '../../src/providers/providerRuntimeTypes'

vi.mock('../secureStorage', () => ({
  getSecureValueAsync: vi.fn(async () => ''),
  setSecureValueAsync: vi.fn(async () => true),
}))

const NOW = 1_800_000_000_000

function jwt(payload: Record<string, unknown>): string {
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
}

function storedCredentials(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accountId: 'account-123',
    expiresAt: NOW + 3_600_000,
    ...overrides,
  })
}

function request(
  overrides: Partial<ProviderRuntimeStreamRequest> = {}
): ProviderRuntimeStreamRequest {
  return {
    provider: 'codex',
    model: 'gpt-5.4',
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  }
}

describe('ChatGPT Codex OAuth credentials', () => {
  it('extracts the account id from the namespaced JWT claim', () => {
    expect(
      extractCodexAccountId(
        jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-workspace' } }),
        ''
      )
    ).toBe('acct-workspace')
  })

  it('reports status without exposing credential values and supports local sign-out', async () => {
    const setSecureValue = vi.fn(async () => true)
    await expect(
      getCodexAuthStatus({ getSecureValue: async () => storedCredentials() })
    ).resolves.toEqual({ signedIn: true })
    await expect(signOutOfCodex({ setSecureValue })).resolves.toBe(true)
    expect(setSecureValue).toHaveBeenCalledWith('chatGptCodexOAuth', '')
  })

  it('refreshes expired credentials once and persists rotated tokens', async () => {
    const setSecureValue = vi.fn(async () => true)
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 7200,
            id_token: jwt({ chatgpt_account_id: 'new-account' }),
          }),
          { status: 200 }
        )
    )
    const credentials = await getFreshCodexCredentials({
      getSecureValue: async () => storedCredentials({ expiresAt: NOW - 1 }),
      setSecureValue,
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })
    expect(credentials).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      accountId: 'new-account',
      expiresAt: NOW + 7_200_000,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://auth.openai.com/oauth/token',
      expect.objectContaining({ method: 'POST' })
    )
    expect(setSecureValue).toHaveBeenCalledWith(
      'chatGptCodexOAuth',
      expect.stringContaining('new-access')
    )
  })

  it('runs a localhost PKCE callback flow and stores only the resulting token bundle', async () => {
    let handler:
      | ((request: IncomingMessage, response: ServerResponse<IncomingMessage>) => void)
      | undefined
    let listeningCallback: (() => void) | undefined
    const server = {
      once: vi.fn(),
      listen: vi.fn((_port: number, host: string, callback: () => void) => {
        expect(host).toBe('127.0.0.1')
        listeningCallback = callback
      }),
      close: vi.fn(),
    }
    const createHttpServer = vi.fn((callback) => {
      handler = callback
      return server
    })
    let authUrl = ''
    const openExternal = vi.fn(async (url: string) => {
      authUrl = url
    })
    const setSecureValue = vi.fn(async () => true)
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const params = new URLSearchParams(String(init?.body))
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('code')).toBe('authorization-code')
      expect(params.get('code_verifier')).toBeTruthy()
      return new Response(
        JSON.stringify({
          access_token: 'oauth-access',
          refresh_token: 'oauth-refresh',
          expires_in: 3600,
          id_token: jwt({ chatgpt_account_id: 'oauth-account' }),
        }),
        { status: 200 }
      )
    })

    const pending = signInToCodex({
      openExternal,
      createHttpServer: createHttpServer as never,
      fetch: fetchMock as typeof fetch,
      setSecureValue,
      now: () => NOW,
    })
    listeningCallback?.()
    await vi.waitFor(() => expect(authUrl).toContain('https://auth.openai.com/oauth/authorize'))
    const authorize = new URL(authUrl)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://localhost:1455/auth/callback')

    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse<IncomingMessage>
    handler?.(
      {
        method: 'GET',
        url: `/auth/callback?code=authorization-code&state=${authorize.searchParams.get('state')}`,
      } as IncomingMessage,
      response
    )
    await pending
    expect(setSecureValue).toHaveBeenCalledWith(
      'chatGptCodexOAuth',
      expect.stringContaining('oauth-refresh')
    )
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Cache-Control': 'no-store' })
    )
    expect(server.close).toHaveBeenCalled()
  })
})

describe('ChatGPT Codex transport', () => {
  it('rewrites only the Responses endpoint and strips unsupported request fields', async () => {
    const upstream = vi.fn(async () => new Response('ok', { status: 200 }))
    const codexFetch = createCodexTransportFetch(
      {
        appVersion: '0.0.6',
        getSecureValue: async () => storedCredentials(),
        fetch: upstream as typeof fetch,
        now: () => NOW,
      },
      'session-123'
    )

    await codexFetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer must-not-leak', Cookie: 'must-not-leak' },
      body: JSON.stringify({
        model: 'gpt-5.4',
        input: [{ role: 'user', content: 'Hello' }],
        stream: true,
        max_output_tokens: 100,
        metadata: { unsafe: true },
      }),
    })

    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe('https://chatgpt.com/backend-api/codex/responses')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer access-token')
    expect(headers.get('chatgpt-account-id')).toBe('account-123')
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('originator')).toBe('zuraai')
    expect(headers.get('session_id')).toBe('session-123')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'gpt-5.4', stream: true, store: false })
    expect(body).not.toHaveProperty('max_output_tokens')
    expect(body).not.toHaveProperty('metadata')
  })

  it('rejects any URL outside the single allowlisted Responses endpoint', async () => {
    const codexFetch = createCodexTransportFetch({
      appVersion: '0.0.6',
      getSecureValue: async () => storedCredentials(),
      now: () => NOW,
    })
    await expect(
      codexFetch('https://attacker.example/v1/responses', {
        method: 'POST',
        body: '{}',
      })
    ).rejects.toThrow('unexpected upstream URL')
  })

  it('refreshes once after an upstream 401 and retries with the rotated access token', async () => {
    const responseAuthHeaders: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://auth.openai.com/oauth/token') {
        return new Response(
          JSON.stringify({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' }),
          { status: 200 }
        )
      }
      responseAuthHeaders.push(new Headers(init?.headers).get('authorization') ?? '')
      return new Response('', { status: responseAuthHeaders.length === 1 ? 401 : 200 })
    })
    const codexFetch = createCodexTransportFetch({
      appVersion: '0.0.6',
      getSecureValue: async () => storedCredentials(),
      setSecureValue: async () => true,
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })

    await expect(
      codexFetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-5.4', input: [], stream: true }),
      })
    ).resolves.toHaveProperty('status', 200)
    expect(responseAuthHeaders).toEqual(['Bearer access-token', 'Bearer rotated-access'])
  })
})

describe('ChatGPT Codex provider stream', () => {
  it('preserves system/user/assistant roles and flattens prior tool results safely', () => {
    expect(
      buildCodexMessages([
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
        { role: 'tool', content: 'Result' },
      ])
    ).toEqual({
      system: 'System instruction',
      messages: [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
        { role: 'user', content: '[Tool result]\nResult' },
      ],
    })
  })

  it('normalizes AI SDK text, reasoning, usage, and finish events', async () => {
    const streamTextImpl = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', id: 'reasoning', text: 'Think' }
        yield { type: 'text-delta', id: 'text', text: 'Hello' }
        yield {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          totalUsage: {
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
            inputTokenDetails: { cacheReadTokens: 3, cacheWriteTokens: 0 },
            outputTokenDetails: { reasoningTokens: 2 },
          },
        }
      })(),
    }))
    const events = []
    for await (const event of streamCodexProviderEvents(request(), {
      appVersion: '0.0.6',
      streamTextImpl: streamTextImpl as never,
    })) {
      events.push(event)
    }
    expect(events).toEqual([
      { type: 'reasoning-delta', delta: 'Think' },
      { type: 'text-delta', delta: 'Hello' },
      {
        type: 'usage',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cachedInputTokens: 3,
          cacheWriteInputTokens: 0,
          thinkingTokens: 2,
          requestCount: 1,
        },
      },
      { type: 'finish', finishReason: 'stop' },
    ])
    expect(streamTextImpl).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, model: expect.any(Object) })
    )
  })

  it.each([
    [
      'tool definitions',
      request({ tools: [{ type: 'function', function: { name: 'x', parameters: {} } }] }),
    ],
    [
      'image inputs',
      request({ messages: [{ role: 'user', content: 'x', images: ['data:image/png;base64,a'] }] }),
    ],
  ])('rejects unsupported %s before starting the SDK stream', async (_label, input) => {
    const events = streamCodexProviderEvents(input, { appVersion: '0.0.6' })
    await expect(events.next()).rejects.toThrow(/does not accept/)
  })
})

describe('ChatGPT Codex model discovery', () => {
  it('maps account-aware model records and sends the required account/version headers', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            models: [
              {
                slug: 'gpt-5.5',
                display_name: 'GPT-5.5',
                context_window: 400000,
                supported_reasoning_efforts: ['low', 'high'],
              },
            ],
          }),
          { status: 200 }
        )
    )
    const models = await listCodexModels(new AbortController().signal, {
      appVersion: '0.0.6',
      getSecureValue: async () => storedCredentials(),
      fetch: fetchMock as typeof fetch,
      now: () => NOW,
    })
    expect(models).toEqual([
      {
        code: 'gpt-5.5',
        displayName: 'GPT-5.5',
        enabled: true,
        maxContext: 400000,
        supportsDeepThinking: true,
        modelType: 'reasoning',
      },
    ])
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/backend-api/codex/models?client_version=0.144.4')
    const headers = new Headers(init?.headers)
    expect(headers.get('chatgpt-account-id')).toBe('account-123')
    expect(headers.get('version')).toBe('0.144.4')
  })
})
