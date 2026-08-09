import { app, shell, type WebContents } from 'electron'
import { toProviderError } from '@zura/provider-core'
import type {
  ProviderRuntimeBridgeEvent,
  ProviderRuntimeGenerateRequest,
  ProviderRuntimeListModelsRequest,
  ProviderRuntimeStartRequest,
} from '../../src/electron/types'
import {
  generateProviderTitleText,
  streamProviderEvents,
} from '../../src/providers/providerRuntime'
import type { ProviderRuntimeSettings } from '../../src/providers/providerRuntimeTypes'
import { normalizeActiveProviderId } from '../../src/providers/providerRegistry'
import { getProviderSettingsDefinition } from '../../src/providers/providerSettingsRegistry'
import { isAlibabaRegion } from '../../src/services/alibabaEndpoints'
import { getSecureValueAsync } from '../secureStorage'
import { trustedIpcMain as ipcMain } from './trustedIpc'
import { fetchOpenRouterModels } from '../../src/services/openrouterModels'
import { fetchDeepSeekModels } from '../../src/services/deepseek'
import { fetchFireworksModels } from '../../src/services/fireworksModels'
import { fetchNvidiaModels } from '../../src/services/nvidiaModels'
import { fetchOpencodeModels } from '../../src/services/opencode'
import { fetchAlibabaModels } from '../../src/services/alibabaModels'
import { enrichOllamaModelsWithContext, listOllamaModels } from '../../src/services/ollama'
import {
  generateCodexText,
  getCodexAuthStatus,
  listCodexModels,
  signOutOfCodex,
  signInToCodex,
  streamCodexProviderEvents,
} from '../providers/codexProvider'

const MAX_ACTIVE_REQUESTS_PER_RENDERER = 4
const MAX_REQUEST_BYTES = 32 * 1024 * 1024
const MAX_REQUEST_RUNTIME_MS = 10 * 60 * 1_000
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
const activeRequests = new Map<string, AbortController>()
let activeCodexSignIn: Promise<void> | null = null

function requestKey(senderId: number, requestId: string): string {
  return `${senderId}:${requestId}`
}

function assertRequestId(requestId: unknown): asserts requestId is string {
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error('Provider runtime request id is invalid.')
  }
}

function validateOllamaUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const parsed = new URL(value)
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Ollama URL must use HTTP or HTTPS.')
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error('Main-process Ollama access is restricted to loopback addresses.')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Ollama URL must not contain credentials, a query, or a fragment.')
  }
  return parsed.toString().replace(/\/$/, '')
}

function sanitizeRequest(input: unknown): ProviderRuntimeStartRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Provider runtime request must be an object.')
  }
  const request = input as ProviderRuntimeStartRequest
  assertRequestId(request.requestId)
  const provider = normalizeActiveProviderId(request.provider)
  if (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 256) {
    throw new Error('Provider runtime model id is invalid.')
  }
  if (
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    request.messages.length > 500
  ) {
    throw new Error('Provider runtime messages are invalid.')
  }

  let encoded: string
  try {
    encoded = JSON.stringify(request)
  } catch {
    throw new Error('Provider runtime request must be serializable.')
  }
  if (Buffer.byteLength(encoded) > MAX_REQUEST_BYTES) {
    throw new Error('Provider runtime request is too large.')
  }

  if (request.alibabaRegion !== undefined && !isAlibabaRegion(request.alibabaRegion)) {
    throw new Error('Alibaba region is invalid.')
  }

  return {
    ...request,
    provider,
    model: request.model.trim(),
    ollamaUrl: validateOllamaUrl(request.ollamaUrl),
  }
}

async function resolveRuntimeSettings(request: {
  provider: ProviderRuntimeStartRequest['provider']
  temperature?: number
  maxTokens?: number
  streamResponses?: boolean
  ollamaUrl?: string
  alibabaRegion?: ProviderRuntimeStartRequest['alibabaRegion']
  openRouterDebug?: boolean
}): Promise<ProviderRuntimeSettings> {
  const settings: ProviderRuntimeSettings = {
    temperature: request.temperature ?? 0.7,
    maxTokens: request.maxTokens ?? 4096,
    streamResponses: request.streamResponses !== false,
    ollamaUrl: request.ollamaUrl,
    alibabaRegion: request.alibabaRegion,
    openRouterDebug: request.openRouterDebug,
  }
  const secretField = getProviderSettingsDefinition(request.provider)?.secretKeyField
  if (secretField) {
    ;(settings as unknown as Record<string, unknown>)[secretField] =
      await getSecureValueAsync(secretField)
  }
  return settings
}

