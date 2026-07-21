import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createOpenAI } from '@ai-sdk/openai'
import {
  ProviderError,
  type ProviderStreamEvent,
  providerErrorCodeForStatus,
} from '@zura/provider-core'
import {
  jsonSchema,
  streamText,
  tool,
  type AssistantContent,
  type ModelMessage,
  type ToolContent,
  type ToolSet,
} from 'ai'
import type { ProviderRuntimeStreamRequest } from '../../src/providers/providerRuntimeTypes'
import { getSecureValueAsync, setSecureValueAsync } from '../secureStorage'

const CHATGPT_ISSUER = 'https://auth.openai.com'
const CHATGPT_AUTHORIZE_URL = `${CHATGPT_ISSUER}/oauth/authorize`
const CHATGPT_TOKEN_URL = `${CHATGPT_ISSUER}/oauth/token`
const CHATGPT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const CHATGPT_CODEX_RESPONSES_URL = `${CHATGPT_CODEX_BASE_URL}/responses`
const CHATGPT_CODEX_MODELS_URL = `${CHATGPT_CODEX_BASE_URL}/models`
const CHATGPT_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CHATGPT_REDIRECT_PORT = 1455
const CHATGPT_REDIRECT_URI = `http://localhost:${CHATGPT_REDIRECT_PORT}/auth/callback`
const CHATGPT_AUTH_TIMEOUT_MS = 5 * 60 * 1_000
const CHATGPT_TOKEN_REFRESH_SKEW_MS = 60 * 1_000
const CODEX_PROTOCOL_VERSION = '0.144.4'
const CODEX_SECURE_STORAGE_KEY = 'chatGptCodexOAuth'
const MAX_AUTH_RESPONSE_BYTES = 64 * 1024
const MAX_MODEL_RESPONSE_BYTES = 2 * 1024 * 1024

export const CODEX_DEFAULT_MODEL = 'gpt-5.4'
export const CODEX_PROVIDER_MODELS = [
  {
    code: CODEX_DEFAULT_MODEL,
    displayName: 'GPT-5.4',
    enabled: true,
    supportsDeepThinking: true,
    supportsToolCall: true,
    modelType: 'reasoning',
  },
] as const

interface ChatGptCodexCredentials {
  accessToken: string
  refreshToken: string
  accountId?: string
  expiresAt: number
}

interface ChatGptTokenResponse {
  access_token?: unknown
  refresh_token?: unknown
  id_token?: unknown
  expires_in?: unknown
}

export interface CodexAuthStatus {
  signedIn: boolean
}

export interface CodexAuthDependencies {
  fetch?: typeof globalThis.fetch
  getSecureValue?: typeof getSecureValueAsync
  setSecureValue?: typeof setSecureValueAsync
  now?: () => number
}

export interface CodexSignInOptions extends CodexAuthDependencies {
  openExternal: (url: string) => Promise<unknown>
  createHttpServer?: typeof createServer
  timeoutMs?: number
}

export interface CodexProviderRuntimeOptions extends CodexAuthDependencies {
  appVersion: string
  streamTextImpl?: typeof streamText
}

function dependencyFetch(dependencies: CodexAuthDependencies): typeof globalThis.fetch {
  return dependencies.fetch ?? globalThis.fetch
}

function dependencyGetSecureValue(dependencies: CodexAuthDependencies): typeof getSecureValueAsync {
  return dependencies.getSecureValue ?? getSecureValueAsync
}

function dependencySetSecureValue(dependencies: CodexAuthDependencies): typeof setSecureValueAsync {
  return dependencies.setSecureValue ?? setSecureValueAsync
}

function now(dependencies: CodexAuthDependencies): number {
  return dependencies.now?.() ?? Date.now()
}

function firstLine(value: unknown): string {
  return (value instanceof Error ? value.message : String(value)).split(/\r?\n/, 1)[0].slice(0, 500)
}

