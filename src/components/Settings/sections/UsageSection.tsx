import React, { useEffect, useMemo, useState } from 'react'
import { Activity, BarChart } from 'lucide-react'
import { Pie, PieChart } from 'recharts'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { WithTooltip } from '@/components/ui/WithTooltip'
import { ActivityGraph } from '../ActivityGraph'
import type {
  UsageStats,
  UsageProvider,
  UsagePerformanceRange,
  ProviderUsageEntry,
} from './usageMetrics'
import type { AnalyticsState } from '@/electron/types'

export interface UsageSectionProps {
  stats: UsageStats
}

type ModelMixEntry = UsageStats['modelEntries'][number]
type PerformanceProviderSelection = UsageProvider | 'all'

const MODEL_MIX_BLUE_SCALE = ['#8fc5fb', '#347ff2', '#2564ed', '#1f4ed8', '#203fbc', '#172f91']

const PERFORMANCE_RANGES: Array<{ value: UsagePerformanceRange; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'all', label: 'All' },
]

const providerName: Record<UsageProvider, string> = {
  alibaba: 'Alibaba',
  deepseek: 'DeepSeek',
  fireworks: 'Fireworks',
  groq: 'Groq',
  nvidia: 'NVIDIA NIM',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  perplexity: 'Perplexity',
  unknown: 'Unknown',
}