function sanitizeGenerateRequest(input: unknown): ProviderRuntimeGenerateRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Provider generation request must be an object.')
  }
  const request = input as ProviderRuntimeGenerateRequest
  assertRequestId(request.requestId)
  const provider = normalizeActiveProviderId(request.provider)
  if (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 256) {
    throw new Error('Provider generation model id is invalid.')
  }
  if (
    typeof request.prompt !== 'string' ||
    !request.prompt.trim() ||
    request.prompt.length > 128_000
  ) {
    throw new Error('Provider generation prompt is invalid.')
  }
  if (
    request.maxTokens !== undefined &&
    (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > 65_536)
  ) {
    throw new Error('Provider generation token limit is invalid.')
  }
  if (request.alibabaRegion !== undefined && !isAlibabaRegion(request.alibabaRegion)) {
    throw new Error('Alibaba region is invalid.')
  }
  return {
    ...request,
    provider,
    model: request.model.trim(),
    prompt: request.prompt.trim(),
    ollamaUrl: validateOllamaUrl(request.ollamaUrl),
  }
}

function sanitizeListModelsRequest(input: unknown): ProviderRuntimeListModelsRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('Provider model-list request must be an object.')
  }
  const request = input as ProviderRuntimeListModelsRequest
  assertRequestId(request.requestId)
  return {
    ...request,
    provider: normalizeActiveProviderId(request.provider),
    ollamaUrl: validateOllamaUrl(request.ollamaUrl),
  }
}

async function listModelsInMain(
  request: ProviderRuntimeListModelsRequest,
  signal: AbortSignal
): Promise<unknown[]> {
  const secretField = getProviderSettingsDefinition(request.provider)?.secretKeyField
  const apiKey = secretField ? await getSecureValueAsync(secretField) : ''
  switch (request.provider) {
    case 'codex':
      return listCodexModels(signal, getCodexRuntimeOptions())
    case 'openrouter':
      return fetchOpenRouterModels(apiKey, signal)
    case 'deepseek':
      return fetchDeepSeekModels(apiKey, signal)
    case 'fireworks':
      return fetchFireworksModels(apiKey, signal)
    case 'nvidia':
      return fetchNvidiaModels(apiKey, signal)
    case 'opencode':
      return fetchOpencodeModels(apiKey, signal)
    case 'alibaba':
      return fetchAlibabaModels()
    case 'ollama': {
      const baseUrl = request.ollamaUrl
      if (!baseUrl) throw new Error('Ollama URL is required to list local models.')
      const models = await listOllamaModels(baseUrl, signal)
      const formatted = models.map((model) => ({ code: model.name, displayName: model.name }))
      const enriched = await enrichOllamaModelsWithContext(baseUrl, formatted, signal)
      const contexts = new Map(enriched.map((model) => [model.code, model.maxContext]))
      return models.map((model) => ({ ...model, maxContext: contexts.get(model.name) }))
    }
    default:
      throw new Error(`Model catalog is not available for provider: ${request.provider}`)
  }
}

function getCodexRuntimeOptions() {
  return {
    appVersion: app.getVersion(),
  }
}

function sendBridgeEvent(sender: WebContents, event: ProviderRuntimeBridgeEvent): void {
  if (!sender.isDestroyed()) sender.send('provider-runtime:event', event)
}

function activeCountForSender(senderId: number): number {
  const prefix = `${senderId}:`
  return [...activeRequests.keys()].filter((key) => key.startsWith(prefix)).length
}

