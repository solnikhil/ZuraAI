import React from 'react'
import { Info, Zap, Clock } from './icons' // Assuming icons exist from lucide-react or similar
import './ResponseInfo.css'

interface ResponseInfoProps {
    model: string
    latency?: number // in milliseconds
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        tps?: number // Tokens per second
        ttft?: number // Time to first token in ms
    }
}

export default function ResponseInfo({ model, latency, usage }: ResponseInfoProps) {
    // Format duration: 46.7s
    const formattedDuration = latency ? `${(latency / 1000).toFixed(1)}s` : '-'

    // Format numbers with commas
    const fmt = (n?: number) => n?.toLocaleString() || '0'
    const fmtTps = (n?: number) => n ? n.toFixed(1) : '-'

    // Clean model name (remove provider prefix if present)
    const displayModel = model.split('/').pop() || model

    // Handle legacy usage keys (snake_case)
    const inputTokens = usage?.inputTokens ?? (usage as any)?.prompt_tokens ?? (usage as any)?.prompt_eval_count ?? 0
    const outputTokens = usage?.outputTokens ?? (usage as any)?.completion_tokens ?? (usage as any)?.eval_count ?? 0
    const totalTokens = usage?.totalTokens ?? (usage as any)?.total_tokens ?? 0

    return (
        <div className="response-info-card">
            <div className="response-info-header">
                <Info size={16} />
                <span>Response Info</span>
            </div>

            <div className="response-info-row">
                <span className="response-info-label">Model</span>
                <div className="model-badge">
                    <Zap size={12} fill="currentColor" />
                    {displayModel}
                </div>
            </div>

            <div className="response-info-row">
                <span className="response-info-label">Generation Time</span>
                <span className="response-info-value">
                    <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
                    {formattedDuration}
                </span>
            </div>

            {usage && (
                <div className="token-usage-section">
                    <span className="token-usage-title">Token Usage</span>

                    <div className="token-grid">
                        <div className="token-metric">
                            <span className="token-metric-label">Input</span>
                            <span className="token-metric-value">{fmt(inputTokens)}</span>
                        </div>
                        <div className="token-metric">
                            <span className="token-metric-label">Output</span>
                            <span className="token-metric-value">{fmt(outputTokens)}</span>
                        </div>
                    </div>

                    <div className="total-row">
                        <span className="response-info-label" style={{ fontSize: '12px' }}>Total Tokens</span>
                        <span className="response-info-value">{fmt(totalTokens)}</span>
                    </div>

                    {(usage.tps !== undefined || usage.ttft !== undefined) && (
                        <div className="token-grid" style={{ marginTop: '8px' }}>
                            <div className="token-metric">
                                <span className="token-metric-label">Speed</span>
                                <span className="token-metric-value">{fmtTps(usage.tps)} t/s</span>
                            </div>
                            <div className="token-metric">
                                <span className="token-metric-label">First Token</span>
                                <span className="token-metric-value">{fmt(usage.ttft)}ms</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