function normalizeCodexError(error: unknown, signal?: AbortSignal): ProviderError {
  if (error instanceof ProviderError) return error
  const cause = signal?.aborted ? signal.reason : error
  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return new ProviderError({
      provider: 'codex',
      code: 'timeout',
      message: 'ChatGPT Codex request timed out.',
      retryable: true,
      cause: error,
    })
  }
  if (signal?.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) {
    return new ProviderError({
      provider: 'codex',
      code: 'aborted',
      message: 'ChatGPT Codex request was cancelled.',
      cause: error,
    })
  }

  const message = firstLine(error)
  if (/unauthori[sz]ed|authentication|sign[- ]?in|\b401\b|\b403\b/i.test(message)) {
    return new ProviderError({
      provider: 'codex',
      code: 'authentication',
      message: 'ChatGPT Codex is not signed in. Sign in with ChatGPT in Settings, then retry.',
      status: /\b403\b/.test(message) ? 403 : 401,
      cause: error,
    })
  }
  return new ProviderError({
    provider: 'codex',
    code: 'unknown',
    message: message || 'ChatGPT Codex failed without an error message.',
    cause: error,
  })
}

function parseStoredCredentials(value: string): ChatGptCodexCredentials | null {
  if (!value || value.length > MAX_AUTH_RESPONSE_BYTES) return null
  try {
    const parsed = JSON.parse(value) as Partial<ChatGptCodexCredentials>
    if (
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken ||
      typeof parsed.refreshToken !== 'string' ||
      !parsed.refreshToken ||
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null
    }
    if (parsed.accountId !== undefined && typeof parsed.accountId !== 'string') return null
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      accountId: parsed.accountId,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

async function persistCredentials(
  credentials: ChatGptCodexCredentials,
  dependencies: CodexAuthDependencies
): Promise<void> {
  const saved = await dependencySetSecureValue(dependencies)(
    CODEX_SECURE_STORAGE_KEY,
    JSON.stringify(credentials)
  )
  if (!saved) {
    throw new ProviderError({
      provider: 'codex',
      code: 'authentication',
      message: 'ChatGPT sign-in could not be stored securely on this device.',
    })
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const value = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function extractCodexAccountId(idToken: string, accessToken: string): string | undefined {
  for (const token of [idToken, accessToken]) {
    const claims = decodeJwtPayload(token)
    if (!claims) continue
    const nested = claims['https://api.openai.com/auth']
    const accountId =
      typeof claims.chatgpt_account_id === 'string'
        ? claims.chatgpt_account_id
        : nested && typeof nested === 'object'
          ? (nested as Record<string, unknown>).chatgpt_account_id
          : undefined
    if (typeof accountId === 'string' && accountId.length > 0 && accountId.length <= 256) {
      return accountId
    }
  }
  return undefined
}

async function parseTokenResponse(
  response: Response,
  previousRefreshToken: string | undefined,
  dependencies: CodexAuthDependencies
): Promise<ChatGptCodexCredentials> {
  const text = await response.text()
  if (Buffer.byteLength(text) > MAX_AUTH_RESPONSE_BYTES) {
    throw new Error('ChatGPT token response was too large.')
  }
  if (!response.ok) {
    throw new Error(`ChatGPT token exchange failed (${response.status}).`)
  }
  let body: ChatGptTokenResponse
  try {
    body = JSON.parse(text) as ChatGptTokenResponse
  } catch {
    throw new Error('ChatGPT token response was not valid JSON.')
  }
  const accessToken = typeof body.access_token === 'string' ? body.access_token : ''
  const refreshToken =
    typeof body.refresh_token === 'string' ? body.refresh_token : (previousRefreshToken ?? '')
  const idToken = typeof body.id_token === 'string' ? body.id_token : ''
  const expiresIn =
    typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
      ? Math.max(60, Math.min(body.expires_in, 24 * 60 * 60))
      : 60 * 60
  if (!accessToken || !refreshToken) {
    throw new Error('ChatGPT token response did not include the required credentials.')
  }
  return {
    accessToken,
    refreshToken,
    accountId: extractCodexAccountId(idToken, accessToken),
    expiresAt: now(dependencies) + expiresIn * 1_000,
  }
}

let refreshPromise: Promise<ChatGptCodexCredentials> | null = null
let authRevision = 0

async function refreshCredentials(
  current: ChatGptCodexCredentials,
  dependencies: CodexAuthDependencies
): Promise<ChatGptCodexCredentials> {
  if (!refreshPromise) {
    const refreshRevision = authRevision
    refreshPromise = (async () => {
      const response = await dependencyFetch(dependencies)(CHATGPT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken,
          client_id: CHATGPT_OAUTH_CLIENT_ID,
        }).toString(),
      })
      const refreshed = await parseTokenResponse(response, current.refreshToken, dependencies)
      if (!refreshed.accountId) refreshed.accountId = current.accountId
      if (refreshRevision === authRevision) {
        await persistCredentials(refreshed, dependencies)
      }
      return refreshed
    })().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function getFreshCodexCredentials(
  dependencies: CodexAuthDependencies = {},
  forceRefresh = false
): Promise<ChatGptCodexCredentials> {
  const stored = parseStoredCredentials(
    await dependencyGetSecureValue(dependencies)(CODEX_SECURE_STORAGE_KEY)
  )
  if (!stored) {
    throw new ProviderError({
      provider: 'codex',
      code: 'authentication',
      message: 'ChatGPT Codex is not signed in. Sign in with ChatGPT in Settings, then retry.',
      status: 401,
    })
  }
  if (!forceRefresh && stored.expiresAt > now(dependencies) + CHATGPT_TOKEN_REFRESH_SKEW_MS) {
    return stored
  }
  return refreshCredentials(stored, dependencies)
}

export async function getCodexAuthStatus(
  dependencies: CodexAuthDependencies = {}
): Promise<CodexAuthStatus> {
  const stored = parseStoredCredentials(
    await dependencyGetSecureValue(dependencies)(CODEX_SECURE_STORAGE_KEY)
  )
  return { signedIn: Boolean(stored) }
}

export async function signOutOfCodex(dependencies: CodexAuthDependencies = {}): Promise<boolean> {
  authRevision += 1
  return dependencySetSecureValue(dependencies)(CODEX_SECURE_STORAGE_KEY, '')
}

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

function buildAuthorizeUrl(challenge: string, state: string): string {
  const url = new URL(CHATGPT_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CHATGPT_OAUTH_CLIENT_ID,
    redirect_uri: CHATGPT_REDIRECT_URI,
    scope: 'openid profile email offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'zuraai',
    state,
  }).toString()
  return url.toString()
}

function statesMatch(actual: string | null, expected: string): boolean {
  if (!actual) return false
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function writeOAuthPage(response: import('node:http').ServerResponse, ok: boolean): void {
  const title = ok ? 'ChatGPT sign-in complete' : 'ChatGPT sign-in failed'
  const message = ok
    ? 'You can close this window and return to ZuraAI.'
    : 'Return to ZuraAI and try signing in again.'
  response.writeHead(ok ? 200 : 400, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(
    `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui;margin:4rem;max-width:42rem}h1{font-size:1.5rem}</style><h1>${title}</h1><p>${message}</p>`
  )
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  dependencies: CodexAuthDependencies
): Promise<ChatGptCodexCredentials> {
  const response = await dependencyFetch(dependencies)(CHATGPT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CHATGPT_REDIRECT_URI,
      client_id: CHATGPT_OAUTH_CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  })
  return parseTokenResponse(response, undefined, dependencies)
}

export async function signInToCodex(options: CodexSignInOptions): Promise<void> {
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(32))
  const createHttpServer = options.createHttpServer ?? createServer
  let server: Server | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  const callback = new Promise<ChatGptCodexCredentials>((resolve, reject) => {
    let settled = false
    const finish = (error?: unknown, credentials?: ChatGptCodexCredentials) => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      server?.close()
      if (error) reject(error)
      else if (credentials) resolve(credentials)
      else reject(new Error('ChatGPT sign-in did not return credentials.'))
    }

    server = createHttpServer(async (request, response) => {
      const url = new URL(request.url ?? '/', CHATGPT_REDIRECT_URI)
      if (request.method !== 'GET' || url.pathname !== '/auth/callback') {
        response.writeHead(404, { 'Cache-Control': 'no-store' })
        response.end('Not found')
        return
      }
      const oauthError = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (oauthError || !code || !statesMatch(url.searchParams.get('state'), state)) {
        writeOAuthPage(response, false)
        finish(new Error(oauthError ? 'ChatGPT rejected sign-in.' : 'Invalid OAuth callback.'))
        return
      }
      try {
        const credentials = await exchangeAuthorizationCode(code, verifier, options)
        authRevision += 1
        await persistCredentials(credentials, options)
        writeOAuthPage(response, true)
        finish(undefined, credentials)
      } catch (error) {
        writeOAuthPage(response, false)
        finish(error)
      }
    })
    server.once('error', finish)
    server.listen(CHATGPT_REDIRECT_PORT, '127.0.0.1', async () => {
      try {
        await options.openExternal(buildAuthorizeUrl(challenge, state))
      } catch (error) {
        finish(error)
      }
    })
    timeout = setTimeout(
      () => finish(new Error('ChatGPT sign-in timed out.')),
      options.timeoutMs ?? CHATGPT_AUTH_TIMEOUT_MS
    )
  })

  try {
    await callback
  } catch (error) {
    throw normalizeCodexError(error)
  } finally {
    if (timeout) clearTimeout(timeout)
    const activeServer = server as Server | null
    activeServer?.close()
  }
}

function codexHeaders(
  credentials: ChatGptCodexCredentials,
  appVersion: string,
  sessionId?: string,
  input?: HeadersInit
): Headers {
  const headers = new Headers(input)
  headers.delete('authorization')
  headers.delete('cookie')
  headers.delete('x-api-key')
  headers.set('Authorization', `Bearer ${credentials.accessToken}`)
  if (credentials.accountId) headers.set('ChatGPT-Account-Id', credentials.accountId)
  headers.set('originator', 'zuraai')
  headers.set('User-Agent', `ZuraAI/${appVersion}`)
  headers.set('version', CODEX_PROTOCOL_VERSION)
  if (sessionId) headers.set('session_id', sessionId.slice(0, 128))
  return headers
}

function parseRequestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== 'string') {
    throw new ProviderError({
      provider: 'codex',
      code: 'bad_request',
      message: 'ChatGPT Codex accepts only JSON request bodies.',
    })
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new ProviderError({
      provider: 'codex',
      code: 'bad_request',
      message: 'ChatGPT Codex request body was not valid JSON.',
    })
  }
  delete parsed.max_output_tokens
  delete parsed.metadata
  parsed.store = false
  return JSON.stringify(parsed)
}