export function registerProviderRuntimeHandlers(): void {
  ipcMain.handle('provider-runtime:start', async (event, input: unknown) => {
    const request = sanitizeRequest(input)
    const key = requestKey(event.sender.id, request.requestId)
    if (activeRequests.has(key)) {
      throw new Error('Provider runtime request id is already active.')
    }
    if (activeCountForSender(event.sender.id) >= MAX_ACTIVE_REQUESTS_PER_RENDERER) {
      throw new Error('Too many provider requests are active for this renderer.')
    }

    const controller = new AbortController()
    const runtimeSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(MAX_REQUEST_RUNTIME_MS),
    ])
    activeRequests.set(key, controller)
    const abortOnDestroyed = () => controller.abort()
    event.sender.once('destroyed', abortOnDestroyed)

    void (async () => {
      try {
        const settings = await resolveRuntimeSettings(request)
        const {
          requestId: _requestId,
          ollamaUrl: _ollamaUrl,
          alibabaRegion: _alibabaRegion,
          openRouterDebug: _debug,
          ...streamRequest
        } = request
        const runtimeRequest = { ...streamRequest, signal: runtimeSignal }
        const providerEvents =
          request.provider === 'codex'
            ? streamCodexProviderEvents(runtimeRequest, getCodexRuntimeOptions())
            : streamProviderEvents(settings, runtimeRequest)
        for await (const providerEvent of providerEvents) {
          if (providerEvent.type === 'error') throw providerEvent.error
          sendBridgeEvent(event.sender, {
            requestId: request.requestId,
            type: 'event',
            event: providerEvent,
          })
        }
        sendBridgeEvent(event.sender, { requestId: request.requestId, type: 'done' })
      } catch (error) {
        const providerError = toProviderError(error, request.provider)
        sendBridgeEvent(event.sender, {
          requestId: request.requestId,
          type: 'error',
          error: providerError.serialize(),
        })
      } finally {
        activeRequests.delete(key)
        event.sender.removeListener('destroyed', abortOnDestroyed)
      }
    })()

    return true
  })

  ipcMain.handle('provider-runtime:generate', async (event, input: unknown) => {
    const request = sanitizeGenerateRequest(input)
    const key = requestKey(event.sender.id, request.requestId)
    if (activeRequests.has(key)) throw new Error('Provider runtime request id is already active.')
    if (activeCountForSender(event.sender.id) >= MAX_ACTIVE_REQUESTS_PER_RENDERER) {
      throw new Error('Too many provider requests are active for this renderer.')
    }

    const controller = new AbortController()
    const runtimeSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(MAX_REQUEST_RUNTIME_MS),
    ])
    activeRequests.set(key, controller)
    const abortOnDestroyed = () => controller.abort()
    event.sender.once('destroyed', abortOnDestroyed)

    try {
      const settings = await resolveRuntimeSettings(request)
      if (request.provider === 'codex') {
        return await generateCodexText(
          {
            provider: 'codex',
            model: request.model,
            messages: [{ role: 'user', content: request.prompt }],
            maxTokens: request.maxTokens,
            streamResponses: true,
            signal: runtimeSignal,
          },
          getCodexRuntimeOptions()
        )
      }
      return await generateProviderTitleText(
        settings,
        request.provider,
        request.model,
        request.prompt,
        {
          signal: runtimeSignal,
          maxTokens: request.maxTokens,
          jsonMode: request.jsonMode,
        }
      )
    } catch (error) {
      throw toProviderError(error, request.provider)
    } finally {
      activeRequests.delete(key)
      event.sender.removeListener('destroyed', abortOnDestroyed)
    }
  })

  ipcMain.handle('provider-runtime:list-models', async (event, input: unknown) => {
    const request = sanitizeListModelsRequest(input)
    const key = requestKey(event.sender.id, request.requestId)
    if (activeRequests.has(key)) throw new Error('Provider runtime request id is already active.')
    if (activeCountForSender(event.sender.id) >= MAX_ACTIVE_REQUESTS_PER_RENDERER) {
      throw new Error('Too many provider requests are active for this renderer.')
    }
    const controller = new AbortController()
    const runtimeSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(MAX_REQUEST_RUNTIME_MS),
    ])
    activeRequests.set(key, controller)
    const abortOnDestroyed = () => controller.abort()
    event.sender.once('destroyed', abortOnDestroyed)
    try {
      return await listModelsInMain(request, runtimeSignal)
    } catch (error) {
      throw toProviderError(error, request.provider)
    } finally {
      activeRequests.delete(key)
      event.sender.removeListener('destroyed', abortOnDestroyed)
    }
  })

  ipcMain.handle('provider-runtime:codex-sign-in', async () => {
    if (!activeCodexSignIn) {
      activeCodexSignIn = signInToCodex({
        openExternal: (url) => shell.openExternal(url),
      }).finally(() => {
        activeCodexSignIn = null
      })
    }
    await activeCodexSignIn
    return true
  })

  ipcMain.handle('provider-runtime:codex-auth-status', () => getCodexAuthStatus())

  ipcMain.handle('provider-runtime:codex-sign-out', () => signOutOfCodex())

  ipcMain.handle('provider-runtime:cancel', (event, requestId: unknown) => {
    assertRequestId(requestId)
    const key = requestKey(event.sender.id, requestId)
    const controller = activeRequests.get(key)
    if (!controller) return false
    controller.abort()
    return true
  })
}

export function unregisterProviderRuntimeHandlers(): void {
  ipcMain.removeHandler('provider-runtime:start')
  ipcMain.removeHandler('provider-runtime:generate')
  ipcMain.removeHandler('provider-runtime:list-models')
  ipcMain.removeHandler('provider-runtime:codex-sign-in')
  ipcMain.removeHandler('provider-runtime:codex-auth-status')
  ipcMain.removeHandler('provider-runtime:codex-sign-out')
  ipcMain.removeHandler('provider-runtime:cancel')
  for (const controller of activeRequests.values()) controller.abort()
  activeRequests.clear()
}
