import type { ConfiguredModel } from '../contexts/SettingsConfigContext'
import { getProviderEndpoint } from '../providers'

export interface AlibabaCatalogModel {
  id: string
  displayName: string
  description?: string
  category?: string
  launchDate?: string
  maxContext?: number
  inputModalities?: string[]
  outputModalities?: string[]
  supportsToolCall?: boolean
  supportsVision?: boolean
  supportsDeepThinking?: boolean
  supportsImageGeneration?: boolean
  supportsVideoRecognition?: boolean
}

interface AlibabaCatalogPageModel {
  modelId?: string
  name?: string
  feature?: string
  description?: string
  modelType?: string
  launchDate?: string
  order?: string
}

const ALIBABA_MODEL_CATALOG_URL =
  getProviderEndpoint('alibaba', 'modelCatalogUrl') ?? 'https://modelstudio.alibabacloud.com/'

const NEXT_FLIGHT_PAYLOAD_PATTERN = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g
const QWEN_REASONING_PATTERNS = [/\breason(?:ing)?\b/i, /\bthinking\b/i, /\bmax\b/i, /\bqwq\b/i]

function decodeNextFlightPayload(payload: string): unknown {
  try {
    const decoded = JSON.parse(`"${payload}"`) as string
    const colonIndex = decoded.indexOf(':')
    const jsonPayload = colonIndex >= 0 ? decoded.slice(colonIndex + 1).trim() : decoded.trim()
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

function parseCatalogPayload(html: string): AlibabaCatalogPageModel[] {
  const models: AlibabaCatalogPageModel[] = []

  for (const match of html.matchAll(NEXT_FLIGHT_PAYLOAD_PATTERN)) {
    const payload = decodeNextFlightPayload(match[1] ?? '')
    if (!Array.isArray(payload) || payload.length < 4) continue

    const payloadData = payload[3]
    if (!payloadData || typeof payloadData !== 'object' || !('data' in payloadData)) continue

    const groupedData = (payloadData as { data?: Record<string, AlibabaCatalogPageModel[]> }).data
    if (!groupedData || typeof groupedData !== 'object') continue

    const pageModels = Object.values(groupedData)
      .flat()
      .filter((model): model is AlibabaCatalogPageModel =>
        Boolean(model && typeof model === 'object' && model.modelId && model.name)
      )

    if (pageModels.length > 0) {
      models.push(...pageModels)
    }
  }

  return models
}

function normalizeSearchText(value: string | undefined): string {
  if (!value) return ''

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferContextFromText(...values: Array<string | undefined>): number | undefined {
  const haystack = values.filter(Boolean).join(' ')

  const millionMatch = haystack.match(/\b(\d+(?:\.\d+)?)\s*m(?:illion)?[- ]context\b/i)
  if (millionMatch) {
    const value = Number.parseFloat(millionMatch[1] ?? '')
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * 1_000_000)
    }
  }

  const thousandMatch = haystack.match(/\b(\d+(?:\.\d+)?)\s*k[- ]context\b/i)
  if (thousandMatch) {
    const value = Number.parseFloat(thousandMatch[1] ?? '')
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * 1_000)
    }
  }

  return undefined
}

function uniqueModalities(...groups: Array<string[] | undefined>): string[] {
  return [...new Set(groups.flat().filter((value): value is string => Boolean(value)))]
}

function inferCapabilities(
  model: AlibabaCatalogPageModel
): Omit<
  AlibabaCatalogModel,
  'id' | 'displayName' | 'description' | 'category' | 'launchDate' | 'maxContext'
> {
  const featureText = model.feature ?? ''
  const description = model.description ?? ''
  const name = model.name ?? ''
  const combined = `${name} ${featureText} ${description}`

  const hasVisualUnderstanding =
    /\bvisual\b/i.test(featureText) ||
    /\bvision-language\b/i.test(description) ||
    /\bnative multimodal\b/i.test(description)
  const hasVideoUnderstanding = /\bvideo analysis\b/i.test(description)
  const hasImageGeneration =
    /\bimage generation\b/i.test(featureText) ||
    /\bimage edit\b/i.test(featureText) ||
    /\btext to image\b/i.test(description)
  const hasToolUse =
    /\btool interaction/i.test(description) ||
    /\bagentic coding\b/i.test(description) ||
    /\bcoding\b/i.test(featureText)
  const hasReasoning = QWEN_REASONING_PATTERNS.some((pattern) => pattern.test(combined))

  const inputModalities = uniqueModalities(
    ['text'],
    hasVisualUnderstanding || hasImageGeneration || hasVideoUnderstanding ? ['image'] : undefined,
    hasVideoUnderstanding ? ['video'] : undefined
  )
  const outputModalities = uniqueModalities(
    hasImageGeneration ? ['image'] : undefined,
    !hasImageGeneration ? ['text'] : undefined
  )

  return {
    inputModalities,
    outputModalities,
    supportsToolCall: hasToolUse,
    supportsVision: hasVisualUnderstanding || hasImageGeneration || hasVideoUnderstanding,
    supportsDeepThinking: hasReasoning,
    supportsImageGeneration: hasImageGeneration,
    supportsVideoRecognition: hasVideoUnderstanding,
  }
}

function compareCatalogModels(a: AlibabaCatalogPageModel, b: AlibabaCatalogPageModel): number {
  const orderA = Number.parseFloat(a.order ?? '')
  const orderB = Number.parseFloat(b.order ?? '')

  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
    return orderA - orderB
  }

  return (a.name ?? '').localeCompare(b.name ?? '')
}

export async function fetchAlibabaModels(apiKey: string): Promise<AlibabaCatalogModel[]> {
  if (!apiKey?.trim()) {
    throw new Error('Alibaba API key is required to fetch catalog models.')
  }

  const response = await fetch(ALIBABA_MODEL_CATALOG_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'text/html',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Alibaba models: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const rawModels = parseCatalogPayload(html)

  if (rawModels.length === 0) {
    throw new Error('Alibaba catalog did not expose any models in the expected page payload.')
  }

  return rawModels
    .filter((model) => {
      const modelId = model.modelId?.trim().toLowerCase()
      const name = model.name?.trim().toLowerCase()
      return Boolean(modelId?.startsWith('qwen') || name?.startsWith('qwen'))
    })
    .sort(compareCatalogModels)
    .map((model) => {
      const capabilities = inferCapabilities(model)
      return {
        id: model.modelId!.trim(),
        displayName: model.name!.trim(),
        description: model.description?.trim(),
        category: model.modelType?.trim(),
        launchDate: model.launchDate?.trim(),
        maxContext: inferContextFromText(model.description, model.feature, model.name),
        ...capabilities,
      }
    })
}

export function mapAlibabaModelToConfiguredModel(apiModel: AlibabaCatalogModel): ConfiguredModel {
  const inputModalities = apiModel.inputModalities ?? ['text']
  const outputModalities = apiModel.outputModalities ?? ['text']

  let modelType: ConfiguredModel['modelType'] = 'chat'
  if (apiModel.supportsImageGeneration) {
    modelType = 'image'
  } else if (apiModel.supportsVideoRecognition) {
    modelType = 'video'
  } else if (apiModel.supportsDeepThinking) {
    modelType = 'reasoning'
  }

  return {
    code: apiModel.id,
    displayName: apiModel.displayName,
    description: apiModel.description,
    maxContext: apiModel.maxContext,
    inputModalities,
    outputModalities,
    modelType,
    supportsToolCall: apiModel.supportsToolCall,
    supportsVision: apiModel.supportsVision,
    supportsDeepThinking: apiModel.supportsDeepThinking,
    supportsImageGeneration: apiModel.supportsImageGeneration,
    supportsVideoRecognition: apiModel.supportsVideoRecognition,
  }
}

export function searchAlibabaModels(
  models: AlibabaCatalogModel[],
  query: string
): AlibabaCatalogModel[] {
  if (!query.trim()) return models

  const normalizedQuery = normalizeSearchText(query)
  const queryTokens = normalizedQuery.split(' ').filter(Boolean)

  return models.filter((model) => {
    const haystack = normalizeSearchText(
      [model.id, model.displayName, model.description, model.category].filter(Boolean).join(' ')
    )

    return (
      haystack.includes(normalizedQuery) || queryTokens.every((token) => haystack.includes(token))
    )
  })
}

const ALIBABA_THINKING_MODEL_PATTERNS = [/\bqwq[-_]/i, /\bqwen3\.5[-_]/i, /\bqwen3[-_]/i]

export function inferAlibabaSupportsDeepThinking(
  model:
    | Pick<ConfiguredModel, 'code' | 'displayName' | 'supportsDeepThinking'>
    | { code?: string; displayName?: string; supportsDeepThinking?: boolean }
    | null
    | undefined
): boolean {
  if (!model) return false
  if (model.supportsDeepThinking === true) return true

  const haystack = [model.code, model.displayName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')

  if (!haystack) return false

  return ALIBABA_THINKING_MODEL_PATTERNS.some((pattern) => pattern.test(haystack))
}