export function createCodexTransportFetch(
  options: CodexProviderRuntimeOptions,
  sessionId?: string
): typeof globalThis.fetch {
  return async (input, init) => {
    const requestedUrl = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url
    )
    if (
      requestedUrl.origin !== 'https://api.openai.com' ||
      requestedUrl.pathname !== '/v1/responses'
    ) {
      throw new ProviderError({
        provider: 'codex',
        code: 'bad_request',
        message: 'ChatGPT Codex transport rejected an unexpected upstream URL.',
      })
    }
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (method.toUpperCase() !== 'POST') {
      throw new ProviderError({
        provider: 'codex',
        code: 'bad_request',
        message: 'ChatGPT Codex transport accepts only POST responses requests.',
      })
    }
    const body = parseRequestBody(init?.body)
    const sourceHeaders = init?.headers ?? (input instanceof Request ? input.headers : undefined)

    const perform = async (credentials: ChatGptCodexCredentials): Promise<Response> => {
      const headers = codexHeaders(credentials, options.appVersion, sessionId, sourceHeaders)
      headers.set('Accept', 'text/event-stream')
      headers.set('Content-Type', 'application/json')
      return dependencyFetch(options)(CHATGPT_CODEX_RESPONSES_URL, {
        ...init,
        method: 'POST',
        headers,
        body,
      })
    }

    let credentials = await getFreshCodexCredentials(options)
    let response = await perform(credentials)
    if (response.status === 401) {
      credentials = await getFreshCodexCredentials(options, true)
      response = await perform(credentials)
    }
    return response
  }
}

