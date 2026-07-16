/**
 * Curated OpenCode Go transport metadata.
 *
 * Snapshot date: 2026-07-17
 * Source: the documented OpenCode Go catalog served by `/zen/go/v1/models`,
 * combined with the provider's documented per-family transport requirements.
 * The model-list response does not currently expose protocol or reasoning
 * capabilities, so these values live in the provider catalog rather than in
 * runtime dispatch code.
 */
export type OpencodeProtocol = 'openai-chat-completions' | 'anthropic-messages'

export interface OpencodeModelMetadata {
  displayName: string
  protocol: OpencodeProtocol
  supportsTools: boolean
  supportsReasoning: boolean
}

const OPENAI = 'openai-chat-completions' satisfies OpencodeProtocol
const ANTHROPIC = 'anthropic-messages' satisfies OpencodeProtocol

export const OPENCODE_MODEL_CATALOG = {
  'deepseek-v4-pro': ['DeepSeek V4 Pro', OPENAI, true, true],
  'deepseek-v4-flash': ['DeepSeek V4 Flash', OPENAI, true, true],
  'kimi-k2.7-code': ['Kimi K2.7 Code', OPENAI, true, true],
  'kimi-k2.6': ['Kimi K2.6', OPENAI, true, true],
  'kimi-k2.5': ['Kimi K2.5', OPENAI, true, true],
  'glm-5.2': ['GLM 5.2', OPENAI, true, true],
  'glm-5.1': ['GLM 5.1', OPENAI, true, true],
  'glm-5': ['GLM 5', OPENAI, true, true],
  'qwen3.7-plus': ['Qwen3.7 Plus', ANTHROPIC, true, true],
  'qwen3.7-max': ['Qwen3.7 Max', ANTHROPIC, true, true],
  'qwen3.6-plus': ['Qwen3.6 Plus', ANTHROPIC, true, true],
  'qwen3.5-plus': ['Qwen3.5 Plus', OPENAI, true, true],
  'minimax-m3': ['MiniMax M3', ANTHROPIC, true, true],
  'minimax-m2.7': ['MiniMax M2.7', ANTHROPIC, true, true],
  'minimax-m2.5': ['MiniMax M2.5', ANTHROPIC, true, true],
  'mimo-v2-pro': ['MiMo-V2-Pro', OPENAI, true, false],
  'mimo-v2-omni': ['MiMo-V2-Omni', OPENAI, true, false],
  'mimo-v2.5': ['MiMo-V2.5', OPENAI, true, false],
  'mimo-v2.5-pro': ['MiMo-V2.5-Pro', OPENAI, true, false],
  'hy3-preview': ['HY3 Preview', OPENAI, true, true],
} as const satisfies Record<string, readonly [string, OpencodeProtocol, boolean, boolean]>

export function getOpencodeModelMetadata(modelId: string): OpencodeModelMetadata | undefined {
  const entry = OPENCODE_MODEL_CATALOG[modelId as keyof typeof OPENCODE_MODEL_CATALOG]
  if (!entry) return undefined

  return {
    displayName: entry[0],
    protocol: entry[1],
    supportsTools: entry[2],
    supportsReasoning: entry[3],
  }
}
