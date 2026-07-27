import { useEffect, useState } from 'react'
import type { ConfiguredModel } from '@/contexts/SettingsConfigContext'
import type { AlibabaRegion } from '@/services/alibabaEndpoints'
import { getAlibabaBaseUrl } from '@/services/alibabaEndpoints'
import { DEFAULT_OLLAMA_URL, getProviderEndpoint, type ProviderId } from '../../../providers'
import {
  getBrowserConnectivityDescriptor,
  type ProviderHubDefinition,
} from './providerHubDescriptors'

export type ConnectivityStatus = 'idle' | 'checking' | 'success' | 'error'

interface ConnectivityState {
  status: ConnectivityStatus
  message: string
  meta: { latencyMs: number; checkedAt: string } | null
  details: string
  showDetails: boolean
}

interface UseProviderConnectivityOptions {
  provider: ProviderHubDefinition
  models: ConfiguredModel[]
  getApiKey: (provider: ProviderHubDefinition) => string
  alibabaRegion: AlibabaRegion
  ollamaUrl: string
  aiModel: string
  onModelsDiscovered: (models: ConfiguredModel[], selectedModel: string) => void
}

const PROVIDER_ENDPOINTS: Record<ProviderId, string> = {
  alibaba: getProviderEndpoint('alibaba', 'baseUrl') || '',
  deepseek: getProviderEndpoint('deepseek', 'baseUrl') || '',
  opencode: getProviderEndpoint('opencode', 'baseUrl') || '',
  fireworks: getProviderEndpoint('fireworks', 'baseUrl') || '',
  groq: getProviderEndpoint('groq', 'baseUrl') || '',
  nvidia: getProviderEndpoint('nvidia', 'baseUrl') || '',
  ollama: getProviderEndpoint('ollama', 'baseUrl') || DEFAULT_OLLAMA_URL,
  openrouter: getProviderEndpoint('openrouter', 'baseUrl') || '',
  codex: 'ChatGPT Codex Responses',
}

const INITIAL_MESSAGE = 'Select a model, then test your connection.'

async function runBearerGetCheck(
  endpointUrl: string,
  apiKey: string,
  failurePrefix: string,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(endpointUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  })
  if (!response.ok) throw new Error(`${failurePrefix} (${response.status}).`)
}

async function runChatCompletionsCheck(
  endpoint: string,
  apiKey: string,
  modelCode: string,
  failurePrefix: string,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelCode,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
    signal,
  })
  if (!response.ok && response.status !== 400) {
    throw new Error(`${failurePrefix} (${response.status}).`)
  }
}

