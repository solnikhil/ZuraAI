import type { ChatSession, ToolCallResult } from '@/chat/types'
import type { ActivityData } from '../ActivityGraph'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const MONTH_30_MS = 30 * DAY_MS
const ONE_MILLION = 1_000_000

export type UsageProvider =
  | 'alibaba'
  | 'deepseek'
  | 'fireworks'
  | 'groq'
  | 'nvidia'
  | 'ollama'
  | 'openrouter'
  | 'perplexity'
  | 'unknown'
export type UsagePerformanceRange = '1d' | '7d' | '30d' | 'all'

interface ModelUsageEntry {
  name: string
  count: number
  tokens: number
}

interface SearchQueryEntry {
  query: string
  count: number
}

export interface ProviderUsageEntry {
  provider: UsageProvider
  messages: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cachedOutputTokens: number
  cacheWriteInputTokens: number
  cachedTotalTokens: number
  avgLatencyMs: number
  avgTtftMs: number
  avgTps: number
  errors: number
  estimatedCostUsd: number
}

export interface UsageErrorBreakdown {
  network: number
  auth: number
  rateLimit: number
  provider: number
  tool: number
  other: number
}

export interface UsageModelCatalog {
  alibabaModels?: string[]
  deepseekModels?: string[]
  fireworksModels?: string[]
  groqModels?: string[]
  nvidiaModels?: string[]
  ollamaModels?: string[]
  openrouterModels?: string[]
  perplexityModels?: string[]
}

export interface UsageStats {
  todayMessages: number
  totalSessions: number
  totalMessages: number
  totalTokens: number
  cachedInputTokens: number
  cachedOutputTokens: number
  cacheWriteInputTokens: number
  cachedTotalTokens: number
  tokensLast7Days: number
  tokensLast30Days: number
  avgTokensPerAssistant: number
  activeDays: number
  currentActiveStreak: number
  longestActiveStreak: number
  assistantMessages: number
  userMessages: number
  avgMessagesPerSession: number
  imagesProcessed: number
  mostUsedModel: string
  modelEntries: ModelUsageEntry[]
  topModelsByTokens: ModelUsageEntry[]
  providerEntries: ProviderUsageEntry[]
  providerPerformanceByRange: Record<UsagePerformanceRange, ProviderUsageEntry[]>
  estimatedSpendUsd: number
  spendCoveragePercent: number
  avgAssistantLatencyMs: number
  avgAssistantTtftMs: number
  avgAssistantTps: number
  totalToolCalls: number
  totalRegenerations: number
  assistantMessagesWithErrors: number
  assistantErrorRate: number
  errorBreakdown: UsageErrorBreakdown
  totalWebSearches: number
  successfulWebSearches: number
  failedWebSearches: number
  webSearchSuccessRate: number
  avgWebSearchExecutionMs: number
  topSearchQueries: SearchQueryEntry[]
  activityData: ActivityData[]
}

export function mergeUsageSessionSnapshots(
  storedSessions: ChatSession[],
  currentSessions: ChatSession[]
): ChatSession[] {
  if (storedSessions.length === 0) return currentSessions

  const currentById = new Map(currentSessions.map((session) => [session.id, session]))
  const storedIds = new Set(storedSessions.map((session) => session.id))
  const merged = storedSessions.map((storedSession) => {
    const currentSession = currentById.get(storedSession.id)
    if (!currentSession) return storedSession

    const currentHasMessages =
      Array.isArray(currentSession.messages) && currentSession.messages.length > 0
    const storedHasMessages =
      Array.isArray(storedSession.messages) && storedSession.messages.length > 0

    if (currentHasMessages || !storedHasMessages) {
      return currentSession
    }

    return {
      ...currentSession,
      messages: storedSession.messages,
      messageCount: currentSession.messageCount ?? storedSession.messageCount,
    }
  })

  for (const currentSession of currentSessions) {
    if (!storedIds.has(currentSession.id)) {
      merged.push(currentSession)
    }
  }

  return merged
}

const PROVIDER_TOKEN_RATES_PER_MILLION: Record<
  Exclude<UsageProvider, 'unknown'>,
  { inputUsd: number; outputUsd: number }
