/**
 * ActivityGraph component for Settings
 * Premium interactive bar chart visualizing token usage over the last 30 days.
 * Toggle between "All" / Top 5 models / Other to focus a single series.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { assignColor } from '@/utils/colorManager'
import { cn } from '@/lib/utils'

const OTHER_KEY = 'Other'
const ALL_KEY = 'All'

type SeriesKey = typeof ALL_KEY | typeof OTHER_KEY | string

/**
 * Activity data point interface
 */
export interface ActivityData {
  label: string
  date: string
  tokens: number
  modelBreakdown?: Record<string, number>
}

/**
 * Props for ActivityGraph component
 */
export interface ActivityGraphProps {
  data: ActivityData[]
  embedded?: boolean
  className?: string
}

interface ChartPoint {
  label: string
  date: string
  tokens: number
  [modelName: string]: number | string
}

interface TooltipPayloadItem {
  dataKey: string
  value: number
  color: string
  payload: ChartPoint
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null

  const item = payload[0]
  const date = (item?.payload?.date as string) ?? label ?? ''
  const value = item?.value ?? 0
  const seriesName = item?.dataKey === OTHER_KEY ? OTHER_KEY : item?.dataKey

  return (
    <div
      style={{
        background: 'var(--theme-surface)',
        border: '1px solid var(--theme-border)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--theme-text-primary)',
          marginBottom: 6,
        }}
      >
        {date}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: '0.8rem',
        }}
      >
        <span style={{ color: 'var(--theme-text-secondary)' }}>{seriesName}</span>
        <span style={{ fontWeight: 600, color: 'var(--theme-text-primary)' }}>
          {Number(value).toLocaleString()} tokens
        </span>
      </div>
    </div>
  )
}

/**
 * ActivityGraph - Premium interactive 30-day token usage bar chart
 */
export function ActivityGraph({
  data,
  embedded = false,
  className,
}: ActivityGraphProps): React.ReactElement {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
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

  const {
    chartData,
    series,
    seriesColors,
    totals,
    totalTokens,
  } = useMemo(() => {
    const modelTotals: Record<string, number> = {}

    data.forEach((day) => {
      if (day.modelBreakdown) {
        Object.entries(day.modelBreakdown).forEach(([model, tokens]) => {
          modelTotals[model] = (modelTotals[model] ?? 0) + tokens
        })
      }
    })

    const sortedModels = Object.entries(modelTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    const topModels = sortedModels.slice(0, 5)
    const otherModels = sortedModels.slice(5)
    const seriesList: string[] =
      otherModels.length > 0 ? [ALL_KEY, ...topModels, OTHER_KEY] : [ALL_KEY, ...topModels]

    const colors: Record<string, string> = {
      [ALL_KEY]: 'var(--theme-accent)',
      [OTHER_KEY]: 'var(--theme-text-muted)',
    }
    topModels.forEach((model) => {
      colors[model] = assignColor(model)
    })

    const transformed: ChartPoint[] = data.map((day) => {
      const point: ChartPoint = {
        label: day.label,
        date: day.date,
        tokens: day.tokens,
        [ALL_KEY]: day.tokens,
      }

      topModels.forEach((model) => {
        point[model] = day.modelBreakdown?.[model] ?? 0
      })

      if (otherModels.length > 0) {
        point[OTHER_KEY] = otherModels.reduce(
          (sum, model) => sum + (day.modelBreakdown?.[model] ?? 0),
          0
        )
      }

      return point
    })

    const computedTotalTokens = data.reduce((sum, day) => sum + day.tokens, 0)
    const seriesTotals: Record<string, number> = { [ALL_KEY]: computedTotalTokens }
    topModels.forEach((model) => {
      seriesTotals[model] = modelTotals[model] ?? 0
    })
    if (otherModels.length > 0) {
      seriesTotals[OTHER_KEY] = otherModels.reduce((sum, model) => sum + (modelTotals[model] ?? 0), 0)
    }

    return {
      chartData: transformed,
      series: seriesList,
      seriesColors: colors,
      totals: seriesTotals,
      totalTokens: computedTotalTokens,
    }
  }, [data])

  const [activeChart, setActiveChart] = useState<SeriesKey>(ALL_KEY)

  useEffect(() => {
    if (!series.includes(activeChart)) {
      setActiveChart(ALL_KEY)
    }
  }, [series, activeChart])

  const activeColor = seriesColors[activeChart] ?? 'var(--theme-accent)'

  const showEmptyState = chartData.length === 0 || totalTokens === 0

  return (
    <Card
      className={cn(
        'usage-chart-card gap-0 border-0 shadow-none bg-transparent',
        embedded && 'usage-chart-card--embedded',
        className
      )}
    >
      <CardHeader className="usage-chart-card__header px-0">
        <div className="usage-chart-card__title-block">
          <CardTitle className="usage-chart-card__title">Token Usage</CardTitle>
          <CardDescription className="usage-chart-card__description">
            Last 30 days
          </CardDescription>
        </div>
        <div className="usage-chart-card__toggles" role="tablist" aria-label="Token usage series">
          {series.map((key) => {
            const isActive = activeChart === key
            const color = seriesColors[key] ?? 'var(--theme-accent)'
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-active={isActive}
                className="usage-chart-card__toggle"
                onClick={() => setActiveChart(key)}
                title={key}
              >
                <span
                  className="usage-chart-card__toggle-swatch"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="usage-chart-card__toggle-label">{key}</span>
                <span className="usage-chart-card__toggle-value">
                  {(totals[key] ?? 0).toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      </CardHeader>

      <CardContent className="usage-chart-card__content px-0">
        <div className="usage-chart-surface usage-motion-surface">
          <ChartContainer config={{}} className="usage-chart-card__chart">
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 12, right: 12, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--theme-border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }}
              />
              <ChartTooltip cursor={false} content={<CustomTooltip />} />
              <Bar
                dataKey={activeChart}
                fill={activeColor}
                fillOpacity={0.95}
                radius={[8, 8, 0, 0]}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={400}
                animationEasing="ease-out"
              />
            </BarChart>
          </ChartContainer>

          {showEmptyState && (
            <div className="usage-chart-card__empty">
              <span>No token usage yet</span>
              <span className="usage-chart-card__empty-sub">Start chatting to see your activity.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default ActivityGraph
