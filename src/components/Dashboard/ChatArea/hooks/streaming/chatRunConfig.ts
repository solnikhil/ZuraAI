import type { Settings } from '../../../../../contexts/settingsStore'
import { inferAlibabaSupportsDeepThinking } from '../../../../../services/alibabaModels'
import { inferOpenRouterSupportsDeepThinking } from '../../../../../services/openrouterModels'
import { getDeepseekReasoning } from '../../../../../utils/deepseekReasoning'
import type { ProviderStreamingRunOptions } from './useProviderStreaming'
import type { StreamingSettings } from './types'

export function buildStreamingSettings(settings: Settings): StreamingSettings {
  return {
    aiModel: settings.aiModel,
    modelProvider: settings.modelProvider,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    streamResponses: settings.streamResponses,
    webSearchPrompt: settings.webSearchPrompt,
    ollamaUrl: settings.ollamaUrl,
    openRouterDebug: settings.openRouterDebug,
    openRouterApiKey: settings.openRouterApiKey,
    configuredModels: settings.configuredModels,
    alibabaModels: settings.alibabaModels,
    alibabaRegion: settings.alibabaRegion,
    groqApiKey: settings.groqApiKey,
    alibabaApiKey: settings.alibabaApiKey,
    deepseekApiKey: settings.deepseekApiKey,
    opencodeGoApiKey: settings.opencodeGoApiKey,
    fireworksApiKey: settings.fireworksApiKey,
    nvidiaApiKey: settings.nvidiaApiKey,
    nvidiaModels: settings.nvidiaModels,
  }
}

type ProviderRunCapabilities = Pick<
  ProviderStreamingRunOptions,
  'modalities' | 'reasoning' | 'enableThinking' | 'reasoningEffort'
>

export function buildProviderRunCapabilities(
  settings: Settings,
  options: { includeImageModalities?: boolean } = {}
): ProviderRunCapabilities {
  const openRouterModel =
    settings.modelProvider === 'openrouter'
      ? settings.configuredModels?.find((model) => model.code === settings.aiModel)
      : undefined
  const reasoning =
    settings.modelProvider === 'openrouter' &&
    inferOpenRouterSupportsDeepThinking(
      openRouterModel || { code: settings.aiModel, displayName: settings.aiModel }
    )
      ? { enabled: true, effort: settings.openRouterReasoningEffort?.[settings.aiModel] }
      : undefined
  const modalities =
    options.includeImageModalities && openRouterModel?.supportsImageGeneration
      ? openRouterModel.outputModalities?.filter(
          (modality): modality is 'text' | 'image' => modality === 'text' || modality === 'image'
        ) || ['image', 'text']
      : undefined

  const alibabaModel =
    settings.modelProvider === 'alibaba'
      ? (settings.alibabaModels || []).find((model) => model.code === settings.aiModel)
      : undefined
  const alibabaEnableThinking =
    settings.modelProvider === 'alibaba' &&
    inferAlibabaSupportsDeepThinking(
      alibabaModel || { code: settings.aiModel, displayName: settings.aiModel }
    )
      ? true
      : undefined

  const deepseekReasoning =
    settings.modelProvider === 'deepseek'
      ? getDeepseekReasoning(settings, settings.aiModel)
      : undefined

  const nvidiaModel =
    settings.modelProvider === 'nvidia'
      ? (settings.nvidiaModels || []).find((model) => model.code === settings.aiModel)
      : undefined
  const nvidiaReasoningEffort =
    settings.modelProvider === 'nvidia'
      ? (settings.nvidiaReasoningEffort?.[settings.aiModel] ?? 'high')
      : undefined
  const nvidiaEnableThinking =
    settings.modelProvider === 'nvidia'
      ? nvidiaReasoningEffort !== 'none' &&
        (nvidiaModel?.supportsDeepThinking ||
          /(?:reason|thinking|m3|nemotron)/i.test(settings.aiModel))
      : undefined

  const codexReasoningEffort =
    settings.modelProvider === 'codex'
      ? (settings.codexReasoningEffort?.[settings.aiModel] ?? 'high')
      : undefined

  return {
    modalities,
    reasoning,
    enableThinking: deepseekReasoning
      ? deepseekReasoning.enabled && deepseekReasoning.effort !== 'none'
      : (nvidiaEnableThinking ?? alibabaEnableThinking),
    reasoningEffort:
      codexReasoningEffort && codexReasoningEffort !== 'none'
        ? codexReasoningEffort
        : deepseekReasoning?.enabled && deepseekReasoning.effort !== 'none'
          ? deepseekReasoning.effort
          : undefined,
  }
}
