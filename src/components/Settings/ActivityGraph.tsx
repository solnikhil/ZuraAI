/**
 * ActivityGraph component for Settings
 * Visualizes token usage over the last 30 days as a bar chart
 *
 * @module ActivityGraph
 * Requirements: 2.2
 */

import React from 'react'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'

/**
 * Activity data point interface
 */
export interface ActivityData {
  label: string
  date: string
  tokens: number
}

/**
 * Props for ActivityGraph component
 */
export interface ActivityGraphProps {
  /** Activity data points for 30 days */
  data: ActivityData[]
}

const chartConfig = {
  tokens: {
    label: 'Tokens',
    color: 'hsl(217, 91%, 60%)'
  }
} satisfies ChartConfig

/**
 * ActivityGraph - Interactive 30-day token usage bar chart
 */
export function ActivityGraph({ data }: ActivityGraphProps): React.ReactElement {
  const chartData = data.map((item) => ({
    label: item.label,
    date: item.date,
    tokens: item.tokens
  }))

  const showEmptyState = chartData.length === 0 || chartData.every((item) => item.tokens === 0)
  const totalTokens = chartData.reduce((sum, item) => sum + item.tokens, 0)

  return (
    <div className="activity-section" style={{ marginTop: 32 }}>
      <div
        className="activity-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="stat-label"
            style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--theme-text-primary)' }}
          >
            Token Usage
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--theme-text-muted)',
              fontWeight: 400
            }}
          >
            Last 30 days
          </span>
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--theme-text-secondary)',
            fontWeight: 500
          }}
        >
          {totalTokens.toLocaleString()} total tokens
        </div>
      </div>

      <div
        style={{
          minHeight: 280,
          width: '100%',
          position: 'relative',
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: 12,
          padding: '16px 16px 8px 8px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ position: 'relative', minHeight: 240 }}>
          <ChartContainer
            config={chartConfig}
            style={{ width: '100%', height: 240, minHeight: 240 }}
          >
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={5}
                tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={40}
                tickFormatter={(value) => {
                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
                  return value.toString()
                }}
                tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
              />
              <ChartTooltip
                cursor={{ fill: 'rgba(255, 255, 255, 0.08)', radius: 4 }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    labelFormatter={(_, payload) => {
                      if (payload && payload[0]?.payload?.date) {
                        return payload[0].payload.date as string
                      }
                      return null
                    }}
                  />
                }
              />
              <Bar
                dataKey="tokens"
                fill="var(--color-tokens)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>

          {showEmptyState && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--theme-text-tertiary)',
                fontSize: '0.85rem',
                pointerEvents: 'none'
              }}
            >
              No token usage yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ActivityGraph
