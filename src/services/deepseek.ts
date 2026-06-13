import { ChatMessage, ToolDefinition, parseErrorResponse, extractErrorMessage } from './types'
import { parseSSEStream } from './streamUtils'
import { getProviderEndpoint } from '../providers'

const DEEPSEEK_BASE_URL =
    getProviderEndpoint('deepseek', 'baseUrl') ??
    'https://api.deepseek.com'

export interface DeepSeekResponse {
    id: string
    object: string
    created: number
    model: string
    choices: {
        index: number
        message: {
            role: string
            content: string | null
            reasoning_content?: string | null
            tool_calls?: Array<{
                id: string
                type: 'function'
                function: {
                    name: string
                    arguments: string
                }
            }>
        }
        finish_reason: string | null
        logprobs?: unknown
    }[]
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        prompt_cache_hit_tokens?: number
        prompt_cache_miss_tokens?: number
        cache_creation_input_tokens?: number
        cache_write_input_tokens?: number
        completion_tokens_details?: {
            reasoning_tokens?: number
        }
    }
    system_fingerprint?: string
}

export interface DeepSeekStreamChunk {
    id: string
    object: string
    created: number
    model: string
    choices: Array<{
        index: number
        delta?: {
            content?: string | null
            reasoning_content?: string | null
            role?: string
            tool_calls?: Array<{
                index?: number
                id?: string
                type?: 'function'
                function?: {
                    name?: string
                    arguments?: string
                }
            }>
            logprobs?: unknown
        }
        finish_reason?: string | null
    }>
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
        prompt_cache_hit_tokens?: number
        prompt_cache_miss_tokens?: number
        cache_creation_input_tokens?: number
        cache_write_input_tokens?: number
        completion_tokens_details?: {
            reasoning_tokens?: number
        }
    }
}

interface DeepSeekRequestBody {
    model: string
    messages: DeepSeekMessage[]
    stream?: boolean
    stream_options?: { include_usage?: boolean }
    temperature?: number
    max_tokens?: number | null
    tools?: ToolDefinition[]
    tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
    thinking?: {
        type: 'enabled' | 'disabled'
        reasoning_effort?: 'high' | 'max'
    }
    response_format?: { type: 'text' | 'json_object' }
    stop?: string | string[]
    user_id?: string
}

interface DeepSeekMessage {
    role: string
    content: string | null
    reasoning_content?: string | null
    tool_calls?: Array<{
        id: string
        type: 'function'
        function: {
            name: string
            arguments: string
        }
    }>
    tool_call_id?: string
    name?: string
    prefix?: boolean
}

type DeepSeekToolChoice = NonNullable<DeepSeekRequestBody['tool_choice']>

function normalizeDeepSeekToolChoice(
    toolChoice: DeepSeekToolChoice | undefined
): DeepSeekToolChoice {
    if (!toolChoice) return 'auto'

    // DeepSeek rejects OpenAI's forced single-function object form for reasoner
    // models. Keep tools available and let the prompt/tool schema drive the
    // call instead of failing the whole request with a 400.
    if (typeof toolChoice === 'object') {
        return 'auto'
    }

    return toolChoice
}

export function convertToDeepSeekMessages(messages: ChatMessage[]): DeepSeekMessage[] {
    return messages.map((msg) => {
        const dsMsg: DeepSeekMessage = {
            role: msg.role,
            content: typeof msg.content === 'string' ? msg.content : null,
        }

        if (msg.reasoning) {
            dsMsg.reasoning_content = msg.reasoning
        }

        const toolCalls = (msg as ChatMessage & { tool_calls?: DeepSeekMessage['tool_calls'] }).tool_calls
        if (toolCalls) {
            dsMsg.tool_calls = toolCalls
        }

        if (msg.tool_call_id) {
            dsMsg.tool_call_id = msg.tool_call_id
        }

        if (msg.name) {
            dsMsg.name = msg.name
        }

        return dsMsg
    })
}

export async function* streamDeepSeekCompletion(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
        onChunk?: (chunk: DeepSeekStreamChunk) => void
        signal?: AbortSignal
        enableThinking?: boolean
        reasoningEffort?: 'high' | 'max'
        jsonMode?: boolean
    }
): AsyncGenerator<DeepSeekStreamChunk, void, unknown> {
    if (!apiKey) {
        throw new Error("DeepSeek API Key is missing")
    }

    const requestBody: DeepSeekRequestBody = {
        model,
        messages: convertToDeepSeekMessages(messages),
        stream: true,
        stream_options: { include_usage: true }
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }
    if (options?.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = normalizeDeepSeekToolChoice(options.toolChoice)
    }

    // Thinking toggle: DeepSeek defaults to `enabled`, so we must send an
    // explicit `disabled` to turn reasoning off (e.g. memory extraction / title
    // generation). A strict `=== false` check means an omitted/undefined value
    // preserves DeepSeek's default behavior and never affects normal chat.
    if (options?.enableThinking === true) {
        requestBody.thinking = {
            type: 'enabled',
            ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
        }
    } else if (options?.enableThinking === false) {
        requestBody.thinking = { type: 'disabled' }
    }

    if (options?.jsonMode) {
        requestBody.response_format = { type: 'json_object' }
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
    })

    if (!response.ok) {
        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)

        if (response.status === 429) {
            throw new Error(`Rate limited by DeepSeek (429). Please try again in a moment. ${errorMessage}`)
        }

        throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
        throw new Error('Failed to get response reader')
    }

    yield* parseSSEStream<DeepSeekStreamChunk>(reader, {
        onChunk: options?.onChunk,
        providerName: 'DeepSeek',
    })
}

