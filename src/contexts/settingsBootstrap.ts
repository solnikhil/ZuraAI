import {
  checkOllamaStatus,
  enrichOllamaModelsWithContext,
  listOllamaModels,
} from '../services/ollama'
import {
  loadApiKeyPresenceFromSecureStorage,
  migrateApiKeysFromLocalStorage,
} from '../utils/secureApiKeys'

export interface StartupOllamaModel {
  code: string
  displayName: string
  maxContext?: number
}

export async function loadSecureSettingPresence(
  currentSettings: Record<string, string | undefined>,
  secureSettingNames: readonly string[]
): Promise<Record<string, string>> {
  await migrateApiKeysFromLocalStorage(currentSettings)
  const presence = await loadApiKeyPresenceFromSecureStorage()
  const presenceRecord = presence as unknown as Record<string, string | undefined>

  return Object.fromEntries(
    secureSettingNames.map((key) => [
      key,
      typeof presenceRecord[key] === 'string' ? presenceRecord[key] : '',
    ])
  )
}

export async function discoverStartupOllamaModels(
  ollamaUrl: string
): Promise<StartupOllamaModel[]> {
  if (!(await checkOllamaStatus(ollamaUrl))) return []

  const models = await listOllamaModels(ollamaUrl)
  if (models.length === 0) return []

  const formatted = models.map((model) => ({
    code: model.name,
    displayName: `${model.name} (${model.details.parameter_size})`,
    ...('maxContext' in model && typeof model.maxContext === 'number'
      ? { maxContext: model.maxContext }
      : {}),
  }))

  return enrichOllamaModelsWithContext(ollamaUrl, formatted)
}

export async function syncReminderExtensionState(enabled: boolean): Promise<void> {
  await window.scheduledTasks?.setExtensionEnabled(enabled)
}
