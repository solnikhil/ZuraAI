/**
 * OpenRouter Models API Service
 * Fetches models from OpenRouter API and maps them to ConfiguredModel format
 *
 */

import type { ConfiguredModel } from '../contexts/SettingsConfigContext'
import { getProviderEndpoint } from '../providers'

/**
 * OpenRouter API model response structure
 */
export interface OpenRouterModel {
  id: string
  name: string
  description?: string
  context_length?: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
    tokenizer?: string
    instruct_type?: string | null
  }
  pricing?: {
    prompt?: string
    completion?: string
    request?: string
    image?: string
    web_search?: string
    internal_reasoning?: string
  }
  supported_parameters?: string[]
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
}

/**
 * OpenRouter API response structure
 */
export interface OpenRouterModelsResponse {
  data: OpenRouterModel[]
}

/**
 * Fetch models from OpenRouter API
 *
 * @param apiKey - Optional API key (required for some models, optional for public catalog)
 * @returns Promise resolving to array of OpenRouter models
 */
export async function fetchOpenRouterModels(apiKey?: string): Promise<OpenRouterModel[]> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(getProviderEndpoint('openrouter', 'modelCatalogUrl')!, {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`)
  }

  const data: OpenRouterModelsResponse = await response.json()
  return data.data || []
}

/**
 * Map OpenRouter API model to ConfiguredModel format with capabilities
 *
 * @param apiModel - OpenRouter API model response
 * @returns ConfiguredModel with mapped capabilities
 */
export function mapOpenRouterModelToConfiguredModel(apiModel: OpenRouterModel): ConfiguredModel {
  const supportedParams = apiModel.supported_parameters || []
  const inputModalities = apiModel.architecture?.input_modalities || []
  const outputModalities = apiModel.architecture?.output_modalities || []
  const pricing = apiModel.pricing || {}

  const supportsToolCall = supportedParams.includes('tools')
  const supportsVision = inputModalities.includes('image')
  const supportsDeepThinking =
    supportedParams.includes('reasoning') || supportedParams.includes('include_reasoning')
  const supportsWebSearch = pricing.web_search != null && pricing.web_search !== '0'
  const supportsImageGeneration = outputModalities.includes('image')
  const supportsVideoRecognition = inputModalities.includes('video')

  let modelType: ConfiguredModel['modelType'] = 'chat'
  if (supportsImageGeneration) {
    modelType = 'image'
  } else if (supportsVideoRecognition) {
    modelType = 'video'
  } else if (supportsDeepThinking) {
    modelType = 'reasoning'
  }

  return {
    code: apiModel.id,
    displayName: apiModel.name,
    description: apiModel.description,
    maxContext: apiModel.context_length || apiModel.top_provider?.context_length,
    inputModalities,
    outputModalities,
    modelType,
    supportsToolCall,
    supportsVision,
    supportsDeepThinking,
    supportsWebSearch,
    supportsImageGeneration,
    supportsVideoRecognition,
    extendedParameters: supportedParams.filter(
      (param) =>
        param !== 'tools' &&
        param !== 'reasoning' &&
        param !== 'include_reasoning' &&
        ['temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty'].includes(
          param
        )
    ),
  }
}

/**
 * Search OpenRouter models by query
 *
 * @param models - Array of OpenRouter models
 * @param query - Search query string
 * @returns Filtered array of models matching the query
 */
export function searchOpenRouterModels(
  models: OpenRouterModel[],
  query: string
): OpenRouterModel[] {
  if (!query.trim()) return models

  const lowerQuery = query.toLowerCase()
  return models.filter(
    (model) =>
      model.name.toLowerCase().includes(lowerQuery) ||
      model.id.toLowerCase().includes(lowerQuery) ||
      model.description?.toLowerCase().includes(lowerQuery)
  )
}