export function useProviderConnectivity({
  provider,
  models,
  getApiKey,
  alibabaRegion,
  ollamaUrl,
  aiModel,
  onModelsDiscovered,
}: UseProviderConnectivityOptions) {
  const [model, setModel] = useState('')
  const [state, setState] = useState<ConnectivityState>({
    status: 'idle',
    message: INITIAL_MESSAGE,
    meta: null,
    details: '',
    showDetails: false,
  })
  const [codexSigningIn, setCodexSigningIn] = useState(false)
  const [codexSignedIn, setCodexSignedIn] = useState<boolean | null>(null)

  const reset = (message: string): void => {
    setState({ status: 'idle', message, meta: null, details: '', showDetails: false })
  }

  const fail = (message: string, details: string): void => {
    setState({ status: 'error', message, meta: null, details, showDetails: false })
  }

  useEffect(() => {
    if (provider.key !== 'codex' || !window.providerRuntime?.getCodexAuthStatus) return
    let active = true
    void window.providerRuntime.getCodexAuthStatus().then(
      (status) => {
        if (active) setCodexSignedIn(status.signedIn)
      },
      () => {
        if (active) setCodexSignedIn(false)
      }
    )
    return () => {
      active = false
    }
  }, [provider.key])

  useEffect(() => {
    if (models.length === 0) {
      setModel('')
      return
    }
    setModel((current) =>
      models.some((configuredModel) => configuredModel.code === current) ? current : models[0].code
    )
  }, [models])

  useEffect(() => {
    reset(INITIAL_MESSAGE)
  }, [provider.key])

  const selectModel = (nextModel: string): void => {
    setModel(nextModel)
    reset('Model changed. Run check again to verify this model.')
  }

  const toggleDetails = (): void => {
    setState((current) => ({ ...current, showDetails: !current.showDetails }))
  }

  const check = async (): Promise<void> => {
    const useMainRuntime = Boolean(window.providerRuntime)
    const selectedKey = useMainRuntime ? '' : getApiKey(provider).trim()
    const endpoint =
      provider.key === 'alibaba'
        ? getAlibabaBaseUrl(alibabaRegion)
        : PROVIDER_ENDPOINTS[provider.key]

    if (!useMainRuntime && provider.key === 'codex') {
      fail(
        'ChatGPT Codex is available only in the ZuraAI desktop runtime.',
        `Provider: ${provider.name}\nModel: ${model || 'none'}`
      )
      return
    }
    if (!useMainRuntime && provider.key !== 'ollama' && !selectedKey) {
      fail(
        `${provider.name} API key is incorrect or empty. Add a valid key and try again.`,
        `Provider: ${provider.name}\nModel: ${model || 'none'}\nEndpoint: ${endpoint}`
      )
      return
    }
    if (!model) {
      fail(
        'Select a model for this provider before checking.',
        `Provider: ${provider.name}\nEndpoint: ${endpoint}`
      )
      return
    }

    setState({
      status: 'checking',
      message: 'Checking provider connectivity...',
      meta: null,
      details: '',
      showDetails: false,
    })
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 9000)
    let mainRequestId: string | undefined

    try {
      if (useMainRuntime) {
        mainRequestId = crypto.randomUUID()
        const requestId = mainRequestId
        controller.signal.addEventListener(
          'abort',
          () => void window.providerRuntime?.cancel(requestId),
          { once: true }
        )
        await window.providerRuntime!.generate({
          requestId,
          provider: provider.key,
          model,
          prompt: 'Reply with OK.',
          maxTokens: 8,
          ollamaUrl,
          alibabaRegion,
        })
      } else {
        const descriptor = getBrowserConnectivityDescriptor(provider.key)
        if (descriptor.kind === 'bearer-get') {
          await runBearerGetCheck(
            `${endpoint}${descriptor.path}`,
            selectedKey,
            descriptor.failurePrefix,
            controller.signal
          )
        } else if (descriptor.kind === 'chat-completions') {
          await runChatCompletionsCheck(
            endpoint,
            selectedKey,
            model,
            descriptor.failurePrefix,
            controller.signal
          )
        } else {
          throw new Error(`Connectivity check is not supported for provider: ${provider.key}`)
        }
      }

      const latencyMs = Math.max(1, Date.now() - startedAt)
      setState({
        status: 'success',
        message:
          provider.key === 'codex'
            ? 'ChatGPT Codex sign-in and model are reachable.'
            : 'Connection successful. API key and model are reachable.',
        meta: { latencyMs, checkedAt: new Date().toLocaleTimeString() },
        details: `Provider: ${provider.name}\nModel: ${model}\nEndpoint: ${endpoint}\nStatus: 200 OK`,
        showDetails: false,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connectivity check failed.'
      setState({
        status: 'error',
        message:
          provider.key === 'codex'
            ? 'ChatGPT Codex is unavailable or not signed in. Use "Sign in with ChatGPT", then retry.'
            : `${provider.name} API key appears invalid or endpoint is unreachable.`,
        meta: null,
        details: `Provider: ${provider.name}\nModel: ${model}\nEndpoint: ${endpoint}\nError: ${message}`,
        showDetails: false,
      })
    } finally {
      clearTimeout(timeout)
      if (mainRequestId) void window.providerRuntime?.cancel(mainRequestId)
    }
  }

  const discoverCodexModels = async (): Promise<ConfiguredModel[]> => {
    if (!window.providerRuntime) throw new Error('The provider runtime bridge is unavailable.')
    const requestId = crypto.randomUUID()
    const result = await window.providerRuntime.listModels({ requestId, provider: 'codex' })
    const discoveredModels = result.filter((candidate): candidate is ConfiguredModel =>
      Boolean(
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as { code?: unknown }).code === 'string' &&
        typeof (candidate as { displayName?: unknown }).displayName === 'string'
      )
    )
    if (discoveredModels.length === 0) throw new Error('ChatGPT returned no usable Codex models.')
    const selectedModel = discoveredModels.some((candidate) => candidate.code === aiModel)
      ? aiModel
      : discoveredModels[0].code
    onModelsDiscovered(discoveredModels, selectedModel)
    setModel(selectedModel)
    return discoveredModels
  }

  const signInCodex = async (): Promise<void> => {
    if (!window.providerRuntime?.signInCodex) {
      fail(
        'ChatGPT sign-in is available only in the ZuraAI desktop runtime.',
        'The provider runtime bridge is unavailable.'
      )
      return
    }
    setCodexSigningIn(true)
    reset('Complete ChatGPT sign-in in the browser window.')
    try {
      await window.providerRuntime.signInCodex()
      setCodexSignedIn(true)
      const discoveredModels = await discoverCodexModels()
      setState((current) => ({
        ...current,
        status: 'success',
        message: `ChatGPT sign-in complete. ${discoveredModels.length} available Codex model${discoveredModels.length === 1 ? '' : 's'} discovered.`,
      }))
    } catch (error) {
      fail(
        'ChatGPT Codex sign-in was cancelled or failed.',
        error instanceof Error ? error.message : 'Unknown sign-in error.'
      )
    } finally {
      setCodexSigningIn(false)
    }
  }

  const signOutCodex = async (): Promise<void> => {
    if (!window.providerRuntime?.signOutCodex) return
    try {
      await window.providerRuntime.signOutCodex()
      setCodexSignedIn(false)
      reset('Signed out of ChatGPT on this device.')
    } catch (error) {
      fail(
        'Could not sign out of ChatGPT Codex.',
        error instanceof Error ? error.message : 'Unknown sign-out error.'
      )
    }
  }

  return {
    model,
    selectModel,
    state,
    reset,
    toggleDetails,
    check,
    codexSigningIn,
    codexSignedIn,
    signInCodex,
    signOutCodex,
  }
}
