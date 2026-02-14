/**
 * ResearchPlanBlock - Displays the structured research plan and progress
 * Used when step-by-step research mode is enabled.
 */

import React from 'react'
import { CheckCircle2, Loader2, Search } from 'lucide-react'

export interface ResearchPlanStep {
  stepNumber: number
  query: string
  rationale?: string
}

export interface ResearchPlanBlockProps {
  topic: string
  steps: ResearchPlanStep[]
  currentStep?: number
  totalSteps?: number
  currentQuery?: string
}

export function ResearchPlanBlock({
  topic,
  steps,
  currentStep = 0,
  totalSteps,
  currentQuery
}: ResearchPlanBlockProps): React.ReactElement {
  const isExecuting = totalSteps != null && currentStep > 0

  return (
    <div
      style={{
        marginBottom: '12px',
        padding: '12px 16px',
        borderRadius: '10px',
        background: 'var(--theme-surface-subtle)',
        border: '1px solid var(--theme-border)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: steps.length > 0 ? '12px' : 0,
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--theme-text-primary)'
        }}
      >
        <Search size={16} style={{ flexShrink: 0 }} />
        <span>Research: {topic}</span>
      </div>

      {steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {steps.map((step) => {
            const isDone = currentStep > step.stepNumber
            const isActive = currentStep === step.stepNumber

            return (
              <div
                key={step.stepNumber}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: isActive ? 'var(--theme-surface-hover)' : 'transparent',
                  border: isActive ? '1px solid var(--theme-border-hover)' : '1px solid transparent'
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDone
                      ? 'rgba(34, 197, 94, 0.2)'
                      : isActive
                        ? 'var(--theme-accent-muted)'
                        : 'var(--theme-surface-active)',
                    color: isDone ? '#22c55e' : isActive ? 'var(--theme-accent)' : 'var(--theme-text-muted)'
                  }}
                >
                  {isDone ? (
                    <CheckCircle2 size={14} />
                  ) : isActive ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{step.stepNumber}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: isDone ? 'var(--theme-text-secondary)' : 'var(--theme-text-primary)',
                      fontWeight: isActive ? 500 : 400
                    }}
                  >
                    {step.query}
                  </div>
                  {step.rationale && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--theme-text-muted)',
                        marginTop: '2px'
                      }}
                    >
                      {step.rationale}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isExecuting && currentQuery && currentStep <= (totalSteps ?? 0) && (
        <div
          style={{
            marginTop: '10px',
            fontSize: '0.75rem',
            color: 'var(--theme-text-muted)'
          }}
        >
          Executing step {currentStep} of {totalSteps}…
        </div>
      )}
    </div>
  )
}

export default ResearchPlanBlock
