import type { ConfiguredModel } from '../contexts/SettingsConfigContext'
import { getProviderEndpoint } from '../providers'
import { listProviderModelsThroughMain } from './providerCatalogBridge'

export interface NvidiaModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
  [key: string]: unknown
}

interface NvidiaModelListResponse {
  object?: 'list'
  data?: NvidiaModel[]
}

const NVIDIA_MODEL_CATALOG_URL =
  getProviderEndpoint('nvidia', 'modelCatalogUrl') ?? 'https://integrate.api.nvidia.com/v1/models'

function normalizeSearchText(value: string | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCaseModelId(modelId: string): string {
  const lastSegment = modelId.split('/').pop() || modelId
  return lastSegment
    .replace(/[-_.]+/g, ' ')
    .replace(/\bm\b/i, 'M')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isNvidiaChatModel(modelId: string): boolean {
  const haystack = modelId.toLowerCase()
  return !/(embed|embedding|rerank|retrieval|guard|safety|flux|stable-diffusion|diffusion|image-detection|protein|cuopt|weather|corrdiff|fourcastnet)/.test(
    haystack
  )
}

export async function fetchNvidiaModels(
  apiKey: string,
  signal?: AbortSignal
): Promise<NvidiaModel[]> {
  const bridged = await listProviderModelsThroughMain<NvidiaModel>('nvidia', signal)
  if (bridged) return bridged
  if (!apiKey?.trim()) {
    throw new Error('NVIDIA API key is required to fetch catalog models.')
  }

  const response = await fetch(NVIDIA_MODEL_CATALOG_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch NVIDIA models: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as NvidiaModelListResponse | NvidiaModel[]
  const rawModels = Array.isArray(payload) ? payload : payload.data || []
  const byId = new Map<string, NvidiaModel>()

  for (const model of rawModels) {
    if (!model || typeof model.id !== 'string') continue
    const id = model.id.trim()
    if (!id || byId.has(id)) continue
    byId.set(id, { ...model, id })
  }

  return [...byId.values()].filter((model) => isNvidiaChatModel(model.id))
}

export function mapNvidiaModelToConfiguredModel(apiModel: NvidiaModel): ConfiguredModel {
  const id = apiModel.id.trim()

  return {
    code: id,
    displayName: titleCaseModelId(id),
    inputModalities: ['text'],
    outputModalities: ['text'],
    modelType: 'chat',
  }
}

export function searchNvidiaModels(models: NvidiaModel[], query: string): NvidiaModel[] {
  if (!query.trim()) return models

  const normalizedQuery = normalizeSearchText(query)
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)

  return models.filter((model) => {
    const haystack = normalizeSearchText([model.id, model.owned_by].filter(Boolean).join(' '))
    return (
      haystack.includes(normalizedQuery) || queryTokens.every((token) => haystack.includes(token))
    )
  })
}
