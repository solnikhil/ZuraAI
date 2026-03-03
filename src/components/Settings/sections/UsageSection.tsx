import React from 'react'
import { MessageSquare, Clock, Zap, TrendingUp, Cpu, BarChart, Calendar, DollarSign, Shield, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ActivityGraph } from '../ActivityGraph'
import type { UsageStats, UsageRuntimeMetrics, UsageProvider } from './usageMetrics'

/**
 * Props for UsageSection component
 */
export interface UsageSectionProps {
  stats: UsageStats
  runtimeMetrics: UsageRuntimeMetrics | null
  isElectron: boolean
  onExportSnapshot: () => void
}

export function UsageSection({
  stats,
  runtimeMetrics,
  isElectron,
  onExportSnapshot,
}: UsageSectionProps): React.ReactElement {
  const delayStyle = (index: number): React.CSSProperties => ({
    ['--usage-delay' as string]: `${index * 40}ms`
  })

  const topModels = stats.topModelsByTokens
  const otherModelsCount = Math.max(stats.modelEntries.length - topModels.length, 0)
  const assistantShare = stats.totalMessages > 0
    ? Math.round((stats.assistantMessages / stats.totalMessages) * 100)
    : 0

  const formatMs = (value: number): string => value > 0 ? `${value} ms` : 'N/A'
  const formatTps = (value: number): string => value > 0 ? `${value.toLocaleString()} tok/s` : 'N/A'
  const formatUsd = (value: number): string => value > 0 ? `$${value.toFixed(2)}` : '$0.00'

  const providerName: Record<UsageProvider, string> = {
    openrouter: 'OpenRouter',
    perplexity: 'Perplexity',
    groq: 'Groq',
    alibaba: 'Alibaba',
    ollama: 'Ollama',
    unknown: 'Unknown',
  }

  return (
    <div className="settings-section-layout settings-section-layout--wide settings-section-layout--usage">
      <div className="page-header">
        <h2 className="page-title">Usage Intelligence</h2>
        <div className="page-subtitle">Monitor activity, performance, model mix, and web search effectiveness</div>
      </div>

      <div className="usage-stats-grid" style={{ marginTop: 24 }}>
        <div className="stat-card compact usage-motion-card usage-motion-card--compact" style={delayStyle(0)}>
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <MessageSquare size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.todayMessages}</div>
            <div className="stat-label-sm">Messages today</div>
          </div>
        </div>

        <div className="stat-card compact usage-motion-card usage-motion-card--compact" style={delayStyle(1)}>
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <Clock size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.totalSessions}</div>
            <div className="stat-label-sm">Total sessions</div>
          </div>
        </div>

        <div className="stat-card compact usage-motion-card usage-motion-card--compact" style={delayStyle(2)}>
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <Zap size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.avgMessagesPerSession}</div>
            <div className="stat-label-sm">Avg msgs/session</div>
          </div>
        </div>

        <div className="stat-card compact usage-motion-card usage-motion-card--compact" style={delayStyle(3)}>
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <TrendingUp size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.avgTokensPerAssistant}</div>
            <div className="stat-label-sm">Avg tokens/assistant</div>
          </div>
        </div>

        <div className="stat-card compact usage-motion-card usage-motion-card--compact" style={delayStyle(4)}>
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <BarChart size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.totalWebSearches}</div>
            <div className="stat-label-sm">Web searches</div>
          </div>
        </div>

        <div className="stat-card compact usage-motion-card usage-motion-card--compact" style={delayStyle(5)}>
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <DollarSign size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{formatUsd(stats.estimatedSpendUsd)}</div>
            <div className="stat-label-sm">Est. spend</div>
          </div>
        </div>
      </div>

      <div className="usage-bento-grid">
        <ActivityGraph data={stats.activityData} embedded className="usage-bento-graph usage-motion-card usage-motion-card--surface" />

        <div className="stat-card usage-bento-card usage-bento-total usage-motion-card usage-motion-card--surface" style={delayStyle(6)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Total Tokens</span>
            <span style={{ color: 'var(--theme-accent)' }}><Cpu size={16} /></span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
            {stats.totalTokens.toLocaleString()}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
            7d: {stats.tokensLast7Days.toLocaleString()} • 30d: {stats.tokensLast30Days.toLocaleString()}
          </div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-most usage-motion-card usage-motion-card--surface" style={delayStyle(7)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Response Performance</span>
            <span style={{ color: 'var(--theme-accent)' }}><BarChart size={16} /></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="stat-subtext">Avg latency</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>{formatMs(stats.avgAssistantLatencyMs)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="stat-subtext">Avg TTFT</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>{formatMs(stats.avgAssistantTtftMs)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="stat-subtext">Throughput</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>{formatTps(stats.avgAssistantTps)}</span>
            </div>

            {isElectron && (
              <>
                <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 6, paddingTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span className="stat-subtext">Startup visible</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                      {runtimeMetrics?.startupWindowVisibleMs ? `${Math.round(runtimeMetrics.startupWindowVisibleMs)} ms` : 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                    <span className="stat-subtext">FCP / TTI</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                      {runtimeMetrics?.fcpMs ? `${Math.round(runtimeMetrics.fcpMs)}ms` : 'N/A'} / {runtimeMetrics?.ttiMs ? `${Math.round(runtimeMetrics.ttiMs)}ms` : 'N/A'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                    <span className="stat-subtext">CPU / memory</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                      {runtimeMetrics?.processCpuPercent != null ? `${runtimeMetrics.processCpuPercent.toFixed(1)}%` : 'N/A'} / {runtimeMetrics?.processMemoryMb != null ? `${runtimeMetrics.processMemoryMb} MB` : 'N/A'}
                    </span>
                  </div>
                </div>

                {runtimeMetrics?.warnings && runtimeMetrics.warnings.length > 0 && (
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
                    {runtimeMetrics.warnings.length} performance warning{runtimeMetrics.warnings.length === 1 ? '' : 's'} detected
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-active usage-motion-card usage-motion-card--surface" style={delayStyle(8)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Activity Streak</span>
            <span style={{ color: 'var(--theme-accent)' }}><Calendar size={16} /></span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
            {stats.currentActiveStreak}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
            Best streak: {stats.longestActiveStreak} day{stats.longestActiveStreak === 1 ? '' : 's'}
          </div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-models usage-motion-card usage-motion-card--surface" style={delayStyle(9)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Model Mix</span>
            <span style={{ color: 'var(--theme-accent)' }}><Cpu size={16} /></span>
          </div>
          {stats.modelEntries.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {stats.modelEntries.slice(0, 8).map((model) => (
                <Badge
                  key={model.name}
                  variant="secondary"
                  title={`${model.count} uses • ${model.tokens.toLocaleString()} tokens`}
                >
                  {model.name}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="stat-subtext" style={{ fontSize: '0.8rem' }}>No model usage yet</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
              Most used: {stats.mostUsedModel}
            </div>
            <div className="stat-subtext" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
              {stats.modelEntries.length} model{stats.modelEntries.length === 1 ? '' : 's'}
            </div>
            <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
              Assistant share: {assistantShare}%
            </div>
            <div className="stat-subtext" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
              Active days: {stats.activeDays}
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 10, paddingTop: 8 }}>
            <div className="stat-subtext" style={{ fontSize: '0.75rem', marginBottom: 6 }}>Provider breakdown</div>
            {stats.providerEntries.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stats.providerEntries.slice(0, 5).map((provider) => (
                  <div key={provider.provider} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--theme-text-secondary)' }}>
                      {providerName[provider.provider]}
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--theme-text-primary)', textAlign: 'right' }}>
                      {provider.tokens.toLocaleString()} tok
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--theme-text-primary)', textAlign: 'right' }}>
                      {formatMs(provider.avgLatencyMs)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>No provider activity yet</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
                Est. spend: {formatUsd(stats.estimatedSpendUsd)}
              </div>
              <div className="stat-subtext" style={{ fontSize: '0.75rem', textAlign: 'right' }}>
                Coverage: {stats.spendCoveragePercent}%
              </div>
            </div>
          </div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-top usage-motion-card usage-motion-card--surface" style={delayStyle(10)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Quality, Tools, and Privacy</span>
            <Shield size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Total tool calls</div>
              <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                {stats.totalToolCalls.toLocaleString()}
              </div>
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Regenerated responses</div>
              <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                {stats.totalRegenerations.toLocaleString()}
              </div>
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Assistant error rate</div>
              <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                {stats.assistantErrorRate}%
              </div>
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Messages with errors</div>
              <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                {stats.assistantMessagesWithErrors.toLocaleString()}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 2, paddingTop: 8 }}>
              <div className="stat-subtext" style={{ fontSize: '0.75rem', marginBottom: 6 }}>Web search quality</div>
              {stats.totalWebSearches > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Search success rate</div>
                  <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                    {stats.webSearchSuccessRate}%
                  </div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Successful searches</div>
                  <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                    {stats.successfulWebSearches.toLocaleString()}
                  </div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Failed searches</div>
                  <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                    {stats.failedWebSearches.toLocaleString()}
                  </div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Avg execution time</div>
                  <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                    {formatMs(stats.avgWebSearchExecutionMs)}
                  </div>
                </div>
              ) : (
                <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>No web search activity yet</div>
              )}
            </div>

            {(stats.errorBreakdown.network + stats.errorBreakdown.auth + stats.errorBreakdown.rateLimit + stats.errorBreakdown.provider + stats.errorBreakdown.tool + stats.errorBreakdown.other) > 0 && (
              <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 2, paddingTop: 8 }}>
                <div className="stat-subtext" style={{ fontSize: '0.75rem', marginBottom: 6 }}>Failure categories</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Network: {stats.errorBreakdown.network}</div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Auth: {stats.errorBreakdown.auth}</div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Rate limit: {stats.errorBreakdown.rateLimit}</div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Provider: {stats.errorBreakdown.provider}</div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Tool: {stats.errorBreakdown.tool}</div>
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Other: {stats.errorBreakdown.other}</div>
                </div>
              </div>
            )}

            {stats.topSearchQueries.length > 0 && (
              <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 2, paddingTop: 8 }}>
                <div className="stat-subtext" style={{ fontSize: '0.75rem', marginBottom: 6 }}>Top search queries</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.topSearchQueries.map((entry, index) => (
                    <div key={entry.query} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--theme-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        #{index + 1} {entry.query}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                        {entry.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 2, paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div className="stat-subtext" style={{ fontSize: '0.75rem', maxWidth: 420 }}>
                Privacy: usage insights are computed from local chat history. Prompt content, response content, and API keys are excluded from exported snapshots.
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onExportSnapshot}>
                <Download size={14} style={{ marginRight: 6 }} />
                Export Snapshot
              </Button>
            </div>

            {otherModelsCount > 0 && (
              <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
                Top {topModels.length} model{topModels.length === 1 ? '' : 's'} account for {stats.totalTokens > 0
                  ? Math.round((topModels.reduce((sum, model) => sum + model.tokens, 0) / stats.totalTokens) * 100)
                  : 0}% of tokens ({otherModelsCount} more model{otherModelsCount === 1 ? '' : 's'})
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default UsageSection
