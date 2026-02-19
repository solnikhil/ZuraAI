import type { ChatSession, ToolCallResult } from '@/contexts/ChatHistoryContext'
import type { ActivityData } from '../ActivityGraph'

const DAY_MS = 24 * 60 * 60 * 1000

interface ModelUsageEntry {
  name: string
  count: number
  tokens: number
}

interface SearchQueryEntry {
  query: string
  count: number
}

export interface UsageStats {
  todayMessages: number
  totalSessions: number
  totalMessages: number
  totalTokens: number
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
  avgAssistantLatencyMs: number
  avgAssistantTtftMs: number
  avgAssistantTps: number
  totalWebSearches: number
  successfulWebSearches: number
  failedWebSearches: number
  webSearchSuccessRate: number
  avgWebSearchExecutionMs: number
  researchPlansExecuted: number
  topSearchQueries: SearchQueryEntry[]
  activityData: ActivityData[]
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

function getModelName(model?: string): string {
  if (!model) return 'Unknown'
  return model.split('/').pop() || model
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
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const result: ActivityData[] = []

  for (let i = 29; i >= 0; i--) {
    const day = new Date(now - i * DAY_MS)
    result.push({
      label: `${months[day.getMonth()]} ${day.getDate()}`,
      date: day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      tokens: 0,
      modelBreakdown: {}
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
    researchPlansExecuted: number
  }
): void {
  const toolName = toolResult.toolCall.name

  if (toolName === 'research_plan') {
    accumulators.researchPlansExecuted += 1
    return
  }

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

export function computeUsageStats(sessions: ChatSession[]): UsageStats {
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)

  let totalMessages = 0
  let totalTokens = 0
  let todayMessages = 0
  let assistantMessages = 0
  let userMessages = 0
  let imagesProcessed = 0

  let assistantMessagesWithTokens = 0
  let assistantTokensSum = 0

  let assistantLatencySumMs = 0
  let assistantLatencyCount = 0

  let assistantTtftSumMs = 0
  let assistantTtftCount = 0

  let assistantTpsSum = 0
  let assistantTpsCount = 0

  const activeDayKeys = new Set<string>()
  const modelUsage = new Map<string, { count: number; tokens: number }>()
  const queryCounts = new Map<string, number>()
  const activityData = getInitialActivityData(now)

  const toolAccumulators = {
    totalWebSearches: 0,
    successfulWebSearches: 0,
    failedWebSearches: 0,
    webSearchExecutionSumMs: 0,
    webSearchExecutionCount: 0,
    researchPlansExecuted: 0
  }

  sessions.forEach((session) => {
    session.messages.forEach((message) => {
      totalMessages += 1

      if (message.timestamp >= todayStart) todayMessages += 1

      activeDayKeys.add(getLocalDayKeyFromTimestamp(message.timestamp))

      const messageTokens = getTokenCount(message)
      totalTokens += messageTokens

      const diffDays = Math.floor((now - message.timestamp) / DAY_MS)
      if (diffDays >= 0 && diffDays < 30) {
        const dayData = activityData[29 - diffDays]
        dayData.tokens += messageTokens

        if (message.model) {
          const modelName = getModelName(message.model)
          dayData.modelBreakdown = dayData.modelBreakdown || {}
          dayData.modelBreakdown[modelName] = (dayData.modelBreakdown[modelName] || 0) + messageTokens
        }
      }

      if (message.image || message.files?.some(file => file.mimeType.startsWith('image/'))) {
        imagesProcessed += 1
      }

      if (message.role === 'user') {
        userMessages += 1
      }

      if (message.role !== 'assistant') return

      assistantMessages += 1

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
        tokens: existingModelUsage.tokens + messageTokens
      })

      ;(message.toolResults || []).forEach((toolResult) => {
        applyToolResultMetrics(toolResult, queryCounts, toolAccumulators)
      })
    })
  })

  const modelEntries = Array.from(modelUsage.entries())
    .map(([name, data]) => ({ name, count: data.count, tokens: data.tokens }))
    .sort((a, b) => {
      if (b.tokens !== a.tokens) return b.tokens - a.tokens
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name)
    })

  const topSearchQueries = Array.from(queryCounts.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.query.localeCompare(b.query)
    })
    .slice(0, 5)

  const avgAssistantLatencyMs = assistantLatencyCount > 0
    ? Math.round(assistantLatencySumMs / assistantLatencyCount)
    : 0

  const avgAssistantTtftMs = assistantTtftCount > 0
    ? Math.round(assistantTtftSumMs / assistantTtftCount)
    : 0

  const avgAssistantTps = assistantTpsCount > 0
    ? Number((assistantTpsSum / assistantTpsCount).toFixed(1))
    : 0

  const avgWebSearchExecutionMs = toolAccumulators.webSearchExecutionCount > 0
    ? Math.round(toolAccumulators.webSearchExecutionSumMs / toolAccumulators.webSearchExecutionCount)
    : 0

  const webSearchSuccessRate = toolAccumulators.totalWebSearches > 0
    ? Math.round((toolAccumulators.successfulWebSearches / toolAccumulators.totalWebSearches) * 100)
    : 0

  return {
    todayMessages,
    totalSessions: sessions.length,
    totalMessages,
    totalTokens,
    avgTokensPerAssistant: assistantMessagesWithTokens > 0
      ? Math.round(assistantTokensSum / assistantMessagesWithTokens)
      : 0,
    activeDays: activeDayKeys.size,
    currentActiveStreak: computeCurrentStreak(activeDayKeys),
    longestActiveStreak: computeLongestStreak(activeDayKeys),
    assistantMessages,
    userMessages,
    avgMessagesPerSession: sessions.length > 0
      ? Number((totalMessages / sessions.length).toFixed(1))
      : 0,
    imagesProcessed,
    mostUsedModel: modelEntries[0]?.name || 'N/A',
    modelEntries,
    topModelsByTokens: modelEntries.slice(0, 3),
    avgAssistantLatencyMs,
    avgAssistantTtftMs,
    avgAssistantTps,
    totalWebSearches: toolAccumulators.totalWebSearches,
    successfulWebSearches: toolAccumulators.successfulWebSearches,
    failedWebSearches: toolAccumulators.failedWebSearches,
    webSearchSuccessRate,
    avgWebSearchExecutionMs,
    researchPlansExecuted: toolAccumulators.researchPlansExecuted,
    topSearchQueries,
    activityData
  }
}
