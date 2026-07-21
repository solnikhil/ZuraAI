import type {
  DeepSeekReasoningEffort,
  SettingsConfig,
} from '../../../contexts/SettingsConfigContext'
import type { Settings } from '../../../contexts/settingsStore'
import {
  DEEPSEEK_REASONING_EFFORTS,
  getDeepseekReasoning,
  setDeepseekReasoningEffort,
} from '../../../utils/deepseekReasoning'
import type { ModelWithProvider } from './types'

export interface ModelSelectorReasoning {
  show: boolean
  enabled: boolean
  effort: DeepSeekReasoningEffort
  efforts: readonly DeepSeekReasoningEffort[]
  compactLabel: string
  settingsPatch: (effort: DeepSeekReasoningEffort) => Partial<SettingsConfig>
}

export function getModelSelectorReasoning(
  settings: Settings,
  currentModel?: ModelWithProvider
): ModelSelectorReasoning {
  const deepseek = getDeepseekReasoning(settings, settings.aiModel)
  const isDeepseek = settings.modelProvider === 'deepseek'
  const isOpenRouter =
    settings.modelProvider === 'openrouter' &&
    currentModel?.openRouterReasoningDetected === true &&
    currentModel.supportsDeepThinking === true
  const isNvidia =
    settings.modelProvider === 'nvidia' && currentModel?.supportsDeepThinking === true
  const isCodex = settings.modelProvider === 'codex' && currentModel?.supportsDeepThinking === true
  const codexEfforts =
    currentModel?.supportedReasoningEfforts?.filter((effort) => effort !== 'none') ??
    DEEPSEEK_REASONING_EFFORTS.filter((effort) => effort !== 'none')
  const storedCodexEffort = settings.codexReasoningEffort?.[settings.aiModel] ?? 'high'
  const codexEffort =
    storedCodexEffort !== 'none' && codexEfforts.includes(storedCodexEffort)
      ? storedCodexEffort
      : codexEfforts.includes('high')
        ? 'high'
        : (codexEfforts[0] ?? 'high')
  const effort = isOpenRouter
    ? settings.openRouterReasoningEffort?.[settings.aiModel] || 'high'
    : isCodex
      ? codexEffort
      : isNvidia
        ? settings.nvidiaReasoningEffort?.[settings.aiModel] || 'high'
        : deepseek.effort
  const show = (isDeepseek && deepseek.enabled) || isOpenRouter || isNvidia || isCodex

  return {
    show,
    enabled: effort !== 'none',
    effort,
    efforts: isCodex ? codexEfforts : DEEPSEEK_REASONING_EFFORTS,
    compactLabel:
      effort === 'xhigh' ? 'XH' : effort === 'none' ? 'N' : effort.charAt(0).toUpperCase(),
    settingsPatch: (nextEffort) => {
      if (isOpenRouter) {
        return {
          openRouterReasoningEffort: {
            ...(settings.openRouterReasoningEffort ?? {}),
            [settings.aiModel]: nextEffort,
          },
        }
      }
      if (isNvidia) {
        return {
          nvidiaReasoningEffort: {
            ...(settings.nvidiaReasoningEffort ?? {}),
            [settings.aiModel]: nextEffort,
          },
        }
      }
      if (isCodex) {
        return {
          codexReasoningEffort: {
            ...(settings.codexReasoningEffort ?? {}),
            [settings.aiModel]: nextEffort,
          },
        }
      }
      return setDeepseekReasoningEffort(settings, settings.aiModel, nextEffort)
    },
  }
}
