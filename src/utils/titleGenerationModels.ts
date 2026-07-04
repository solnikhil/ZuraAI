import type { ConfiguredModel } from '../contexts/SettingsConfigContext'

function normalizeModalities(modalities?: string[]): string[] {
  if (!Array.isArray(modalities)) return []
  return modalities
    .filter(
      (modality): modality is string => typeof modality === 'string' && modality.trim().length > 0
    )
    .map((modality) => modality.trim().toLowerCase())
}

export function isModelEligibleForTitleGeneration(model: ConfiguredModel): boolean {
  const outputModalities = normalizeModalities(model.outputModalities)
  if (outputModalities.length > 0) {
    return outputModalities.includes('text')
  }

  if (
    model.modelType === 'image' ||
    model.modelType === 'video' ||
    model.modelType === 'embedding'
  ) {
    return false
  }

  return true
}

export function getTitleEligibleModels(models: ConfiguredModel[]): ConfiguredModel[] {
  const seenCodes = new Set<string>()
  const eligibleModels: ConfiguredModel[] = []

  for (const model of models) {
    if (!model || typeof model.code !== 'string') continue

    const normalizedCode = model.code.trim()
    if (!normalizedCode || seenCodes.has(normalizedCode)) continue

    seenCodes.add(normalizedCode)
    if (!isModelEligibleForTitleGeneration(model)) continue

    eligibleModels.push({
      ...model,
      code: normalizedCode,
    })
  }

  return eligibleModels
}
