import { getProviderModelListFields, type ProviderModelListKey } from './index'

type ModelOption = { code: string; displayName: string }

export interface ModelDisplaySettingsLike {
  aiModel?: string
  configuredModels?: ModelOption[]
  ollamaModels?: ModelOption[]
  perplexityModels?: ModelOption[]
  groqModels?: ModelOption[]
  alibabaModels?: ModelOption[]
  fireworksModels?: ModelOption[]
  nvidiaModels?: ModelOption[]
  deepseekModels?: ModelOption[]
  opencodeModels?: ModelOption[]
}

export function getModelDisplayName(settings: ModelDisplaySettingsLike): string {
  const allModels: ModelOption[] = getProviderModelListFields().flatMap((field) => {
    return (settings[field as ProviderModelListKey] || []) as ModelOption[]
  })

  const currentModel = allModels.find((model) => model.code === settings.aiModel)
  return currentModel?.displayName || settings.aiModel?.split('/').pop() || 'Auto'
}
