/**
 * UsageSection component for Settings
 * Displays usage statistics and activity graph
 * 
 * @module UsageSection
 * Requirements: 2.4
 */

import React from 'react'
import { MessageSquare, Clock, Zap, TrendingUp, HardDrive, Image as ImageIcon, Cpu, BarChart, Calendar } from 'lucide-react'
import { ActivityGraph, ActivityData, GraphRange } from '../ActivityGraph'

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
  /** Current graph range */
  graphRange: GraphRange
  /** Callback when graph range changes */
  onGraphRangeChange: (range: GraphRange) => void
  /** Sessions for model usage calculation */
  sessions: Array<{
    messages: Array<{
      role: string
      model?: string
    }>
  }>
}

/**
 * UsageSection - Displays usage statistics and activity visualization
 */
export function UsageSection({
  stats,
  graphRange,
  onGraphRangeChange,
  sessions
}: UsageSectionProps): React.ReactElement {
  // Calculate model usage count for display
  const modelUsageCount = sessions.flatMap(s => s.messages).reduce((acc, msg) => {
    if (msg.role === 'assistant' && msg.model) {
      const mName = msg.model.split('/').pop() || msg.model
      acc[mName] = (acc[mName] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)[stats.mostUsedModel || ''] || 0

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
          <div className="stat-icon-wrapper">
            <MessageSquare size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.todayMessages}</div>
            <div className="stat-label-sm">Messages today</div>
          </div>
        </div>

        {/* Total Sessions */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper">
            <Clock size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.totalSessions}</div>
            <div className="stat-label-sm">Total sessions</div>
          </div>
        </div>

        {/* Total Messages */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper">
            <Zap size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.totalMessages}</div>
            <div className="stat-label-sm">All messages</div>
          </div>
        </div>

        {/* Avg Tokens */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper">
            <TrendingUp size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.avgTokens}</div>
            <div className="stat-label-sm">Avg tokens/msg</div>
          </div>
        </div>

        {/* Storage */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper">
            <HardDrive size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.storageUsed} KB</div>
            <div className="stat-label-sm">Storage used</div>
          </div>
        </div>

        {/* Images */}
        <div className="stat-card compact">
          <div className="stat-icon-wrapper">
            <ImageIcon size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="stat-value-sm">{stats.imagesProcessed}</div>
            <div className="stat-label-sm">Images processed</div>
          </div>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
        <div className="stat-card" style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Total Tokens</span>
            <Cpu size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
            {stats.totalTokens.toLocaleString()}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Lifetime usage</div>
        </div>

        <div className="stat-card" style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Most Used Model</span>
            <BarChart size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--theme-text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stats.mostUsedModel || 'N/A'}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>
            {modelUsageCount} uses
          </div>
        </div>

        <div className="stat-card" style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="stat-label" style={{ fontSize: '0.85rem', fontWeight: 500 }}>Active Days</span>
            <Calendar size={16} color="var(--theme-accent)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--theme-text-primary)', marginBottom: 4 }}>
            {stats.activeDays || 0}
          </div>
          <div className="stat-subtext" style={{ fontSize: '0.75rem' }}>Days with activity</div>
        </div>
      </div>

      {/* Activity Graph */}
      <ActivityGraph
        data={stats.activityData}
        range={graphRange}
        onRangeChange={onGraphRangeChange}
      />
    </div>
  )
}

export default UsageSection