function textFromContent(
  content: ProviderRuntimeStreamRequest['messages'][number]['content']
): string {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
}

export function buildCodexMessages(messages: ProviderRuntimeStreamRequest['messages']): {
  system?: string
  messages: ModelMessage[]
} {
  const system: string[] = []
  const modelMessages: ModelMessage[] = []
  const toolNamesByCallId = new Map<string, string>()
  for (const message of messages) {
    const text = textFromContent(message.content)
    if (message.role === 'system' || message.role === 'developer') {
      if (text) system.push(text)
    } else if (message.role === 'assistant') {
      if (!message.tool_calls?.length) {
        if (text) modelMessages.push({ role: 'assistant', content: text })
        continue
      }
      const content: AssistantContent = []
      if (text) content.push({ type: 'text', text })
      for (const toolCall of message.tool_calls ?? []) {
        if (!toolCall.id || !toolCall.function.name) continue
        let input: unknown
        try {
          input = JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          input = {}
        }
        toolNamesByCallId.set(toolCall.id, toolCall.function.name)
        content.push({
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          input,
        })
      }
      if (content.length > 0) modelMessages.push({ role: 'assistant', content })
    } else if (message.role === 'tool') {
      const toolCallId = message.tool_call_id
      const toolName = toolCallId ? toolNamesByCallId.get(toolCallId) : undefined
      if (toolCallId && toolName) {
        const content: ToolContent = [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            output: { type: 'text', value: text },
          },
        ]
        modelMessages.push({ role: 'tool', content })
      } else if (text) {
        modelMessages.push({ role: 'user', content: `[Tool result]\n${text}` })
      }
    } else {
      if (text) modelMessages.push({ role: 'user', content: text })
    }
  }
  if (modelMessages.length === 0) {
    throw new ProviderError({
      provider: 'codex',
      code: 'bad_request',
      message: 'ChatGPT Codex requires at least one text message.',
    })
  }
  return { system: system.length ? system.join('\n\n') : undefined, messages: modelMessages }
}