> = {
  alibaba: { inputUsd: 0.5, outputUsd: 1.5 },
  deepseek: { inputUsd: 0.27, outputUsd: 1.1 },
  fireworks: { inputUsd: 0.9, outputUsd: 2.7 },
  groq: { inputUsd: 0.8, outputUsd: 0.8 },
  nvidia: { inputUsd: 0, outputUsd: 0 },
  ollama: { inputUsd: 0, outputUsd: 0 },
  openrouter: { inputUsd: 1.2, outputUsd: 4.8 },
  perplexity: { inputUsd: 1.0, outputUsd: 1.0 },
}

function getLocalDayKeyFromTimestamp(timestamp: number): string {
  const d = new Date(timestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getLocalDayKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDayKeyToTimestamp(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

function normalizeModelCode(model?: string): string {
  if (!model) return ''
  const trimmed = model.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.startsWith('openrouter/') ? trimmed.replace(/^openrouter\//, '') : trimmed
}

function getModelName(model?: string): string {
  if (!model) return 'Unknown'
  const normalized = model.startsWith('openrouter/') ? model.replace(/^openrouter\//, '') : model
  return normalized.split('/').pop() || normalized
}

function getTokenCount(message: ChatSession['messages'][number]): number {
  if (message.usage) {
    const usageTotal = message.usage.totalTokens || 0
    if (usageTotal > 0) return usageTotal

    const usageCombined = (message.usage.inputTokens || 0) + (message.usage.outputTokens || 0)
    if (usageCombined > 0) return usageCombined
  }

  return message.tokenCount || 0
}

function getTokenBreakdown(message: ChatSession['messages'][number]): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
} {
  const fromUsageInput = message.usage?.inputTokens || 0
  const fromUsageOutput = message.usage?.outputTokens || 0
  const fromUsageTotal = message.usage?.totalTokens || 0

  const usageTotal = fromUsageTotal > 0 ? fromUsageTotal : fromUsageInput + fromUsageOutput

  if (usageTotal > 0) {
    const inputTokens = fromUsageInput > 0 ? fromUsageInput : Math.round(usageTotal * 0.45)
    const outputTokens =
      fromUsageOutput > 0 ? fromUsageOutput : Math.max(0, usageTotal - inputTokens)
    return {
      inputTokens,
      outputTokens,
      totalTokens: usageTotal,
    }
  }

  const totalTokens = message.tokenCount || 0
  if (totalTokens <= 0) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  if (message.role === 'assistant') {
    return {
      inputTokens: Math.round(totalTokens * 0.45),
      outputTokens: Math.round(totalTokens * 0.55),
      totalTokens,
    }
  }

  if (message.role === 'user') {
    return { inputTokens: totalTokens, outputTokens: 0, totalTokens }
  }

  return { inputTokens: 0, outputTokens: totalTokens, totalTokens }
}

function extractQuery(argumentsValue: unknown): string | null {
  if (!argumentsValue) return null

  if (typeof argumentsValue === 'string') {
    const trimmed = argumentsValue.trim()
    if (!trimmed) return null

    try {
      const parsed = JSON.parse(trimmed)
      return extractQuery(parsed)
    } catch {
      return trimmed
    }
  }

  if (typeof argumentsValue === 'object') {
    const args = argumentsValue as Record<string, unknown>
    const queryCandidates = [args.query, args.q, args.search, args.term]
    for (const candidate of queryCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }
  }

  return null
}

function computeLongestStreak(activeDayKeys: Set<string>): number {
  if (activeDayKeys.size === 0) return 0

  const sortedDays = Array.from(activeDayKeys)
    .map(parseDayKeyToTimestamp)
    .sort((a, b) => a - b)

  let longest = 1
  let current = 1

  for (let i = 1; i < sortedDays.length; i++) {
    if (sortedDays[i] - sortedDays[i - 1] === DAY_MS) {
      current += 1
      if (current > longest) longest = current
    } else {
      current = 1
    }
  }

  return longest
}

function computeCurrentStreak(activeDayKeys: Set<string>): number {
  if (activeDayKeys.size === 0) return 0

  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  let streak = 0
  while (activeDayKeys.has(getLocalDayKeyFromDate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

function getInitialActivityData(now: number): ActivityData[] {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const result: ActivityData[] = []

  for (let i = 29; i >= 0; i--) {
    const day = new Date(now - i * DAY_MS)
    result.push({
      label: `${months[day.getMonth()]} ${day.getDate()}`,
      date: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      tokens: 0,
      modelBreakdown: {},
    })
  }

  return result
}

function applyToolResultMetrics(
  toolResult: ToolCallResult,
  queryCounts: Map<string, number>,
  accumulators: {
    totalWebSearches: number
    successfulWebSearches: number
    failedWebSearches: number
    webSearchExecutionSumMs: number
    webSearchExecutionCount: number
  }
): void {
  const toolName = toolResult.toolCall.name

  if (toolName !== 'web_search') return

  accumulators.totalWebSearches += 1

  if (toolResult.result.success) {
    accumulators.successfulWebSearches += 1
  } else {
    accumulators.failedWebSearches += 1
  }

  if (typeof toolResult.result.executionTime === 'number' && toolResult.result.executionTime > 0) {
    accumulators.webSearchExecutionSumMs += toolResult.result.executionTime
    accumulators.webSearchExecutionCount += 1
  }

  const query = extractQuery(toolResult.toolCall.arguments)
  if (query) {
    queryCounts.set(query, (queryCounts.get(query) || 0) + 1)
  }
}

function classifyAssistantError(
  message: ChatSession['messages'][number]
): keyof UsageErrorBreakdown | null {
  if (message.role !== 'assistant') return null
  const content = (message.content || '').trim().toLowerCase()
  if (!content) return null

  const likelyErrorText =
    content.startsWith('error:') ||
    content.startsWith('provider error') ||
    content.startsWith('invalid api key') ||
    content.startsWith('network error') ||
    content.startsWith('rate limit exceeded') ||
    content.includes('failed to regenerate') ||
    content.includes('upstream model provider returned an error') ||
    content.includes('api key is required')

  if (!likelyErrorText) return null
  if (content.includes('network') || content.includes('internet connection')) return 'network'
  if (
    content.includes('api key') ||
    content.includes('unauthorized') ||
    content.includes('forbidden')
  )
    return 'auth'
  if (content.includes('rate limit') || content.includes('429') || content.includes('overloaded'))
    return 'rateLimit'
  if (content.includes('provider error') || content.includes('upstream model provider'))
    return 'provider'
  return 'other'
}

function buildModelProviderMap(catalog?: UsageModelCatalog): Map<string, UsageProvider> {
  const map = new Map<string, UsageProvider>()
  const register = (provider: UsageProvider, codes?: string[]) => {
    ;(codes || []).forEach((code) => {
      const normalized = normalizeModelCode(code)
      if (normalized) map.set(normalized, provider)
    })
  }

  register('alibaba', catalog?.alibabaModels)
  register('deepseek', catalog?.deepseekModels)
  register('fireworks', catalog?.fireworksModels)
  register('groq', catalog?.groqModels)
  register('nvidia', catalog?.nvidiaModels)
  register('ollama', catalog?.ollamaModels)
  register('openrouter', catalog?.openrouterModels)
  register('perplexity', catalog?.perplexityModels)

  return map
}

function inferProvider(
  model: string | undefined,
  modelProviderMap: Map<string, UsageProvider>
): UsageProvider {
  if (!model) return 'unknown'

  const raw = model.trim().toLowerCase()
  const normalized = normalizeModelCode(model)
  if (!normalized) return 'unknown'

  const catalogProvider = modelProviderMap.get(normalized)
  if (catalogProvider) return catalogProvider

  if (raw.startsWith('fireworks/') || raw.includes('accounts/fireworks')) return 'fireworks'
  if (raw.startsWith('openrouter/')) return 'openrouter'
  if (normalized.startsWith('sonar')) return 'perplexity'
  if (normalized.startsWith('groq/')) return 'groq'

  return 'unknown'
}

function calculateProviderCostUsd(
  provider: UsageProvider,
  inputTokens: number,
  outputTokens: number
): number {
  if (provider === 'unknown') return 0
  const rates = PROVIDER_TOKEN_RATES_PER_MILLION[provider]
  if (!rates) return 0
  const inputCost = (inputTokens / ONE_MILLION) * rates.inputUsd
  const outputCost = (outputTokens / ONE_MILLION) * rates.outputUsd
  return Number((inputCost + outputCost).toFixed(4))
}

interface ProviderAccumulator {
  messages: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cachedOutputTokens: number
  cacheWriteInputTokens: number
  latencySumMs: number
  latencyCount: number
  ttftSumMs: number
  ttftCount: number
  tpsSum: number
  tpsCount: number
  errors: number
}

function createProviderAccumulator(): ProviderAccumulator {
  return {
    messages: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cachedOutputTokens: 0,
    cacheWriteInputTokens: 0,
    latencySumMs: 0,
    latencyCount: 0,
    ttftSumMs: 0,
    ttftCount: 0,
    tpsSum: 0,
    tpsCount: 0,
    errors: 0,
  }
}

function addProviderMetric(
  usageMap: Map<UsageProvider, ProviderAccumulator>,
  provider: UsageProvider,
  metrics: {
    tokens: number
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    cachedOutputTokens: number
    cacheWriteInputTokens: number
    latency?: number
    ttft?: number
    tps?: number
    hasError: boolean
  }
): void {
  const usage = usageMap.get(provider) || createProviderAccumulator()
  usage.messages += 1
  usage.tokens += metrics.tokens
  usage.inputTokens += metrics.inputTokens
  usage.outputTokens += metrics.outputTokens
  usage.cachedInputTokens += metrics.cachedInputTokens
  usage.cachedOutputTokens += metrics.cachedOutputTokens
  usage.cacheWriteInputTokens += metrics.cacheWriteInputTokens

  if (typeof metrics.latency === 'number' && metrics.latency > 0) {
    usage.latencySumMs += metrics.latency
    usage.latencyCount += 1
  }

  if (typeof metrics.ttft === 'number' && metrics.ttft > 0) {
    usage.ttftSumMs += metrics.ttft
    usage.ttftCount += 1
  }

  if (typeof metrics.tps === 'number' && metrics.tps > 0) {
    usage.tpsSum += metrics.tps
    usage.tpsCount += 1
  }

  if (metrics.hasError) {
    usage.errors += 1
  }

  usageMap.set(provider, usage)
}

function toProviderEntries(
  usageMap: Map<UsageProvider, ProviderAccumulator>
): ProviderUsageEntry[] {
  return Array.from(usageMap.entries())
    .map(([provider, data]) => {
      const estimatedCostUsd = calculateProviderCostUsd(
        provider,
        data.inputTokens,
        data.outputTokens
      )
      return {
        provider,
        messages: data.messages,
        tokens: data.tokens,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cachedInputTokens: data.cachedInputTokens,
        cachedOutputTokens: data.cachedOutputTokens,
        cacheWriteInputTokens: data.cacheWriteInputTokens,
        cachedTotalTokens: data.cachedInputTokens + data.cachedOutputTokens,
        avgLatencyMs: data.latencyCount > 0 ? Math.round(data.latencySumMs / data.latencyCount) : 0,
        avgTtftMs: data.ttftCount > 0 ? Math.round(data.ttftSumMs / data.ttftCount) : 0,
        avgTps: data.tpsCount > 0 ? Number((data.tpsSum / data.tpsCount).toFixed(1)) : 0,
        errors: data.errors,
        estimatedCostUsd,
      }
    })
    .sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens
      if (b.messages !== a.messages) return b.messages - a.messages
      return a.provider.localeCompare(b.provider)
    })
}

export function computeUsageStats(
  sessions: ChatSession[],
  modelCatalog?: UsageModelCatalog
): UsageStats {
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const modelProviderMap = buildModelProviderMap(modelCatalog)

  let totalMessages = 0
  let totalTokens = 0
  let cachedInputTokens = 0
  let cachedOutputTokens = 0
  let cacheWriteInputTokens = 0
  let todayMessages = 0
  let assistantMessages = 0
  let userMessages = 0
  let imagesProcessed = 0
  let tokensLast7Days = 0
  let tokensLast30Days = 0

  let assistantMessagesWithTokens = 0
  let assistantTokensSum = 0

  let assistantLatencySumMs = 0
  let assistantLatencyCount = 0

  let assistantTtftSumMs = 0
  let assistantTtftCount = 0

  let assistantTpsSum = 0
  let assistantTpsCount = 0

  let totalToolCalls = 0
  let totalRegenerations = 0
  let assistantMessagesWithErrors = 0

  const errorBreakdown: UsageErrorBreakdown = {
    network: 0,
    auth: 0,
    rateLimit: 0,
    provider: 0,
    tool: 0,
    other: 0,
  }

  const activeDayKeys = new Set<string>()
  const modelUsage = new Map<string, { count: number; tokens: number }>()
  const providerUsage = new Map<UsageProvider, ProviderAccumulator>()
  const providerRangeUsage: Record<
    UsagePerformanceRange,
    Map<UsageProvider, ProviderAccumulator>
  > = {
    '1d': new Map(),
    '7d': new Map(),
    '30d': new Map(),
    all: new Map(),
  }
  const queryCounts = new Map<string, number>()
  const activityData = getInitialActivityData(now)

  const toolAccumulators = {
    totalWebSearches: 0,
    successfulWebSearches: 0,
    failedWebSearches: 0,
    webSearchExecutionSumMs: 0,
    webSearchExecutionCount: 0,
  }

  sessions.forEach((session) => {
    session.messages.forEach((message) => {
      totalMessages += 1

      if (message.timestamp >= todayStart) todayMessages += 1

      activeDayKeys.add(getLocalDayKeyFromTimestamp(message.timestamp))

      const messageTokens = getTokenCount(message)
      totalTokens += messageTokens

      const ageMs = now - message.timestamp
      if (ageMs >= 0 && ageMs < WEEK_MS) tokensLast7Days += messageTokens
      if (ageMs >= 0 && ageMs < MONTH_30_MS) tokensLast30Days += messageTokens

      const diffDays = Math.floor(ageMs / DAY_MS)
      if (diffDays >= 0 && diffDays < 30) {
        const dayData = activityData[29 - diffDays]
        dayData.tokens += messageTokens

        if (message.model) {
          const modelName = getModelName(message.model)
          dayData.modelBreakdown = dayData.modelBreakdown || {}
          dayData.modelBreakdown[modelName] =
            (dayData.modelBreakdown[modelName] || 0) + messageTokens
        }
      }

      if (message.image || message.files?.some((file) => file.mimeType.startsWith('image/'))) {
        imagesProcessed += 1
      }

      if (message.role === 'user') {
        userMessages += 1
      }

      if (message.role !== 'assistant') return

      assistantMessages += 1
      totalRegenerations += message.responseVersions?.length || 0

      const tokenBreakdown = getTokenBreakdown(message)
      const messageCachedInputTokens = message.usage?.cachedInputTokens || 0
      const messageCachedOutputTokens = message.usage?.cachedOutputTokens || 0
      const messageCacheWriteInputTokens = message.usage?.cacheWriteInputTokens || 0

      cachedInputTokens += messageCachedInputTokens
      cachedOutputTokens += messageCachedOutputTokens
      cacheWriteInputTokens += messageCacheWriteInputTokens

      if (messageTokens > 0) {
        assistantMessagesWithTokens += 1
        assistantTokensSum += messageTokens
      }

      if (typeof message.latency === 'number' && message.latency > 0) {
        assistantLatencySumMs += message.latency
        assistantLatencyCount += 1
      }

      if (typeof message.usage?.ttft === 'number' && message.usage.ttft > 0) {
        assistantTtftSumMs += message.usage.ttft
        assistantTtftCount += 1
      }

      if (typeof message.usage?.tps === 'number' && message.usage.tps > 0) {
        assistantTpsSum += message.usage.tps
        assistantTpsCount += 1
      }

      const modelName = getModelName(message.model)
      const existingModelUsage = modelUsage.get(modelName) || { count: 0, tokens: 0 }
      modelUsage.set(modelName, {
        count: existingModelUsage.count + 1,
        tokens: existingModelUsage.tokens + messageTokens,
      })

      const provider = inferProvider(message.model, modelProviderMap)
      let hasAnyError = false
      const errorCategory = classifyAssistantError(message)
      if (errorCategory) {
        errorBreakdown[errorCategory] += 1
        hasAnyError = true
      }

      ;(message.toolResults || []).forEach((toolResult) => {
        totalToolCalls += 1
        applyToolResultMetrics(toolResult, queryCounts, toolAccumulators)
        if (!toolResult.result.success) {
          errorBreakdown.tool += 1
          hasAnyError = true
        }
      })

      if (hasAnyError) {
        assistantMessagesWithErrors += 1
      }

      const providerMetrics = {
        tokens: messageTokens,
        inputTokens: tokenBreakdown.inputTokens,
        outputTokens: tokenBreakdown.outputTokens,
        cachedInputTokens: messageCachedInputTokens,
        cachedOutputTokens: messageCachedOutputTokens,
        cacheWriteInputTokens: messageCacheWriteInputTokens,
        latency: message.latency,
        ttft: message.usage?.ttft,
        tps: message.usage?.tps,
        hasError: hasAnyError,
      }
      addProviderMetric(providerUsage, provider, providerMetrics)
      addProviderMetric(providerRangeUsage.all, provider, providerMetrics)
      if (ageMs >= 0 && ageMs < DAY_MS)
        addProviderMetric(providerRangeUsage['1d'], provider, providerMetrics)
      if (ageMs >= 0 && ageMs < WEEK_MS)
        addProviderMetric(providerRangeUsage['7d'], provider, providerMetrics)
      if (ageMs >= 0 && ageMs < MONTH_30_MS)
        addProviderMetric(providerRangeUsage['30d'], provider, providerMetrics)
    })
  })

  const modelEntries = Array.from(modelUsage.entries())
    .map(([name, data]) => ({ name, count: data.count, tokens: data.tokens }))
    .sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name)
    })

  const providerEntries = toProviderEntries(providerUsage)
  const providerPerformanceByRange: Record<UsagePerformanceRange, ProviderUsageEntry[]> = {
    '1d': toProviderEntries(providerRangeUsage['1d']),
    '7d': toProviderEntries(providerRangeUsage['7d']),
    '30d': toProviderEntries(providerRangeUsage['30d']),
    all: toProviderEntries(providerRangeUsage.all),
  }

  const topSearchQueries = Array.from(queryCounts.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.query.localeCompare(b.query)
    })
    .slice(0, 5)

  const avgAssistantLatencyMs =
    assistantLatencyCount > 0 ? Math.round(assistantLatencySumMs / assistantLatencyCount) : 0

  const avgAssistantTtftMs =
    assistantTtftCount > 0 ? Math.round(assistantTtftSumMs / assistantTtftCount) : 0

  const avgAssistantTps =
    assistantTpsCount > 0 ? Number((assistantTpsSum / assistantTpsCount).toFixed(1)) : 0

  const avgWebSearchExecutionMs =
    toolAccumulators.webSearchExecutionCount > 0
      ? Math.round(
          toolAccumulators.webSearchExecutionSumMs / toolAccumulators.webSearchExecutionCount
        )
      : 0

  const webSearchSuccessRate =
    toolAccumulators.totalWebSearches > 0
      ? Math.round(
          (toolAccumulators.successfulWebSearches / toolAccumulators.totalWebSearches) * 100
        )
      : 0

  const estimatedSpendUsd = Number(
    providerEntries.reduce((sum, provider) => sum + provider.estimatedCostUsd, 0).toFixed(4)
  )
  const coverageKnownTokens = providerEntries
    .filter((provider) => provider.provider !== 'unknown')
    .reduce((sum, provider) => sum + provider.tokens, 0)
  const assistantTokenTotal = providerEntries.reduce((sum, provider) => sum + provider.tokens, 0)
  const spendCoveragePercent =
    assistantTokenTotal > 0 ? Math.round((coverageKnownTokens / assistantTokenTotal) * 100) : 100

  return {
    todayMessages,
    totalSessions: sessions.length,
    totalMessages,
    totalTokens,
    cachedInputTokens,
    cachedOutputTokens,
    cacheWriteInputTokens,
    cachedTotalTokens: cachedInputTokens + cachedOutputTokens,
    tokensLast7Days,
    tokensLast30Days,
    avgTokensPerAssistant:
      assistantMessagesWithTokens > 0
        ? Math.round(assistantTokensSum / assistantMessagesWithTokens)
        : 0,
    activeDays: activeDayKeys.size,
    currentActiveStreak: computeCurrentStreak(activeDayKeys),
    longestActiveStreak: computeLongestStreak(activeDayKeys),
    assistantMessages,
    userMessages,
    avgMessagesPerSession:
      sessions.length > 0 ? Number((totalMessages / sessions.length).toFixed(1)) : 0,
    imagesProcessed,
    mostUsedModel: modelEntries[0]?.name || 'N/A',
    modelEntries,
    topModelsByTokens: modelEntries.slice(0, 3),
    providerEntries,
    providerPerformanceByRange,
    estimatedSpendUsd,
    spendCoveragePercent,
    avgAssistantLatencyMs,
    avgAssistantTtftMs,
    avgAssistantTps,
    totalToolCalls,
    totalRegenerations,
    assistantMessagesWithErrors,
    assistantErrorRate:
      assistantMessages > 0
        ? Math.round((assistantMessagesWithErrors / assistantMessages) * 100)
        : 0,
    errorBreakdown,
    totalWebSearches: toolAccumulators.totalWebSearches,
    successfulWebSearches: toolAccumulators.successfulWebSearches,
    failedWebSearches: toolAccumulators.failedWebSearches,
    webSearchSuccessRate,
    avgWebSearchExecutionMs,
    topSearchQueries,
    activityData,
  }
}
