import type { ConfiguredModel } from '../contexts/SettingsConfigContext'
import { getProviderEndpoint } from '../providers'

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

export async function fetchNvidiaModels(apiKey: string): Promise<NvidiaModel[]> {
  if (!apiKey?.trim()) {
    throw new Error('NVIDIA API key is required to fetch catalog models.')
  }

  const response = await fetch(NVIDIA_MODEL_CATALOG_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
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
  const lowerId = id.toLowerCase()
  const isMiniMaxM3 = lowerId === 'minimaxai/minimax-m3'
  const supportsVision = isMiniMaxM3 || /\b(vl|vision|visual|multimodal|m3|vila|llava)\b/i.test(id)
  const supportsVideo = isMiniMaxM3 || /\b(video|m3)\b/i.test(id)
  const supportsReasoning =
    isMiniMaxM3 || /\b(reason|reasoning|thinking|r1|qwq|nemotron|m3)\b/i.test(id)
  const supportsImageGeneration = /\b(image|flux|stable-diffusion|sdxl)\b/i.test(id)

  let modelType: ConfiguredModel['modelType'] = 'chat'
  if (supportsImageGeneration) {
    modelType = 'image'
  } else if (supportsReasoning) {
    modelType = 'reasoning'
  } else if (supportsVideo) {
    modelType = 'video'
  }

  return {
    code: id,
    displayName: isMiniMaxM3 ? 'MiniMax M3' : titleCaseModelId(id),
    maxContext: isMiniMaxM3 ? 1048576 : undefined,
    inputModalities: supportsVision
      ? ['text', 'image', ...(supportsVideo ? ['video'] : [])]
      : ['text'],
    outputModalities: ['text'],
    modelType,
    supportsToolCall: true,
    supportsVision,
    supportsDeepThinking: supportsReasoning,
    supportsImageGeneration,
    supportsVideoRecognition: supportsVideo,
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