export const generateDeepSeekCompletion = async (
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    options?: {
        temperature?: number
        max_tokens?: number
        tools?: ToolDefinition[]
        toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }
        signal?: AbortSignal
        enableThinking?: boolean
        reasoningEffort?: 'high' | 'max'
        jsonMode?: boolean
    }
): Promise<DeepSeekResponse> => {
    if (!apiKey) {
        throw new Error("DeepSeek API Key is missing")
    }

    const requestBody: DeepSeekRequestBody = {
        model,
        messages: convertToDeepSeekMessages(messages),
    }

    if (options?.temperature !== undefined) {
        requestBody.temperature = options.temperature
    }
    if (options?.max_tokens !== undefined) {
        requestBody.max_tokens = options.max_tokens
    }
    if (options?.tools && options.tools.length > 0) {
        requestBody.tools = options.tools
        requestBody.tool_choice = normalizeDeepSeekToolChoice(options.toolChoice)
    }
    // Thinking toggle: DeepSeek defaults to `enabled`, so we must send an
    // explicit `disabled` to turn reasoning off (e.g. memory extraction / title
    // generation). A strict `=== false` check means an omitted/undefined value
    // preserves DeepSeek's default behavior and never affects normal chat.
    if (options?.enableThinking === true) {
        requestBody.thinking = {
            type: 'enabled',
            ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
        }
    } else if (options?.enableThinking === false) {
        requestBody.thinking = { type: 'disabled' }
    }
    if (options?.jsonMode) {
        requestBody.response_format = { type: 'json_object' }
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
    })

    if (!response.ok) {
        const errorText = await response.text()
        const errorData = parseErrorResponse(errorText)
        const errorMessage = extractErrorMessage(errorData, errorText, response.status, response.statusText)

        if (response.status === 429) {
            throw new Error(`Rate limited by DeepSeek (429). Please try again in a moment. ${errorMessage}`)
        }

        throw new Error(errorMessage)
    }

    return response.json() as Promise<DeepSeekResponse>
}

export interface DeepSeekModel {
    id: string
    object: string
    owned_by: string
}

export interface DeepSeekModelListResponse {
    object: 'list'
    data: DeepSeekModel[]
}

const DEEPSEEK_MODEL_ALIASES: Record<string, string> = {
    'deepseek-chat': 'deepseek-v4-flash',
    'deepseek-reasoner': 'deepseek-v4-pro',
}

export function getCanonicalDeepSeekModelId(modelId: string): string {
    return DEEPSEEK_MODEL_ALIASES[modelId] ?? modelId
}

export function isDeepSeekCompatibilityAlias(modelId: string): boolean {
    return modelId in DEEPSEEK_MODEL_ALIASES
}

export async function fetchDeepSeekModels(apiKey: string): Promise<DeepSeekModel[]> {
    if (!apiKey?.trim()) {
        throw new Error('Add a DeepSeek API key before loading the catalog.')
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/models`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch DeepSeek models: ${response.status} ${errorText}`)
    }

    const data = await response.json() as DeepSeekModelListResponse
    return data.data || []
}

export function mapDeepSeekModelToConfiguredModel(model: DeepSeekModel): import('../contexts/SettingsConfigContext').ConfiguredModel {
    const canonicalId = getCanonicalDeepSeekModelId(model.id)
    const isCompatibilityAlias = isDeepSeekCompatibilityAlias(model.id)
    const isReasoner =
        canonicalId.includes('reasoner') ||
        canonicalId.includes('r1') ||
        canonicalId === 'deepseek-v4-pro'
    const supportsTools = true

    let displayName = canonicalId
        .replace(/^deepseek-/, 'DeepSeek ')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

    if (canonicalId === 'deepseek-v4-flash') displayName = 'DeepSeek V4 Flash'
    if (canonicalId === 'deepseek-v4-pro') displayName = 'DeepSeek V4 Pro'

    if (isCompatibilityAlias) {
        displayName = `${displayName} (Compatibility Alias)`
    }

    return {
        code: model.id,
        displayName,
        enabled: true,
        supportsToolCall: supportsTools || undefined,
        supportsDeepThinking: isReasoner || undefined,
        maxContext: canonicalId.startsWith('deepseek-v4-') ? 1048576 : 131072,
        modelType: isReasoner ? 'reasoning' : 'chat',
    }
}

export function searchDeepSeekModels(models: DeepSeekModel[], query: string): DeepSeekModel[] {
    const lowerQuery = query.toLowerCase()
    return models.filter((model) =>
        model.id.toLowerCase().includes(lowerQuery) ||
        model.owned_by.toLowerCase().includes(lowerQuery)
    )
}

export interface DeepSeekBalanceInfo {
    is_available: boolean
    balance_infos: Array<{
        currency: string
        total_balance: string
        granted_balance: string
        topped_up_balance: string
    }>
}

export async function fetchDeepSeekBalance(apiKey: string): Promise<DeepSeekBalanceInfo> {
    if (!apiKey?.trim()) {
        throw new Error('DeepSeek API key is required to check balance.')
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/user/balance`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
        },
    })

    if (!response.ok) {
        throw new Error(`Failed to fetch DeepSeek balance: ${response.status}`)
    }

    return response.json() as Promise<DeepSeekBalanceInfo>
}