function buildCodexTools(definitions: ProviderRuntimeStreamRequest['tools']): ToolSet | undefined {
  if (!definitions?.length) return undefined
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.function.name,
      tool({
        description: definition.function.description,
        inputSchema: jsonSchema(
          (definition.function.parameters ?? {
            type: 'object',
            properties: {},
            additionalProperties: false,
          }) as never
        ),
      }),
    ])
  )
}

function buildCodexToolChoice(request: ProviderRuntimeStreamRequest) {
  return typeof request.toolChoice === 'object'
    ? ({ type: 'tool', toolName: request.toolChoice.function.name } as const)
    : request.toolChoice
}

function mapUsage(usage: {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number }
  outputTokenDetails?: { reasoningTokens?: number }
}) {
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
    cacheWriteInputTokens: usage.inputTokenDetails?.cacheWriteTokens,
    thinkingTokens: usage.outputTokenDetails?.reasoningTokens,
    requestCount: 1,
  }
}

export async function* streamCodexProviderEvents(
  request: ProviderRuntimeStreamRequest,
  options: CodexProviderRuntimeOptions
): AsyncGenerator<ProviderStreamEvent> {
  if (request.messages.some((message) => message.images?.length)) {
    throw new ProviderError({
      provider: 'codex',
      code: 'bad_request',
      message: 'ChatGPT Codex does not accept image attachments in ZuraAI.',
    })
  }
  if (request.signal?.aborted) throw normalizeCodexError(request.signal.reason, request.signal)

  const prompt = buildCodexMessages(request.messages)
  const openai = createOpenAI({
    apiKey: 'oauth-token-is-injected-by-main',
    fetch: createCodexTransportFetch(options, request.sessionId),
  })
  const effort = request.reasoningEffort ?? request.reasoning?.effort
  try {
    const result = (options.streamTextImpl ?? streamText)({
      model: openai.responses(request.model),
      system: prompt.system,
      messages: prompt.messages,
      maxRetries: 0,
      abortSignal: request.signal,
      tools: buildCodexTools(request.tools),
      toolChoice: buildCodexToolChoice(request),
      providerOptions: {
        openai: {
          store: false,
          reasoningEffort: effort && effort !== 'none' ? effort : undefined,
          reasoningSummary: 'auto',
        },
      },
    })

    let finished = false
    let toolCallIndex = 0
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta' && part.text) {
        yield { type: 'text-delta', delta: part.text }
      } else if (part.type === 'reasoning-delta' && part.text) {
        yield { type: 'reasoning-delta', delta: part.text }
      } else if (part.type === 'tool-call') {
        yield {
          type: 'tool-call-delta',
          delta: [
            {
              index: toolCallIndex++,
              id: part.toolCallId,
              type: 'function',
              function: {
                name: part.toolName,
                arguments: JSON.stringify(part.input ?? {}),
              },
            },
          ],
        }
      } else if (part.type === 'error') {
        throw part.error
      } else if (part.type === 'abort') {
        throw new DOMException('ChatGPT Codex request was cancelled.', 'AbortError')
      } else if (part.type === 'finish') {
        yield { type: 'usage', usage: mapUsage(part.totalUsage) }
        yield {
          type: 'finish',
          finishReason:
            part.finishReason === 'tool-calls'
              ? 'tool_calls'
              : part.finishReason === 'content-filter'
                ? 'content_filter'
                : part.finishReason,
        }
        finished = true
      }
    }
    if (!finished) {
      throw new ProviderError({
        provider: 'codex',
        code: 'invalid_response',
        message: 'ChatGPT Codex ended before completing the response.',
      })
    }
  } catch (error) {
    throw normalizeCodexError(error, request.signal)
  }
}

