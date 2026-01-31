/**
 * UsageSection component for Settings
 * Displays usage statistics and activity graph
 * 
 * @module UsageSection
 * Requirements: 2.4
 */

import React from 'react'
import { MessageSquare, Clock, Zap, TrendingUp, HardDrive, Image as ImageIcon, Cpu, BarChart, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ActivityGraph, ActivityData } from '../ActivityGraph'

/**
 * Usage statistics interface
 */
export interface UsageStats {
  todayMessages: number
  totalSessions: number
  totalMessages: number
  avgTokens: number
  storageUsed: number
  imagesProcessed: number
  totalTokens: number
  mostUsedModel: string
  activeDays?: number
  activityData: ActivityData[]
}

/**
 * Props for UsageSection component
 */
export interface UsageSectionProps {
  /** Usage statistics */
  stats: UsageStats
  /** Sessions for model usage calculation */
  sessions: Array<{
    messages: Array<{
      role: string
      model?: string
      tokenCount?: number
      usage?: {
        totalTokens?: number
        inputTokens?: number
        outputTokens?: number
      }
    }>
  }>
}

/**
 * UsageSection - Displays usage statistics and activity visualization
 */
export function UsageSection({
  stats,
  sessions
}: UsageSectionProps): React.ReactElement {
  const modelUsage = sessions.flatMap(s => s.messages).reduce((acc, msg) => {
    if (msg.role !== 'assistant' || !msg.model) return acc
    const mName = msg.model.split('/').pop() || msg.model
    const usageTotal = typeof msg.usage?.totalTokens === 'number'
      ? msg.usage.totalTokens
      : (msg.usage?.inputTokens || 0) + (msg.usage?.outputTokens || 0)
    const resolvedTokens = usageTotal > 0 ? usageTotal : (msg.tokenCount || 0)

    acc[mName] = acc[mName] || { count: 0, tokens: 0 }
    acc[mName].count += 1
    acc[mName].tokens += resolvedTokens
    return acc
  }, {} as Record<string, { count: number; tokens: number }>)

  const modelEntries = Object.entries(modelUsage).map(([name, data]) => ({
    name,
    count: data.count,
    tokens: data.tokens
  }))

  const modelsByCount = [...modelEntries].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })

  const modelsByTokens = [...modelEntries].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens
    if (b.count !== a.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })

  const topModels = modelsByTokens.slice(0, 2)
  const otherModels = modelsByTokens.slice(2)
  const otherModelsCount = otherModels.length

  const normalizedMostUsedModel = stats.mostUsedModel && stats.mostUsedModel !== 'N/A'
    ? stats.mostUsedModel
    : ''
  const modelUsageCount = normalizedMostUsedModel
    ? modelUsage[normalizedMostUsedModel]?.count || 0
    : 0

  return (
    <div style={{ padding: '32px', paddingLeft: 'calc(32px + env(safe-area-inset-left, 0px))', paddingRight: 'calc(32px + env(safe-area-inset-right, 0px))' }}>
      <div className="page-header">
        <h2 className="page-title">Usage Statistics</h2>
        <div className="page-subtitle">Track your chat activity and token usage</div>
      </div>

      {/* Quick Stats Grid */}
      <div className="usage-stats-grid" style={{ marginTop: 24 }}>
        {/* Today Messages */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <MessageSquare size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.todayMessages}</div>
            <div className="stat-label-sm">Messages today</div>
          </div>
        </div>

        {/* Total Sessions */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <Clock size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.totalSessions}</div>
            <div className="stat-label-sm">Total sessions</div>
          </div>
        </div>

        {/* Total Messages */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <Zap size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.totalMessages}</div>
            <div className="stat-label-sm">All messages</div>
          </div>
        </div>

        {/* Avg Tokens */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <TrendingUp size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.avgTokens}</div>
            <div className="stat-label-sm">Avg tokens/msg</div>
          </div>
        </div>

        {/* Storage */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <HardDrive size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.storageUsed} KB</div>
            <div className="stat-label-sm">Storage used</div>
          </div>
        </div>

        {/* Images */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper" style={{ color: 'var(--theme-accent)' }}>
            <ImageIcon size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.imagesProcessed}</div>
            <div className="stat-label-sm">Images processed</div>
          </div>
        </div>
      </div>

      {/* Usage Bento */}
      <div className="usage-bento-grid">
        <ActivityGraph data={stats.activityData} embedded className="usage-bento-graph" />

        <div className="stat-card usage-bento-card usage-bento-total">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Total Tokens</span>
            <span style={{ color: 'var(--theme-accent)' }}><Cpu size={16} /></span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
            {stats.totalTokens.toLocaleString()}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Lifetime usage</div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-most">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Most Used Model</span>
            <span style={{ color: 'var(--theme-accent)' }}><BarChart size={16} /></span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stats.mostUsedModel || 'N/A'}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
            {modelUsageCount} uses
          </div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-active">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Active Days</span>
            <span style={{ color: 'var(--theme-accent)' }}><Calendar size={16} /></span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
            {stats.activeDays || 0}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Days with activity</div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-models">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Models used</span>
            <span style={{ color: 'var(--theme-accent)' }}><Cpu size={16} /></span>
          </div>
          {modelsByCount.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {modelsByCount.map((model) => (
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
          <div className="stat-subtext" style={{ fontSize: '0.75rem', marginTop: 10 }}>
            {modelsByCount.length} model{modelsByCount.length === 1 ? '' : 's'} in history
          </div>
        </div>

        <div className="stat-card usage-bento-card usage-bento-top">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Top models by tokens</span>
            <BarChart size={16} color="var(--theme-accent)" />
          </div>
          {topModels.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topModels.map((model, index) => (
                <div key={model.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--theme-text-tertiary)' }}>#{index + 1}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--theme-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {model.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                    {model.tokens.toLocaleString()} tokens
                  </span>
                </div>
              ))}
              {otherModelsCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--theme-text-secondary)' }}>Others</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--theme-text-tertiary)' }}>{otherModelsCount} models</span>
                </div>
              )}
            </div>
          ) : (
            <div className="stat-subtext" style={{ fontSize: '0.8rem' }}>No model usage yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UsageSection
