import type { ConfiguredModel } from '../contexts/SettingsConfigContext'
import { getProviderEndpoint } from '../providers'
import { listProviderModelsThroughMain } from './providerCatalogBridge'

export interface FireworksModel {
  name: string
  displayName?: string
  description?: string
  contextLength?: number
  context_length?: number
  inputModalities?: string[]
  input_modalities?: string[]
  outputModalities?: string[]
  output_modalities?: string[]
  supportsToolUse?: boolean
  supportsReasoning?: boolean
  supportsVision?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
  [key: string]: unknown
}

interface FireworksModelsResponse {
  models?: FireworksModel[]
  nextPageToken?: string
}

const FIREWORKS_MODEL_CATALOG_URL =
  getProviderEndpoint('fireworks', 'modelCatalogUrl') ??
  'https://api.fireworks.ai/v1/accounts/fireworks/models'

function coerceStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function coerceContextLength(model: FireworksModel): number | undefined {
  const candidates = [
    model.contextLength,
    model.context_length,
    model.contextWindowLength,
    model.maxContextLength,
    model.maxSequenceLength,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
  }

  return undefined
}

function normalizeSearchText(value: string | undefined): string {
  if (!value) return ''

  const normalized = value
    .toLowerCase()
    .replace(/k2p5/g, 'k2p5 k2.5 2.5')
    .replace(/k25/g, 'k25 k2.5 2.5')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
}

export async function fetchFireworksModels(
  apiKey: string,
  signal?: AbortSignal
): Promise<FireworksModel[]> {
  const bridged = await listProviderModelsThroughMain<FireworksModel>('fireworks', signal)
  if (bridged) return bridged
  if (!apiKey?.trim()) {
    throw new Error('Fireworks API key is required to fetch catalog models.')
  }

  const models: FireworksModel[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL(FIREWORKS_MODEL_CATALOG_URL)
    url.searchParams.set('filter', 'supports_serverless=true')
    url.searchParams.set('pageSize', '200')
    if (nextPageToken) {
      url.searchParams.set('pageToken', nextPageToken)
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch Fireworks models: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as FireworksModelsResponse | FireworksModel[]
    const pageModels = Array.isArray(data) ? data : data.models || []
    models.push(...pageModels)
    nextPageToken = Array.isArray(data) ? undefined : data.nextPageToken
  } while (nextPageToken)

  return models
}

export function mapFireworksModelToConfiguredModel(apiModel: FireworksModel): ConfiguredModel {
  const inputModalities = coerceStringArray(apiModel.inputModalities ?? apiModel.input_modalities)
  const outputModalities = coerceStringArray(
    apiModel.outputModalities ?? apiModel.output_modalities
  )

  const supportsVision =
    Boolean(apiModel.supportsVision) ||
    inputModalities.includes('image') ||
    inputModalities.includes('video')
  const supportsImageGeneration =
    Boolean(apiModel.supportsImageGeneration) || outputModalities.includes('image')
  const supportsVideoRecognition =
    Boolean(apiModel.supportsVideoRecognition) || inputModalities.includes('video')
  const supportsReasoning = Boolean(apiModel.supportsReasoning)
  const supportsToolCall = Boolean(apiModel.supportsToolUse)

  let modelType: ConfiguredModel['modelType'] = 'chat'
  if (supportsImageGeneration) {
    modelType = 'image'
  } else if (supportsVideoRecognition) {
    modelType = 'video'
  } else if (supportsReasoning) {
    modelType = 'reasoning'
  }

  return {
    code: apiModel.name,
    displayName: apiModel.displayName || apiModel.name,
    description: apiModel.description,
    maxContext: coerceContextLength(apiModel),
    inputModalities,
    outputModalities,
    modelType,
    supportsToolCall,
    supportsVision,
    supportsDeepThinking: supportsReasoning,
    supportsImageGeneration,
    supportsVideoRecognition,
  }
}

export function searchFireworksModels(models: FireworksModel[], query: string): FireworksModel[] {
  if (!query.trim()) return models

  const normalizedQuery = normalizeSearchText(query)
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)

  return models.filter((model) => {
    const haystack = normalizeSearchText(
      [model.name, model.displayName, model.description].filter(Boolean).join(' ')
    )

    return (
      haystack.includes(normalizedQuery) || queryTokens.every((token) => haystack.includes(token))
    )
  })
}
