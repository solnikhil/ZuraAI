/**
 * ActivityGraph component for Settings
 * Visualizes token usage over the last 30 days as a bar chart
 *
 * @module ActivityGraph
 * Requirements: 2.2
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig
} from '@/components/ui/chart'
import { assignColor } from '@/utils/colorManager'
import { cn } from '@/lib/utils'

/**
 * Activity data point interface
 */
export interface ActivityData {
  label: string
  date: string
  tokens: number
  modelBreakdown?: Record<string, number> // Per-model token usage
}

/**
 * Props for ActivityGraph component
 */
export interface ActivityGraphProps {
  /** Activity data points for 30 days */
  data: ActivityData[]
  /** Remove outer margin for embedded layouts */
  embedded?: boolean
  /** Optional class name for container */
  className?: string
}

/**
 * Custom tooltip component showing model breakdown
 */
interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    dataKey: string
    value: number
    color: string
    payload: Record<string, unknown>
  }>
  label?: string
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null

  // Get the date from the first payload item
  const date = payload[0]?.payload?.date as string || label

  // Calculate total tokens for percentage
  const totalTokens = payload.reduce((sum, item) => sum + (item.value || 0), 0)

  // Filter out items with 0 tokens and sort by value descending
  const sortedPayload = payload
    .filter(item => item.value > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))

  if (sortedPayload.length === 0) return null

  return (
    <div
      style={{
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        minWidth: 180
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--theme-text-primary)',
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: '1px solid var(--theme-border)'
        }}
      >
        {date}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sortedPayload.map((item) => {
          const percentage = totalTokens > 0 ? ((item.value / totalTokens) * 100).toFixed(1) : '0'
          return (
            <div
              key={item.dataKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.75rem'
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: item.color,
                  flexShrink: 0
                }}
              />
              <div style={{ flex: 1, color: 'var(--theme-text-secondary)' }}>
                {item.dataKey}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <div style={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>
                  {item.value.toLocaleString()}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--theme-text-muted)' }}>
                  {percentage}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div
        style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid var(--theme-border)',
          fontSize: '0.7rem',
          color: 'var(--theme-text-muted)',
          textAlign: 'right'
        }}
      >
        Total: {totalTokens.toLocaleString()} tokens
      </div>
    </div>
  )
}

/**
 * ActivityGraph - Interactive 30-day token usage bar chart
 */
export function ActivityGraph({ data, embedded = false, className }: ActivityGraphProps): React.ReactElement {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)
    update()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  // Transform data and extract unique models
  const { chartData, uniqueModels, chartConfig, modelColors } = useMemo(() => {
    const modelsSet = new Set<string>()
    
    // Collect all unique models
    data.forEach(item => {
      if (item.modelBreakdown) {
        Object.keys(item.modelBreakdown).forEach(model => modelsSet.add(model))
      }
    })
    
    const models = Array.from(modelsSet)
    
    // Assign colors to all models and create a direct color map
    const config: ChartConfig = {}
    const colorMap: Record<string, string> = {}
    models.forEach(model => {
      const color = assignColor(model)
      config[model] = {
        label: model,
        color: color
      }
      colorMap[model] = color
    })
    
    // Transform data to Recharts format
    const transformed = data.map(item => {
      const point: Record<string, unknown> = {
        label: item.label,
        date: item.date,
        tokens: item.tokens
      }
      
      // Add each model's tokens as a separate field
      if (item.modelBreakdown) {
        Object.entries(item.modelBreakdown).forEach(([model, tokens]) => {
          point[model] = tokens
        })
      }
      
      return point
    })
    
    return {
      chartData: transformed,
      uniqueModels: models,
      chartConfig: config,
      modelColors: colorMap
    }
  }, [data])

  const showEmptyState = chartData.length === 0 || chartData.every((item) => (item.tokens as number) === 0)
  const totalTokens = chartData.reduce((sum, item) => sum + ((item.tokens as number) || 0), 0)

  return (
    <div
      className={cn('activity-section', embedded && 'activity-section--embedded', className)}
      style={{ marginTop: embedded ? 0 : 32 }}
    >
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
        className="usage-chart-surface usage-motion-surface"
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
                content={<CustomTooltip />}
              />
              {uniqueModels.map((model, index) => (
                <Bar
                  key={model}
                  dataKey={model}
                  stackId="models"
                  fill={modelColors[model]}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={!prefersReducedMotion}
                  animationBegin={Math.min(index * 50, 260)}
                  animationDuration={420}
                  animationEasing="ease-out"
                />
              ))}
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
