/**
 * ActivityGraph component for Settings
 * Visualizes chat activity over time with interactive hover
 * 
 * @module ActivityGraph
 * Requirements: 2.2
 */

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'

/**
 * Activity data point interface
 */
export interface ActivityData {
  label: string
  value: number
}

/**
 * Graph range type
 */
export type GraphRange = '7d' | '30d' | '12m'

/**
 * Props for ActivityGraph component
 */
export interface ActivityGraphProps {
  /** Activity data points */
  data: ActivityData[]
  /** Current graph range */
  range: GraphRange
  /** Callback when range changes */
  onRangeChange: (range: GraphRange) => void
}

/**
 * ActivityGraph - Interactive activity visualization
 * Supports 7 day, 30 day, and 12 month views
 */
export function ActivityGraph({
  data,
  range,
  onRangeChange
}: ActivityGraphProps): React.ReactElement {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const pathRef = useRef<SVGPathElement | null>(null)
  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const [graphDimensions, setGraphDimensions] = useState({ width: 1100, height: 320 })

  // Update graph dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (graphContainerRef.current) {
        const rect = graphContainerRef.current.getBoundingClientRect()
        const containerWidth = Math.max(400, rect.width - 60)
        const aspectRatio = 1100 / 320
        const calculatedHeight = Math.max(180, Math.min(containerWidth / aspectRatio, 400))
        setGraphDimensions({
          width: containerWidth,
          height: calculatedHeight
        })
      }
    }

    const timeoutId = setTimeout(updateDimensions, 100)

    let resizeObserver: ResizeObserver | null = null
    if (graphContainerRef.current && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateDimensions)
      resizeObserver.observe(graphContainerRef.current)
    }

    window.addEventListener('resize', updateDimensions)

    return () => {
      clearTimeout(timeoutId)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      window.removeEventListener('resize', updateDimensions)
    }
  }, [range])

  // Calculate graph paths and coordinates
  const rawValues = data.map(d => d.value)
  const maxValue = Math.max(...rawValues, 1)
  const max = maxValue * 1.15
  const width = graphDimensions.width
  const height = graphDimensions.height
  const paddingX = Math.max(20, Math.min(28, width * 0.025))
  const paddingY = Math.max(18, Math.min(22, height * 0.07))

  const getCoords = (val: number, idx: number) => {
    const x = paddingX + (idx / Math.max(1, data.length - 1)) * (width - 2 * paddingX)
    const y = height - paddingY - (Math.max(0, val) / max) * (height - 2 * paddingY)
    return { x, y }
  }

  // Build smooth path
  let lineD = ''
  let areaD = ''

  if (data.length > 0) {
    const points = rawValues.map((v, i) => getCoords(v, i))
    lineD = `M ${points[0].x} ${points[0].y}`

    if (points.length === 1) {
      lineD = `M ${paddingX} ${points[0].y} L ${width - paddingX} ${points[0].y}`
    } else if (points.length === 2) {
      lineD = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
    } else {
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const midX = (prev.x + curr.x) / 2
        const midY = (prev.y + curr.y) / 2

        if (i === 1) {
          lineD += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`
        } else if (i === points.length - 1) {
          lineD += ` Q ${prev.x} ${prev.y} ${curr.x} ${curr.y}`
        } else {
          lineD += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`
        }
      }
    }

    const lastPoint = points[points.length - 1]
    const firstPoint = points[0]
    areaD = `${lineD} L ${lastPoint.x} ${height - paddingY} L ${firstPoint.x} ${height - paddingY} Z`
  }

  const yLabels = [Math.round(max), Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]
  const xLabelInterval = range === '30d' ? 3 : range === '12m' ? 2 : 1
  const xAxisFontSize = Math.max(10, Math.min(12, width * 0.011))

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
            Activity
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 0,
            background: 'var(--theme-surface)',
            padding: 2,
            borderRadius: 8,
            border: '1px solid var(--theme-border)'
          }}
        >
          {(['7d', '30d', '12m'] as GraphRange[]).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              style={{
                padding: '6px 14px',
                fontSize: '0.8rem',
                borderRadius: 6,
                background: range === r ? 'var(--theme-accent)' : 'transparent',
                color: range === r ? 'var(--theme-text-inverse)' : 'var(--theme-text-muted)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={graphContainerRef}
        style={{
          minHeight: 320,
          width: '100%',
          position: 'relative',
          background: 'linear-gradient(180deg, var(--theme-surface) 0%, var(--theme-background) 100%)',
          border: '1px solid var(--theme-border)',
          borderRadius: 18,
          padding: '20px',
          paddingTop: '32px',
          boxSizing: 'border-box',
          overflow: 'visible',
          boxShadow: 'var(--theme-shadow-lg)'
        }}
      >
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'visible', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'visible', minWidth: 0 }}>
            {/* Y-Axis */}
            <div
              style={{
                position: 'relative',
                paddingRight: Math.max(8, Math.min(10, width * 0.009)),
                height: '100%',
                color: '#999999',
                fontSize: 'clamp(0.65rem, 0.7vw, 0.75rem)',
                width: Math.max(35, Math.min(50, width * 0.045)),
                textAlign: 'right',
                boxSizing: 'border-box',
                flexShrink: 0
              }}
            >
              {yLabels.map((v, i) => {
                const graphHeight = height - 2 * paddingY
                const svgY = height - paddingY - (i / 4) * graphHeight
                const percentFromTop = (svgY / height) * 100
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: `${percentFromTop}%`,
                      transform: 'translateY(-50%)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {v}
                  </div>
                )
              })}
            </div>

            {/* Graph SVG */}
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <svg
                width="100%"
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                style={{ display: 'block', overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={`h-${i}`}
                    x1={paddingX}
                    y1={height - paddingY - (i / 4) * (height - 2 * paddingY)}
                    x2={width - paddingX}
                    y2={height - paddingY - (i / 4) * (height - 2 * paddingY)}
                    stroke="#1a1a1a"
                    strokeWidth="1.5"
                  />
                ))}

                {/* Vertical Grid lines */}
                {data.length > 1 && data.map((_, i) => {
                  const showLine = range === '30d' ? i % xLabelInterval === 0 || i === data.length - 1 : true
                  if (!showLine) return null
                  const x = paddingX + (i / (data.length - 1)) * (width - 2 * paddingX)
                  return (
                    <line
                      key={`x-${i}`}
                      x1={x}
                      y1={paddingY}
                      x2={x}
                      y2={height - paddingY}
                      stroke="#151515"
                      strokeWidth="1"
                      opacity={i === 0 || i === data.length - 1 ? 0.25 : 0.14}
                      strokeDasharray={range === '30d' ? '2 6' : 'none'}
                    />
                  )
                })}

                {/* Area & Line Animated */}
                <motion.path
                  d={areaD}
                  fill="url(#chartGradient)"
                  stroke="none"
                  initial={false}
                  animate={{ d: areaD }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />
                <motion.path
                  ref={pathRef}
                  d={lineD}
                  fill="none"
                  stroke="var(--theme-accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ d: lineD }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />

                {/* Hover interaction */}
                {hoverX !== null && data.length > 0 && (() => {
                  const continuousIndex = hoverX * (data.length - 1)
                  const cursorX = paddingX + hoverX * (width - 2 * paddingX)
                  const points = rawValues.map((v, i) => getCoords(v, i))

                  let cursorY = height - paddingY
                  if (data.length === 1) {
                    cursorY = points[0].y
                  } else {
                    for (let i = 0; i < points.length - 1; i++) {
                      const p1 = points[i]
                      const p2 = points[i + 1]
                      if (cursorX >= p1.x && cursorX <= p2.x) {
                        const t = (cursorX - p1.x) / (p2.x - p1.x || 0.001)
                        cursorY = p1.y + (p2.y - p1.y) * t
                        break
                      }
                    }
                  }

                  const circleRadius = 7
                  cursorY = Math.max(paddingY + circleRadius, Math.min(height - paddingY - circleRadius, cursorY))

                  return (
                    <>
                      <line
                        x1={cursorX}
                        y1={paddingY}
                        x2={cursorX}
                        y2={height - paddingY}
                        stroke="rgba(255,228,196,0.2)"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        pointerEvents="none"
                      />
                      <circle
                        cx={cursorX}
                        cy={cursorY}
                        r={7}
                        fill="var(--theme-accent)"
                        stroke="var(--theme-background)"
                        strokeWidth="3"
                        style={{ pointerEvents: 'none' }}
                      />
                    </>
                  )
                })()}

                {/* Interaction layer */}
                <rect
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onMouseMove={(e) => {
                    const svg = e.currentTarget.ownerSVGElement
                    if (!svg) return
                    const svgRect = svg.getBoundingClientRect()
                    const mouseX = ((e.clientX - svgRect.left) / svgRect.width) * width
                    const graphX = (mouseX - paddingX) / (width - 2 * paddingX)
                    const pixelX = e.clientX - svgRect.left
                    const pixelY = e.clientY - svgRect.top
                    if (graphX >= 0 && graphX <= 1) {
                      setHoverX(graphX)
                      setMousePos({ x: pixelX, y: pixelY })
                    } else {
                      setHoverX(null)
                      setMousePos(null)
                    }
                  }}
                  onMouseLeave={() => {
                    setHoverX(null)
                    setMousePos(null)
                  }}
                />
              </svg>

              {/* Floating Tooltip */}
              {hoverX !== null && mousePos && data.length > 0 && (() => {
                const continuousIndex = hoverX * (data.length - 1)
                const nearestIndex = Math.round(continuousIndex)
                const nearestData = data[nearestIndex]

                if (!nearestData) return null

                return (
                  <div
                    style={{
                      position: 'absolute',
                      left: mousePos.x,
                      top: mousePos.y - 60,
                      transform: 'translate(-50%, -100%)',
                      background: 'rgba(20,20,20,0.95)',
                      border: '1px solid #333',
                      borderRadius: 10,
                      padding: '10px 14px',
                      minWidth: 80,
                      zIndex: 10,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                      pointerEvents: 'none',
                      backdropFilter: 'blur(8px)'
                    }}
                  >
                    <div
                      style={{
                        color: 'var(--theme-accent)',
                        fontSize: '1rem',
                        fontWeight: 700,
                        marginBottom: 2,
                        textAlign: 'center'
                      }}
                    >
                      {nearestData.value}
                    </div>
                    <div
                      style={{
                        color: '#888',
                        fontSize: 'clamp(0.65rem, 0.8vw, 0.75rem)',
                        textAlign: 'center'
                      }}
                    >
                      {nearestData.label}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {/* X-Axis Labels */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingLeft: paddingX,
              paddingRight: paddingX,
              marginTop: 12,
              color: '#999999',
              fontSize: `clamp(0.65rem, ${xAxisFontSize}px, 0.75rem)`,
              minWidth: 0,
              overflow: 'hidden'
            }}
          >
            {data.map((d, i) => {
              const showLabel = range === '30d' ? i % xLabelInterval === 0 || i === data.length - 1 : true
              return (
                <div
                  key={i}
                  style={{
                    width: `${100 / data.length}%`,
                    textAlign: 'center',
                    opacity: showLabel ? 0.85 : 0.2,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={d.label}
                >
                  {showLabel ? d.label : ''}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActivityGraph
