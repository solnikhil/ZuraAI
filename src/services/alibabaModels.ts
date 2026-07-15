import type { ConfiguredModel } from '../contexts/SettingsConfigContext'

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

/**
 * Alibaba does not document an OpenAI-compatible model-list endpoint. Keep the
 * picker deliberately small and versioned instead of scraping Model Studio's
 * private Next.js payload or guessing capabilities from marketing copy.
 *
 * Sources reviewed 2026-07-15:
 * - https://www.alibabacloud.com/help/en/model-studio/models
 * - https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling
 * - https://www.alibabacloud.com/help/en/model-studio/deep-thinking
 */
export const ALIBABA_CURATED_MODELS: readonly AlibabaCatalogModel[] = Object.freeze([
  {
    id: 'qwen3.7-max',
    displayName: 'Qwen3.7-Max',
    description: 'Flagship Qwen text model with hybrid thinking and function calling.',
    category: 'Text generation',
    maxContext: 1_000_000,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsToolCall: true,
    supportsVision: false,
    supportsDeepThinking: true,
  },
  {
    id: 'qwen3.7-plus',
    displayName: 'Qwen3.7-Plus',
    description: 'General-purpose Qwen model with vision, hybrid thinking, and function calling.',
    category: 'Multimodal generation',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    supportsToolCall: true,
    supportsVision: true,
    supportsDeepThinking: true,
  },
  {
    id: 'qwen3.6-flash',
    displayName: 'Qwen3.6-Flash',
    description: 'Cost-efficient Qwen text model with hybrid thinking and function calling.',
    category: 'Text generation',
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportsToolCall: true,
    supportsVision: false,
    supportsDeepThinking: true,
  },
  {
    id: 'qwen3.5-omni-plus',
    displayName: 'Qwen3.5-Omni-Plus',
    description: 'Multimodal Qwen model for text, image, audio, and video understanding.',
    category: 'Multimodal generation',
    inputModalities: ['text', 'image', 'audio', 'video'],
    outputModalities: ['text'],
    supportsToolCall: true,
    supportsVision: true,
    supportsDeepThinking: false,
    supportsVideoRecognition: true,
  },
  {
    id: 'qwen3-vl-plus',
    displayName: 'Qwen3-VL-Plus',
    description: 'Vision-language Qwen model with documented function-calling support.',
    category: 'Visual understanding',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    supportsToolCall: true,
    supportsVision: true,
    supportsDeepThinking: false,
    supportsVideoRecognition: true,
  },
])

function normalizeSearchText(value: string | undefined): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchAlibabaModels(): Promise<AlibabaCatalogModel[]> {
  return ALIBABA_CURATED_MODELS.map((model) => ({ ...model }))
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

export function inferAlibabaSupportsDeepThinking(
  model: Pick<ConfiguredModel, 'supportsDeepThinking'> | null | undefined
): boolean {
  return model?.supportsDeepThinking === true
}