function formatPercent(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

function buildModelMixData(modelEntries: ModelMixEntry[]) {
  const positiveEntries = modelEntries.filter((model) => model.tokens > 0)
  const topModels = positiveEntries.slice(0, 5)
  const remaining = positiveEntries.slice(5)
  const chartEntries = topModels.map((model, index) => ({
    model: model.name,
    tokens: model.tokens,
    count: model.count,
    fill: MODEL_MIX_BLUE_SCALE[index] ?? MODEL_MIX_BLUE_SCALE[MODEL_MIX_BLUE_SCALE.length - 2],
  }))

  if (remaining.length > 0) {
    chartEntries.push({
      model: 'Other',
      tokens: remaining.reduce((sum, model) => sum + model.tokens, 0),
      count: remaining.reduce((sum, model) => sum + model.count, 0),
      fill: MODEL_MIX_BLUE_SCALE[MODEL_MIX_BLUE_SCALE.length - 1],
    })
  }

  return chartEntries
}

function getEmptyProviderSummary(): ProviderUsageEntry {
  return {
    provider: 'unknown',
    messages: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cachedOutputTokens: 0,
    cacheWriteInputTokens: 0,
    cachedTotalTokens: 0,
    avgLatencyMs: 0,
    avgTtftMs: 0,
    avgTps: 0,
    errors: 0,
    estimatedCostUsd: 0,
  }
}

function getWeightedAverage(
  entries: ProviderUsageEntry[],
  key: 'avgLatencyMs' | 'avgTtftMs' | 'avgTps'
): number {
  const weighted = entries.reduce(
    (total, entry) => {
      const value = entry[key]
      if (value <= 0 || entry.messages <= 0) return total
      return { sum: total.sum + value * entry.messages, count: total.count + entry.messages }
    },
    { sum: 0, count: 0 }
  )

  if (weighted.count === 0) return 0
  const average = weighted.sum / weighted.count
  return key === 'avgTps' ? Number(average.toFixed(1)) : Math.round(average)
}

function aggregateProviderEntries(entries: ProviderUsageEntry[]): ProviderUsageEntry {
  if (entries.length === 0) return getEmptyProviderSummary()

  const totals = entries.reduce(
    (summary, entry) => ({
      ...summary,
      messages: summary.messages + entry.messages,
      tokens: summary.tokens + entry.tokens,
      inputTokens: summary.inputTokens + entry.inputTokens,
      outputTokens: summary.outputTokens + entry.outputTokens,
      cachedInputTokens: summary.cachedInputTokens + entry.cachedInputTokens,
      cachedOutputTokens: summary.cachedOutputTokens + entry.cachedOutputTokens,
      cacheWriteInputTokens: summary.cacheWriteInputTokens + entry.cacheWriteInputTokens,
      cachedTotalTokens: summary.cachedTotalTokens + entry.cachedTotalTokens,
      errors: summary.errors + entry.errors,
      estimatedCostUsd: Number((summary.estimatedCostUsd + entry.estimatedCostUsd).toFixed(4)),
    }),
    getEmptyProviderSummary()
  )

  return {
    ...totals,
    avgLatencyMs: getWeightedAverage(entries, 'avgLatencyMs'),
    avgTtftMs: getWeightedAverage(entries, 'avgTtftMs'),
    avgTps: getWeightedAverage(entries, 'avgTps'),
  }
}

function ActivitySummaryCard({ stats }: { stats: UsageStats }): React.ReactElement {
  const hasActivity = stats.totalMessages > 0 || stats.totalSessions > 0

  const statItems = [
    {
      label: 'Today',
      value: stats.todayMessages.toLocaleString(),
      unit: stats.todayMessages === 1 ? 'message' : 'messages',
    },
    {
      label: 'Total messages',
      value: stats.totalMessages.toLocaleString(),
      unit: stats.totalMessages === 1 ? 'message' : 'messages',
    },
    {
      label: 'Sessions',
      value: stats.totalSessions.toLocaleString(),
      unit: stats.avgMessagesPerSession > 0 ? `${stats.avgMessagesPerSession}/session` : undefined,
    },
    {
      label: 'Active days',
      value: stats.activeDays.toLocaleString(),
      unit: stats.activeDays === 1 ? 'day' : 'days',
    },
    {
      label: 'Current streak',
      value: stats.currentActiveStreak.toLocaleString(),
      unit: stats.longestActiveStreak > 0 ? `best ${stats.longestActiveStreak}` : undefined,
    },
    {
      label: 'Top model',
      value: stats.mostUsedModel || '—',
      unit: undefined,
      isLong: true,
    },
    {
      label: 'Images processed',
      value: stats.imagesProcessed.toLocaleString(),
      unit: stats.imagesProcessed === 1 ? 'image' : 'images',
    },
    {
      label: 'Avg / session',
      value: stats.avgMessagesPerSession.toLocaleString(),
      unit: 'messages',
    },
  ]

  return (
    <section
      className="stat-card usage-response-card usage-motion-card usage-motion-card--surface"
      aria-labelledby="usage-activity-summary-title"
    >
      <div className="usage-response-card__header">
        <div>
          <h3 id="usage-activity-summary-title" className="usage-response-card__title">
            Activity Summary
          </h3>
          <p className="usage-response-card__description">Your chat highlights</p>
        </div>
        <span className="usage-response-card__icon">
          <Activity size={16} />
        </span>
      </div>

      {hasActivity ? (
        <div className="usage-activity-summary-grid">
          {statItems.map((item) => (
            <div
              key={item.label}
              className={`usage-activity-summary-item${item.isLong ? ' usage-activity-summary-item--long' : ''}`}
            >
              <span className="usage-activity-summary-item__label">{item.label}</span>
              <div className="usage-activity-summary-item__value-row">
                <WithTooltip tooltip={item.value}>
                  <strong className="usage-activity-summary-item__value">{item.value}</strong>
                </WithTooltip>
                {item.unit && (
                  <span className="usage-activity-summary-item__unit">{item.unit}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="usage-response-empty">No activity yet.</div>
      )}
    </section>
  )
}

function ModelMixPieCard({ stats }: { stats: UsageStats }): React.ReactElement {
  const chartData = buildModelMixData(stats.modelEntries)
  const modelTokenTotal = chartData.reduce((sum, model) => sum + model.tokens, 0)
  const topModel = chartData[0]
  const topModelShare = topModel ? formatPercent(topModel.tokens, modelTokenTotal) : 0

  const chartConfig = {
    tokens: {
      label: 'Tokens',
    },
  } satisfies ChartConfig

  return (
    <section
      className="stat-card usage-model-mix-card usage-motion-card usage-motion-card--surface"
      aria-labelledby="usage-model-mix-title"
    >
      <div className="usage-model-mix-card__header">
        <div>
          <h3 id="usage-model-mix-title" className="usage-model-mix-card__title">
            Model Mix
          </h3>
          <p className="usage-model-mix-card__description">Token share by model</p>
        </div>
        <span className="usage-model-mix-card__badge">
          {stats.modelEntries.length} model{stats.modelEntries.length === 1 ? '' : 's'}
        </span>
      </div>

      {chartData.length > 0 && modelTokenTotal > 0 ? (
        <>
          <div className="usage-model-mix-card__body">
            <ChartContainer
              config={chartConfig}
              className="usage-model-mix-card__chart"
              aria-label="Model token share pie chart"
            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      nameKey="model"
                      className="usage-model-mix-card__tooltip"
                      formatter={(value, name) => (
                        <div className="usage-model-mix-card__tooltip-row">
                          <span>{name}</span>
                          <span>{Number(value).toLocaleString()} tokens</span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={chartData}
                  dataKey="tokens"
                  nameKey="model"
                  outerRadius={96}
                  stroke="none"
                  strokeWidth={0}
                />
              </PieChart>
            </ChartContainer>

            <div className="usage-model-mix-card__legend" aria-label="Model token share legend">
              {chartData.map((model) => {
                const share = formatPercent(model.tokens, modelTokenTotal)
                return (
                  <div key={model.model} className="usage-model-mix-card__legend-row">
                    <span
                      className="usage-model-mix-card__swatch"
                      style={{ background: model.fill }}
                    />
                    <WithTooltip tooltip={model.model}>
                      <span className="usage-model-mix-card__model">{model.model}</span>
                    </WithTooltip>
                    <span className="usage-model-mix-card__tokens">
                      {model.tokens.toLocaleString()} tokens
                    </span>
                    <span className="usage-model-mix-card__percent">{share}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          <footer className="usage-model-mix-card__footer">
            <div className="usage-model-mix-card__footer-primary">
              {topModel.model} leads with {topModelShare}% of model tokens
            </div>
            <div className="usage-model-mix-card__footer-secondary">
              Based on assistant messages with recorded token usage
            </div>
          </footer>
        </>
      ) : (
        <div className="usage-model-mix-card__empty">No model usage yet</div>
      )}
    </section>
  )
}

interface ResponsePerformancePanelProps {
  entries: ProviderUsageEntry[]
  selectedProvider: PerformanceProviderSelection
  selectedRange: UsagePerformanceRange
  onProviderChange: (provider: PerformanceProviderSelection) => void
  onRangeChange: (range: UsagePerformanceRange) => void
}

function ResponsePerformancePanel({
  entries,
  selectedProvider,
  selectedRange,
  onProviderChange,
  onRangeChange,
}: ResponsePerformancePanelProps): React.ReactElement {
  const selectedEntry =
    selectedProvider === 'all'
      ? aggregateProviderEntries(entries)
      : (entries.find((entry) => entry.provider === selectedProvider) ?? getEmptyProviderSummary())
  const hasActivity = selectedEntry.messages > 0 || selectedEntry.tokens > 0
  const errorRate =
    selectedEntry.messages > 0
      ? Math.round((selectedEntry.errors / selectedEntry.messages) * 100)
      : 0

  const formatMs = (value: number): string => (value > 0 ? `${value} ms` : 'N/A')
  const formatTps = (value: number): string =>
    value > 0 ? `${value.toLocaleString()} tok/s` : 'N/A'

  return (
    <section
      className="stat-card usage-response-card usage-motion-card usage-motion-card--surface"
      aria-labelledby="usage-response-title"
    >
      <div className="usage-response-card__header">
        <div>
          <h3 id="usage-response-title" className="usage-response-card__title">
            Response Performance
          </h3>
          <p className="usage-response-card__description">Provider latency and throughput</p>
        </div>
        <span className="usage-response-card__icon">
          <BarChart size={16} />
        </span>
      </div>

      <div className="usage-response-controls">
        <div className="usage-response-range" aria-label="Performance range">
          {PERFORMANCE_RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              className={selectedRange === range.value ? 'active' : ''}
              onClick={() => onRangeChange(range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>

        <label className="usage-response-provider">
          <span>Provider</span>
          <select
            value={selectedProvider}
            onChange={(event) =>
              onProviderChange(event.target.value as PerformanceProviderSelection)
            }
            aria-label="Provider"
          >
            <option value="all">All providers</option>
            {entries.map((entry) => (
              <option key={entry.provider} value={entry.provider}>
                {providerName[entry.provider]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasActivity ? (
        <div className="usage-response-metrics">
          <div className="usage-response-metric">
            <span>Avg latency</span>
            <strong>{formatMs(selectedEntry.avgLatencyMs)}</strong>
          </div>
          <div className="usage-response-metric">
            <span>Avg TTFT</span>
            <strong>{formatMs(selectedEntry.avgTtftMs)}</strong>
          </div>
          <div className="usage-response-metric">
            <span>Throughput</span>
            <strong>{formatTps(selectedEntry.avgTps)}</strong>
          </div>
          <div className="usage-response-metric">
            <span>Error rate</span>
            <strong>{errorRate}%</strong>
          </div>
          <div className="usage-response-metric usage-response-metric--wide">
            <span>Messages</span>
            <strong>{selectedEntry.messages.toLocaleString()}</strong>
          </div>
          <div className="usage-response-metric usage-response-metric--wide">
            <span>Tokens</span>
            <strong>{selectedEntry.tokens.toLocaleString()}</strong>
          </div>
        </div>
      ) : (
        <div className="usage-response-empty">No provider activity for this range.</div>
      )}
    </section>
  )
}

export function UsageSection({ stats }: UsageSectionProps): React.ReactElement {
  const [analyticsState, setAnalyticsState] = useState<AnalyticsState | null>(null)
  const [analyticsUpdating, setAnalyticsUpdating] = useState(false)
  const [performanceRange, setPerformanceRange] = useState<UsagePerformanceRange>('7d')
  const [selectedProvider, setSelectedProvider] = useState<PerformanceProviderSelection>('all')

  useEffect(() => {
    if (!window.analytics?.getState) return
    void window.analytics
      .getState()
      .then(setAnalyticsState)
      .catch(() => undefined)
  }, [])

  const updateAnalyticsEnabled = async (enabled: boolean) => {
    if (!window.analytics?.setEnabled || analyticsUpdating) return
    setAnalyticsUpdating(true)
    try {
      const nextState = await window.analytics.setEnabled(enabled)
      setAnalyticsState(nextState)
    } finally {
      setAnalyticsUpdating(false)
    }
  }

  const performanceEntries = useMemo(
    () => stats.providerPerformanceByRange?.[performanceRange] ?? stats.providerEntries,
    [performanceRange, stats.providerEntries, stats.providerPerformanceByRange]
  )

  useEffect(() => {
    if (selectedProvider === 'all') return
    if (performanceEntries.some((entry) => entry.provider === selectedProvider)) return
    setSelectedProvider('all')
  }, [performanceEntries, selectedProvider])

  return (
    <div className="settings-section-layout settings-section-layout--wide settings-section-layout--usage">
      <div className="page-header">
        <h2 className="page-title">Usage Intelligence</h2>
        <div className="page-subtitle">
          Monitor activity, response trends, model mix, and web search effectiveness
        </div>
      </div>

      <div className="usage-overview-grid">
        <ActivityGraph
          data={stats.activityData}
          embedded
          className="usage-overview-graph usage-motion-card usage-motion-card--surface"
        />
      </div>

      <div className="usage-sidecards-grid">
        <ResponsePerformancePanel
          entries={performanceEntries}
          selectedProvider={selectedProvider}
          selectedRange={performanceRange}
          onProviderChange={setSelectedProvider}
          onRangeChange={setPerformanceRange}
        />
        <ActivitySummaryCard stats={stats} />
      </div>

      <div className="usage-lower-grid">
        <ModelMixPieCard stats={stats} />
      </div>

      <Card className="settings-section-card provider-hub-base-card mt-4">
        <div className="settings-list-row">
          <div className="settings-list-row__meta">
            <h3 className="settings-list-row__label">Anonymous analytics</h3>
            <div className="settings-list-row__description">
              Share basic app usage and reliability events with ZuraAI. Prompt text, AI responses,
              files, API keys, clipboard data, and conversation content are never sent.
              {analyticsState && !analyticsState.hasProjectKey
                ? ' Analytics is configured off in this build because no PostHog project key is present.'
                : ''}
            </div>
          </div>
          <div className="settings-list-row__control">
            <Switch
              checked={analyticsState?.analyticsEnabled ?? false}
              onCheckedChange={(enabled) => void updateAnalyticsEnabled(enabled)}
              disabled={!analyticsState || analyticsUpdating}
              aria-label="Enable anonymous analytics"
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

export default UsageSection
