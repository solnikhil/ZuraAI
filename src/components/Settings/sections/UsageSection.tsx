import React from 'react'
import { MessageSquare, Clock, Zap, TrendingUp, Image as ImageIcon, Cpu, BarChart, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ActivityGraph } from '../ActivityGraph'
import type { UsageStats } from './usageMetrics'

/**
 * Props for UsageSection component
 */
export interface UsageSectionProps {
  stats: UsageStats
}

export function UsageSection({
  stats
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

  return (
    <div style={{ padding: '32px', paddingLeft: 'calc(32px + env(safe-area-inset-left, 0px))', paddingRight: 'calc(32px + env(safe-area-inset-right, 0px))' }}>
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
            <ImageIcon size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.webSearchSuccessRate}%</div>
            <div className="stat-label-sm">Search success rate</div>
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
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Lifetime usage</div>
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
        </div>

        <div className="stat-card usage-bento-card usage-bento-top usage-motion-card usage-motion-card--surface" style={delayStyle(10)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Web Search Insights</span>
            <BarChart size={16} color="var(--theme-accent)" />
          </div>
          {stats.totalWebSearches > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
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
                <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Research plans</div>
                <div style={{ fontSize: '0.85rem', textAlign: 'right', color: 'var(--theme-text-primary)', fontWeight: 600 }}>
                  {stats.researchPlansExecuted.toLocaleString()}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--theme-border-subtle)', marginTop: 4, paddingTop: 8 }}>
                <div className="stat-subtext" style={{ fontSize: '0.75rem', marginBottom: 6 }}>Top search queries</div>
                {stats.topSearchQueries.length > 0 ? (
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
                ) : (
                  <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>No query text captured yet</div>
                )}
              </div>

              {otherModelsCount > 0 && (
                <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
                  Top {topModels.length} model{topModels.length === 1 ? '' : 's'} account for {stats.totalTokens > 0
                    ? Math.round((topModels.reduce((sum, model) => sum + model.tokens, 0) / stats.totalTokens) * 100)
                    : 0}% of tokens ({otherModelsCount} more model{otherModelsCount === 1 ? '' : 's'})
                </div>
              )}
            </div>
          ) : (
            <div className="stat-subtext" style={{ fontSize: '0.8rem' }}>No web search activity yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UsageSection