export async function generateCodexText(
  request: ProviderRuntimeStreamRequest,
  options: CodexProviderRuntimeOptions
): Promise<string> {
  let text = ''
  for await (const event of streamCodexProviderEvents(request, options)) {
    if (event.type === 'text-delta') text += event.delta
  }
  return text
}

interface CodexModelRecord {
  id?: unknown
  slug?: unknown
  name?: unknown
  display_name?: unknown
  context_window?: unknown
  max_context_length?: unknown
  reasoning?: unknown
  supported_reasoning_efforts?: unknown
}

export async function listCodexModels(
  signal: AbortSignal,
  options: CodexProviderRuntimeOptions
): Promise<unknown[]> {
  try {
    const url = new URL(CHATGPT_CODEX_MODELS_URL)
    url.searchParams.set('client_version', CODEX_PROTOCOL_VERSION)
    const perform = (credentials: ChatGptCodexCredentials) =>
      dependencyFetch(options)(url, {
        method: 'GET',
        headers: codexHeaders(credentials, options.appVersion),
        signal,
      })
    let credentials = await getFreshCodexCredentials(options)
    let response = await perform(credentials)
    if (response.status === 401) {
      credentials = await getFreshCodexCredentials(options, true)
      response = await perform(credentials)
    }
    const text = await response.text()
    if (Buffer.byteLength(text) > MAX_MODEL_RESPONSE_BYTES) {
      throw new ProviderError({
        provider: 'codex',
        code: 'response_too_large',
        message: 'ChatGPT Codex returned an oversized model catalog.',
        status: response.status,
      })
    }
    if (!response.ok) {
      throw new ProviderError({
        provider: 'codex',
        code: providerErrorCodeForStatus(response.status),
        message:
          response.status === 401 || response.status === 403
            ? 'ChatGPT Codex sign-in has expired. Sign in again in Settings.'
            : `ChatGPT Codex model discovery failed (${response.status}).`,
        status: response.status,
      })
    }
    const parsed = JSON.parse(text) as { data?: unknown; models?: unknown }
    const records = Array.isArray(parsed.data)
      ? (parsed.data as CodexModelRecord[])
      : Array.isArray(parsed.models)
        ? (parsed.models as CodexModelRecord[])
        : []
    const models = records.flatMap((record) => {
      const code = typeof record.id === 'string' ? record.id : record.slug
      if (typeof code !== 'string' || !/^[a-zA-Z0-9._:/-]{1,128}$/.test(code)) return []
      const displayName =
        typeof record.name === 'string'
          ? record.name
          : typeof record.display_name === 'string'
            ? record.display_name
            : code
      const context =
        typeof record.context_window === 'number'
          ? record.context_window
          : typeof record.max_context_length === 'number'
            ? record.max_context_length
            : undefined
      const reasoning =
        record.reasoning === true ||
        (Array.isArray(record.supported_reasoning_efforts) &&
          record.supported_reasoning_efforts.length > 0)
      const supportedReasoningEfforts = Array.isArray(record.supported_reasoning_efforts)
        ? record.supported_reasoning_efforts.filter(
            (effort): effort is 'low' | 'medium' | 'high' | 'xhigh' =>
              effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh'
          )
        : []
      return [
        {
          code,
          displayName: displayName.slice(0, 160),
          enabled: true,
          maxContext: context,
          supportsDeepThinking: reasoning,
          supportsToolCall: true,
          modelType: reasoning ? 'reasoning' : 'chat',
          ...(supportedReasoningEfforts.length > 0 ? { supportedReasoningEfforts } : {}),
        },
      ]
    })
    if (models.length === 0) {
      throw new ProviderError({
        provider: 'codex',
        code: 'invalid_response',
        message: 'ChatGPT Codex returned a model catalog with no usable models.',
      })
    }
    return models
  } catch (error) {
    throw normalizeCodexError(error, signal)
  }
}
