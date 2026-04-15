type ModelOption = { code: string; displayName: string }

export interface ModelDisplaySettingsLike {
  aiModel?: string
  configuredModels?: ModelOption[]
  ollamaModels?: ModelOption[]
  perplexityModels?: ModelOption[]
  groqModels?: ModelOption[]
  alibabaModels?: ModelOption[]
  fireworksModels?: ModelOption[]
}

export function getModelDisplayName(settings: ModelDisplaySettingsLike): string {
  const allModels: ModelOption[] = [
    ...(settings.ollamaModels || []),
    ...(settings.perplexityModels || []),
    ...(settings.configuredModels || []),
    ...(settings.groqModels || []),
    ...(settings.alibabaModels || []),
    ...(settings.fireworksModels || []),
  ]

  const currentModel = allModels.find((model) => model.code === settings.aiModel)
  return currentModel?.displayName || settings.aiModel?.split('/').pop() || 'Auto'
}
